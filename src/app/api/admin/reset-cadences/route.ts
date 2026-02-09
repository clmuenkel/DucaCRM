/**
 * POST /api/admin/reset-cadences
 * Clear email_queue and reset all active cadences
 * This is a utility endpoint to clean up existing data
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
        const userId = DEFAULT_USER_ID;

    // Clear all email_queue entries
    const { error: queueError } = await insforge.database
      .from("email_queue")
      .delete()
      .eq("user_id", userId);

    if (queueError) {
      console.error("Error clearing email_queue:", queueError);
    }

    // Reset all active cadences
    const { error: cadenceError } = await insforge.database
      .from("contacts")
      .update({
        cadence_status: null,
        cadence_step: null,
        cadence_outcome: null,
        next_action_date: null,
        next_action_type: null,
        cadence_day_started: null,
        cadence_started_at: null,
      })
      .eq("user_id", userId)
      .eq("cadence_status", "active");

    if (cadenceError) {
      console.error("Error resetting cadences:", cadenceError);
      return NextResponse.json(
        { error: "Failed to reset cadences", details: cadenceError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email queue cleared and all active cadences reset",
    });
  } catch (error: any) {
    console.error("Reset cadences error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reset cadences" },
      { status: 500 }
    );
  }
}
