import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

// Cadence step definitions
const CADENCE_STEPS = [
  { step: 0, day: 0, type: "email", name: "Email 1 - Intro" },
  { step: 1, day: 0, type: "call", name: "Call 1" },
  { step: 2, day: 4, type: "email", name: "Email 2 - Follow-up" },
  { step: 3, day: 7, type: "call", name: "Call 2" },
  { step: 4, day: 11, type: "email", name: "Email 3 - Breakup" },
  { step: 5, day: 14, type: "call", name: "Call 3 - Final" },
];

const MAX_STEP = 5;

type Outcome = "won" | "lost" | "no_answer" | "callback" | "wrong_number" | "voicemail" | "busy" | "gatekeeper";

interface OutcomeRequest {
  contactId: string;
  outcome: Outcome;
  callbackDate?: string; // Required if outcome is "callback"
  notes?: string;
}

/**
 * POST /api/contacts/outcome
 * Handle call outcome and advance/complete cadence
 */
export async function POST(request: NextRequest) {
  try {
    const body: OutcomeRequest = await request.json();
    const { contactId, outcome, callbackDate, notes } = body;

    if (!contactId || !outcome) {
      return NextResponse.json(
        { error: "contactId and outcome are required" },
        { status: 400 }
      );
    }

    if (outcome === "callback" && !callbackDate) {
      return NextResponse.json(
        { error: "callbackDate is required for callback outcome" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get current contact state
    const { data: contact, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const typedContact = contact as Contact;
    const currentStep = typedContact.cadence_step ?? 0;
    const cadenceStart = typedContact.cadence_day_started 
      ? new Date(typedContact.cadence_day_started) 
      : new Date();

    let updateData: Record<string, any> = {
      last_contacted_at: new Date().toISOString(),
      call_attempts: (typedContact.call_attempts ?? 0) + 1,
      last_call_outcome: outcome,
      last_call_attempt_date: new Date().toISOString().split("T")[0],
    };

    let activitySummary = "";

    switch (outcome) {
      case "won":
        // Meeting booked - exit cadence
        updateData = {
          ...updateData,
          cadence_status: "completed",
          cadence_outcome: "won",
          cadence_step: null,
          next_action_date: null,
          next_action_type: null,
          stage: "meeting_booked",
        };
        activitySummary = "🎉 Meeting booked! Contact won.";
        break;

      case "lost":
        // Not interested - exit cadence
        updateData = {
          ...updateData,
          cadence_status: "completed",
          cadence_outcome: "lost",
          cadence_step: null,
          next_action_date: null,
          next_action_type: null,
          stage: "lost",
        };
        activitySummary = "Contact marked as lost.";
        break;

      case "wrong_number":
        // Wrong number - stop cadence, do NOT return to queue
        updateData = {
          ...updateData,
          wrong_number_flag: true,
          cadence_status: "completed",
          cadence_outcome: "wrong_number",
          cadence_step: null,
          next_action_date: null,
          next_action_type: null,
          stage: "archived",
        };
        activitySummary = "Wrong number - cadence stopped.";
        break;

      case "callback":
        // Snooze until callback date
        updateData = {
          ...updateData,
          cadence_outcome: "callback",
          snooze_until: callbackDate,
          next_action_date: callbackDate,
          next_action_type: "call",
        };
        activitySummary = `Callback scheduled for ${callbackDate}`;
        break;

      case "no_answer":
      case "voicemail":
      case "busy":
      case "gatekeeper":
        // These outcomes trigger 7-day follow-up email
        // Set outcome and mark for follow-up (will be sent in 7 days)
        updateData = {
          ...updateData,
          cadence_outcome: outcome,
          // Keep cadence active, will trigger follow-up in 7 days
          // next_action_type stays as "call" so they can be called again
          next_action_type: "call",
        };
        activitySummary = `${outcome === "no_answer" ? "No answer" : outcome === "voicemail" ? "Voicemail left" : outcome === "busy" ? "Busy" : "Gatekeeper"} - follow-up email will be sent in 7 days`;
        break;
    }

    // Update contact
    const { error: updateError } = await (supabase as any)
      .from("contacts")
      .update(updateData)
      .eq("id", contactId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log call activity
    await (supabase as any)
      .from("calls")
      .insert({
        user_id: userId,
        contact_id: contactId,
        outcome: outcome === "won" ? "connected" : outcome === "lost" ? "not_interested" : outcome,
        duration_seconds: 0, // Will be updated if tracked
        notes: notes || activitySummary,
        called_at: new Date().toISOString(),
      });

    // Log activity
    await (supabase as any)
      .from("activity_log")
      .insert({
        user_id: userId,
        contact_id: contactId,
        activity_type: `cadence_${outcome}`,
        summary: activitySummary,
        metadata: {
          outcome,
          step: currentStep,
          callbackDate: callbackDate || null,
        },
      });

    return NextResponse.json({
      success: true,
      message: activitySummary,
      outcome,
      nextStep: updateData.cadence_step,
      nextActionDate: updateData.next_action_date,
    });
  } catch (error: any) {
    console.error("Outcome error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process outcome" },
      { status: 500 }
    );
  }
}
