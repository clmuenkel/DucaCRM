import Twilio from "twilio";

let twilioClient: Twilio.Twilio | null = null;

/**
 * Get or create Twilio client instance
 * Uses singleton pattern to avoid creating multiple clients
 */
export function getTwilioClient(): Twilio.Twilio {
  if (twilioClient) {
    return twilioClient;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in environment variables."
    );
  }

  twilioClient = Twilio(accountSid, authToken);
  return twilioClient;
}

/**
 * Validate Twilio credentials by making a test API call
 * Returns true if credentials are valid, false otherwise
 */
export async function validateCredentials(): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const client = getTwilioClient();
    // Make a lightweight API call to validate credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    if (!accountSid) {
      return { valid: false, error: "TWILIO_ACCOUNT_SID not configured" };
    }
    await client.api.accounts(accountSid).fetch();
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message || "Invalid Twilio credentials",
    };
  }
}

/**
 * Get Twilio configuration from environment variables
 */
export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const businessProfileSid = process.env.TWILIO_BUSINESS_PROFILE_SID;

  // Get phone numbers from env (TWILIO_PHONE_NUMBER_1 through TWILIO_PHONE_NUMBER_5)
  const phoneNumbers: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const phoneNumber = process.env[`TWILIO_PHONE_NUMBER_${i}`];
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
    accountSid,
    authToken,
    twimlAppSid,
    apiKeySid,
    apiKeySecret,
    businessProfileSid,
    phoneNumbers,
    hasCredentials: !!(accountSid && authToken),
    hasTwimlApp: !!twimlAppSid,
    hasApiKey: !!(apiKeySid && apiKeySecret),
    hasBusinessProfile: !!businessProfileSid,
    hasPhoneNumbers: phoneNumbers.length > 0,
  };
}
