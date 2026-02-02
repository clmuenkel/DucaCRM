/**
 * GET /api/auth/google
 * Initiate Google OAuth flow for Calendar access
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${request.nextUrl.origin}/api/auth/google/callback`;
    
    if (!clientId) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 500 }
      );
    }

    // Build OAuth URL
    const scope = "https://www.googleapis.com/auth/calendar.events";
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent"); // Force consent to get refresh token

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error("Google OAuth error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}
