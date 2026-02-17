import type { ApolloSearchParams, ApolloSearchResponse, ApolloPerson } from "@/types/apollo";
import { getTimezoneFromLocation } from "@/lib/timezone";
import { APOLLO_MAX_RETRIES, APOLLO_RATE_LIMIT_BACKOFF_MS, DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { logDebug, logInfo, logWarn, logError } from "@/lib/logger";

const APOLLO_API_BASE = "https://api.apollo.io/v1";

// ============================================================
// KEYWORD-BASED INDUSTRY MAP (replaces broken industry tag IDs)
// Industry tag IDs return ZERO results — use keywords instead.
// ============================================================
export const INDUSTRY_KEYWORDS_MAP: Record<string, string[]> = {
  plumbing: ["plumbing", "plumbing services", "pipe repair", "plumbing contractor", "water heater"],
  hvac: ["hvac", "heating and cooling", "air conditioning", "hvac contractor", "heating contractor", "ac repair"],
  roofing: ["roofing", "roof repair", "roofing contractor", "roof replacement", "roofing services"],
  landscaping: ["landscaping", "lawn care", "landscape", "landscape contractor", "lawn service", "tree service"],
  pest_control: ["pest control", "exterminator", "pest management", "pest control services", "exterminating"],
  general_contractor: ["general contractor", "home builder", "construction contractor", "remodeling contractor", "home improvement"],
  painting: ["painting contractor", "house painter", "commercial painter", "painting services", "interior painting", "exterior painting"],
  cleaning: ["cleaning services", "commercial cleaning", "janitorial services", "office cleaning", "house cleaning", "maid service"],
  garage_door: ["garage door", "garage door repair", "garage door installation", "overhead door", "garage door contractor"],
  fencing: ["fencing contractor", "fence installation", "fence repair", "fence company", "fencing services", "vinyl fencing"],
};

// Legacy industry ID mapping for backward compatibility 
// (kept for existing imports, but keyword search is now preferred)
export const APOLLO_INDUSTRIES = {
  hvac: "5407d4ff6966620008b500bd",
  plumbing: "5407d4ff6966620008b500be", 
  roofing: "5407d4ff6966620008b500bf",
  electrical: "5407d4ff6966620008b500c0",
  solar: "5407d4ff6966620008b500c1",
  construction: "5407d4ff6966620008b500c2",
  landscaping: "5407d4ff6966620008b500c3",
  pest_control: "5407d4ff6966620008b500c4"
};

// Valid employee size buckets for Apollo search
export const EMPLOYEE_SIZE_BUCKETS = ["1,10", "11,20", "21,50", "51,200"];

// Title sets by company size
export const OWNER_TITLES = ["Owner", "CEO", "President", "Founder"];
export const EXPANDED_TITLES = [
  ...OWNER_TITLES,
  "COO",
  "CFO",
  "Operations Manager",
  "Procurement",
];

/**
 * Get appropriate titles based on employee range.
 * 1-20 employees → Owner/CEO/President/Founder only
 * 21+           → add COO, CFO, Operations Manager, Procurement
 */
export function getTitlesForSize(employeeRange: string): string[] {
  const max = parseInt(employeeRange.split(",")[1] || "10", 10);
  return max <= 20 ? OWNER_TITLES : EXPANDED_TITLES;
}

// Legacy exports kept for backward compat
export const DECISION_MAKER_TITLES = OWNER_TITLES;
export const DECISION_MAKER_TITLE_KEYWORDS = EXPANDED_TITLES;

export interface EnhancedSearchParams extends ApolloSearchParams {
  intent_topic_ids?: string[];
  organization_intent_score_min?: number;
  person_locations?: string[];
  q_organization_keyword_tags?: string[];
}

// ============================================================
// Retry helper: retries on 429 with 2s exponential backoff
// ============================================================
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = APOLLO_MAX_RETRIES
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt === maxRetries) {
      return response;
    }
    lastResponse = response;
    const delay = APOLLO_RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt); // 2s, 4s, 8s
    logWarn("Apollo rate-limited, retrying", { delayMs: delay, attempt: attempt + 1, maxRetries });
    await new Promise((r) => setTimeout(r, delay));
  }
  return lastResponse!;
}

// ============================================================
// KEYWORD-BASED SEARCH (the winning approach)
// ============================================================
export async function searchApolloContacts(
  apiKey: string,
  params: EnhancedSearchParams
): Promise<ApolloSearchResponse> {
  const searchParams: Record<string, any> = {
    person_locations: params.person_locations || ["United States"],
    page: params.page || 1,
    per_page: params.per_page || DEFAULT_PAGE_SIZE,
  };

  // Use keyword tags instead of industry tag IDs
  if (params.q_organization_keyword_tags?.length) {
    searchParams.q_organization_keyword_tags = params.q_organization_keyword_tags;
  }
  if (params.q_organization_domains) {
    searchParams.q_organization_domains = params.q_organization_domains;
  }
  if (params.organization_num_employees_ranges) {
    searchParams.organization_num_employees_ranges = params.organization_num_employees_ranges;
  }
  if (params.person_titles) {
    searchParams.person_titles = params.person_titles;
  }
  if (params.intent_topic_ids?.length) {
    searchParams.intent_topic_ids = params.intent_topic_ids;
  }
  if (params.organization_intent_score_min) {
    searchParams.organization_intent_score_min = params.organization_intent_score_min;
  }

  const response = await fetchWithRetry(
    `${APOLLO_API_BASE}/mixed_people/api_search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(searchParams),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Apollo API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Search Apollo by industry keyword + size + titles with step-down logic.
 * 1. Try owner titles first
 * 2. If zero results, broaden to all decision-maker titles
 */
export async function searchByIndustryKeyword(
  apiKey: string,
  industry: string,
  employeeRange: string = "1,10",
  options?: { per_page?: number; person_locations?: string[] }
): Promise<ApolloSearchResponse> {
  const keywords = INDUSTRY_KEYWORDS_MAP[industry];
  if (!keywords) {
    throw new Error(`Unknown industry: ${industry}. Valid: ${Object.keys(INDUSTRY_KEYWORDS_MAP).join(", ")}`);
  }

  const titles = getTitlesForSize(employeeRange);
  const per_page = options?.per_page || 25;
  const person_locations = options?.person_locations || ["United States"];

  // Step 1: Try with size-appropriate titles
  const result = await searchApolloContacts(apiKey, {
    q_organization_keyword_tags: keywords,
    organization_num_employees_ranges: [employeeRange],
    person_titles: titles,
    person_locations,
    per_page,
  } as EnhancedSearchParams);

  if (result.people && result.people.length > 0) {
    return result;
  }

  // Step 2: Broaden to all decision-maker titles
  logInfo("Apollo search broadening titles", { originalTitleCount: titles.length, industry, employeeRange });
  return searchApolloContacts(apiKey, {
    q_organization_keyword_tags: keywords,
    organization_num_employees_ranges: [employeeRange],
    person_titles: EXPANDED_TITLES,
    person_locations,
    per_page,
  } as EnhancedSearchParams);
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
  const response = await fetchWithRetry(`${APOLLO_API_BASE}/people/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      ...params,
      reveal_personal_emails: true,
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
 * Enrich a person by their Apollo ID
 */
export async function enrichPersonById(
  apiKey: string,
  personId: string,
  personDetails?: { first_name?: string; last_name?: string; organization_name?: string; linkedin_url?: string; domain?: string },
  webhookUrl?: string
): Promise<ApolloPerson | null> {
  try {
    logDebug("Apollo matching person by ID", { personId });

    const matchPayload: Record<string, any> = {
      id: personId,
      reveal_personal_emails: true,
    };

    const response = await fetchWithRetry(`${APOLLO_API_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(matchPayload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError("Apollo match failed", null, { status: response.status, errorPreview: errorBody.substring(0, 200) });

      if (personDetails?.first_name && personDetails?.organization_name) {
        logDebug("Apollo trying fallback match", { firstName: personDetails.first_name, organization: personDetails.organization_name });
        const fallbackPayload: Record<string, any> = {
          reveal_personal_emails: true,
          first_name: personDetails.first_name,
          organization_name: personDetails.organization_name,
        };
        if (personDetails?.last_name) fallbackPayload.last_name = personDetails.last_name;
        if (personDetails?.domain) fallbackPayload.domain = personDetails.domain;
        if (personDetails?.linkedin_url) fallbackPayload.linkedin_url = personDetails.linkedin_url;

        const fallbackResp = await fetchWithRetry(`${APOLLO_API_BASE}/people/match`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
          body: JSON.stringify(fallbackPayload),
        });

        if (fallbackResp.ok) {
          const fallbackData = await fallbackResp.json();
          if (fallbackData.person?.email) {
            logInfo("Apollo fallback match successful", { email: fallbackData.person.email });
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
      logWarn("Apollo no email revealed", { personId });
      return null;
    }

    const phoneNumbers = person.phone_numbers || [];
    const hasMobile = phoneNumbers.some((p: any) => p.type === "mobile");

    if (phoneNumbers.length > 0) {
      const types = phoneNumbers.map((p: any) => `${p.type}:${p.sanitized_number || p.raw_number}`).join(", ");
      logInfo("Apollo person enriched with phone", { email: person.email, phones: types });
    } else {
      logInfo("Apollo person enriched", { email: person.email, phoneCount: 0 });
    }

    if (!hasMobile && webhookUrl) {
      console.log(`[Apollo] No mobile found, requesting phone reveal via webhook...`);
      await requestPhoneReveal(apiKey, personId, webhookUrl);
    }

    return person;
  } catch (e) {
    logError("Apollo enrich failed", e, { personId });
    return null;
  }
}

async function requestPhoneReveal(
  apiKey: string,
  personId: string,
  webhookUrl: string
): Promise<boolean> {
  try {
    const response = await fetchWithRetry(`${APOLLO_API_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        id: personId,
        reveal_phone_number: true,
        webhook_url: webhookUrl,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError("Apollo phone reveal request failed", null, { errorPreview: errorBody.substring(0, 100) });
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
 */
function mapSearchResultToApolloPerson(
  candidate: {
    id: string;
    first_name: string;
    last_name: string;
    title: string;
    has_email: boolean;
    organization_name: string;
    linkedin_url?: string;
    email?: string;
  },
  company: { name: string; domain?: string | null; city?: string | null; state?: string | null }
): ApolloPerson {
  const name = `${candidate.first_name || ""} ${candidate.last_name || ""}`.trim() || candidate.first_name || candidate.last_name || company.name;
  const email = candidate.email?.trim() || "";
  const orgName = candidate.organization_name || company.name;
  const websiteUrl = company.domain ? `https://${company.domain}` : "";
  const city = company.city || "";
  const state = company.state || "";
  const country = "US";

  const mapped: ApolloPerson = {
    id: candidate.id,
    first_name: candidate.first_name || "",
    last_name: candidate.last_name || "",
    name,
    title: candidate.title || "",
    email,
    email_status: email ? "revealed" : candidate.has_email ? "pending" : "unavailable",
    phone_numbers: [],
    linkedin_url: candidate.linkedin_url || "",
    organization: {
      id: "",
      name: orgName,
      website_url: websiteUrl,
      linkedin_url: "",
      industry: "",
      estimated_num_employees: 0,
      annual_revenue: 0,
      annual_revenue_printed: "",
      city,
      state,
      country,
      technologies: [],
    },
    seniority: "",
    departments: [],
    city,
    state,
    country,
  };

  (mapped as any).has_email = candidate.has_email === true;
  return mapped;
}

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
  const searchParams: Record<string, any> = {
    person_locations: params.person_locations || ["United States"],
    per_page: params.per_page || 10,
  };

  if (params.domain) {
    searchParams.q_organization_domains = params.domain;
    console.log(`[Apollo] Searching by domain: "${params.domain}"`);
  } else {
    searchParams.q_organization_name = params.organization_name;
    console.log(`[Apollo] Searching by org name: "${params.organization_name}"`);
  }

  const response = await fetchWithRetry(
    `${APOLLO_API_BASE}/mixed_people/api_search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(searchParams),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Apollo org name search failed: ${response.status} - ${errorText}`);
    return [];
  }

  const data = await response.json();
  const people = data.people || [];

  console.log(`[Apollo] Found ${people.length} people at "${params.organization_name}"`);

  return people.map((p: any) => ({
    id: p.id,
    first_name: p.first_name || "",
    last_name: p.last_name || "",
    title: p.title || "",
    has_email: p.has_email === true,
    has_direct_phone: p.has_direct_phone === "Yes" || p.has_direct_phone === true,
    organization_name: p.organization?.name || params.organization_name,
    linkedin_url: p.linkedin_url || "",
    email: p.email || "",
  }));
}

/**
 * Find a decision maker using Apollo's 2-step process with step-down titles.
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
  console.log(`[Apollo] Finding decision maker for: ${company.name}`);

  try {
    let searchResults = await searchByOrganizationName(apiKey, {
      organization_name: company.name,
      domain: company.domain,
      person_titles: OWNER_TITLES,
    });

    if (searchResults.length === 0) {
      console.log(`[Apollo] No owners found, trying broader search...`);
      searchResults = await searchByOrganizationName(apiKey, {
        organization_name: company.name,
        domain: company.domain,
      });
    }

    if (searchResults.length > 0) {
      const ranked = searchResults
        .map((p) => ({ ...p, titleScore: scoreDecisionMakerTitle(p.title) }))
        .sort((a, b) => b.titleScore - a.titleScore);

      const bestMatch = ranked[0];
      if (bestMatch) {
        console.log(`[Apollo] Best match (raw search): ${bestMatch.first_name} ${bestMatch.last_name} - ${bestMatch.title}`);
        const mappedPerson = mapSearchResultToApolloPerson(bestMatch, company);
        const sourceTag = company.domain ? "apollo_domain" : "apollo_org_name";
        return { person: mappedPerson, source: sourceTag };
      }
    }
  } catch (e) {
    console.error("Apollo search error:", e);
  }

  return { person: null, source: "none" };
}

/**
 * Find the top N decision makers at a company
 */
export async function findTopDecisionMakers(
  apiKey: string,
  company: { name: string; domain?: string | null },
  limit: number = 3,
  webhookUrl?: string
): Promise<{ people: ApolloPerson[]; source: string; creditsUsed: number }> {
  console.log(`[Apollo] Finding top ${limit} decision makers at: ${company.name} (domain: ${company.domain})`);

  try {
    const searchResults = await searchByOrganizationName(apiKey, {
      organization_name: company.name,
      domain: company.domain,
      per_page: Math.max(limit * 3, 25),
    });

    if (searchResults.length === 0) {
      console.log(`[Apollo] No people found at "${company.name}"`);
      return { people: [], source: "none", creditsUsed: 0 };
    }

    const ranked = searchResults
      .map((p) => ({ ...p, titleScore: scoreDecisionMakerTitle(p.title) }))
      .sort((a, b) => b.titleScore - a.titleScore);

    const topN = ranked.slice(0, limit);
    topN.forEach((p, i) => console.log(`  ${i + 1}. ${p.first_name} - ${p.title} (score: ${p.titleScore})`));

    const mappedPeople = topN.map((candidate) => mapSearchResultToApolloPerson(candidate, company));
    const sourceTag = company.domain ? "apollo_domain" : "apollo_org_name";

    return { people: mappedPeople, source: sourceTag, creditsUsed: 0 };
  } catch (e) {
    console.error("[Apollo] Error finding top decision makers:", e);
    return { people: [], source: "error", creditsUsed: 0 };
  }
}

/**
 * Score a title for likelihood of being a decision-maker who buys services.
 */
export function scoreDecisionMakerTitle(title: string | null | undefined): number {
  if (!title) return 0;
  const t = title.toLowerCase().trim();

  // EXCLUDE non-buying roles
  if (/\b(cfo|chief\s*financial|finance|controller|accountant|accounting|treasurer|bookkeeper|financial\s*analyst)\b/i.test(t)) return 30;
  if (/\b(cmo|chief\s*marketing|marketing|brand|content|social\s*media|digital\s*marketing|advertising|pr\b|public\s*relations)\b/i.test(t)) return 30;
  if (/\b(chro|chief\s*human|human\s*resources|\bhr\b|recruiter|recruiting|talent|people\s*ops|people\s*operations|payroll)\b/i.test(t)) return 30;
  if (/\b(general\s*counsel|legal|attorney|lawyer|compliance|paralegal)\b/i.test(t)) return 30;
  if (/\b(cto|chief\s*technology|chief\s*information|cio|\bit\b|information\s*technology|software|developer|engineer|programmer|devops|sysadmin|network\s*admin)\b/i.test(t)) return 30;
  if (/\b(customer\s*service|customer\s*support|call\s*center|contact\s*center|support\s*specialist|help\s*desk)\b/i.test(t)) return 35;

  // PRIORITIZE buying decision-makers
  if (/\b(owner|co-?owner|proprietor)\b/i.test(t)) return 100;
  if (/\b(founder|co-?founder)\b/i.test(t)) return 98;
  if (/\b(ceo|chief\s*executive)\b/i.test(t)) return 95;
  if (/\b(president)\b/i.test(t)) return 95;
  if (/\b(coo|chief\s*operating)\b/i.test(t)) return 93;
  if (/\b(partner|managing\s*partner|principal)\b/i.test(t)) return 90;
  if (/\b(general\s*manager|\bgm\b)\b/i.test(t)) return 88;
  if (/\b(operations\s*manager|operations\s*director|director\s*of\s*operations|vp\s*of\s*operations|vp\s*operations)\b/i.test(t)) return 88;
  if (/\b(facilities|facility|building\s*manager|property\s*manager|maintenance\s*manager|plant\s*manager)\b/i.test(t)) return 85;
  if (/\b(branch\s*manager|regional\s*manager|district\s*manager|area\s*manager|location\s*manager|store\s*manager)\b/i.test(t)) return 82;
  if (/\b(office\s*manager|admin\s*manager|administrative\s*manager)\b/i.test(t)) return 78;
  if (/\b(vice\s*president|vp)\b/i.test(t)) return 75;
  if (/\b(director|managing\s*director|exec(utive)?\s*director)\b/i.test(t)) return 70;
  if (/\b(manager|supervisor|superintendent|foreman)\b/i.test(t)) return 60;
  if (/\b(purchasing|procurement|buyer|supply\s*chain)\b/i.test(t)) return 55;
  if (/\b(sales|business\s*development|account\s*exec|bd\b)\b/i.test(t)) return 45;
  if (/\b(executive\s*assistant|assistant\s*to|ea\b)\b/i.test(t)) return 40;

  return 35;
}

export function extractPersonMobile(
  phoneNumbers: Array<{ type?: string; sanitized_number?: string }> | undefined
): { mobile: string | null; direct: string | null; any: string | null } {
  if (!phoneNumbers?.length) return { mobile: null, direct: null, any: null };

  const mobile = phoneNumbers.find((p) => p.type === "mobile")?.sanitized_number || null;
  const direct = phoneNumbers.find((p) => p.type === "direct_dial" || p.type === "direct" || p.type === "work_direct")?.sanitized_number || null;
  const any = phoneNumbers.find((p) => p.type !== "work_hq" && p.type !== "corporate_hq" && p.sanitized_number)?.sanitized_number || null;

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
export function mapApolloToCompany(person: ApolloPerson, userId: string) {
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
