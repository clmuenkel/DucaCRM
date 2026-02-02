import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/test-lead-push
 * Test pushing a lead to Instantly campaign
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    if (!apiKey || !campaignId) {
      return NextResponse.json({
        success: false,
        message: "API key or campaign ID not configured",
      }, { status: 400 });
    }

    // Create test lead
    const testLead = {
      email: `test-${Date.now()}@example.com`,
      first_name: "Test",
      last_name: "Lead",
      company_name: "Test Company",
    };

    const response = await fetch("https://api.instantly.ai/api/v2/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        skip_if_in_workspace: true,
        leads: [testLead],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        success: false,
        message: `Failed to push lead: ${errorText}`,
      });
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: "Test lead pushed successfully",
      lead: testLead,
      response: data,
    });
  } catch (error: any) {
    console.error("Test lead push error:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Failed to push test lead",
    }, { status: 500 });
  }
}
