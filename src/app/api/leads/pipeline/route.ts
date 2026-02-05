import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { extractPersonMobile, findDecisionMaker } from "@/lib/apollo/client";

export const dynamic = 'force-dynamic';

const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";

// Industry keywords for home services
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  hvac: ["HVAC contractor", "heating and cooling", "air conditioning repair"],
  plumbing: ["plumber", "plumbing contractor", "plumbing services"],
  roofing: ["roofing contractor", "roof repair", "roofing company"],
  electrical: ["electrician", "electrical contractor", "electrical services"],
  solar: ["solar installer", "solar panel installation", "solar contractor"],
  construction: ["general contractor", "home builder", "remodeling contractor"],
};

interface PipelineRequest {
  industry: string;
  location: string;
  maxCompanies?: number;
  skipScrape?: boolean;
  enableFacebook?: boolean;
  enableBBB?: boolean;
  enableReviewExtraction?: boolean;
}

interface PipelineProgress {
  step: string;
  status: "pending" | "running" | "completed" | "failed";
  message: string;
  stats?: Record<string, number>;
}

interface PlaceResult {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  addressComponents?: Array<{
    types: string[];
    shortText: string;
    longText: string;
  }>;
  reviews?: Array<{
    text?: { text: string };
    authorAttribution?: { displayName: string };
  }>;
}

function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractAddressComponents(components: PlaceResult["addressComponents"]) {
  const result = { city: "", state: "", zip: "", country: "US" };
  if (!components) return result;
  
  for (const component of components) {
    if (component.types.includes("locality")) {
      result.city = component.longText;
    } else if (component.types.includes("administrative_area_level_1")) {
      result.state = component.shortText;
    } else if (component.types.includes("postal_code")) {
      result.zip = component.shortText;
    } else if (component.types.includes("country")) {
      result.country = component.shortText;
    }
  }
  return result;
}

async function upsertCompanyToCRM(
  insforgeClient: any,
  userId: string,
  company: {
    name: string;
    domain: string | null;
    website: string | null;
    city: string | null;
    state: string | null;
    industry: string;
    country?: string;
  }
): Promise<string> {
  const payload = {
    user_id: userId,
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    city: company.city,
    state: company.state,
    country: company.country || "US",
    website: company.website,
  };

  if (company.domain) {
    const { data, error } = await insforge.database
      .from("companies")
      .upsert(payload, { onConflict: "user_id,domain" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data: existing } = await insforge.database
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .eq("name", company.name)
    .eq("city", company.city)
    .eq("state", company.state)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await insforge.database
    .from("companies")
    .insert([payload])
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function upsertContactToCRM(
  insforgeClient: any,
  userId: string,
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    phone_type: string | null;
    linkedin_url: string | null;
    title: string | null;
    company_name: string;
    company_domain: string | null;
    industry: string;
    city: string | null;
    state: string | null;
    company_id: string | null;
    source: string;
    lead_score: number;
  }
): Promise<"inserted" | "exists"> {
  const { data: existing } = await insforge.database
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .eq("email", contact.email)
    .maybeSingle();

  if (existing?.id) return "exists";

  const primaryPhone = contact.phone_type === "mobile" ? null : contact.phone;
  const mobilePhone = contact.phone_type === "mobile" ? contact.phone : null;

  const { error } = await insforge.database
    .from("contacts")
    .insert([{
      user_id: userId,
      company_id: contact.company_id,
      first_name: contact.first_name || "Owner",
      last_name: contact.last_name,
      email: contact.email,
      phone: primaryPhone,
      mobile: mobilePhone,
      linkedin_url: contact.linkedin_url,
      title: contact.title || "Owner",
      company_name: contact.company_name,
      company_domain: contact.company_domain,
      industry: contact.industry,
      city: contact.city,
      state: contact.state,
      country: "US",
      stage: "fresh",
      status: "active",
      source: contact.source,
      source_list: `${contact.industry} - ${contact.city || ""}, ${contact.state || ""}`,
      lead_score: contact.lead_score,
      enrichment_status: "enriched",
      enriched_at: new Date().toISOString(),
      cadence_status: "none",
    }]);

  if (error) throw error;
  return "inserted";
}

function scoreTitle(title: string): number {
  const titleLower = title.toLowerCase();
  if (titleLower.includes("owner")) return 100;
  if (titleLower.includes("founder")) return 95;
  if (titleLower.includes("president")) return 90;
  if (titleLower.includes("ceo")) return 85;
  if (titleLower.includes("managing partner")) return 80;
  if (titleLower.includes("principal")) return 75;
  if (titleLower.includes("general manager")) return 70;
  return 40;
}

/**
 * Generate email patterns from a name and domain
 */
function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();
  
  return [
    `${f}@${domain}`,                    // john@domain.com (most common for small biz)
    `${f}${l}@${domain}`,                // johnsmith@domain.com
    `${f}.${l}@${domain}`,               // john.smith@domain.com
    `${f[0]}${l}@${domain}`,             // jsmith@domain.com
    `${f}${l[0]}@${domain}`,             // johns@domain.com
  ];
}

/**
 * POST /api/leads/pipeline
 * Run the full lead generation pipeline with multi-source discovery
 */
export async function POST(request: NextRequest) {
  try {
    const body: PipelineRequest = await request.json();
    const { 
      industry, 
      location, 
      maxCompanies = 20, 
      skipScrape = false,
      enableFacebook = true,
      enableBBB = true,
      enableReviewExtraction = true,
    } = body;

    if (!industry || !location) {
      return NextResponse.json(
        { error: "Industry and location are required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;
    const baseUrl = request.nextUrl.origin;

    // Get API keys
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    const apolloApiKey = process.env.APOLLO_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!googleApiKey) {
      return NextResponse.json(
        { error: "GOOGLE_PLACES_API_KEY not configured" },
        { status: 400 }
      );
    }

    // Also check user_settings for Apollo key
    let effectiveApolloKey = apolloApiKey;
    if (!effectiveApolloKey) {
      const { data: settings } = await insforge.database
        .from("user_settings")
        .select("apollo_api_key")
        .eq("user_id", userId)
        .single();
      effectiveApolloKey = (settings as any)?.apollo_api_key || null;
    }

    const progress: PipelineProgress[] = [];
    const finalStats = {
      companiesFound: 0,
      companiesWithDM: 0,
      companiesScraped: 0,
      companiesWithFallback: 0,
      totalPeopleFound: 0,
      apolloMatches: 0,
      apolloOrgNameMatches: 0,
      scrapedPeople: 0,
      reviewExtractions: 0,
      facebookMatches: 0,
      bbbMatches: 0,
      contactsSaved: 0,
      failed: 0,
    };

    // ===========================================
    // STEP 1: Google Places Search (with reviews)
    // ===========================================
    progress.push({
      step: "places_search",
      status: "running",
      message: `Searching Google Places for ${industry} companies in ${location}...`,
    });

    const keywords = INDUSTRY_KEYWORDS[industry];
    if (!keywords) {
      return NextResponse.json(
        { error: `Unknown industry: ${industry}` },
        { status: 400 }
      );
    }

    const allPlaces: PlaceResult[] = [];
    const seenPlaceIds = new Set<string>();

    console.log(`[Pipeline] Starting Places search: industry=${industry}, location=${location}`);

    for (const keyword of keywords) {
      if (allPlaces.length >= maxCompanies) break;
      
      const query = `${keyword} in ${location}`;
      
      try {
        const response = await fetch(PLACES_API_BASE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": googleApiKey,
            // Include reviews for AI extraction
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.addressComponents,places.reviews",
          },
          body: JSON.stringify({
            textQuery: query,
            maxResultCount: Math.min(20, maxCompanies - allPlaces.length),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const places = data.places || [];
          
          for (const place of places) {
            if (!seenPlaceIds.has(place.id) && allPlaces.length < maxCompanies) {
              seenPlaceIds.add(place.id);
              allPlaces.push(place);
            }
          }
        }
      } catch (e: any) {
        console.error(`[Pipeline] Places error for "${keyword}":`, e.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[Pipeline] Found ${allPlaces.length} unique places`);

    // Insert companies into database
    const insertedCompanyIds: string[] = [];
    const companyReviews: Map<string, string[]> = new Map();
    
    for (const place of allPlaces) {
      const address = extractAddressComponents(place.addressComponents);
      const domain = extractDomain(place.websiteUri);
      
      // Collect review responses for later AI extraction
      const reviewTexts = (place.reviews || [])
        .filter(r => r.text?.text)
        .map(r => r.text!.text);
      
      const companyData = {
        user_id: userId,
        place_id: place.id,
        name: place.displayName.text,
        website: place.websiteUri || null,
        domain,
        phone: place.nationalPhoneNumber || null,
        address: place.formattedAddress,
        city: address.city || null,
        state: address.state || null,
        zip: address.zip || null,
        country: address.country,
        industry_tag: industry,
        source: "google_places",
        enrichment_status: "pending",
        contact_type: "pending",
        fallback_email: domain ? `info@${domain}` : null,
        fallback_phone: place.nationalPhoneNumber || null,
      };

      const { data: inserted, error } = await insforge.database
        .from("lead_companies")
        .upsert(companyData, {
          onConflict: "user_id,place_id",
          ignoreDuplicates: false,
        })
        .select("id")
        .single();

      if (!error && inserted) {
        insertedCompanyIds.push(inserted.id);
        finalStats.companiesFound++;
        if (reviewTexts.length > 0) {
          companyReviews.set(inserted.id, reviewTexts);
        }
      }
    }

    progress[0].status = "completed";
    progress[0].message = `Found ${finalStats.companiesFound} companies`;
    progress[0].stats = { found: finalStats.companiesFound };

    // ===========================================
    // STEP 2: Apollo Enrichment (Multi-method)
    // ===========================================
    if (effectiveApolloKey && insertedCompanyIds.length > 0) {
      progress.push({
        step: "apollo_enrich",
        status: "running",
        message: `Enriching with Apollo (domain + org name search)...`,
      });

      const { data: companies } = await insforge.database
        .from("lead_companies")
        .select("id, name, domain, phone, city, state")
        .in("id", insertedCompanyIds);

      for (const company of companies || []) {
        const c = company as any;
        
        try {
          // Use the multi-method finder
          const { person, source } = await findDecisionMaker(
            effectiveApolloKey,
            {
              name: c.name,
              domain: c.domain,
              city: c.city,
              state: c.state,
            }
          );

          if (person && person.email) {
            const confidence = scoreTitle(person.title || "");
            const personName = person.name || `${person.first_name} ${person.last_name}`.trim();
            
            console.log(`[Pipeline] Saving contact: ${personName} (${person.email}) for ${c.name}`);
            
            // Check if this person already exists for this company
            const { data: existingPerson } = await insforge.database
              .from("lead_people")
              .select("id")
              .eq("lead_company_id", c.id)
              .eq("email", person.email)
              .limit(1)
              .single();
            
            if (!existingPerson) {
              const phones = extractPersonMobile(person.phone_numbers);
              const { error: insertError } = await insforge.database
                .from("lead_people")
                .insert([{
                  user_id: userId,
                  lead_company_id: c.id,
                  full_name: personName,
                  first_name: person.first_name,
                  last_name: person.last_name,
                  title: person.title,
                  email: person.email,
                  email_status: "found",
                  email_verified: true,
                  phone: phones.mobile || phones.direct || phones.any,
                  phone_type: phones.mobile ? "mobile" : (phones.direct ? "direct" : "other"),
                  linkedin_url: person.linkedin_url || null,
                  source: source,
                  confidence_score: confidence,
                  is_decision_maker: confidence >= 70,
                  is_primary_contact: true,
                }]);
              
              if (insertError) {
                console.error(`[Pipeline] Failed to save contact: ${insertError.message}`);
              } else {
                console.log(`[Pipeline] ✓ Saved ${personName} to lead_people`);
              }
            } else {
              console.log(`[Pipeline] Contact ${personName} already exists, skipping`);
            }

            // Direct injection into CRM contacts
            try {
              const companyId = await upsertCompanyToCRM(insforge, userId, {
                name: c.name,
                domain: c.domain,
                website: null,
                city: c.city,
                state: c.state,
                industry,
                country: "US",
              });

              const contactPhones = extractPersonMobile(person.phone_numbers);
              const result = await upsertContactToCRM(insforge, userId, {
                first_name: person.first_name || personName.split(" ")[0] || null,
                last_name: person.last_name || personName.split(" ").slice(1).join(" ") || null,
                email: person.email,
                phone: contactPhones.mobile || contactPhones.direct || contactPhones.any,
                phone_type: contactPhones.mobile ? "mobile" : (contactPhones.direct ? "direct" : "other"),
                linkedin_url: person.linkedin_url || null,
                title: person.title || "Owner",
                company_name: c.name,
                company_domain: c.domain || null,
                industry,
                city: c.city || null,
                state: c.state || null,
                company_id: companyId,
                source,
                lead_score: confidence,
              });

              if (result === "inserted") {
                finalStats.contactsSaved++;
              }
            } catch (crmError: any) {
              console.error(`[Pipeline] CRM insert error for ${person.email}: ${crmError.message}`);
            }
            
            await insforge.database
              .from("lead_companies")
              .update({
                enrichment_status: "enriched",
                enriched_at: new Date().toISOString(),
                contact_type: "dm_verified",
              })
              .eq("id", c.id);
            
            finalStats.totalPeopleFound++;
            finalStats.companiesWithDM++;
            
            if (source === "apollo_domain") {
              finalStats.apolloMatches++;
            } else {
              finalStats.apolloOrgNameMatches++;
            }
          } else {
            await insforge.database
              .from("lead_companies")
              .update({
                enrichment_status: "no_match",
                contact_type: "pending_scrape",
              })
              .eq("id", c.id);
          }
          
          await new Promise(resolve => setTimeout(resolve, 400));
          
        } catch (e) {
          console.error(`Apollo error for ${c.name}:`, e);
        }
      }

      progress[1].status = "completed";
      progress[1].message = `Apollo: ${finalStats.apolloMatches} domain, ${finalStats.apolloOrgNameMatches} org name matches`;
      progress[1].stats = { domain: finalStats.apolloMatches, orgName: finalStats.apolloOrgNameMatches };
    } else {
      progress.push({
        step: "apollo_enrich",
        status: "completed",
        message: effectiveApolloKey ? "No companies to enrich" : "Apollo API key not configured",
      });
    }

    // ===========================================
    // STEP 3: AI Review Extraction (for no-match)
    // ===========================================
    if (enableReviewExtraction && openaiApiKey) {
      progress.push({
        step: "review_extraction",
        status: "running",
        message: "Extracting owner names from Google reviews...",
      });

      const { data: noMatchCompanies } = await insforge.database
        .from("lead_companies")
        .select("id, name, domain")
        .in("id", insertedCompanyIds)
        .eq("contact_type", "pending_scrape");

      console.log(`[Pipeline] Review extraction: ${noMatchCompanies?.length || 0} companies need review extraction`);
      console.log(`[Pipeline] companyReviews map has ${companyReviews.size} entries`);

      for (const company of noMatchCompanies || []) {
        const c = company as any;
        const reviews = companyReviews.get(c.id) || [];
        
        console.log(`[Pipeline] Company ${c.name}: ${reviews.length} reviews`);
        if (reviews.length === 0) continue;
        
        try {
          // Call our extract-owner API with review text
          for (const reviewText of reviews) {
            const extractResponse = await fetch(`${baseUrl}/api/leads/extract-owner`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rawText: reviewText }),
            });

            if (extractResponse.ok) {
              const extractData = await extractResponse.json();
              console.log(`[Pipeline] AI extracted for ${c.name}: ${JSON.stringify(extractData)}`);
              
              if (extractData.success && extractData.ownerName && extractData.confidence >= 50) {
                console.log(`[Pipeline] Found owner "${extractData.ownerName}" for ${c.name}`);
                // We found an owner name! Generate email patterns
                const emails = c.domain 
                  ? generateEmailPatterns(
                      extractData.firstName || extractData.ownerName.split(" ")[0],
                      extractData.lastName || extractData.ownerName.split(" ").slice(-1)[0],
                      c.domain
                    )
                  : [];
                
                // If we have Apollo, try to verify this person
                let verifiedEmail: string | null = null;
                let verifiedPhone: string | null = null;
                
                if (effectiveApolloKey && extractData.firstName && extractData.lastName) {
                  const { person } = await findDecisionMaker(
                    effectiveApolloKey,
                    { name: c.name, domain: c.domain },
                    { first_name: extractData.firstName, last_name: extractData.lastName }
                  );
                  
                  if (person?.email) {
                    verifiedEmail = person.email;
                    const verifiedPhones = extractPersonMobile(person.phone_numbers);
                    verifiedPhone = verifiedPhones.mobile || verifiedPhones.direct || verifiedPhones.any;
                  }
                }
                
                // Check if this company already has a lead_person
                const { data: existingPeople } = await insforge.database
                  .from("lead_people")
                  .select("id")
                  .eq("lead_company_id", c.id)
                  .limit(1);
                
                if (!existingPeople || existingPeople.length === 0) {
                  // No existing person, insert new one
                  const insertResult = await insforge.database
                    .from("lead_people")
                    .insert([{
                      user_id: userId,
                      lead_company_id: c.id,
                      full_name: extractData.ownerName,
                      first_name: extractData.firstName,
                      last_name: extractData.lastName,
                      title: "Owner",
                      email: verifiedEmail || emails[0] || null,
                      email_status: verifiedEmail ? "verified" : (emails[0] ? "guessed" : "unknown"),
                      email_verified: !!verifiedEmail,
                      phone: verifiedPhone,
                      source: "review_ai",
                      confidence_score: verifiedEmail ? 85 : extractData.confidence,
                      is_decision_maker: true,
                      is_primary_contact: true,
                    }]);
                    
                  if (insertResult.error) {
                    console.error(`[Pipeline] Failed to save AI extracted person: ${insertResult.error.message}`);
                  } else {
                    console.log(`[Pipeline] Saved AI extracted person "${extractData.ownerName}" for ${c.name}`);
                  }
                } else {
                  console.log(`[Pipeline] Company ${c.name} already has a contact, skipping AI extraction save`);
                }
                
                await insforge.database
                  .from("lead_companies")
                  .update({
                    enrichment_status: verifiedEmail ? "enriched" : "scraped",
                    contact_type: verifiedEmail ? "dm_verified" : "dm_guessed",
                  })
                  .eq("id", c.id);
                
                finalStats.reviewExtractions++;
                finalStats.totalPeopleFound++;
                if (verifiedEmail) finalStats.companiesWithDM++;
                
                break; // Found owner, move to next company
              }
            }
          }
        } catch (e) {
          console.error(`Review extraction error for ${c.name}:`, e);
        }
      }

      progress[2].status = "completed";
      progress[2].message = `Extracted ${finalStats.reviewExtractions} owner names from reviews`;
      progress[2].stats = { extracted: finalStats.reviewExtractions };
    }

    // ===========================================
    // STEP 4: Facebook Scraping (DISABLED - blocked by login wall)
    // ===========================================
    if (false && enableFacebook && !skipScrape) { // DISABLED - Facebook blocks scraping
      progress.push({
        step: "facebook_scrape",
        status: "running",
        message: "Searching Facebook for mobile numbers...",
      });

      const { data: pendingCompanies } = await insforge.database
        .from("lead_companies")
        .select("id, name, website")
        .in("id", insertedCompanyIds)
        .in("contact_type", ["pending_scrape", "dm_guessed"]);

      for (const company of pendingCompanies || []) {
        const c = company as any;
        if (!c.website) continue;
        
        try {
          const fbResponse = await fetch(`${baseUrl}/api/leads/facebook-scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ websiteUrl: c.website, companyName: c.name }),
          });

          if (fbResponse.ok) {
            const fbData = await fbResponse.json();
            
            if (fbData.success && (fbData.phone || fbData.ownerName)) {
              // Update existing lead_person or create new one
              const updates: any = {};
              
              if (fbData.phone) {
                updates.phone = fbData.phone;
                updates.phone_type = "mobile"; // Facebook phones are usually mobile
              }
              
              if (fbData.ownerName) {
                const nameParts = fbData.ownerName.split(" ");
                updates.full_name = fbData.ownerName;
                updates.first_name = nameParts[0];
                updates.last_name = nameParts.slice(1).join(" ");
                updates.title = "Owner";
              }
              
              if (Object.keys(updates).length > 0) {
                // Check if we have an existing person for this company
                const { data: existingPerson } = await insforge.database
                  .from("lead_people")
                  .select("id")
                  .eq("lead_company_id", c.id)
                  .eq("is_primary_contact", true)
                  .single();
                
                if (existingPerson) {
                  await insforge.database
                    .from("lead_people")
                    .update(updates)
                    .eq("id", existingPerson.id);
                } else {
                  await insforge.database
                    .from("lead_people")
                    .insert([{
                      user_id: userId,
                      lead_company_id: c.id,
                      ...updates,
                      source: "facebook",
                      confidence_score: 70,
                      is_decision_maker: !!fbData.ownerName,
                      is_primary_contact: true,
                    });
                }
                
                finalStats.facebookMatches++;
              }
            }
          }
        } catch (e) {
          console.error(`Facebook scrape error for ${c.name}:`, e);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      progress[progress.length - 1].status = "completed";
      progress[progress.length - 1].message = `Found ${finalStats.facebookMatches} contacts from Facebook`;
      progress[progress.length - 1].stats = { found: finalStats.facebookMatches };
    }

    // ===========================================
    // STEP 5: BBB Lookup
    // ===========================================
    if (enableBBB && !skipScrape) {
      progress.push({
        step: "bbb_lookup",
        status: "running",
        message: "Looking up owners on BBB...",
      });

      const { data: stillPending } = await insforge.database
        .from("lead_companies")
        .select("id, name, city, state")
        .in("id", insertedCompanyIds)
        .in("contact_type", ["pending_scrape", "dm_guessed"])
        .not("city", "is", null)
        .not("state", "is", null);

      for (const company of stillPending || []) {
        const c = company as any;
        
        try {
          const bbbResponse = await fetch(`${baseUrl}/api/leads/bbb-lookup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyName: c.name, city: c.city, state: c.state }),
          });

          if (bbbResponse.ok) {
            const bbbData = await bbbResponse.json();
            
            if (bbbData.success && bbbData.ownerName) {
              const nameParts = bbbData.ownerName.split(" ");
              
              // Check if we have an existing person
              const { data: existingPerson } = await insforge.database
                .from("lead_people")
                .select("id")
                .eq("lead_company_id", c.id)
                .eq("is_primary_contact", true)
                .single();
              
              if (existingPerson) {
                await insforge.database
                  .from("lead_people")
                  .update({
                    full_name: bbbData.ownerName,
                    first_name: nameParts[0],
                    last_name: nameParts.slice(1).join(" "),
                    title: "Owner",
                    phone: bbbData.phone || undefined,
                  })
                  .eq("id", existingPerson.id);
              } else {
                await insforge.database
                  .from("lead_people")
                  .insert([{
                    user_id: userId,
                    lead_company_id: c.id,
                    full_name: bbbData.ownerName,
                    first_name: nameParts[0],
                    last_name: nameParts.slice(1).join(" "),
                    title: "Owner",
                    phone: bbbData.phone || null,
                    source: "bbb",
                    confidence_score: 75,
                    is_decision_maker: true,
                    is_primary_contact: true,
                  });
              }
              
              finalStats.bbbMatches++;
            }
          }
        } catch (e) {
          console.error(`BBB lookup error for ${c.name}:`, e);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      progress[progress.length - 1].status = "completed";
      progress[progress.length - 1].message = `Found ${finalStats.bbbMatches} owners from BBB`;
      progress[progress.length - 1].stats = { found: finalStats.bbbMatches };
    }

    // ===========================================
    // STEP 6: Website Scraping (remaining)
    // ===========================================
    if (!skipScrape) {
      progress.push({
        step: "scrape_sites",
        status: "running",
        message: "Scraping websites for owner info...",
      });

      const { data: toScrape } = await insforge.database
        .from("lead_companies")
        .select("id")
        .in("id", insertedCompanyIds)
        .in("enrichment_status", ["no_match", "pending"]);

      if (toScrape && toScrape.length > 0) {
        try {
          const scrapeResponse = await fetch(`${baseUrl}/api/leads/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              companyIds: toScrape.map((c: any) => c.id),
              limit: 50,
            }),
          });

          if (scrapeResponse.ok) {
            const scrapeData = await scrapeResponse.json();
            finalStats.companiesScraped = scrapeData.stats?.scraped || 0;
            finalStats.scrapedPeople = scrapeData.stats?.peopleFound || 0;
            finalStats.totalPeopleFound += finalStats.scrapedPeople;
          }
        } catch (e) {
          console.error("[Pipeline] Scrape step error:", e);
        }
      }

      progress[progress.length - 1].status = "completed";
      progress[progress.length - 1].message = `Scraped ${finalStats.companiesScraped} sites`;
      progress[progress.length - 1].stats = { scraped: finalStats.companiesScraped };
    }

    // ===========================================
    // STEP 7: Ensure all companies have fallback
    // ===========================================
    progress.push({
      step: "fallback_assignment",
      status: "running",
      message: "Assigning fallback contacts...",
    });

    const { data: pendingCompanies } = await insforge.database
      .from("lead_companies")
      .select("id, name, domain, phone")
      .in("id", insertedCompanyIds)
      .in("contact_type", ["pending", "pending_scrape"]);

    for (const company of pendingCompanies || []) {
      const c = company as any;
      
      await insforge.database
        .from("lead_companies")
        .update({
          enrichment_status: "no_dm",
          contact_type: "fallback",
          fallback_email: c.domain ? `info@${c.domain}` : null,
          fallback_phone: c.phone,
        })
        .eq("id", c.id);
      
      finalStats.companiesWithFallback++;
    }

    progress[progress.length - 1].status = "completed";
    progress[progress.length - 1].message = `${finalStats.companiesWithFallback} companies using fallback`;
    progress[progress.length - 1].stats = { fallback: finalStats.companiesWithFallback };

    // ===========================================
    // FINAL SUMMARY
    // ===========================================
    const dmRate = finalStats.companiesFound > 0 
      ? Math.round((finalStats.companiesWithDM / finalStats.companiesFound) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      message: `Pipeline completed: ${finalStats.companiesFound} companies, ${finalStats.companiesWithDM} with verified DM (${dmRate}%), ${finalStats.companiesWithFallback} fallback, ${finalStats.contactsSaved} saved to CRM`,
      progress,
      stats: finalStats,
      companyIds: insertedCompanyIds,
    });

  } catch (error: any) {
    console.error("Pipeline error:", error);
    return NextResponse.json(
      { error: error.message || "Pipeline failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads/pipeline
 * Get pipeline status and stats
 */
export async function GET(request: NextRequest) {
  try {
        const userId = DEFAULT_USER_ID;

    // Get company counts by status
    const { data: companies } = await insforge.database
      .from("lead_companies")
      .select("enrichment_status, contact_type, industry_tag")
      .eq("user_id", userId);

    const stats = {
      total: 0,
      byStatus: {
        pending: 0,
        enriched: 0,
        scraped: 0,
        no_match: 0,
        no_dm: 0,
        failed: 0,
      },
      byContactType: {
        dm_verified: 0,
        dm_guessed: 0,
        fallback: 0,
        pending: 0,
        pending_scrape: 0,
      },
      byIndustry: {} as Record<string, number>,
    };

    for (const company of companies || []) {
      const c = company as any;
      stats.total++;
      
      if (c.enrichment_status in stats.byStatus) {
        stats.byStatus[c.enrichment_status as keyof typeof stats.byStatus]++;
      }
      
      if (c.contact_type in stats.byContactType) {
        stats.byContactType[c.contact_type as keyof typeof stats.byContactType]++;
      }
      
      if (c.industry_tag) {
        stats.byIndustry[c.industry_tag] = (stats.byIndustry[c.industry_tag] || 0) + 1;
      }
    }

    // Get people count by source
    const { data: people } = await insforge.database
      .from("lead_people")
      .select("source, email_status, email_verified")
      .eq("user_id", userId);

    const peopleStats = {
      total: people?.length || 0,
      bySource: {} as Record<string, number>,
      verified: 0,
      guessed: 0,
    };

    for (const person of people || []) {
      const p = person as any;
      peopleStats.bySource[p.source] = (peopleStats.bySource[p.source] || 0) + 1;
      if (p.email_verified) peopleStats.verified++;
      if (p.email_status === "guessed") peopleStats.guessed++;
    }

    return NextResponse.json({
      stats,
      peopleStats,
    });

  } catch (error: any) {
    console.error("Pipeline status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get status" },
      { status: 500 }
    );
  }
}
