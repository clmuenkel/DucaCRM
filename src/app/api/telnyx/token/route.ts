import { NextRequest, NextResponse } from "next/server";
import { getTelnyxConfig } from "@/lib/telnyx/client";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/telnyx/token
 * Generate Telnyx WebRTC credential token for browser SDK
 */
export async function GET(request: NextRequest) {
  try {
    const config = getTelnyxConfig();

    if (!config.hasCredentials) {
      return NextResponse.json(
        { error: "Telnyx API key not configured" },
        { status: 500 }
      );
    }

    if (!config.sipConnectionId) {
      return NextResponse.json(
        { error: "Telnyx SIP Connection ID not configured" },
        { status: 500 }
      );
    }

    // Create a credential for WebRTC
    const credentialResponse = await fetch(
      "https://api.telnyx.com/v2/telephony_credentials",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connection_id: config.sipConnectionId,
          name: `webrtc-${DEFAULT_USER_ID}-${Date.now()}`,
        }),
      }
    );

    if (!credentialResponse.ok) {
      const errorData = await credentialResponse.json().catch(() => ({}));
      console.error("Telnyx credential error:", errorData);
      return NextResponse.json(
        {
          error:
            errorData.errors?.[0]?.detail ||
            `Failed to create credential: ${credentialResponse.status}`,
        },
        { status: 500 }
      );
    }

    const credentialData = await credentialResponse.json();
    const credentialId = credentialData.data.id;

    // Get the token for this credential
    const tokenResponse = await fetch(
      `https://api.telnyx.com/v2/telephony_credentials/${credentialId}/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error("Telnyx token error:", errorData);
      return NextResponse.json(
        {
          error:
            errorData.errors?.[0]?.detail ||
            `Failed to get token: ${tokenResponse.status}`,
        },
        { status: 500 }
      );
    }

    const token = await tokenResponse.text();

    return NextResponse.json({
      token,
      expiresIn: 3600,
      sipConnectionId: config.sipConnectionId,
    });
  } catch (error: any) {
    console.error("Error generating Telnyx token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate access token" },
      { status: 500 }
    );
  }
}
