import { NextRequest, NextResponse } from "next/server";

/**
 * Company Discovery API
 * 
 * Simple endpoint that searches Google Places and returns company names/websites/phones
 * Does NOT save to database - just for manual lookup in Apollo
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";

// Industry keywords for home services - multiple variations for more results
const INDUSTRY_KEYWORDS: Record<string, string[]> = {
  hvac: ["HVAC contractor", "heating and cooling", "air conditioning service", "AC repair", "furnace repair", "HVAC company", "heating contractor"],
  plumbing: ["plumber", "plumbing contractor", "plumbing services", "plumbing company", "drain cleaning", "water heater repair"],
  roofing: ["roofing contractor", "roof repair", "roofing company", "roofer", "roof replacement", "roofing services"],
  electrical: ["electrician", "electrical contractor", "electrical services", "electrical company", "electrical repair"],
  solar: ["solar installer", "solar panel installation", "solar company", "solar contractor", "solar energy"],
  construction: ["general contractor", "home builder", "remodeling contractor", "construction company", "home remodeling"],
};

interface DiscoverRequest {
  industry: string;
  location: string;
  pageToken?: string; // For "Load More"
}

interface DiscoveredCompany {
  name: string;
  website: string | null;
  domain: string | null;
  phone: string | null;
  address: string;
  city: string;
  state: string;
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

function extractCityState(address: string): { city: string; state: string } {
  // Try to extract city and state from formatted address
  // Format is typically: "123 Main St, Houston, TX 77001, USA"
  const parts = address.split(",").map(p => p.trim());
  
  if (parts.length >= 3) {
    const city = parts[parts.length - 3] || "";
    const stateZip = parts[parts.length - 2] || "";
    const stateMatch = stateZip.match(/^([A-Z]{2})/);
    const state = stateMatch ? stateMatch[1] : "";
    return { city, state };
  }
  
  return { city: "", state: "" };
}

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body: DiscoverRequest = await request.json();
    const { industry, location, pageToken } = body;

    if (!industry || !location) {
      return NextResponse.json(
        { error: "Industry and location are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Places API key not configured" },
        { status: 500 }
      );
    }

    const keywords = INDUSTRY_KEYWORDS[industry];
    if (!keywords) {
      return NextResponse.json(
        { error: `Unknown industry: ${industry}` },
        { status: 400 }
      );
    }

    const companies: DiscoveredCompany[] = [];
    const seenNames = new Set<string>();
    let nextPageToken: string | undefined = pageToken;
    
    // Use multiple keywords to get variety
    for (const keyword of keywords) {
      if (companies.length >= 100) break;
      
      const query = `${keyword} ${location}`;
      console.log(`[Discover] Searching: ${query}`);

      const requestBody: Record<string, any> = {
        textQuery: query,
        maxResultCount: 20,
        languageCode: "en",
      };

      // If we have a page token, use it
      if (nextPageToken && keyword === keywords[0]) {
        requestBody.pageToken = nextPageToken;
      }

      const response = await fetch(PLACES_API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,nextPageToken",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error(`[Discover] Places API error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const places = data.places || [];
      
      // Save the next page token for "Load More"
      if (data.nextPageToken) {
        nextPageToken = data.nextPageToken;
      }

      for (const place of places) {
        const name = place.displayName?.text;
        if (!name) continue;
        
        // Skip duplicates
        const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);

        const { city, state } = extractCityState(place.formattedAddress || "");
        
        companies.push({
          name,
          website: place.websiteUri || null,
          domain: extractDomain(place.websiteUri),
          phone: place.nationalPhoneNumber || null,
          address: place.formattedAddress || "",
          city,
          state,
        });

        if (companies.length >= 100) break;
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Discover] Found ${companies.length} companies for ${industry} in ${location}`);

    return NextResponse.json({
      companies,
      count: companies.length,
      nextPageToken: nextPageToken || null,
      query: { industry, location },
    });

  } catch (error: any) {
    console.error("[Discover] Error:", error);
    return NextResponse.json(
      { error: error.message || "Discovery failed" },
      { status: 500 }
    );
  }
}
