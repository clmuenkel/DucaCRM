import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/test
 * Test Instantly API connection with comprehensive diagnostics
 */
export async function POST(request: NextRequest) {
  try {
    const { testType = "connection" } = await request.json();
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: "API key not configured in .env.local",
        diagnostics: {
          hasApiKey: false,
          hasCampaignId: !!campaignId,
        },
      }, { status: 400 });
    }

    const results: any = {
      apiKeyValid: false,
      campaignAccessible: false,
      campaignDetails: null,
      webhookUrl: null,
      errors: [],
    };

    // Test 1: API Key validity
    try {
      const campaignsResponse = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=10", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
      });

      if (!campaignsResponse.ok) {
        const errorText = await campaignsResponse.text();
        results.errors.push(`API key test failed: ${campaignsResponse.status} ${errorText}`);
        return NextResponse.json({
          success: false,
          message: "API key is invalid or expired",
          diagnostics: results,
        });
      }

      results.apiKeyValid = true;
      const campaigns = await campaignsResponse.json();
      const campaignsList = Array.isArray(campaigns) ? campaigns : campaigns.campaigns || [];

      // Test 2: Campaign access
      if (campaignId) {
        const targetCampaign = campaignsList.find((c: any) => c.id === campaignId);
        if (targetCampaign) {
          results.campaignAccessible = true;
          results.campaignDetails = {
            id: targetCampaign.id,
            name: targetCampaign.name,
            status: targetCampaign.status,
            email_accounts: targetCampaign.email_accounts?.length || 0,
          };
        } else {
          results.errors.push(`Campaign ${campaignId} not found in your campaigns`);
        }
      }

      // Test 3: Webhook URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : "https://your-domain.com";
      results.webhookUrl = `${baseUrl}/api/instantly/webhook`;

    } catch (error: any) {
      results.errors.push(`Connection error: ${error.message}`);
    }

    const success = results.apiKeyValid && (!campaignId || results.campaignAccessible);

    return NextResponse.json({
      success,
      message: success 
        ? "All tests passed!" 
        : "Some tests failed - check diagnostics",
      diagnostics: results,
    });
  } catch (error: any) {
    console.error("Instantly test error:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Connection test failed",
      diagnostics: { errors: [error.message] },
    }, { status: 500 });
  }
}
