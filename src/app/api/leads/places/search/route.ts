import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

// Google Places API v2 (New) endpoint
const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAILS_BASE = "https://places.googleapis.com/v1/places";

// Industry keywords for home services
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  hvac: ["HVAC contractor", "heating and cooling", "air conditioning repair", "furnace repair"],
  plumbing: ["plumber", "plumbing contractor", "plumbing services", "drain cleaning"],
  roofing: ["roofing contractor", "roof repair", "roofing company", "roofer"],
  electrical: ["electrician", "electrical contractor", "electrical services"],
  solar: ["solar installer", "solar panel installation", "solar contractor"],
  construction: ["general contractor", "home builder", "remodeling contractor", "construction company"],
};

interface PlacesSearchRequest {
  industry: string;
  location: string; // city, state or zip
  radius?: number; // miles, default 25
}

interface PlaceResult {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  location?: {
    latitude: number;
    longitude: number;
  };
  addressComponents?: Array<{
    types: string[];
    shortText: string;
    longText: string;
  }>;
  reviews?: Array<{
    authorAttribution?: {
      displayName: string;
    };
    text?: {
      text: string;
    };
    relativePublishTimeDescription?: string;
  }>;
}

interface PlacesResponse {
  places: PlaceResult[];
  nextPageToken?: string;
}

interface DebugLog {
  keyword: string;
  query: string;
  status: number;
  resultsCount: number;
  error?: string;
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
  const result = {
    city: "",
    state: "",
    zip: "",
    country: "US",
  };
  
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

export async function POST(request: NextRequest) {
  const debugLogs: DebugLog[] = [];
  
  try {
    const body: PlacesSearchRequest = await request.json();
    const { industry, location } = body;

    console.log(`[Places Search] Starting search: industry=${industry}, location=${location}`);

    // Validate inputs
    if (!industry || !location) {
      return NextResponse.json(
        { error: "Industry and location are required" },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Places API key not configured" },
        { status: 500 }
      );
    }

    // Get keywords for this industry
    const keywords = INDUSTRY_KEYWORDS[industry];
    if (!keywords) {
      return NextResponse.json(
        { error: `Unknown industry: ${industry}. Valid options: ${Object.keys(INDUSTRY_KEYWORDS).join(", ")}` },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Search for each keyword and collect results
    const allPlaces: PlaceResult[] = [];
    const seenPlaceIds = new Set<string>();

    for (const keyword of keywords) {
      const query = `${keyword} in ${location}`;
      console.log(`[Places Search] Searching: "${query}"`);
      
      const requestBody = {
        textQuery: query,
        maxResultCount: 20,
        // NOTE: Removed invalid locationBias - Google Places text search handles
        // location from the query string itself ("plumber in Houston, TX")
      };

      try {
        const response = await fetch(PLACES_API_BASE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            // Include reviews in field mask for owner extraction
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types,places.location,places.addressComponents,places.reviews",
          },
          body: JSON.stringify(requestBody),
        });

        const debugEntry: DebugLog = {
          keyword,
          query,
          status: response.status,
          resultsCount: 0,
        };

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Places Search] API error for "${keyword}": HTTP ${response.status} - ${errorText}`);
          debugEntry.error = errorText;
          debugLogs.push(debugEntry);
          continue; // Skip this keyword but continue with others
        }

        const data: PlacesResponse = await response.json();
        const placesInResponse = data.places || [];
        debugEntry.resultsCount = placesInResponse.length;
        debugLogs.push(debugEntry);
        
        console.log(`[Places Search] "${keyword}" returned ${placesInResponse.length} results`);
        
        // Add unique places
        for (const place of placesInResponse) {
          if (!seenPlaceIds.has(place.id)) {
            seenPlaceIds.add(place.id);
            allPlaces.push(place);
          }
        }
      } catch (fetchError: any) {
        console.error(`[Places Search] Fetch error for "${keyword}":`, fetchError.message);
        debugLogs.push({
          keyword,
          query,
          status: 0,
          resultsCount: 0,
          error: `Fetch error: ${fetchError.message}`,
        });
      }
      
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Places Search] Total unique places found: ${allPlaces.length}`);

    if (allPlaces.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No companies found for this search",
        stats: { found: 0, inserted: 0, duplicates: 0, errors: 0 },
        debug: {
          searchedKeywords: keywords,
          location,
          logs: debugLogs,
        },
      });
    }

    // Upsert into lead_companies
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    const insertErrors: string[] = [];

    for (const place of allPlaces) {
      const address = extractAddressComponents(place.addressComponents);
      const domain = extractDomain(place.websiteUri);
      
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
        lat: place.location?.latitude || null,
        lng: place.location?.longitude || null,
        industry_tag: industry,
        business_types: place.types || [],
        source: "google_places",
        raw_payload: place,
        enrichment_status: "pending",
        contact_type: "pending",
        fallback_email: domain ? `info@${domain}` : null,
        fallback_phone: place.nationalPhoneNumber || null,
      };

      const { error } = await insforge.database
        .from("lead_companies")
        .upsert(companyData, {
          onConflict: "user_id,place_id",
          ignoreDuplicates: false,
        });

      if (error) {
        if (error.code === "23505") {
          // Duplicate key - this is fine
          duplicates++;
        } else {
          console.error("[Places Search] Insert error:", error);
          insertErrors.push(`${place.displayName.text}: ${error.message}`);
          errors++;
        }
      } else {
        inserted++;
      }
    }

    console.log(`[Places Search] Complete: found=${allPlaces.length}, inserted=${inserted}, duplicates=${duplicates}, errors=${errors}`);

    return NextResponse.json({
      success: true,
      message: `Found ${allPlaces.length} companies`,
      stats: {
        found: allPlaces.length,
        inserted,
        duplicates,
        errors,
      },
      debug: {
        searchedKeywords: keywords,
        location,
        logs: debugLogs,
        insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
      },
    });
  } catch (error: any) {
    console.error("[Places Search] Fatal error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to search places",
        debug: { logs: debugLogs },
      },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch existing lead companies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get("industry");
    const state = searchParams.get("state");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "100");

        const userId = DEFAULT_USER_ID;

    let query = insforge.database
      .from("lead_companies")
      .select("*, lead_people(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (industry) {
      query = query.eq("industry_tag", industry);
    }
    if (state) {
      query = query.eq("state", state);
    }
    if (status) {
      query = query.eq("enrichment_status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ companies: data });
  } catch (error: any) {
    console.error("Get lead companies error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch companies" },
      { status: 500 }
    );
  }
}
