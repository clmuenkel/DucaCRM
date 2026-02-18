import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

interface StartCadenceRequest {
  contactIds: string[];
  templateId?: string;
}

/**
 * POST /api/contacts/start-cadence
 * Start sales cadence for selected contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body: StartCadenceRequest = await request.json();
    const { contactIds } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "No contacts selected" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Cadence email automation is intentionally disabled for now.
    // Cadence starts immediately in call-only mode.
    let started = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    const today = new Date().toISOString().split("T")[0];

    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      try {
        // Get contact details
        const { data: contact, error: fetchError } = await insforge.database
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !contact) {
          errors++;
          errorDetails.push(`Contact ${contactId}: ${fetchError?.message || "Not found"}`);
          continue;
        }

        const typedContact = contact as Contact;

        // Update cadence status in call-only mode.
        // Reset all call tracking fields so the contact appears fresh in the power dialer.
        const { error: updateError } = await insforge.database
          .from("contacts")
          .update({
            cadence_status: "active",
            cadence_step: 0,
            cadence_day_started: today,
            cadence_outcome: "in_progress",
            next_action_date: today,
            next_action_type: "call",
            cadence_started_at: new Date().toISOString(),
            stage: "fresh",
            email_opened: false,
            email_replied: false,
            call_attempts: 0,
            last_call_attempt_date: null,
            last_call_outcome: null,
            wrong_number_flag: false,
            wrong_number_phone: null,
          })
          .eq("id", contactId);

        if (updateError) {
          const errorMsg = `Failed to update cadence status: ${updateError.message}`;
          errors++;
          errorDetails.push(errorMsg);
          continue;
        }

        started++;

        // Log activity
        try {
          await insforge.database
            .from("activity_log")
            .insert([{
              user_id: userId,
              contact_id: contactId,
              activity_type: "cadence_started",
              summary: "Sales cadence started - call-only mode (email automation disabled)",
              metadata: {
                email_automation_enabled: false,
              },
            }]);
        } catch (logError) {
          console.warn("Failed to log activity:", logError);
        }

      } catch (e: any) {
        const errorMsg = `Unexpected error: ${e.message || "Unknown error"}`;
        console.error(`Error starting cadence for contact ${contactId}:`, e);
        errors++;
        errorDetails.push(errorMsg);
      }
    }

    return NextResponse.json({
      success: errors === 0,
      message: `Started call-only cadence for ${started} contact${started !== 1 ? "s" : ""}${errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : ""}`,
      stats: {
        started,
        errors,
        total: contactIds.length,
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined, // Include error details
    });
  } catch (error: any) {
    console.error("Start cadence error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start cadence" },
      { status: 500 }
    );
  }
}
