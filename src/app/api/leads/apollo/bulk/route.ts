import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { extractPersonMobile, findTopDecisionMakers, scoreDecisionMakerTitle } from "@/lib/apollo/client";

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";

// Industry keywords for Google Places search
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  hvac: ["HVAC contractor", "heating and cooling", "air conditioning repair"],
  plumbing: ["plumber", "plumbing contractor", "plumbing services"],
  roofing: ["roofing contractor", "roof repair", "roofing company"],
  electrical: ["electrician", "electrical contractor", "electrical services"],
  solar: ["solar installer", "solar panel installation", "solar contractor"],
  construction: ["general contractor", "home builder", "remodeling contractor"],
};

// Default US cities for bulk extraction
const DEFAULT_CITIES = [
  "Houston, TX", "Dallas, TX", "Austin, TX", "San Antonio, TX",
  "Phoenix, AZ", "Los Angeles, CA", "San Diego, CA", "San Jose, CA",
  "Denver, CO", "Seattle, WA", "Portland, OR", "Miami, FL",
  "Atlanta, GA", "Chicago, IL", "Detroit, MI", "Minneapolis, MN",
  "Las Vegas, NV", "Charlotte, NC", "Columbus, OH", "Philadelphia, PA",
];

interface BulkRequest {
  industries: string[];
  locations?: string[]; // If not provided, use default cities
  maxCompanies?: number;
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
    if (!component.types) continue;
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
  supabase: any,
  userId: string,
  company: {
    name: string;
    domain: string | null;
    website: string | null;
    city: string;
    state: string;
    industry: string;
    country?: string;
  }
): Promise<string> {
  const companyPayload = {
    user_id: userId,
    name: company.name,
    domain: company.domain,
    industry: company.industry,
    city: company.city || null,
    state: company.state || null,
    country: company.country || "US",
    website: company.website,
  };

  if (company.domain) {
    const { data, error } = await supabase
      .from("companies")
      .upsert(companyPayload, { onConflict: "user_id,domain" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .eq("name", company.name)
    .eq("city", company.city || null)
    .eq("state", company.state || null)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("companies")
    .insert(companyPayload)
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

/**
 * Search Google Places for companies
 */
async function searchGooglePlaces(
  apiKey: string,
  query: string,
  maxResults: number = 20
): Promise<PlaceResult[]> {
  const response = await fetch(PLACES_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: Math.min(20, maxResults),
    }),
  });

  if (!response.ok) {
    console.error(`[Bulk] Places search failed: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.places || [];
}

/**
 * POST /api/leads/apollo/bulk
 * Bulk extraction: Google Places → Apollo enrichment by company name
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: BulkRequest = await request.json();
    
    const { industries, locations, maxCompanies = 50 } = body;
    // Calculate maxContacts from maxCompanies (3 contacts per company)
    const maxContacts = maxCompanies * 3;

    if (!industries || industries.length === 0) {
      return NextResponse.json(
        { error: "At least one industry is required" },
        { status: 400 }
      );
    }

    // Get API keys
    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    const { data: settings } = await (supabase as any)
      .from("user_settings")
      .select("apollo_api_key")
      .eq("user_id", userId)
      .single();

    const apolloKey = settings?.apollo_api_key || process.env.APOLLO_API_KEY;
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apolloKey) {
      return NextResponse.json(
        { error: "Apollo API key not configured" },
        { status: 400 }
      );
    }

    if (!placesKey) {
      return NextResponse.json(
        { error: "Google Places API key not configured" },
        { status: 400 }
      );
    }

    // Set up webhook URL for phone reveals (Apollo requires it)
    // Phone data will arrive via webhook 2-5 minutes after enrichment
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;
    const webhookUrl = webhookBaseUrl ? `${webhookBaseUrl}/api/apollo/webhook` : undefined;
    
    if (webhookUrl) {
      console.log(`[Bulk] Phone reveal webhook: ${webhookUrl}`);
    } else {
      console.log(`[Bulk] No WEBHOOK_BASE_URL set - mobile numbers won't be revealed. Set up ngrok/localtunnel to get mobiles.`);
    }

    // Use provided locations or default cities
    const searchLocations = locations && locations.length > 0 ? locations : DEFAULT_CITIES;

    // Stats tracking
    const stats = {
      locationsSearched: 0,
      companiesFound: 0,
      companiesEnriched: 0,
      contactsSaved: 0,
      skipped: 0,
      failed: 0,
      creditsUsed: 0,
      phoneRevealsPending: 0, // Webhook requests sent
    };

    const savedContacts: Array<{
      name: string;
      email: string;
      title: string;
      company: string;
      city: string;
    }> = [];

    const seenCompanyNames = new Set<string>();

    console.log(`[Bulk] Starting: ${industries.join(", ")} across ${searchLocations.length} locations`);
    console.log(`[Bulk] Target: ${maxCompanies} companies with ${maxContacts} total contacts`);

    // Track successful companies (those with contacts saved)
    let successfulCompanies = 0;
    const targetCompanies = maxCompanies;
    
    // We'll search for MORE companies than requested to account for failures
    const searchMultiplier = 3; // Search for 3x as many to ensure we get enough
    const maxToSearch = Math.min(targetCompanies * searchMultiplier, 60);

    // Step 1: Search Google Places for companies across all locations
    const allCompanies: Array<{
      name: string;
      domain: string | null;
      website: string | null;
      phone: string | null;
      city: string;
      state: string;
      address: string;
      industry: string;
    }> = [];

    let locationIndex = 0;
    let keywordIndex = 0;
    
    // Keep searching until we have enough companies in our pool
    while (allCompanies.length < maxToSearch && locationIndex < searchLocations.length) {
      const location = searchLocations[locationIndex];
      
      for (const industry of industries) {
        if (allCompanies.length >= maxToSearch) break;

        const keywords = INDUSTRY_KEYWORDS[industry];
        if (!keywords) continue;

        // Cycle through different keywords for variety
        const keyword = keywords[keywordIndex % keywords.length];
        const query = `${keyword} ${location}`;

        console.log(`[Bulk] Searching: ${query}`);

        const places = await searchGooglePlaces(
          placesKey,
          query,
          20 // Always get max results
        );

        stats.locationsSearched++;

        for (const place of places) {
          if (allCompanies.length >= maxToSearch) break;

          const companyName = place.displayName.text;
          
          // Skip duplicates
          const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (seenCompanyNames.has(normalizedName)) continue;
          seenCompanyNames.add(normalizedName);

          const address = extractAddressComponents(place.addressComponents);
          const domain = extractDomain(place.websiteUri);

          allCompanies.push({
            name: companyName,
            domain,
            website: place.websiteUri || null,
            phone: place.nationalPhoneNumber || null,
            city: address.city || location.split(",")[0].trim(),
            state: address.state || location.split(",")[1]?.trim() || "",
            address: place.formattedAddress,
            industry,
          });

          stats.companiesFound++;
        }

        // Small delay between Places API calls
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
      locationIndex++;
      keywordIndex++;
    }

    console.log(`[Bulk] Found ${allCompanies.length} unique companies (searching for ${targetCompanies} with contacts)`);

    // Step 2: Enrich each company via Apollo - get TOP 3 decision makers
    // KEEP GOING until we have the requested number of successful companies
    for (const company of allCompanies) {
      // Stop once we have enough successful companies
      if (successfulCompanies >= targetCompanies) {
        console.log(`[Bulk] Reached target of ${targetCompanies} companies with contacts`);
        break;
      }
      if (stats.contactsSaved >= maxContacts) break;

      try {
        console.log(`[Bulk] Enriching: ${company.name}`);

        // Search Apollo for top 3 decision makers
        // If no mobile found, phone reveal is requested via webhook
        const { people, source, creditsUsed } = await findTopDecisionMakers(
          apolloKey,
          { name: company.name, domain: company.domain },
          3,
          webhookUrl
        );


        stats.creditsUsed += creditsUsed;

        if (people.length === 0) {
          stats.skipped++;
          continue;
        }

        stats.companiesEnriched++;

        // Save company directly to CRM
        let companyId: string;
        try {
          companyId = await upsertCompanyToCRM(supabase, userId, {
            name: company.name,
            domain: company.domain,
            website: company.website,
            city: company.city,
            state: company.state,
            industry: company.industry,
            country: "US",
          });
        } catch (companyError: any) {
          console.error(`[Bulk] Company upsert error: ${companyError.message}`);
          stats.failed++;
          continue;
        }

        // Save ALL decision makers (up to 3) for this company
        let contactsSavedForThisCompany = 0;
        
        for (const person of people) {
          if (stats.contactsSaved >= maxContacts) break;
          if (!person.email) continue;

          // Check if contact already exists by email
          const { data: existingContact } = await (supabase as any)
            .from("contacts")
            .select("id")
            .eq("user_id", userId)
            .eq("email", person.email)
            .maybeSingle();

          if (!existingContact) {
            const personName = person.name || `${person.first_name} ${person.last_name}`.trim();
            const phones = extractPersonMobile(person.phone_numbers);
            const titleScore = scoreDecisionMakerTitle(person.title);
            
            // Use company phone from Google Places as fallback if no personal phone
            const companyPhone = company.phone;
            const bestPhone = phones.mobile || phones.direct || phones.any || companyPhone;

            // Log the apollo_id we're saving - this is critical for webhook matching
            console.log(`[Bulk] Inserting contact: email=${person.email}, apollo_id=${person.id}, title=${person.title}, score=${titleScore}`);

            const { data: insertedContact, error: contactError } = await (supabase as any)
              .from("contacts")
              .insert({
                user_id: userId,
                company_id: companyId,
                apollo_id: person.id, // CRITICAL: This must match what Apollo sends in webhook
                first_name: person.first_name || personName.split(" ")[0] || "Owner",
                last_name: person.last_name || personName.split(" ").slice(1).join(" ") || null,
                email: person.email,
                phone: bestPhone, // Use best available phone
                mobile: phones.mobile || null,
                linkedin_url: person.linkedin_url || null,
                title: person.title || "Decision Maker",
                company_name: company.name,
                company_domain: company.domain || null,
                industry: company.industry,
                city: company.city,
                state: company.state,
                country: "US",
                stage: "fresh",
                status: "active",
                source: `bulk_${source}`,
                source_list: `${company.industry} - ${company.city}, ${company.state}`,
                lead_score: 90,
                priority_score: titleScore, // Score based on title
                enrichment_status: "enriched",
                enriched_at: new Date().toISOString(),
                cadence_status: "none",
              })
              .select("id, apollo_id, email"); // Select to verify what was saved

            if (contactError) {
              console.error(`[Bulk] Contact insert error: ${contactError.message}`);
              stats.failed++;
              continue;
            }

            // Verify what was saved
            if (insertedContact && insertedContact.length > 0) {
              const saved = insertedContact[0];
              console.log(`[Bulk] ✓ Contact inserted: id=${saved.id}, apollo_id=${saved.apollo_id}, email=${saved.email}`);
              
              // Verify apollo_id was saved correctly
              if (saved.apollo_id !== person.id) {
                console.error(`[Bulk] ⚠️ apollo_id MISMATCH! Expected ${person.id}, got ${saved.apollo_id}`);
              }
            } else {
              console.log(`[Bulk] ✓ Contact inserted but no select data returned`);
            }

            stats.contactsSaved++;
            contactsSavedForThisCompany++;
            
            // Track if we got a mobile number
            if (phones.mobile) {
              stats.phoneRevealsPending++; // Re-using this stat for "mobiles found"
            }
            
            savedContacts.push({
              name: personName,
              email: person.email,
              title: person.title || "Decision Maker",
              company: company.name,
              city: company.city,
            });

            // Log with phone details
            let phoneStatus: string;
            if (phones.mobile) {
              phoneStatus = `MOBILE: ${phones.mobile}`;
            } else if (webhookUrl) {
              phoneStatus = `phone: ${bestPhone || 'none'} (mobile pending via webhook)`;
            } else {
              phoneStatus = bestPhone ? `phone: ${bestPhone} (company line)` : 'NO PHONE';
            }
            console.log(`[Bulk] ✓ Saved: ${personName} (${person.email}) ${phoneStatus} - ${person.title} at ${company.name}`);
          } else {
            console.log(`[Bulk] Contact ${person.email} already exists, skipping`);
          }
        }

        // Track successful companies (those with at least 1 contact saved)
        if (contactsSavedForThisCompany > 0) {
          successfulCompanies++;
          console.log(`[Bulk] ✓ Company ${company.name} complete with ${contactsSavedForThisCompany} contacts (${successfulCompanies}/${targetCompanies} companies done)`);
        }

        // Small delay between companies
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (e: any) {
        console.error(`[Bulk] Error for ${company.name}: ${e.message}`);
        stats.failed++;
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const mobilesFound = stats.phoneRevealsPending; // Counts contacts with mobile numbers

    console.log(`[Bulk] Complete: ${stats.contactsSaved} contacts from ${successfulCompanies} companies, ${mobilesFound} with mobile numbers, ${stats.creditsUsed} credits, ${duration}s`);

    // Build message with mobile number info
    let message = `Extracted ${stats.contactsSaved} contacts from ${successfulCompanies} companies`;
    if (mobilesFound > 0) {
      message += `. ${mobilesFound} contacts have mobile numbers.`;
    } else if (webhookUrl) {
      message += `. Mobile numbers will arrive via webhook in 2-5 minutes.`;
    } else {
      message += `. Set WEBHOOK_BASE_URL and run ngrok to get mobile numbers.`;
    }

    return NextResponse.json({
      success: true,
      message,
      stats: {
        ...stats,
        mobilesFound,
        successfulCompanies,
        duration,
        webhookEnabled: !!webhookUrl,
      },
      preview: savedContacts.slice(0, 20),
    });

  } catch (error: any) {
    console.error("[Bulk] Error:", error);
    return NextResponse.json(
      { error: error.message || "Bulk extraction failed" },
      { status: 500 }
    );
  }
}
