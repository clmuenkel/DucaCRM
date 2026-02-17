import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import {
  OutreachState,
  canTransition,
  shouldSendEmail,
  shouldCall,
  getNextAction,
  getAllowedTransitions,
} from "@/lib/outreach/state-machine";

export const dynamic = "force-dynamic";

const CONTACT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "stage",
  "outreach_lock",
  "outreach_follow_up_date",
  "allow_email_override",
  "email",
  "phone",
  "mobile",
].join(", ");

const EVENT_TO_STATE: Record<string, OutreachState> = {
  call_connected: "call_connected",
  meeting_booked: "meeting_booked",
  dead: "dead",
  call_back: "call_back_scheduled",
};

function buildContactPayload(contact: any) {
  const outreachLock = contact.outreach_lock ?? "fresh";
  const stageForAction = contact.stage ?? outreachLock;
  return {
    contact_id: contact.id,
    stage: contact.stage,
    outreach_lock: outreachLock,
    outreach_follow_up_date: contact.outreach_follow_up_date,
    allowed_transitions: getAllowedTransitions(outreachLock),
    can_send_email: shouldSendEmail(contact.outreach_lock ?? null, contact.allow_email_override ?? false),
    should_call: shouldCall(contact.outreach_lock ?? null),
    next_action: getNextAction(stageForAction, contact.outreach_follow_up_date),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data, error } = await insforge.database
      .from("contacts")
      .select(CONTACT_FIELDS)
      .eq("user_id", DEFAULT_USER_ID)
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(buildContactPayload(data));
  } catch (err: any) {
    console.error("[Outreach GET]", err);
    return NextResponse.json({ error: err.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { event, follow_up_days } = body ?? {};

    if (!event || typeof event !== "string") {
      return NextResponse.json(
        {
          error: "Missing 'event' field",
          valid_events: Object.keys(EVENT_TO_STATE),
        },
        { status: 400 }
      );
    }

    const targetState = EVENT_TO_STATE[event];
    if (!targetState) {
      return NextResponse.json(
        {
          error: `Invalid event: ${event}`,
          valid_events: Object.keys(EVENT_TO_STATE),
        },
        { status: 400 }
      );
    }

    const { data: contact, error: fetchError } = await insforge.database
      .from("contacts")
      .select(CONTACT_FIELDS)
      .eq("user_id", DEFAULT_USER_ID)
      .eq("id", id)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const currentState = contact.outreach_lock ?? "fresh";
    if (!canTransition(currentState, targetState)) {
      return NextResponse.json(
        {
          error: "Invalid transition",
          current_state: currentState,
          attempted_event: event,
          allowed_transitions: getAllowedTransitions(currentState),
        },
        { status: 422 }
      );
    }

    let followUpDate: string | null = null;
    if (targetState === "call_back_scheduled") {
      const days = Number(follow_up_days ?? 0);
      if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json(
          { error: "'follow_up_days' must be a positive number for call_back events" },
          { status: 400 }
        );
      }
      const due = new Date();
      due.setDate(due.getDate() + Math.floor(days));
      followUpDate = due.toISOString();
    }

    const updates: Record<string, any> = {
      outreach_lock: targetState,
      stage: targetState,
      outreach_follow_up_date: followUpDate,
      updated_at: new Date().toISOString(),
    };

    if (targetState !== "call_back_scheduled") {
      updates.outreach_follow_up_date = null;
    }

    const { data: updatedContact, error: updateError } = await insforge.database
      .from("contacts")
      .update(updates)
      .eq("user_id", DEFAULT_USER_ID)
      .eq("id", id)
      .select(CONTACT_FIELDS)
      .single();

    if (updateError || !updatedContact) {
      console.error("[Outreach POST] Update failed", updateError);
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
    }

    return NextResponse.json({
      previous_state: currentState,
      new_state: updatedContact.outreach_lock ?? "fresh",
      ...buildContactPayload(updatedContact),
    });
  } catch (err: any) {
    console.error("[Outreach POST]", err);
    return NextResponse.json({ error: err.message ?? "Unexpected error" }, { status: 500 });
  }
}
