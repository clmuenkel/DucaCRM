import type { ApolloSearchParams, ApolloSearchResponse, ApolloPerson } from "@/types/apollo";
import { getTimezoneFromLocation } from "@/lib/timezone";

const APOLLO_API_BASE = "https://api.apollo.io/v1";

// Apollo industry tag IDs for home services (used for bulk search)
export const APOLLO_INDUSTRY_TAGS: Record<string, string> = {
  hvac: "5b106b591b148900016adb6d",
  plumbing: "5b106b5e1b148900016adb74",
  roofing: "5b106b5d1b148900016adb72",
  electrical: "5b106b481b148900016adb57",
  solar: "5b106b5f1b148900016adb75",
  construction: "5b106b441b148900016adb51",
};

// Decision maker titles in priority order
export const DECISION_MAKER_TITLES = [
  "Owner",
  "Founder",
  "Co-Founder",
  "President",
  "CEO",
  "Chief Executive Officer",
  "Principal",
  "Managing Partner",
  "General Manager",
];

export const DECISION_MAKER_TITLE_KEYWORDS = [
  "Owner",
  "Co-Owner",
  "Founder",
  "Co-Founder",
  "President",
  "Vice President",
  "CEO",
  "Chief Executive",
  "CFO",
  "COO",
  "Principal",
  "Partner",
  "Managing Partner",
  "Director",
  "Managing Director",
  "General Manager",
  "Operations Manager",
  "Branch Manager",
  "Manager",
];

export interface EnhancedSearchParams extends ApolloSearchParams {
  // Intent data filters
  intent_topic_ids?: string[];
  organization_intent_score_min?: number;
  // Always filter to US
  person_locations?: string[];
}

export async function searchApolloContacts(
  apiKey: string,
  params: EnhancedSearchParams
): Promise<ApolloSearchResponse> {
  // Always include US location filter
  const searchParams = {
    q_organization_domains: params.q_organization_domains,
    organization_industry_tag_ids: params.organization_industry_tag_ids,
    organization_num_employees_ranges: params.organization_num_employees_ranges,
    person_titles: params.person_titles,
    // Lock to United States
    person_locations: params.person_locations || ["United States"],
    page: params.page || 1,
    per_page: params.per_page || 25,
    // Intent data filters (if provided)
    ...(params.intent_topic_ids?.length && { 
      intent_topic_ids: params.intent_topic_ids 
    }),
    ...(params.organization_intent_score_min && { 
      organization_intent_score_min: params.organization_intent_score_min 
    }),
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

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Apollo API error: ${response.status}`);
  }

  return response.json();
}

export async function enrichApolloContact(
  apiKey: string,
  params: {
    email?: string;
    linkedin_url?: string;
    first_name?: string;
    last_name?: string;
    organization_name?: string;
  }
): Promise<ApolloPerson | null> {
  const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      ...params,
      reveal_personal_emails: true,
      // reveal_phone_number: true, // Requires webhook URL - disabled
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Apollo API error: ${response.status}`);
  }

  const data = await response.json();
  return data.person || null;
}

/**
 * Enrich a person by ID to reveal contact info (uses 1 credit per reveal)
 * 
 * @param webhookUrl - If provided, Apollo will send phone numbers to this URL asynchronously
 *                     Mobile numbers require webhook_url - they arrive 2-5 minutes after request
 */
/**
 * Enrich a person by their Apollo ID
 * 
 * Strategy:
 * 1. First call WITHOUT reveal_phone_number to get email + any available phone data
 * 2. If we got email but no mobile, AND webhook URL is provided, request phone reveal
 * 3. Phone reveal data will arrive via webhook (2-5 min later)
 */
export async function enrichPersonById(
  apiKey: string,
  personId: string,
  personDetails?: { first_name?: string; last_name?: string; organization_name?: string; linkedin_url?: string; domain?: string },
  webhookUrl?: string
): Promise<ApolloPerson | null> {
  try {
    console.log(`[Apollo] Match by ID: ${personId}`);
    
    // Step 1: Get person data WITHOUT phone reveal first
    const matchPayload: Record<string, any> = {
      id: personId,
      reveal_personal_emails: true,
    };

    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(matchPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Apollo] Match failed (${response.status}): ${errorBody.substring(0, 200)}`);
      
      // Try fallback with name + org if ID match fails
      if (personDetails?.first_name && personDetails?.organization_name) {
        console.log(`[Apollo] Trying fallback: name + org match...`);
        const fallbackPayload: Record<string, any> = {
          reveal_personal_emails: true,
          first_name: personDetails.first_name,
          organization_name: personDetails.organization_name,
        };
        if (personDetails?.last_name) fallbackPayload.last_name = personDetails.last_name;
        if (personDetails?.domain) fallbackPayload.domain = personDetails.domain;
        if (personDetails?.linkedin_url) fallbackPayload.linkedin_url = personDetails.linkedin_url;
        
        const fallbackResp = await fetch(`${APOLLO_API_BASE}/people/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify(fallbackPayload),
        });
        
        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json();
          if (fallbackData.person?.email) {
            console.log(`[Apollo] ✓ Fallback match: ${fallbackData.person.email}`);
            // Try phone reveal on fallback result too
            const fallbackPerson = fallbackData.person;
            const fallbackPhones = fallbackPerson.phone_numbers || [];
            const hasMobile = fallbackPhones.some((p: any) => p.type === "mobile");
            
            if (!hasMobile && webhookUrl && fallbackPerson.id) {
              await requestPhoneReveal(apiKey, fallbackPerson.id, webhookUrl);
            }
            return fallbackPerson;
          }
        }
      }
      return null;
    }

    const data = await response.json();
    const person = data.person;
    
    if (!person?.email) {
      console.log(`[Apollo] ✗ No email revealed for ID ${personId}`);
      return null;
    }

    const phoneNumbers = person.phone_numbers || [];
    const hasMobile = phoneNumbers.some((p: any) => p.type === "mobile");
    
    // Log what we got
    if (phoneNumbers.length > 0) {
      const types = phoneNumbers.map((p: any) => `${p.type}:${p.sanitized_number || p.raw_number}`).join(', ');
      console.log(`[Apollo] ✓ Got: ${person.email}, phones: [${types}]`);
    } else {
      console.log(`[Apollo] ✓ Got: ${person.email}, no phones available`);
    }

    // Step 2: If no mobile and webhook provided, request phone reveal
    // Apollo will send mobile number to webhook in 2-5 minutes
    if (!hasMobile && webhookUrl) {
      console.log(`[Apollo] No mobile found, requesting phone reveal via webhook...`);
      await requestPhoneReveal(apiKey, personId, webhookUrl);
    }

    return person;
  } catch (e) {
    console.error("[Apollo] Enrich error:", e);
    return null;
  }
}

/**
 * Request phone number reveal from Apollo
 * Apollo requires a webhook URL - they will POST phone data to it in 2-5 minutes
 */
async function requestPhoneReveal(
  apiKey: string,
  personId: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const payload = {
      id: personId,
      reveal_phone_number: true,
      webhook_url: webhookUrl,
    };

    const response = await fetch(`${APOLLO_API_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Apollo] Phone reveal request failed: ${errorBody.substring(0, 100)}`);
      return false;
    }

    console.log(`[Apollo] ✓ Phone reveal requested, webhook will receive data in 2-5 min`);
    return true;
  } catch (e) {
    console.error("[Apollo] Phone reveal error:", e);
    return false;
  }
}

/**
 * Search Apollo for people by organization name (not domain)
 * Returns basic info - use enrichPersonById to get full contact details
 */
export async function searchByOrganizationName(
  apiKey: string,
  params: {
    organization_name: string;
    domain?: string | null;
    person_titles?: string[];
    person_locations?: string[];
    per_page?: number;
  }
): Promise<Array<{
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  has_email: boolean;
  has_direct_phone: boolean;
  organization_name: string;
  linkedin_url?: string;
  email?: string;
}>> {
  // If we have domain, search by domain (more accurate)
  // Otherwise fall back to org name search
  const searchParams: Record<string, any> = {
    person_locations: params.person_locations || ["United States"],
    per_page: params.per_page || 10,
  };

  if (params.domain) {
    // Domain search is more accurate
    searchParams.q_organization_domains = params.domain;
    console.log(`[Apollo] Searching by domain: "${params.domain}"`);
  } else {
    searchParams.q_organization_name = params.organization_name;
    console.log(`[Apollo] Searching by org name: "${params.organization_name}"`);
  }

  const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(searchParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Apollo org name search failed: ${response.status} - ${errorText}`);
    return [];
  }

  const data = await response.json();
  const people = data.people || [];
  
  console.log(`[Apollo] Found ${people.length} people at "${params.organization_name}"`);
  
  // Return simplified info - caller should enrich to get full details
  return people.map((p: any) => ({
    id: p.id,
    first_name: p.first_name || "",
    last_name: p.last_name || "",
    title: p.title || "",
    has_email: p.has_email === true,
    has_direct_phone: p.has_direct_phone === "Yes" || p.has_direct_phone === true,
    organization_name: p.organization?.name || params.organization_name,
    linkedin_url: p.linkedin_url || "",
    email: p.email || "", // Some search results may include email directly
  }));
}

/**
 * Try to find a decision maker using Apollo's 2-step process:
 * 1. Search for people at the company by name
 * 2. Enrich the best match to reveal contact info (uses credits)
 */
export async function findDecisionMaker(
  apiKey: string,
  company: {
    name: string;
    domain?: string | null;
    city?: string | null;
    state?: string | null;
  },
  scrapedPerson?: {
    first_name?: string;
    last_name?: string;
  }
): Promise<{ person: ApolloPerson | null; source: string }> {
  // Titles to prioritize
  const ownerTitles = ["Owner", "Founder", "Co-Founder", "President", "CEO", "Principal"];
  
  console.log(`[Apollo] Finding decision maker for: ${company.name}`);
  
  // Step 1: Search by organization name (most reliable for small businesses)
  try {
    // First try with owner titles
    let searchResults = await searchByOrganizationName(apiKey, {
      organization_name: company.name,
      person_titles: ownerTitles,
    });
    
    // If no results with owner titles, try broader search (no title filter)
    if (searchResults.length === 0) {
      console.log(`[Apollo] No owners found, trying broader search...`);
      searchResults = await searchByOrganizationName(apiKey, {
        organization_name: company.name,
      });
    }
    
    if (searchResults.length > 0) {
      // Prioritize people with email who are likely decision makers
      const ranked = searchResults
        .filter(p => p.has_email)
        .sort((a, b) => {
          // Score by title relevance
          const titleScore = (title: string) => {
            const t = (title || "").toLowerCase();
            if (t.includes("owner") || t.includes("founder")) return 100;
            if (t.includes("ceo") || t.includes("president")) return 90;
            if (t.includes("principal") || t.includes("partner")) return 80;
            if (t.includes("general manager") || t.includes("director")) return 70;
            if (t.includes("manager")) return 60;
            return 50;
          };
          return titleScore(b.title) - titleScore(a.title);
        });
      
      if (ranked.length > 0) {
        const bestMatch = ranked[0];
        console.log(`[Apollo] Best match: ${bestMatch.first_name} (${bestMatch.title}) - enriching...`);
        
        // Step 2: Enrich to reveal contact info (uses 1 credit)
        const enrichedPerson = await enrichPersonById(apiKey, bestMatch.id);
        
        if (enrichedPerson && enrichedPerson.email) {
          console.log(`[Apollo] ✓ Got contact: ${enrichedPerson.email}`);
          return { person: enrichedPerson, source: "apollo_enriched" };
        }
      }
    }
  } catch (e) {
    console.error("Apollo search error:", e);
  }
  
  // Fallback: Try people/match if we have a scraped name
  if (scrapedPerson?.first_name && scrapedPerson?.last_name) {
    try {
      console.log(`[Apollo] Trying match for: ${scrapedPerson.first_name} ${scrapedPerson.last_name}`);
      const person = await enrichApolloContact(apiKey, {
        first_name: scrapedPerson.first_name,
        last_name: scrapedPerson.last_name,
        organization_name: company.name,
      });
      
      if (person && person.email) {
        return { person, source: "apollo_match" };
      }
    } catch (e) {
      console.error("Apollo match error:", e);
    }
  }
  
  return { person: null, source: "none" };
}

/**
 * Find the top N decision makers at a company
 * 1. Search ALL people at company (up to 25)
 * 2. Rank by title using scoreDecisionMakerTitle
 * 3. Enrich top N to reveal phone + email (uses N credits)
 * 
 * @param webhookUrl - If provided, Apollo will send mobile phone numbers to this URL asynchronously
 */
export async function findTopDecisionMakers(
  apiKey: string,
  company: { name: string; domain?: string | null },
  limit: number = 3,
  webhookUrl?: string
): Promise<{ people: ApolloPerson[]; source: string; creditsUsed: number }> {
  console.log(`[Apollo] Finding top ${limit} decision makers at: ${company.name} (domain: ${company.domain})`);
  
  try {
    // Step 1: Search ALL people at company (up to 25)
    // Prefer domain search if available (more accurate)
    const searchResults = await searchByOrganizationName(apiKey, {
      organization_name: company.name,
      domain: company.domain,
      per_page: 25,
    });

    if (searchResults.length === 0) {
      console.log(`[Apollo] No people found at "${company.name}"`);
      return { people: [], source: "none", creditsUsed: 0 };
    }

    console.log(`[Apollo] Found ${searchResults.length} people, filtering and ranking...`);

    // Step 2: Filter to those with email and rank by title
    const ranked = searchResults
      .filter(p => p.has_email)
      .map(p => ({
        ...p,
        titleScore: scoreDecisionMakerTitle(p.title),
      }))
      .sort((a, b) => b.titleScore - a.titleScore);

    if (ranked.length === 0) {
      console.log(`[Apollo] No people with email found`);
      return { people: [], source: "none", creditsUsed: 0 };
    }

    // Step 3: Take top N
    const topN = ranked.slice(0, limit);
    console.log(`[Apollo] Top ${topN.length} candidates:`);
    topN.forEach((p, i) => console.log(`  ${i + 1}. ${p.first_name} - ${p.title} (score: ${p.titleScore})`));

    // Step 4: Enrich each to reveal phone + email (uses 1 credit per person)
    const enrichedPeople: ApolloPerson[] = [];
    let creditsUsed = 0;

    for (const person of topN) {
      console.log(`[Apollo] Enriching: ${person.first_name} ${person.last_name} (${person.title}) at ${person.organization_name}`);
      
      // Get person data, request phone reveal via webhook if needed
      const enriched = await enrichPersonById(
        apiKey,
        person.id,
        {
          first_name: person.first_name,
          last_name: person.last_name,
          organization_name: person.organization_name,
          linkedin_url: person.linkedin_url,
          domain: company.domain || undefined,
        },
        webhookUrl
      );
      creditsUsed++;
      
      if (enriched && enriched.email) {
        enrichedPeople.push(enriched);
      } else {
        console.log(`[Apollo] ✗ No email returned for ${person.first_name} ${person.last_name}`);
      }
      
      // Small rate limit between people
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Apollo] Enriched ${enrichedPeople.length}/${topN.length} people, used ${creditsUsed} credits`);
    
    return { 
      people: enrichedPeople, 
      source: "apollo_top3",
      creditsUsed,
    };
  } catch (e) {
    console.error("[Apollo] Error finding top decision makers:", e);
    return { people: [], source: "error", creditsUsed: 0 };
  }
}

/**
 * Score a title for likelihood of being a decision-maker who buys services.
 * Optimized for home services (HVAC, plumbing, roofing, etc.)
 * 
 * EXCLUDED roles (score 30): Finance, Marketing, HR, Legal, IT - they don't buy HVAC services
 * PRIORITIZED roles (score 90-100): Owners, GMs, Operations - they make buying decisions
 */
export function scoreDecisionMakerTitle(title: string | null | undefined): number {
  if (!title) return 0;
  const t = title.toLowerCase().trim();

  // ========== STEP 1: EXCLUDE non-buying roles (score 30) ==========
  // These people don't typically make decisions about buying HVAC/plumbing/roofing services
  
  // Finance roles - they manage money, not operations
  if (/\b(cfo|chief\s*financial|finance|controller|accountant|accounting|treasurer|bookkeeper|financial\s*analyst)\b/i.test(t)) {
    return 30;
  }
  
  // Marketing roles - they manage brand, not facilities
  if (/\b(cmo|chief\s*marketing|marketing|brand|content|social\s*media|digital\s*marketing|advertising|pr\b|public\s*relations)\b/i.test(t)) {
    return 30;
  }
  
  // HR roles - they manage people, not buildings
  if (/\b(chro|chief\s*human|human\s*resources|\bhr\b|recruiter|recruiting|talent|people\s*ops|people\s*operations|payroll)\b/i.test(t)) {
    return 30;
  }
  
  // Legal roles - they manage compliance, not operations
  if (/\b(general\s*counsel|legal|attorney|lawyer|compliance|paralegal)\b/i.test(t)) {
    return 30;
  }
  
  // IT/Tech roles - they manage computers, not HVAC (unless it's a tech company)
  if (/\b(cto|chief\s*technology|chief\s*information|cio|\bit\b|information\s*technology|software|developer|engineer|programmer|devops|sysadmin|network\s*admin)\b/i.test(t)) {
    return 30;
  }
  
  // Customer service / Support - they handle complaints, not purchases
  if (/\b(customer\s*service|customer\s*support|call\s*center|contact\s*center|support\s*specialist|help\s*desk)\b/i.test(t)) {
    return 35;
  }

  // ========== STEP 2: PRIORITIZE buying decision-makers ==========
  
  // Owners - HIGHEST priority, they make ALL decisions
  if (/\b(owner|co-?owner|proprietor)\b/i.test(t)) return 100;
  
  // Founders/Presidents/CEOs - top executives who approve big purchases
  if (/\b(founder|co-?founder)\b/i.test(t)) return 98;
  if (/\b(ceo|chief\s*executive)\b/i.test(t)) return 95;
  if (/\b(president)\b/i.test(t)) return 95;
  
  // COO - Chief Operating Officer - directly responsible for operations/facilities
  if (/\b(coo|chief\s*operating)\b/i.test(t)) return 93;
  
  // Partners/Principals - equity holders who make decisions
  if (/\b(partner|managing\s*partner|principal)\b/i.test(t)) return 90;
  
  // General Manager / Operations Manager - run day-to-day, decide on vendors
  if (/\b(general\s*manager|\bgm\b)\b/i.test(t)) return 88;
  if (/\b(operations\s*manager|operations\s*director|director\s*of\s*operations|vp\s*of\s*operations|vp\s*operations)\b/i.test(t)) return 88;
  
  // Facilities Manager - DIRECTLY responsible for HVAC, plumbing, etc.
  if (/\b(facilities|facility|building\s*manager|property\s*manager|maintenance\s*manager|plant\s*manager)\b/i.test(t)) return 85;
  
  // Branch/Regional Manager - manage locations, make local decisions
  if (/\b(branch\s*manager|regional\s*manager|district\s*manager|area\s*manager|location\s*manager|store\s*manager)\b/i.test(t)) return 82;
  
  // Office Manager - often responsible for building/office needs
  if (/\b(office\s*manager|admin\s*manager|administrative\s*manager)\b/i.test(t)) return 78;
  
  // VP titles (not already excluded) - may have purchasing authority
  if (/\b(vice\s*president|vp)\b/i.test(t)) return 75;
  
  // Directors (not already excluded) - mid-level authority
  if (/\b(director|managing\s*director|exec(utive)?\s*director)\b/i.test(t)) return 70;
  
  // Other managers/supervisors
  if (/\b(manager|supervisor|superintendent|foreman)\b/i.test(t)) return 60;
  
  // Purchasing/Procurement - they process orders but may not decide
  if (/\b(purchasing|procurement|buyer|supply\s*chain)\b/i.test(t)) return 55;
  
  // Sales/BD - might know who to talk to, but don't buy HVAC
  if (/\b(sales|business\s*development|account\s*exec|bd\b)\b/i.test(t)) return 45;
  
  // Executive Assistant - often gatekeepers to decision makers
  if (/\b(executive\s*assistant|assistant\s*to|ea\b)\b/i.test(t)) return 40;
  
  // Default - unknown role
  return 35;
}

export function extractPersonMobile(
  phoneNumbers: Array<{ type?: string; sanitized_number?: string }> | undefined
): { mobile: string | null; direct: string | null; any: string | null } {
  if (!phoneNumbers?.length) return { mobile: null, direct: null, any: null };

  const mobile = phoneNumbers.find((p) => p.type === "mobile")?.sanitized_number || null;
  const direct =
    phoneNumbers.find(
      (p) => p.type === "direct_dial" || p.type === "direct" || p.type === "work_direct"
    )?.sanitized_number || null;
  const any =
    phoneNumbers.find(
      (p) => p.type !== "work_hq" && p.type !== "corporate_hq" && p.sanitized_number
    )?.sanitized_number || null;

  return { mobile, direct, any };
}

/**
 * Map Apollo person data to our contact format
 */
export function mapApolloToContact(
  person: ApolloPerson,
  userId: string,
  sourceList?: string,
  companyId?: string
) {
  const city = person.city || person.organization?.city;
  const state = person.state || person.organization?.state;
  const country = person.country || person.organization?.country || "US";

  return {
    user_id: userId,
    company_id: companyId || null,
    apollo_id: person.id,
    enrichment_status: "enriched",
    enriched_at: new Date().toISOString(),
    first_name: person.first_name,
    last_name: person.last_name,
    email: person.email,
    phone: person.phone_numbers?.[0]?.sanitized_number || null,
    mobile: person.phone_numbers?.find((p) => p.type === "mobile")?.sanitized_number || null,
    linkedin_url: person.linkedin_url,
    title: person.title,
    seniority: person.seniority,
    department: person.departments?.[0] || null,
    company_name: person.organization?.name,
    company_domain: person.organization?.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    company_linkedin: person.organization?.linkedin_url,
    industry: person.organization?.industry,
    employee_count: person.organization?.estimated_num_employees,
    employee_range: getEmployeeRange(person.organization?.estimated_num_employees),
    annual_revenue: person.organization?.annual_revenue_printed,
    city,
    state,
    country,
    source: "apollo",
    source_list: sourceList,
    stage: "fresh",
    status: "active",
  };
}

/**
 * Map Apollo organization data to our company format
 */
export function mapApolloToCompany(
  person: ApolloPerson,
  userId: string
) {
  const org = person.organization;
  if (!org) return null;

  const city = org.city || person.city;
  const state = org.state || person.state;
  const country = org.country || person.country || "US";
  const timezone = getTimezoneFromLocation(city, state, country);

  const domain = org.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return {
    user_id: userId,
    name: org.name,
    domain: domain || null,
    industry: org.industry || null,
    employee_count: org.estimated_num_employees || null,
    employee_range: getEmployeeRange(org.estimated_num_employees),
    city: city || null,
    state: state || null,
    country,
    timezone,
    website: org.website_url || null,
    linkedin_url: org.linkedin_url || null,
    annual_revenue: org.annual_revenue_printed || null,
    // Intent data (if available from Apollo response)
    intent_score: (org as any).intent_score || null,
    intent_topics: (org as any).intent_topics || [],
  };
}

function getEmployeeRange(count?: number): string | null {
  if (!count) return null;
  if (count <= 50) return "1-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  if (count <= 1000) return "501-1000";
  if (count <= 5000) return "1001-5000";
  return "5001+";
}

// Apollo intent topics for reference
export const APOLLO_INTENT_TOPICS = [
  { id: "home_improvement", label: "Home Improvement" },
  { id: "construction", label: "Construction" },
  { id: "facility_management", label: "Facility Management" },
  { id: "real_estate", label: "Real Estate" },
  { id: "energy_efficiency", label: "Energy Efficiency" },
  { id: "sustainability", label: "Sustainability" },
];

// Apollo industry codes for home services targets
// Note: These are Apollo's internal industry tag IDs
export const APOLLO_INDUSTRIES = {
  hvac: "5b106b591b148900016adb6d",
  plumbing: "5b106b5e1b148900016adb74",
  roofing: "5b106b5d1b148900016adb72",
  electrical: "5b106b481b148900016adb57",
  construction: "5b106b441b148900016adb51",
  solar: "5b106b5f1b148900016adb75",
  general_contractor: "5b106b441b148900016adb51",
};
