import { NextRequest, NextResponse } from "next/server";
import { getNextAvailableNumber, incrementCallCount } from "@/lib/telnyx/number-rotation";
import { recordCall } from "@/lib/telnyx/call-pacing";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { normalizeToE164 } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/telnyx/call/initiate
 * Initiate a Telnyx call and return the number to use
 * This is called before connecting via browser WebRTC SDK
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, toNumber } = body;

    if (!toNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Normalize phone number to E.164 format
    const normalizedNumber = normalizeToE164(toNumber);
    if (!normalizedNumber) {
      return NextResponse.json(
        {
          error: `Invalid phone number format: ${toNumber}. Must be in E.164 format (e.g., +18322941575)`,
        },
        { status: 400 }
      );
    }

    const userId = DEFAULT_USER_ID;

    // Get next available number
    const { number, error: numberError } = await getNextAvailableNumber();
    if (numberError || !number) {
      return NextResponse.json(
        { error: numberError || "No available Telnyx numbers" },
        { status: 500 }
      );
    }

    // Check daily limits
    if (number.daily_call_count >= number.daily_call_limit) {
      return NextResponse.json(
        {
          error: `Number ${number.phone_number} has reached daily limit (${number.daily_call_limit} calls)`,
        },
        { status: 429 }
      );
    }

    // Record call in database (before actually making it)
    const { data: telnyxCall, error: callError } = await insforge.database
      .from("telnyx_calls")
      .insert([
        {
          user_id: userId,
          contact_id: contactId || null,
          telnyx_number_id: number.id,
          from_number: number.phone_number,
          to_number: normalizedNumber,
          status: "initiated",
          direction: "outbound",
        },
      ])
      .select()
      .single();

    if (callError) {
      console.error("Error creating telnyx_calls record:", callError);
      // Continue anyway - this is just tracking
    }

    // Increment call count for the number
    await incrementCallCount(number.id);

    // Record call in pacing system
    recordCall(userId);

    return NextResponse.json({
      success: true,
      phoneNumber: number.phone_number,
      telnyxNumberId: number.id,
      telnyxCallId: telnyxCall?.id || null,
      dailyCallCount: number.daily_call_count + 1,
      dailyCallLimit: number.daily_call_limit,
    });
  } catch (error: any) {
    console.error("Error initiating Telnyx call:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate call" },
      { status: 500 }
    );
  }
}
