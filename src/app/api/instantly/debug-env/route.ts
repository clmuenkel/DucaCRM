import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * GET /api/instantly/debug-env
 * Debug endpoint to check what Instantly environment variables are loaded
 * (Does not expose full values for security)
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;
    
    return NextResponse.json({
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + "..." : null,
      apiKeyHasQuotes: apiKey ? (apiKey.startsWith('"') || apiKey.startsWith("'")) : false,
      hasCampaignId: !!campaignId,
      campaignId: campaignId || null,
      campaignIdHasQuotes: campaignId ? (campaignId.startsWith('"') || campaignId.startsWith("'")) : false,
      allInstantlyKeys: Object.keys(process.env).filter(k => k.includes("INSTANTLY")),
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error.message || "Failed to check environment variables",
        hasApiKey: false,
        hasCampaignId: false,
      },
      { status: 500 }
    );
  }
}
