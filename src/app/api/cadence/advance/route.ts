import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

// Cadence step definitions (matches migration)
const CADENCE_STEPS = [
  { step: 0, day: 0, type: "email", name: "Email 1 - Intro" },
  { step: 1, day: 0, type: "call", name: "Call 1" },
  { step: 2, day: 4, type: "email", name: "Email 2 - Follow-up" },
  { step: 3, day: 7, type: "call", name: "Call 2" },
  { step: 4, day: 11, type: "email", name: "Email 3 - Breakup" },
  { step: 5, day: 14, type: "call", name: "Call 3 - Final" },
];

const MAX_STEP = 5;
const ARCHIVE_DAY = 15;

/**
 * POST /api/cadence/advance
 * Advance contacts through cadence steps based on time
 * Run this daily (or on-demand) to process email steps and check for auto-archive
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;
    const today = new Date().toISOString().split("T")[0];

    let advanced = 0;
    let archived = 0;
    let errors = 0;

    // 1. Find contacts with due actions
    const { data: dueContacts, error: fetchError } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("cadence_status", "active")
      .eq("cadence_outcome", "in_progress")
      .lte("next_action_date", today);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    for (const contact of dueContacts || []) {
      try {
        const currentStep = contact.cadence_step ?? -1;
        const stepDef = CADENCE_STEPS.find(s => s.step === currentStep);

        // If current step is an email step, auto-advance to next step
        // (Instantly handles the actual sending)
        if (stepDef?.type === "email") {
          const nextStep = currentStep + 1;
          
          if (nextStep > MAX_STEP) {
            // Cadence complete - archive
            await supabase
              .from("contacts")
              .update({
                cadence_status: "completed",
                cadence_outcome: "archived",
                cadence_step: null,
                next_action_date: null,
                next_action_type: null,
                stage: "archived",
              })
              .eq("id", contact.id);
            archived++;
          } else {
            // Advance to next step
            const nextStepDef = CADENCE_STEPS[nextStep];
            const cadenceStart = new Date(contact.cadence_day_started);
            const nextDate = new Date(cadenceStart);
            nextDate.setDate(nextDate.getDate() + nextStepDef.day);

            await supabase
              .from("contacts")
              .update({
                cadence_step: nextStep,
                next_action_date: nextDate.toISOString().split("T")[0],
                next_action_type: nextStepDef.type,
              })
              .eq("id", contact.id);
            advanced++;
          }
        }
        // Call steps are handled manually by the dialer

      } catch (e: any) {
        console.error(`Error advancing contact ${contact.id}:`, e);
        errors++;
      }
    }

    // 2. Check for snoozed contacts that are ready to resume
    const { data: snoozedContacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("cadence_status", "active")
      .eq("cadence_outcome", "callback")
      .lte("snooze_until", today);

    for (const contact of snoozedContacts || []) {
      try {
        // Resume at current step
        const stepDef = CADENCE_STEPS.find(s => s.step === contact.cadence_step);
        
        await supabase
          .from("contacts")
          .update({
            cadence_outcome: "in_progress",
            snooze_until: null,
            next_action_date: today,
            next_action_type: stepDef?.type || "call",
          })
          .eq("id", contact.id);
        advanced++;
      } catch (e: any) {
        console.error(`Error resuming contact ${contact.id}:`, e);
        errors++;
      }
    }

    // 3. Auto-archive contacts past day 15 with no response
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - ARCHIVE_DAY);

    const { data: staleContacts } = await supabase
      .from("contacts")
      .select("id, cadence_day_started, cadence_step")
      .eq("user_id", userId)
      .eq("cadence_status", "active")
      .eq("cadence_outcome", "in_progress")
      .lte("cadence_day_started", archiveDate.toISOString().split("T")[0])
      .gte("cadence_step", MAX_STEP);

    for (const contact of staleContacts || []) {
      try {
        await supabase
          .from("contacts")
          .update({
            cadence_status: "completed",
            cadence_outcome: "archived",
            cadence_step: null,
            next_action_date: null,
            next_action_type: null,
            stage: "archived",
          })
          .eq("id", contact.id);
        archived++;
      } catch (e: any) {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed cadence: ${advanced} advanced, ${archived} archived`,
      stats: {
        processed: (dueContacts?.length || 0) + (snoozedContacts?.length || 0),
        advanced,
        archived,
        errors,
      },
    });
  } catch (error: any) {
    console.error("Cadence advance error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to advance cadence" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cadence/advance
 * Get cadence summary stats
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;
    const today = new Date().toISOString().split("T")[0];

    // Get contacts by cadence status
    const { data: contacts } = await supabase
      .from("contacts")
      .select("cadence_status, cadence_outcome, cadence_step, next_action_date, next_action_type")
      .eq("user_id", userId)
      .eq("cadence_status", "active");

    const stats = {
      total: contacts?.length || 0,
      inProgress: contacts?.filter((c: any) => c.cadence_outcome === "in_progress").length || 0,
      callsDueToday: contacts?.filter((c: any) => 
        c.next_action_date === today && c.next_action_type === "call"
      ).length || 0,
      emailsDueToday: contacts?.filter((c: any) => 
        c.next_action_date === today && c.next_action_type === "email"
      ).length || 0,
      snoozed: contacts?.filter((c: any) => c.cadence_outcome === "callback").length || 0,
      byStep: {} as Record<number, number>,
    };

    // Count by step
    contacts?.forEach((c: any) => {
      if (c.cadence_step !== null) {
        stats.byStep[c.cadence_step] = (stats.byStep[c.cadence_step] || 0) + 1;
      }
    });

    return NextResponse.json({ stats });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
