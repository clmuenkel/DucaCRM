import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/test
 * Test Instantly API connection (server-side to avoid CORS)
 */
export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "API key is required" },
        { status: 400 }
      );
    }

    // Test connection by fetching campaigns
    const response = await fetch("https://api.instantly.ai/api/v2/campaigns?limit=1", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        message: error.message || `Instantly API error: ${response.status} ${response.statusText}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Connected successfully",
    });
  } catch (error: any) {
    console.error("Instantly test error:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Connection test failed",
    });
  }
}
