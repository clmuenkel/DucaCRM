import { NextRequest, NextResponse } from "next/server";
import { getTwilioClient } from "@/lib/twilio/client";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

/**
 * POST /api/twilio/webhook
 * Handle Twilio status callbacks for calls
 * Twilio sends webhooks when call status changes
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const fromNumber = formData.get("From") as string;
    const toNumber = formData.get("To") as string;
    const duration = formData.get("CallDuration") as string | null;
    const direction = formData.get("Direction") as string | null;

    if (!callSid) {
      return NextResponse.json({ error: "CallSid is required" }, { status: 400 });
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Find existing twilio_calls record
    const { data: existingCall, error: findError } = await supabase
      .from("twilio_calls")
      .select("*")
      .eq("call_sid", callSid)
      .single();

    // Update or create twilio_calls record
    const callData: any = {
      call_sid: callSid,
      status: callStatus,
      from_number: fromNumber,
      to_number: toNumber,
      direction: direction || "outbound-api",
      updated_at: new Date().toISOString(),
    };

    // Set timestamps based on status
    if (callStatus === "in-progress" && !existingCall?.answered_at) {
      callData.answered_at = new Date().toISOString();
    } else if (callStatus === "ringing" && !existingCall?.started_at) {
      callData.started_at = new Date().toISOString();
    } else if (
      (callStatus === "completed" || callStatus === "failed" || callStatus === "busy" || callStatus === "no-answer") &&
      !existingCall?.ended_at
    ) {
      callData.ended_at = new Date().toISOString();
    }

    // Set duration if provided
    if (duration) {
      callData.duration = parseInt(duration, 10);
    }

    if (existingCall) {
      // Update existing record
      const { error: updateError } = await supabase
        .from("twilio_calls")
        .update(callData)
        .eq("call_sid", callSid);

      if (updateError) {
        console.error("Error updating twilio_calls:", updateError);
        return NextResponse.json({ error: "Failed to update call record" }, { status: 500 });
      }
    } else {
      // Create new record (webhook received before initiate)
      callData.user_id = userId;
      const { error: insertError } = await supabase.from("twilio_calls").insert(callData);

      if (insertError) {
        console.error("Error creating twilio_calls:", insertError);
        return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
      }
    }

    // If call completed, update the main calls table if linked
    if (callStatus === "completed" && existingCall?.contact_id) {
      const { data: updatedCall } = await supabase
        .from("twilio_calls")
        .select("*")
        .eq("call_sid", callSid)
        .single();

      if (updatedCall) {
        // Find the corresponding call in calls table
        const { data: calls } = await supabase
          .from("calls")
          .select("id")
          .eq("twilio_call_sid", callSid)
          .limit(1);

        if (calls && calls.length > 0) {
          // Update the call record
          await supabase
            .from("calls")
            .update({
              ended_at: updatedCall.ended_at,
              duration_seconds: updatedCall.duration,
            })
            .eq("id", calls[0].id);
        }
      }
    }

    // Return TwiML response (Twilio expects this)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error: any) {
    console.error("Error processing Twilio webhook:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}
