/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback and store tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=oauth_cancelled`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=oauth_no_code`
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${request.nextUrl.origin}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/?error=oauth_not_configured`
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange error:", errorText);
      return NextResponse.redirect(
        `${request.nextUrl.origin}/settings?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/settings?error=no_access_token`
      );
    }

    // Calculate expiration time
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    // Store tokens in database (create profile if it doesn't exist)
    const userId = DEFAULT_USER_ID;
    const { USER_INFO } = await import("@/lib/default-user");

    // Check if profile exists
    const { data: existingProfile } = await insforge.database
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      // Profile exists - update with tokens
      const { error: updateError } = await insforge.database
        .from("profiles")
        .update({
          google_calendar_access_token: access_token,
          google_calendar_refresh_token: refresh_token || null,
          google_calendar_token_expires_at: expiresAt,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Error updating tokens:", updateError);
        return NextResponse.redirect(
          `${request.nextUrl.origin}/?error=token_storage_failed&message=${encodeURIComponent(updateError.message)}`
        );
      }
    } else {
      // Profile doesn't exist - create it with tokens
      const { error: createError } = await insforge.database
        .from("profiles")
        .insert([{
          id: userId,
          full_name: USER_INFO.full_name,
          email: USER_INFO.email,
          google_calendar_access_token: access_token,
          google_calendar_refresh_token: refresh_token || null,
          google_calendar_token_expires_at: expiresAt,
          daily_call_goal: 50,
          daily_email_goal: 20,
        }]);

      if (createError) {
        console.error("Error creating profile with tokens:", createError);
        return NextResponse.redirect(
          `${request.nextUrl.origin}/?error=token_storage_failed&message=${encodeURIComponent(createError.message)}`
        );
      }
    }

    return NextResponse.redirect(
      `${request.nextUrl.origin}/?success=google_calendar_connected`
    );
  } catch (error: any) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      `${request.nextUrl.origin}/?error=oauth_callback_failed`
    );
  }
}
