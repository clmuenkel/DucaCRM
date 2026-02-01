import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * GET /api/instantly/verify-campaign
 * Verify Instantly campaign exists and is configured correctly
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.INSTANTLY_API_KEY;
    const campaignId = process.env.INSTANTLY_CAMPAIGN_ID;
    
    if (!apiKey || !campaignId) {
      return NextResponse.json({ 
        valid: false, 
        error: "API key or campaign ID not configured in .env.local" 
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
