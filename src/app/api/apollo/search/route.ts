import { NextRequest, NextResponse } from "next/server";
import { searchApolloContacts, type EnhancedSearchParams } from "@/lib/apollo/client";


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      apiKey, 
      personaSetId,
      // Direct params (used if no persona set)
      ...params 
    } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Apollo API key is required" },
        { status: 400 }
      );
    }

    // Build search params
    const searchParams: EnhancedSearchParams = {
      // Lock to United States
      person_locations: ["United States"],
      page: params.page || 1,
      per_page: params.per_page || 25,
    };

    // Add industry filter
    if (params.organization_industry_tag_ids) {
      searchParams.organization_industry_tag_ids = params.organization_industry_tag_ids;
    }

    // Add employee range filter
    if (params.organization_num_employees_ranges) {
      searchParams.organization_num_employees_ranges = params.organization_num_employees_ranges;
    }

    // Add title filter
    if (params.person_titles) {
      searchParams.person_titles = params.person_titles;
    }

    // Add domain filter
    if (params.q_organization_domains) {
      searchParams.q_organization_domains = params.q_organization_domains;
    }

    // Add intent data filters if specified
    if (params.intent_topic_ids && params.intent_topic_ids.length > 0) {
      searchParams.intent_topic_ids = params.intent_topic_ids;
    }

    if (params.organization_intent_score_min) {
      searchParams.organization_intent_score_min = params.organization_intent_score_min;
    }

    const results = await searchApolloContacts(apiKey, searchParams);
    
    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Apollo search error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search Apollo" },
      { status: 500 }
    );
  }
}
