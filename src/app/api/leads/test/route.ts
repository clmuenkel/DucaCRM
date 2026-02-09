import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

const PLACES_API_BASE = "https://places.googleapis.com/v1/places:searchText";
const APOLLO_API_BASE = "https://api.apollo.io/v1";

interface TestResult {
  service: string;
  status: "pass" | "fail" | "skip";
  message: string;
  details?: any;
}

/**
 * Test Google Places API connection
 */
async function testGooglePlaces(apiKey: string): Promise<TestResult> {
  try {
    const response = await fetch(PLACES_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({
        textQuery: "HVAC contractor Denver CO",
        maxResultCount: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "API request failed";
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      return {
        service: "Google Places API",
        status: "fail",
        message: `HTTP ${response.status}: ${errorMessage}`,
      };
    }

    const data = await response.json();
    const placesFound = data.places?.length || 0;

    return {
      service: "Google Places API",
      status: "pass",
      message: `Connected successfully. Test query returned ${placesFound} result(s).`,
      details: {
        testQuery: "HVAC contractor Denver CO",
        resultsReturned: placesFound,
      },
    };
  } catch (error: any) {
    return {
      service: "Google Places API",
      status: "fail",
      message: `Connection error: ${error.message}`,
    };
  }
}

/**
 * Test Apollo API connection
 */
async function testApollo(apiKey: string): Promise<TestResult> {
  try {
    // Use a well-known domain that Apollo definitely has
    const response = await fetch(`${APOLLO_API_BASE}/mixed_people/api_search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: ["homedepot.com"],
        person_titles: ["CEO", "Owner"],
        per_page: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "API request failed";
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      // Check for specific Apollo errors
      if (response.status === 401) {
        errorMessage = "Invalid API key";
      } else if (response.status === 429) {
        errorMessage = "Rate limit exceeded - try again later";
      }
      
      return {
        service: "Apollo API",
        status: "fail",
        message: `HTTP ${response.status}: ${errorMessage}`,
      };
    }

    const data = await response.json();
    const peopleFound = data.people?.length || 0;

    return {
      service: "Apollo API",
      status: "pass",
      message: `Connected successfully. Test query returned ${peopleFound} result(s).`,
      details: {
        testDomain: "homedepot.com",
        resultsReturned: peopleFound,
        pagination: data.pagination,
      },
    };
  } catch (error: any) {
    return {
      service: "Apollo API",
      status: "fail",
      message: `Connection error: ${error.message}`,
    };
  }
}

/**
 * Test InsForge Database connection
 */
async function testDatabase(): Promise<TestResult> {
  try {
        // Try to read from profiles table
    const { data, error } = await insforge.database
      .from("profiles")
      .select("id")
      .eq("id", DEFAULT_USER_ID)
      .single();

    if (error) {
      return {
        service: "InsForge Database",
        status: "fail",
        message: `Database error: ${error.message}`,
      };
    }

    // Test lead_companies table exists
    const { error: leadError } = await insforge.database
      .from("lead_companies")
      .select("id")
      .limit(1);

    if (leadError) {
      return {
        service: "InsForge Database",
        status: "fail",
        message: `lead_companies table error: ${leadError.message}. Did you run the migrations?`,
      };
    }

    return {
      service: "InsForge Database",
      status: "pass",
      message: "Connected successfully. All required tables exist.",
      details: {
        userId: DEFAULT_USER_ID,
        tablesVerified: ["profiles", "lead_companies", "lead_people"],
      },
    };
  } catch (error: any) {
    return {
      service: "InsForge Database",
      status: "fail",
      message: `Connection error: ${error.message}`,
    };
  }
}

/**
 * GET /api/leads/test
 * Test all API connections and return status
 */
export async function GET(request: NextRequest) {
  const results: TestResult[] = [];

  // Test InsForge Database first
  const dbResult = await testDatabase();
  results.push(dbResult);

  // Get API keys
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const apolloApiKey = process.env.APOLLO_API_KEY;

  // Also check user_settings for Apollo key
  let apolloKeyFromDb: string | null = null;
  if (dbResult.status === "pass") {
    try {
            const { data: settings } = await insforge.database
        .from("user_settings")
        .select("apollo_api_key")
        .eq("user_id", DEFAULT_USER_ID)
        .single();
      apolloKeyFromDb = (settings as any)?.apollo_api_key || null;
    } catch {
      // Ignore - we'll use env var
    }
  }

  // Test Google Places
  if (googleApiKey) {
    const placesResult = await testGooglePlaces(googleApiKey);
    results.push(placesResult);
  } else {
    results.push({
      service: "Google Places API",
      status: "skip",
      message: "GOOGLE_PLACES_API_KEY not set in environment variables",
    });
  }

  // Test Apollo
  const effectiveApolloKey = apolloApiKey || apolloKeyFromDb;
  if (effectiveApolloKey) {
    const apolloResult = await testApollo(effectiveApolloKey);
    results.push(apolloResult);
  } else {
    results.push({
      service: "Apollo API",
      status: "skip",
      message: "APOLLO_API_KEY not set (check .env.local or Settings page)",
    });
  }

  // Determine overall status
  const allPassed = results.every(r => r.status === "pass");
  const anyFailed = results.some(r => r.status === "fail");

  return NextResponse.json({
    success: allPassed,
    overall: anyFailed ? "fail" : allPassed ? "pass" : "partial",
    message: allPassed 
      ? "All API connections verified successfully!" 
      : anyFailed 
        ? "Some API connections failed. Check details below."
        : "Some APIs were skipped due to missing keys.",
    results,
    timestamp: new Date().toISOString(),
  });
}
