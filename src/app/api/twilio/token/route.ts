import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { getTwilioConfig } from "@/lib/twilio/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";

/**
 * GET /api/twilio/token
 * Generate Twilio access token for browser Voice SDK
 */
export async function GET(request: NextRequest) {
  try {
    const config = getTwilioConfig();

    if (!config.hasCredentials) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 500 }
      );
    }

    if (!config.hasTwimlApp) {
      return NextResponse.json(
        { error: "Twilio TwiML App SID not configured" },
        { status: 500 }
      );
    }

    if (!config.apiKeySid || !config.apiKeySecret) {
      return NextResponse.json(
        { error: "Twilio API Key not configured" },
        { status: 500 }
      );
    }

    // Create access token
    const AccessToken = Twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create a grant for Voice
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: config.twimlAppSid,
      incomingAllow: false, // We only do outbound calls
    });

    // Create token
    const token = new AccessToken(
      config.accountSid!,
      config.apiKeySid!,
      config.apiKeySecret!,
      {
        identity: DEFAULT_USER_ID, // Use user ID as identity
        ttl: 3600, // Token expires in 1 hour
      }
    );

    token.addGrant(voiceGrant);

    return NextResponse.json({
      token: token.toJwt(),
      expiresIn: 3600,
    });
  } catch (error: any) {
    console.error("Error generating Twilio token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate access token" },
      { status: 500 }
    );
  }
}
