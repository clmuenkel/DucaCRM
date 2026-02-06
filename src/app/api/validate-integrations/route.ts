/**
 * GET /api/validate-integrations
 * Validate Google Calendar and Twilio integrations
 * Returns status of both integrations
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { getValidAccessToken } from "@/lib/google-calendar/client";
import { getTwilioConfig, validateCredentials } from "@/lib/twilio/client";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const results = {
    googleCalendar: {
      connected: false,
      error: null as string | null,
      message: "",
    },
    twilio: {
      connected: false,
      error: null as string | null,
      message: "",
      hasNumbers: false,
    },
  };

  // Ensure profile exists first
  try {
    await fetch(`${request.nextUrl.origin}/api/profile/ensure`, {
      method: "POST",
    });
  } catch (e) {
    // Continue even if ensure fails
  }

  // Check Google Calendar
  try {
    const { data: profileData } = await insforge.database
      .from("profiles")
      .select("google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expires_at")
      .eq("id", DEFAULT_USER_ID)
      .maybeSingle();

    if (profileData?.google_calendar_access_token && profileData?.google_calendar_refresh_token) {
      // Try to get valid token (this will refresh if needed)
      try {
        await getValidAccessToken(
          profileData.google_calendar_access_token,
          profileData.google_calendar_refresh_token,
          profileData.google_calendar_token_expires_at
        );
        results.googleCalendar.connected = true;
        results.googleCalendar.message = "Google Calendar is connected and working";
      } catch (tokenError: any) {
        results.googleCalendar.error = tokenError.message;
        results.googleCalendar.message = "Google Calendar tokens found but invalid - may need to reconnect";
      }
    } else {
      results.googleCalendar.error = "No Google Calendar tokens found";
      results.googleCalendar.message = "Google Calendar not connected. Visit /api/auth/google to connect.";
    }
  } catch (error: any) {
    results.googleCalendar.error = error.message;
    results.googleCalendar.message = "Failed to check Google Calendar status";
  }

  // Check Twilio
  try {
    const config = getTwilioConfig();
    
    if (!config.accountSid || !config.authToken) {
      results.twilio.error = "Twilio credentials not found in environment variables";
      results.twilio.message = "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in environment";
    } else {
      // Validate credentials
      const validation = await validateCredentials();
      if (validation.valid) {
        results.twilio.connected = true;
        results.twilio.hasNumbers = config.hasPhoneNumbers;
        results.twilio.message = `Twilio connected. ${config.phoneNumbers.length} phone number(s) configured.`;
      } else {
        results.twilio.error = validation.error || "Invalid credentials";
        results.twilio.message = "Twilio credentials invalid - check environment variables";
      }
    }
  } catch (error: any) {
    results.twilio.error = error.message;
    results.twilio.message = "Failed to check Twilio status";
  }

  const allConnected = results.googleCalendar.connected && results.twilio.connected;

  return NextResponse.json({
    success: allConnected,
    ...results,
    summary: {
      googleCalendar: results.googleCalendar.connected ? "✅ Connected" : "❌ Not Connected",
      twilio: results.twilio.connected ? "✅ Connected" : "❌ Not Connected",
    },
  });
}
