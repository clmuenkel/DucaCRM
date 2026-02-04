import { NextRequest, NextResponse } from "next/server";
import { getTwilioClient, getTwilioConfig } from "@/lib/twilio/client";

export const dynamic = 'force-dynamic';

/**
 * POST /api/twilio/associate-business-profile
 * Attempts to associate a Twilio phone number with a Business Profile
 * This helps resolve Error 13225 (Phone number is blacklisted)
 * 
 * Note: Phone number association with Business Profiles is typically done
 * through the Twilio Console UI. This endpoint verifies the association
 * and provides instructions if manual setup is needed.
 */
export async function POST(request: NextRequest) {
  try {
    const config = getTwilioConfig();
    
    if (!config.hasCredentials) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 500 }
      );
    }

    if (!config.businessProfileSid) {
      return NextResponse.json(
        { error: "TWILIO_BUSINESS_PROFILE_SID not configured in environment variables" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required in request body: { phoneNumber: '+17622466193' }" },
        { status: 400 }
      );
    }

    // Normalize phone number (ensure E.164 format)
    const normalizedNumber = phoneNumber.replace(/[\s\(\)\-]/g, "");
    const e164Number = normalizedNumber.startsWith("+") 
      ? normalizedNumber 
      : normalizedNumber.startsWith("1") && normalizedNumber.length === 11
      ? `+${normalizedNumber}`
      : normalizedNumber.length === 10
      ? `+1${normalizedNumber}`
      : normalizedNumber;

    const client = getTwilioClient();

    // Find the phone number in Twilio account
    const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: e164Number,
      limit: 1,
    });

    if (incomingPhoneNumbers.length === 0) {
      return NextResponse.json(
        { 
          error: `Phone number ${e164Number} not found in your Twilio account`,
          suggestion: "Make sure the phone number is active in your Twilio Console"
        },
        { status: 404 }
      );
    }

    const phoneNumberSid = incomingPhoneNumbers[0].sid;
    const phoneNumberData = incomingPhoneNumbers[0];

    // Check current status
    const currentStatus = {
      phoneNumber: e164Number,
      phoneNumberSid,
      businessProfileSid: config.businessProfileSid,
      friendlyName: phoneNumberData.friendlyName,
      status: phoneNumberData.status,
    };

    // Note: Twilio's API doesn't directly expose a method to associate phone numbers
    // with Business Profiles via the standard SDK. This association is typically done
    // through the Twilio Console UI or via Regulatory Compliance API endpoints.
    // 
    // However, we can verify the phone number exists and provide instructions.
    // The actual association may need to be done manually or via a different API endpoint.

    return NextResponse.json({
      success: true,
      message: "Phone number found. Association with Business Profile may need to be done via Twilio Console.",
      phoneNumber: e164Number,
      phoneNumberSid,
      businessProfileSid: config.businessProfileSid,
      currentStatus,
      instructions: {
        step1: "Go to Twilio Console → Phone Numbers → Manage → Active Numbers",
        step2: `Click on phone number ${e164Number}`,
        step3: "Look for 'Regulatory Compliance' or 'Business Profile' section",
        step4: `Associate with Business Profile: ${config.businessProfileSid}`,
        step5: "If the UI doesn't show this option, the association may be automatic when the Business Profile is set as Primary",
        alternative: "The phone number should automatically be associated if your Business Profile is set as the Primary Customer Profile in Trust Hub"
      },
      verification: {
        phoneNumberExists: true,
        businessProfileConfigured: true,
        nextStep: "Verify association in Twilio Console or test a call to see if Error 13225 is resolved"
      }
    });
  } catch (error: any) {
    console.error("Error checking Business Profile association:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to check Business Profile association",
        details: error.toString()
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/twilio/associate-business-profile
 * Test endpoint to check all configured phone numbers
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

    if (!config.businessProfileSid) {
      return NextResponse.json(
        { error: "TWILIO_BUSINESS_PROFILE_SID not configured" },
        { status: 500 }
      );
    }

    if (!config.hasPhoneNumbers) {
      return NextResponse.json(
        { error: "No phone numbers configured in environment variables" },
        { status: 400 }
      );
    }

    const client = getTwilioClient();
    const results = [];
    
    for (const phoneNumber of config.phoneNumbers) {
      try {
        const incomingPhoneNumbers = await client.incomingPhoneNumbers.list({
          phoneNumber,
          limit: 1,
        });

        if (incomingPhoneNumbers.length > 0) {
          const phoneNumberData = incomingPhoneNumbers[0];
          results.push({
            phoneNumber,
            found: true,
            phoneNumberSid: phoneNumberData.sid,
            friendlyName: phoneNumberData.friendlyName,
            status: phoneNumberData.status,
            businessProfileSid: config.businessProfileSid,
          });
        } else {
          results.push({
            phoneNumber,
            found: false,
            error: "Phone number not found in Twilio account",
          });
        }
      } catch (error: any) {
        results.push({
          phoneNumber,
          found: false,
          error: error.message || "Error checking phone number",
        });
      }
    }

    return NextResponse.json({
      success: true,
      businessProfileSid: config.businessProfileSid,
      results,
      instructions: {
        note: "Phone number association with Business Profiles is typically done via Twilio Console UI",
        consolePath: "Phone Numbers → Manage → Active Numbers → [Your Number] → Regulatory Compliance",
        trustHubPath: "Trust Hub → Business Profiles → [Your Profile] → Verify it's set as Primary",
      }
    });
  } catch (error: any) {
    console.error("Error checking phone numbers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check phone numbers" },
      { status: 500 }
    );
  }
}
