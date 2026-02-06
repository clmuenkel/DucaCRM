/**
 * Telnyx API Client
 * https://developers.telnyx.com/docs/api/v2/overview
 */

/**
 * Get Telnyx configuration from environment variables
 */
export function getTelnyxConfig() {
  const apiKey = process.env.TELNYX_API_KEY;
  const sipConnectionId = process.env.TELNYX_SIP_CONNECTION_ID;

  // Get phone numbers from env (TELNYX_PHONE_NUMBER_1 through TELNYX_PHONE_NUMBER_5)
  const phoneNumbers: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const phoneNumber = process.env[`TELNYX_PHONE_NUMBER_${i}`];
    if (phoneNumber) {
      // Normalize phone number format (remove spaces, parentheses, dashes)
      const normalized = phoneNumber.replace(/[\s\(\)\-]/g, "");
      if (normalized.startsWith("+")) {
        phoneNumbers.push(normalized);
      } else if (normalized.startsWith("1") && normalized.length === 11) {
        phoneNumbers.push(`+${normalized}`);
      } else if (normalized.length === 10) {
        phoneNumbers.push(`+1${normalized}`);
      }
    }
  }

  return {
    apiKey,
    sipConnectionId,
    phoneNumbers,
    hasCredentials: !!apiKey,
    hasSipConnection: !!sipConnectionId,
    hasPhoneNumbers: phoneNumbers.length > 0,
  };
}

/**
 * Validate Telnyx credentials by making a test API call
 */
export async function validateCredentials(): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const config = getTelnyxConfig();
    
    if (!config.apiKey) {
      return { valid: false, error: "TELNYX_API_KEY not configured" };
    }

    // Test the API key by fetching account info
    const response = await fetch("https://api.telnyx.com/v2/balance", {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: errorData.errors?.[0]?.detail || `API error: ${response.status}`,
      };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || "Invalid Telnyx credentials",
    };
  }
}

/**
 * Create a Telnyx credential for WebRTC
 * Returns a JWT token for the browser SDK
 */
export async function createWebRTCCredential(identity: string): Promise<{
  token?: string;
  error?: string;
}> {
  try {
    const config = getTelnyxConfig();

    if (!config.apiKey) {
      return { error: "TELNYX_API_KEY not configured" };
    }

    if (!config.sipConnectionId) {
      return { error: "TELNYX_SIP_CONNECTION_ID not configured" };
    }

    // Create a credential token for WebRTC
    const response = await fetch("https://api.telnyx.com/v2/telephony_credentials", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: config.sipConnectionId,
        name: identity,
        // Token expires in 1 hour
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        error: errorData.errors?.[0]?.detail || `Failed to create credential: ${response.status}`,
      };
    }

    const data = await response.json();
    
    // Now get the token for this credential
    const tokenResponse = await fetch(
      `https://api.telnyx.com/v2/telephony_credentials/${data.data.id}/token`,
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
      return {
        error: errorData.errors?.[0]?.detail || `Failed to get token: ${tokenResponse.status}`,
      };
    }

    const tokenData = await tokenResponse.text();
    return { token: tokenData };
  } catch (error: any) {
    return { error: error.message || "Failed to create WebRTC credential" };
  }
}

/**
 * Initiate an outbound call via Telnyx API
 */
export async function initiateCall(params: {
  from: string;
  to: string;
  connectionId?: string;
  webhookUrl?: string;
}): Promise<{
  callControlId?: string;
  callLegId?: string;
  error?: string;
}> {
  try {
    const config = getTelnyxConfig();

    if (!config.apiKey) {
      return { error: "TELNYX_API_KEY not configured" };
    }

    const response = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connection_id: params.connectionId || config.sipConnectionId,
        from: params.from,
        to: params.to,
        webhook_url: params.webhookUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        error: errorData.errors?.[0]?.detail || `Failed to initiate call: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      callControlId: data.data.call_control_id,
      callLegId: data.data.call_leg_id,
    };
  } catch (error: any) {
    return { error: error.message || "Failed to initiate call" };
  }
}
