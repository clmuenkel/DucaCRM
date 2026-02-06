import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/telnyx/webhook
 * Handle Telnyx call control webhooks
 * https://developers.telnyx.com/docs/api/v2/call-control/Call-Commands
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, meta } = body;

    if (!data) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const eventType = data.event_type;
    const payload = data.payload;

    const callControlId = payload?.call_control_id;
    const callLegId = payload?.call_leg_id;
    const fromNumber = payload?.from;
    const toNumber = payload?.to;
    const direction = payload?.direction;
    const state = payload?.state;

    console.log(`[Telnyx Webhook] Event: ${eventType}, State: ${state}, CallControlId: ${callControlId}`);

    const userId = DEFAULT_USER_ID;

    // Map Telnyx event types to our call status
    let callStatus = state || eventType;
    
    // Normalize status names
    const statusMap: Record<string, string> = {
      "call.initiated": "initiated",
      "call.ringing": "ringing",
      "call.answered": "in-progress",
      "call.bridged": "in-progress",
      "call.hangup": "completed",
      "call.machine.detection.ended": "voicemail",
    };
    
    if (statusMap[eventType]) {
      callStatus = statusMap[eventType];
    }

    // Find existing telnyx_calls record
    const { data: existingCall, error: findError } = await insforge.database
      .from("telnyx_calls")
      .select("*")
      .eq("call_control_id", callControlId)
      .maybeSingle();

    const typedExistingCall = existingCall as any;

    // Build update data
    const callData: any = {
      call_control_id: callControlId,
      call_leg_id: callLegId,
      status: callStatus,
      from_number: fromNumber,
      to_number: toNumber,
      direction: direction || "outbound",
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on event
    if (eventType === "call.initiated" && !typedExistingCall?.started_at) {
      callData.started_at = new Date().toISOString();
    } else if (eventType === "call.answered" && !typedExistingCall?.answered_at) {
      callData.answered_at = new Date().toISOString();
    } else if (eventType === "call.hangup" && !typedExistingCall?.ended_at) {
      callData.ended_at = new Date().toISOString();
      // Calculate duration if we have start time
      if (typedExistingCall?.answered_at) {
        const answeredAt = new Date(typedExistingCall.answered_at);
        const endedAt = new Date();
        callData.duration = Math.floor((endedAt.getTime() - answeredAt.getTime()) / 1000);
      }
    }

    if (typedExistingCall) {
      // Update existing record
      const { error: updateError } = await insforge.database
        .from("telnyx_calls")
        .update(callData)
        .eq("call_control_id", callControlId);

      if (updateError) {
        console.error("Error updating telnyx_calls:", updateError);
      }
    } else {
      // Create new record
      callData.user_id = userId;
      const { error: insertError } = await insforge.database
        .from("telnyx_calls")
        .insert([callData]);

      if (insertError) {
        console.error("Error creating telnyx_calls:", insertError);
      }
    }

    // Return 200 OK to acknowledge webhook
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing Telnyx webhook:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}
