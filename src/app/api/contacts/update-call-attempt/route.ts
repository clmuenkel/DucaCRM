import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

interface UpdateCallAttemptRequest {
  contactId: string;
}

/**
 * POST /api/contacts/update-call-attempt
 * Update last call attempt date and increment call attempts
 * Keeps contact in queue but moves to bottom
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdateCallAttemptRequest = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get contact
    const { data: contact, error: fetchError } = await insforge.database
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
    const today = new Date().toISOString().split("T")[0];

    // Update contact
    const { error: updateError } = await insforge.database
      .from("contacts")
      .update({
        last_call_attempt_date: today,
        call_attempts: (typedContact.call_attempts || 0) + 1,
        last_contacted_at: new Date().toISOString(),
      })
      .eq("id", contactId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log activity
    await insforge.database
      .from("activity_log")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        activity_type: "call_attempt",
        summary: "Call attempt recorded (no answer)",
        metadata: {
          attempt_number: (typedContact.call_attempts || 0) + 1,
        },
      });

    return NextResponse.json({
      success: true,
      message: "Call attempt recorded",
      lastCallAttemptDate: today,
    });
  } catch (error: any) {
    console.error("Update call attempt error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update call attempt" },
      { status: 500 }
    );
  }
}
