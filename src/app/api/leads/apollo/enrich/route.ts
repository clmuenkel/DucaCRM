import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { enrichPersonById, extractPersonMobile, scoreDecisionMakerTitle } from "@/lib/apollo/client";

const APOLLO_API_BASE = "https://api.apollo.io/v1";

// Decision maker titles to search for (in priority order for home services)
const DECISION_MAKER_TITLES = [
  "Owner",
  "Founder",
  "Co-Founder",
  "President",
  "CEO",
  "Chief Executive Officer",
  "Managing Partner",
  "Principal",
  "General Manager",
  "Operations Manager",
];

interface ApolloPersonSearchParams {
  q_organization_domains?: string[];
  organization_domains?: string[];
  person_titles?: string[];
  page?: number;
  per_page?: number;
}

interface ApolloOrganization {
  id?: string;
  name?: string;
  website_url?: string;
  linkedin_url?: string;
  estimated_num_employees?: number;
}

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  linkedin_url?: string;
  phone_numbers?: Array<{
    raw_number: string;
    sanitized_number: string;
    type: string;
  }>;
  organization?: ApolloOrganization;
}

interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination?: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

interface EnrichRequest {
  companyIds?: string[]; // Specific companies to enrich
  limit?: number; // Max companies to process
  industry?: string; // Filter by industry
  retryFailed?: boolean; // Retry previously failed companies
}

interface EnrichResult {
  companyId: string;
  companyName: string;
  status: "success" | "no_match" | "failed" | "skipped";
  peopleFound: number;
  error?: string;
  retryCount?: number;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be exponentially increased

async function getApolloApiKey(): Promise<string | null> {
  // First try environment variable
  if (process.env.APOLLO_API_KEY) {
    return process.env.APOLLO_API_KEY;
  }
  
  // Fallback to user settings
  const { data: settings } = await insforge.database
    .from("user_settings")
    .select("apollo_api_key")
    .eq("user_id", DEFAULT_USER_ID)
    .single();
    
  return settings?.apollo_api_key || null;
}

/**
 * Search Apollo with retry logic
 */
async function searchApolloWithRetry(
  apiKey: string, 
  domain: string,
  maxRetries: number = MAX_RETRIES
): Promise<{ people: ApolloPerson[]; error?: string; retries: number }> {
  let lastError: string | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const searchParams = {
        q_organization_domains: [domain],
        person_titles: DECISION_MAKER_TITLES,
        per_page: 10,
      };

      const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify(searchParams),
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
        lastError = `Rate limited. Waiting ${retryAfter}s...`;
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        return { people: [], error: "Rate limit exceeded after retries", retries: attempt };
      }

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `HTTP ${response.status}: ${errorText}`;
        
        // Don't retry on auth errors
        if (response.status === 401 || response.status === 403) {
          return { people: [], error: "Invalid API key", retries: attempt };
        }
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
          continue;
        }
        return { people: [], error: lastError, retries: attempt };
      }

      const data: ApolloSearchResponse = await response.json();
      return { people: data.people || [], retries: attempt };
      
    } catch (error: any) {
      lastError = error.message;
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  return { people: [], error: lastError || "Unknown error", retries: maxRetries };
}


export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequest = await request.json();
    const { companyIds, limit = 50, industry, retryFailed = false } = body;

        const userId = DEFAULT_USER_ID;

    // Get Apollo API key
    const apiKey = await getApolloApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured. Add it in Settings or set APOLLO_API_KEY env var." },
        { status: 400 }
      );
    }

    // Build query for companies to enrich
    const statusesToQuery = retryFailed 
      ? ["pending", "failed", "no_match"] 
      : ["pending"];

    let query = insforge.database
      .from("lead_companies")
      .select("id, name, domain, website, phone")
      .eq("user_id", userId)
      .in("enrichment_status", statusesToQuery)
      .not("domain", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (companyIds && companyIds.length > 0) {
      query = query.in("id", companyIds);
    }
    
    if (industry) {
      query = query.eq("industry_tag", industry);
    }

    const { data: companies, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No companies to enrich",
        stats: { processed: 0, enriched: 0, peopleFound: 0, failed: 0, noMatch: 0 },
        results: [],
      });
    }

    const results: EnrichResult[] = [];
    let processed = 0;
    let enriched = 0;
    let peopleFound = 0;
    let failed = 0;
    let noMatch = 0;

    for (const company of companies) {
      const c = company as any;
      processed++;
      
      if (!c.domain) {
        // Mark as skipped if no domain
        await insforge.database
          .from("lead_companies")
          .update({ 
            enrichment_status: "skipped",
            contact_type: "fallback",
            fallback_email: null,
            fallback_phone: c.phone,
          })
          .eq("id", c.id);
        
        results.push({
          companyId: c.id,
          companyName: c.name,
          status: "skipped",
          peopleFound: 0,
        });
        continue;
      }

      // Search Apollo with retry
      const { people, error, retries } = await searchApolloWithRetry(apiKey, c.domain);
      
      if (error) {
        console.error(`Apollo error for ${c.name} (${c.domain}):`, error);
        
        await insforge.database
          .from("lead_companies")
          .update({ 
            enrichment_status: "failed",
            contact_type: "fallback",
            fallback_email: `info@${c.domain}`,
            fallback_phone: c.phone,
          })
          .eq("id", c.id);
        
        failed++;
        results.push({
          companyId: c.id,
          companyName: c.name,
          status: "failed",
          peopleFound: 0,
          error,
          retryCount: retries,
        });
        continue;
      }
      
      if (people.length === 0) {
        // No people found - set fallback contact info
        await insforge.database
          .from("lead_companies")
          .update({ 
            enrichment_status: "no_match",
            contact_type: "fallback",
            fallback_email: `info@${c.domain}`,
            fallback_phone: c.phone,
          })
          .eq("id", c.id);
        
        noMatch++;
        results.push({
          companyId: c.id,
          companyName: c.name,
          status: "no_match",
          peopleFound: 0,
          retryCount: retries,
        });
        continue;
      }

      // Insert people and mark primary contact
      let isPrimarySet = false;
      let companyPeopleFound = 0;
      let bestPhone: string | null = null;
      let bestEmail: string | null = null;
      
      for (const person of people) {
        if (!person.email) continue; // Skip people without email
        
        const confidence = scoreDecisionMakerTitle(person.title || "");
        const isPrimary = !isPrimarySet && confidence >= 70;
        let personWithPhones = person;
        if (isPrimary && person.id) {
          const enriched = await enrichPersonById(apiKey, person.id);
          if (enriched) {
            personWithPhones = enriched as any;
          }
        }
        const phones = extractPersonMobile(personWithPhones.phone_numbers);
        const phone = phones.mobile || phones.direct || phones.any;
        
        if (isPrimary) {
          isPrimarySet = true;
          bestPhone = phone;
          bestEmail = person.email;
        }
        
        const personData = {
          user_id: userId,
          lead_company_id: c.id,
          full_name: personWithPhones.name || `${person.first_name} ${person.last_name}`.trim(),
          first_name: person.first_name,
          last_name: person.last_name,
          title: person.title,
          email: person.email,
          email_status: "found",
          phone,
          phone_type: phones.mobile ? "mobile" : (phones.direct ? "direct" : "other"),
          linkedin_url: personWithPhones.linkedin_url || person.linkedin_url || null,
          source: "apollo",
          confidence_score: confidence,
          is_decision_maker: confidence >= 70,
          is_primary_contact: isPrimary,
          raw_payload: personWithPhones,
        };

        const { error: insertError } = await insforge.database
          .from("lead_people")
          .upsert(personData, {
            onConflict: "lead_company_id,email",
            ignoreDuplicates: false,
          });

        if (!insertError) {
          companyPeopleFound++;
          peopleFound++;
        }
      }

      // Mark company as enriched with DM contact type
      await insforge.database
        .from("lead_companies")
        .update({ 
          enrichment_status: "enriched",
          enriched_at: new Date().toISOString(),
          contact_type: companyPeopleFound > 0 ? "dm" : "fallback",
          // Also set fallback in case DM info becomes unavailable
          fallback_email: `info@${c.domain}`,
          fallback_phone: c.phone,
        })
        .eq("id", c.id);
      
      enriched++;
      results.push({
        companyId: c.id,
        companyName: c.name,
        status: "success",
        peopleFound: companyPeopleFound,
        retryCount: retries,
      });
      
      // Rate limiting - Apollo has limits (150 req/min on most plans)
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed} companies`,
      stats: {
        processed,
        enriched,
        peopleFound,
        failed,
        noMatch,
        skipped: processed - enriched - failed - noMatch,
      },
      results,
    });
  } catch (error: any) {
    console.error("Apollo enrich error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to enrich companies" },
      { status: 500 }
    );
  }
}

// GET endpoint to get enrichment status/stats
export async function GET(request: NextRequest) {
  try {
        const userId = DEFAULT_USER_ID;

    // Get counts by status
    const { data: statusCounts } = await insforge.database
      .from("lead_companies")
      .select("enrichment_status, contact_type")
      .eq("user_id", userId);

    const counts = {
      pending: 0,
      enriched: 0,
      no_match: 0,
      failed: 0,
      skipped: 0,
    };

    const contactTypes = {
      dm: 0,
      fallback: 0,
      pending: 0,
    };

    for (const row of statusCounts || []) {
      const r = row as any;
      const status = r.enrichment_status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
      
      const cType = r.contact_type as keyof typeof contactTypes;
      if (cType in contactTypes) {
        contactTypes[cType]++;
      }
    }

    // Get total people count
    const { count: peopleCount } = await insforge.database
      .from("lead_people")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Get DM vs fallback breakdown
    const { count: dmCount } = await insforge.database
      .from("lead_people")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("confidence_score", 70);

    return NextResponse.json({
      companies: counts,
      contactTypes,
      totalPeople: peopleCount || 0,
      decisionMakers: dmCount || 0,
      canRetry: counts.failed + counts.no_match,
    });
  } catch (error: any) {
    console.error("Get enrichment status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
