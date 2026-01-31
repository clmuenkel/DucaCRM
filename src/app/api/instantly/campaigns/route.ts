import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/campaigns
 * Get Instantly campaigns (server-side to avoid CORS)
 */
export async function POST(request: NextRequest) {
  try {
    const { apiKey: requestApiKey } = await request.json();
    const apiKey = requestApiKey || process.env.INSTANTLY_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    const response = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=100", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: error.message || `Instantly API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    // V2 returns an array directly or inside a data field
    const campaigns = Array.isArray(data) ? data : (data.campaigns || data.data || data.items || []);

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Instantly campaigns error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}
