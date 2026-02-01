import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * GET /api/instantly/verify-campaign
 * Verify Instantly campaign exists and is configured correctly
 */
export async function GET(request: NextRequest) {
  try {
    // Debug: Log what we're reading (without exposing full values)
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;
    
    console.log("[Verify Campaign] API Key exists:", !!apiKey);
    console.log("[Verify Campaign] API Key length:", apiKey?.length || 0);
    console.log("[Verify Campaign] Campaign ID exists:", !!campaignId);
    console.log("[Verify Campaign] Campaign ID:", campaignId ? `${campaignId.substring(0, 8)}...` : "none");
    
    if (!apiKey || !campaignId) {
      // Return more detailed error
      return NextResponse.json({ 
        valid: false, 
        error: `Missing configuration: ${!apiKey ? "API key" : ""} ${!campaignId ? "Campaign ID" : ""} not found in environment variables`,
        debug: {
          hasApiKey: !!apiKey,
          hasCampaignId: !!campaignId,
          envKeys: Object.keys(process.env).filter(k => k.includes("INSTANTLY")),
        }
      });
    }
    
    // Check for common formatting issues (quotes)
    if (apiKey && (apiKey.startsWith('"') || apiKey.startsWith("'"))) {
      return NextResponse.json({
        valid: false,
        error: "API key appears to have quotes. Remove quotes from .env.local (use: INSTANTLY_API_KEY=your_key, not INSTANTLY_API_KEY=\"your_key\")",
      });
    }

    if (campaignId && (campaignId.startsWith('"') || campaignId.startsWith("'"))) {
      return NextResponse.json({
        valid: false,
        error: "Campaign ID appears to have quotes. Remove quotes from .env.local (use: INSTANTLY_CAMPAIGN_ID=your_id, not INSTANTLY_CAMPAIGN_ID=\"your_id\")",
      });
    }
    
    // Fetch campaign details from Instantly
    const response = await fetch(
      `https://api.instantly.ai/api/v2/campaigns/${campaignId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        valid: false, 
        error: `Campaign not found or API error: ${errorText}` 
      });
    }
    
    const campaign = await response.json();
    
    // Handle both array and object responses
    const campaignData = Array.isArray(campaign) ? campaign[0] : campaign;
    
    return NextResponse.json({ 
      valid: true, 
      campaign: {
        id: campaignData?.id || campaignId,
        name: campaignData?.name || "Unknown",
        status: campaignData?.status || "unknown",
      }
    });
  } catch (error: any) {
    console.error("Campaign verification error:", error);
    return NextResponse.json(
      { 
        valid: false, 
        error: error.message || "Failed to verify campaign" 
      },
      { status: 500 }
    );
  }
}
