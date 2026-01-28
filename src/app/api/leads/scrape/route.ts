import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

// ===========================================
// TYPES
// ===========================================

interface ScrapeRequest {
  companyIds?: string[];
  limit?: number;
}

interface ScrapedPerson {
  name: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  source: "json_ld" | "meta" | "team_page" | "regex" | "linkedin";
  confidence: number;
}

interface ScrapeResult {
  companyId: string;
  companyName: string;
  status: "success" | "no_data" | "failed";
  peopleFound: number;
  emailsFound: number;
  phonesFound: number;
  linkedinUrlsFound: number;
  error?: string;
}

// ===========================================
// REGEX PATTERNS
// ===========================================

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// LinkedIn profile URL patterns
const LINKEDIN_PROFILE_REGEX = /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi;

// Enhanced patterns for finding owner/founder names
const OWNER_PATTERNS = [
  // "Owner: John Smith" or "Owner - John Smith"
  /(?:owner|founder|president|ceo|principal|proprietor)[:\s-]+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)/gi,
  // "John Smith, Owner" or "John Smith - President"
  /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)[,\s-]+(?:owner|founder|president|ceo|principal|proprietor)/gi,
  // "Meet John Smith, our owner"
  /meet\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)[,\s]+(?:our|the)\s+(?:owner|founder|president)/gi,
  // "Founded by John Smith"
  /founded\s+by\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)/gi,
  // "John Smith founded" or "John Smith started"
  /([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)\s+(?:founded|started|established)/gi,
  // "About John Smith" (common on about pages)
  /about\s+([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)[,\s]/gi,
  // Team member cards: "John Smith" followed by title
  /class="[^"]*(?:team|staff|member|person)[^"]*"[^>]*>[\s\S]{0,200}?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+)[\s\S]{0,100}?(?:owner|founder|president|ceo)/gi,
];

// Title detection patterns
const TITLE_PATTERNS = {
  owner: /\b(?:owner|co-owner)\b/i,
  founder: /\b(?:founder|co-founder)\b/i,
  president: /\bpresident\b/i,
  ceo: /\b(?:ceo|chief\s+executive)\b/i,
  principal: /\bprincipal\b/i,
  gm: /\b(?:general\s+manager|gm)\b/i,
  manager: /\bmanager\b/i,
};

// ===========================================
// HELPER FUNCTIONS
// ===========================================

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const filtered = matches.filter(email => {
    const lower = email.toLowerCase();
    return !lower.includes("example.com") &&
           !lower.includes("domain.com") &&
           !lower.includes("email.com") &&
           !lower.includes("noreply") &&
           !lower.includes("wixpress.com") &&
           !lower.includes("sentry.io") &&
           !lower.endsWith(".png") &&
           !lower.endsWith(".jpg") &&
           !lower.endsWith(".gif") &&
           !lower.endsWith(".webp");
  });
  return [...new Set(filtered)];
}

function extractPhones(html: string): string[] {
  const matches = html.match(PHONE_REGEX) || [];
  const cleaned = matches.map(p => p.replace(/\D/g, "").slice(-10));
  return [...new Set(cleaned)].filter(p => p.length === 10);
}

function extractLinkedInUrls(html: string): string[] {
  const matches: string[] = [];
  let match;
  const regex = new RegExp(LINKEDIN_PROFILE_REGEX.source, "gi");
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[0]);
  }
  return [...new Set(matches)];
}

/**
 * Extract owner info from JSON-LD structured data
 */
function extractFromJsonLd(html: string): ScrapedPerson[] {
  const people: ScrapedPerson[] = [];
  const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  
  let match;
  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const jsonText = match[1].trim();
      const data = JSON.parse(jsonText);
      
      // Handle arrays of JSON-LD objects
      const items = Array.isArray(data) ? data : [data];
      
      for (const item of items) {
        // Check for LocalBusiness or Organization with founder/owner
        if (item["@type"] === "LocalBusiness" || item["@type"] === "Organization" || 
            item["@type"] === "HomeAndConstructionBusiness" || item["@type"] === "Plumber" ||
            item["@type"] === "Electrician" || item["@type"] === "RoofingContractor" ||
            item["@type"] === "HVACBusiness") {
          
          // Check for founder
          if (item.founder) {
            const founder = Array.isArray(item.founder) ? item.founder[0] : item.founder;
            if (typeof founder === "string") {
              people.push({
                name: founder,
                title: "Founder",
                source: "json_ld",
                confidence: 85,
              });
            } else if (founder.name) {
              people.push({
                name: founder.name,
                title: "Founder",
                email: founder.email,
                source: "json_ld",
                confidence: 90,
              });
            }
          }
          
          // Check for employee array
          if (item.employee) {
            const employees = Array.isArray(item.employee) ? item.employee : [item.employee];
            for (const emp of employees) {
              if (emp.name && emp.jobTitle) {
                const titleLower = emp.jobTitle.toLowerCase();
                if (titleLower.includes("owner") || titleLower.includes("founder") || 
                    titleLower.includes("president") || titleLower.includes("ceo")) {
                  people.push({
                    name: emp.name,
                    title: emp.jobTitle,
                    email: emp.email,
                    source: "json_ld",
                    confidence: 90,
                  });
                }
              }
            }
          }
        }
        
        // Check for Person type (often on about pages)
        if (item["@type"] === "Person" && item.jobTitle) {
          const titleLower = item.jobTitle.toLowerCase();
          if (titleLower.includes("owner") || titleLower.includes("founder") || 
              titleLower.includes("president") || titleLower.includes("ceo")) {
            people.push({
              name: item.name,
              title: item.jobTitle,
              email: item.email,
              source: "json_ld",
              confidence: 90,
            });
          }
        }
      }
    } catch (e) {
      // JSON parse error - continue to next
    }
  }
  
  return people;
}

/**
 * Extract owner info from meta tags
 */
function extractFromMeta(html: string): ScrapedPerson[] {
  const people: ScrapedPerson[] = [];
  
  // Look for author meta tag
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (authorMatch && authorMatch[1]) {
    const name = authorMatch[1].trim();
    if (name.split(" ").length >= 2 && !name.includes("@") && name.length < 50) {
      people.push({
        name,
        title: "Owner", // Assume owner if they're the author
        source: "meta",
        confidence: 50,
      });
    }
  }
  
  return people;
}

/**
 * Extract names with titles using regex patterns
 */
function extractWithPatterns(html: string): ScrapedPerson[] {
  const people: ScrapedPerson[] = [];
  const seenNames = new Set<string>();
  
  // Strip HTML but preserve spacing
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  
  for (const pattern of OWNER_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 3 && name.length < 50 && 
          name.split(" ").length >= 2 && 
          !seenNames.has(name.toLowerCase())) {
        
        // Skip if looks like a business name
        if (/\b(llc|inc|corp|company|services|plumbing|hvac|roofing|electric)\b/i.test(name)) {
          continue;
        }
        
        seenNames.add(name.toLowerCase());
        
        // Determine title from context
        const contextStart = Math.max(0, match.index - 100);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 100);
        const context = text.slice(contextStart, contextEnd).toLowerCase();
        
        let title = "Owner";
        let confidence = 60;
        
        if (TITLE_PATTERNS.founder.test(context)) {
          title = "Founder";
          confidence = 70;
        } else if (TITLE_PATTERNS.ceo.test(context)) {
          title = "CEO";
          confidence = 70;
        } else if (TITLE_PATTERNS.president.test(context)) {
          title = "President";
          confidence = 70;
        } else if (TITLE_PATTERNS.principal.test(context)) {
          title = "Principal";
          confidence = 65;
        }
        
        const nameParts = name.split(" ");
        people.push({
          name,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" "),
          title,
          source: "regex",
          confidence,
        });
      }
    }
  }
  
  return people;
}

/**
 * Extract name from LinkedIn profile URL slug
 */
function extractFromLinkedInUrl(url: string): ScrapedPerson | null {
  const match = url.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  if (!match) return null;
  
  const slug = match[1];
  // LinkedIn slugs are often like "john-smith-12345" or "johnsmith"
  
  // Remove trailing numbers (the random suffix LinkedIn adds)
  const cleaned = slug.replace(/-\d+$/, "").replace(/-/g, " ");
  const parts = cleaned.split(" ").filter(p => p.length > 1);
  
  if (parts.length >= 2 && parts.length <= 4) {
    const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    const lastName = parts.slice(1).map(p => 
      p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    ).join(" ");
    
    return {
      name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
      linkedin_url: url,
      source: "linkedin",
      confidence: 55, // Medium confidence - we don't know their title
    };
  }
  
  return null;
}

/**
 * Generate email guesses from name and domain
 */
function generateEmailGuesses(firstName: string, lastName: string, domain: string): Array<{ email: string; confidence: number }> {
  const first = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const last = lastName.toLowerCase().replace(/[^a-z]/g, "");
  
  if (!first || !last) return [];
  
  return [
    { email: `${first}@${domain}`, confidence: 45 },
    { email: `${first}.${last}@${domain}`, confidence: 40 },
    { email: `${first}${last}@${domain}`, confidence: 35 },
    { email: `${first[0]}${last}@${domain}`, confidence: 30 },
    { email: `${first}.${last[0]}@${domain}`, confidence: 25 },
    { email: `${first[0]}.${last}@${domain}`, confidence: 25 },
  ];
}

/**
 * Score and dedupe people, picking the best candidates
 */
function dedupeAndRankPeople(people: ScrapedPerson[]): ScrapedPerson[] {
  const nameMap = new Map<string, ScrapedPerson>();
  
  for (const person of people) {
    const key = person.name.toLowerCase();
    const existing = nameMap.get(key);
    
    if (!existing || person.confidence > existing.confidence) {
      nameMap.set(key, person);
    } else if (person.confidence === existing.confidence) {
      // Merge data from both
      nameMap.set(key, {
        ...existing,
        email: existing.email || person.email,
        phone: existing.phone || person.phone,
        linkedin_url: existing.linkedin_url || person.linkedin_url,
      });
    }
  }
  
  // Sort by confidence (highest first)
  return Array.from(nameMap.values())
    .sort((a, b) => b.confidence - a.confidence);
}

// ===========================================
// MAIN SCRAPE FUNCTION
// ===========================================

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeRequest = await request.json();
    const { companyIds, limit = 25 } = body;

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get companies that need scraping
    let query = (supabase as any)
      .from("lead_companies")
      .select("id, name, domain, website, phone, city, state, fallback_email, fallback_phone")
      .eq("user_id", userId)
      .in("enrichment_status", ["no_match", "pending", "failed"])
      .not("website", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (companyIds && companyIds.length > 0) {
      query = query.in("id", companyIds);
    }

    const { data: companies, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No companies to scrape",
        stats: { processed: 0, scraped: 0, peopleFound: 0 },
        results: [],
      });
    }

    const results: ScrapeResult[] = [];
    let processed = 0;
    let scraped = 0;
    let totalPeopleFound = 0;
    let failed = 0;

    for (const company of companies) {
      const c = company as any;
      processed++;
      
      if (!c.website) {
        results.push({
          companyId: c.id,
          companyName: c.name,
          status: "failed",
          peopleFound: 0,
          emailsFound: 0,
          phonesFound: 0,
          linkedinUrlsFound: 0,
          error: "No website",
        });
        continue;
      }

      try {
        const baseUrl = c.website.replace(/\/$/, "");
        const pagesToTry = [
          baseUrl,
          `${baseUrl}/about`,
          `${baseUrl}/about-us`,
          `${baseUrl}/team`,
          `${baseUrl}/our-team`,
          `${baseUrl}/staff`,
          `${baseUrl}/contact`,
          `${baseUrl}/contact-us`,
          `${baseUrl}/meet-the-team`,
          `${baseUrl}/leadership`,
        ];

        const allEmails: string[] = [];
        const allPhones: string[] = [];
        const allLinkedInUrls: string[] = [];
        const allPeople: ScrapedPerson[] = [];

        // Scrape each page
        for (const pageUrl of pagesToTry) {
          const html = await fetchPage(pageUrl);
          if (html) {
            // Extract emails and phones
            allEmails.push(...extractEmails(html));
            allPhones.push(...extractPhones(html));
            allLinkedInUrls.push(...extractLinkedInUrls(html));
            
            // Extract people from various sources (priority order)
            allPeople.push(...extractFromJsonLd(html));
            allPeople.push(...extractFromMeta(html));
            allPeople.push(...extractWithPatterns(html));
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Extract names from LinkedIn URLs
        for (const linkedinUrl of allLinkedInUrls) {
          const person = extractFromLinkedInUrl(linkedinUrl);
          if (person) {
            allPeople.push(person);
          }
        }

        // Dedupe and rank
        const uniqueEmails = [...new Set(allEmails)];
        const uniquePhones = [...new Set(allPhones)];
        const rankedPeople = dedupeAndRankPeople(allPeople);
        
        let companyPeopleFound = 0;
        let bestEmail: string | null = null;
        let bestPhone: string | null = null;

        // Process top candidates
        for (const person of rankedPeople.slice(0, 3)) {
          let email: string | null = person.email || null;
          let emailStatus = person.email ? "found" : "unknown";
          let confidence = person.confidence;
          
          // If no email, try to find a matching one
          if (!email) {
            const firstName = (person.first_name || person.name.split(" ")[0]).toLowerCase();
            const matchingEmail = uniqueEmails.find(e => 
              e.toLowerCase().includes(firstName)
            );
            
            if (matchingEmail) {
              email = matchingEmail;
              emailStatus = "found";
              confidence = Math.min(confidence + 15, 90);
            } else if (c.domain) {
              // Generate guesses
              const lastName = person.last_name || person.name.split(" ").slice(1).join(" ");
              const guesses = generateEmailGuesses(firstName, lastName, c.domain);
              if (guesses.length > 0) {
                email = guesses[0].email;
                emailStatus = "guessed";
                confidence = guesses[0].confidence;
              }
            }
          }

          const phone = uniquePhones.shift() || c.phone;
          
          if (!bestEmail && email) bestEmail = email;
          if (!bestPhone && phone) bestPhone = phone;

          // Only save if we have an email
          if (email) {
            const personData = {
              user_id: userId,
              lead_company_id: c.id,
              full_name: person.name,
              first_name: person.first_name || person.name.split(" ")[0],
              last_name: person.last_name || person.name.split(" ").slice(1).join(" ") || null,
              title: person.title || "Owner",
              email,
              email_status: emailStatus,
              phone: phone ? phone.replace(/\D/g, "").slice(-10) : null,
              phone_type: "office",
              linkedin_url: person.linkedin_url || null,
              source: `scrape_${person.source}`,
              confidence_score: confidence,
              is_decision_maker: true,
              is_primary_contact: companyPeopleFound === 0,
              raw_payload: { 
                emails_found: uniqueEmails.slice(0, 5), 
                phones_found: uniquePhones.slice(0, 3),
                linkedin_urls: allLinkedInUrls.slice(0, 3),
              },
            };

            const { error: insertError } = await (supabase as any)
              .from("lead_people")
              .upsert(personData, {
                onConflict: "lead_company_id,email",
                ignoreDuplicates: true,
              });

            if (!insertError) {
              companyPeopleFound++;
              totalPeopleFound++;
            }
          }
        }

        // If we found LinkedIn URLs but no people, try harder
        if (companyPeopleFound === 0 && allLinkedInUrls.length > 0) {
          for (const url of allLinkedInUrls.slice(0, 2)) {
            const person = extractFromLinkedInUrl(url);
            if (person && c.domain) {
              const firstName = person.first_name || "";
              const lastName = person.last_name || "";
              const guesses = generateEmailGuesses(firstName, lastName, c.domain);
              
              if (guesses.length > 0) {
                const personData = {
                  user_id: userId,
                  lead_company_id: c.id,
                  full_name: person.name,
                  first_name: person.first_name,
                  last_name: person.last_name,
                  title: "Owner", // Assume owner if on company site
                  email: guesses[0].email,
                  email_status: "guessed",
                  phone: uniquePhones[0] || c.phone,
                  phone_type: "office",
                  linkedin_url: url,
                  source: "scrape_linkedin",
                  confidence_score: guesses[0].confidence,
                  is_decision_maker: true,
                  is_primary_contact: companyPeopleFound === 0,
                };

                const { error: insertError } = await (supabase as any)
                  .from("lead_people")
                  .upsert(personData, {
                    onConflict: "lead_company_id,email",
                    ignoreDuplicates: true,
                  });

                if (!insertError) {
                  companyPeopleFound++;
                  totalPeopleFound++;
                  if (!bestEmail) bestEmail = guesses[0].email;
                }
              }
            }
          }
        }

        // Update company status
        const fallbackEmail = bestEmail || (c.domain ? `info@${c.domain}` : c.fallback_email);
        const fallbackPhone = bestPhone || c.phone || c.fallback_phone;
        
        await (supabase as any)
          .from("lead_companies")
          .update({ 
            enrichment_status: companyPeopleFound > 0 ? "scraped" : "no_match",
            enriched_at: new Date().toISOString(),
            contact_type: companyPeopleFound > 0 ? "scraped_dm" : "fallback",
            fallback_email: fallbackEmail,
            fallback_phone: fallbackPhone,
          })
          .eq("id", c.id);
        
        if (companyPeopleFound > 0) scraped++;

        results.push({
          companyId: c.id,
          companyName: c.name,
          status: companyPeopleFound > 0 ? "success" : "no_data",
          peopleFound: companyPeopleFound,
          emailsFound: uniqueEmails.length,
          phonesFound: uniquePhones.length,
          linkedinUrlsFound: allLinkedInUrls.length,
        });

      } catch (error: any) {
        console.error(`Error scraping ${c.name}:`, error);
        
        await (supabase as any)
          .from("lead_companies")
          .update({ 
            enrichment_status: "failed",
            contact_type: "fallback",
            fallback_email: c.domain ? `info@${c.domain}` : null,
            fallback_phone: c.phone,
          })
          .eq("id", c.id);
        
        failed++;
        results.push({
          companyId: c.id,
          companyName: c.name,
          status: "failed",
          peopleFound: 0,
          emailsFound: 0,
          phonesFound: 0,
          linkedinUrlsFound: 0,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} companies`,
      stats: {
        processed,
        scraped,
        peopleFound: totalPeopleFound,
        failed,
        noData: processed - scraped - failed,
      },
      results,
    });
  } catch (error: any) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to scrape companies" },
      { status: 500 }
    );
  }
}
