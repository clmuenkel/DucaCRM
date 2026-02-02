/**
 * POST /api/admin/setup-test-data
 * Clear email_queue, reset cadences, and create test contact
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Clear email_queue
    const { error: queueError, count: queueCount } = await (supabase as any)
      .from("email_queue")
      .delete({ count: 'exact' })
      .eq("user_id", userId);

    if (queueError) {
      console.error("Error clearing email_queue:", queueError);
    }

    // Reset all active cadences
    const { error: cadenceError, count: cadenceCount } = await (supabase as any)
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
      .eq("cadence_status", "active")
      .select("id", { count: 'exact', head: false });

    if (cadenceError) {
      console.error("Error resetting cadences:", cadenceError);
    }

    // Check if test contact exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("email", "18cmuenkel@gmail.com")
      .maybeSingle();

    const typedExisting = existing as { id: string } | null;

    if (typedExisting) {
      // Update existing contact
      const { error: updateError } = await (supabase as any)
        .from("contacts")
        .update({
          first_name: "Carl-Luca",
          last_name: "Muenkel",
          email: "18cmuenkel@gmail.com",
          industry: "swag",
          industries: ["swag"],
          status: "active",
          cadence_status: null,
          cadence_step: null,
          cadence_outcome: null,
          next_action_date: null,
          next_action_type: null,
        })
        .eq("id", typedExisting.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update test contact", details: updateError.message },
          { status: 500 }
        );
      }
    } else {
      // Create new contact
      const { error: insertError } = await (supabase as any)
        .from("contacts")
        .insert({
          user_id: userId,
          first_name: "Carl-Luca",
          last_name: "Muenkel",
          email: "18cmuenkel@gmail.com",
          industry: "swag",
          industries: ["swag"],
          status: "active",
        });

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to create test contact", details: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Test data setup complete",
      stats: {
        queueCleared: queueCount || 0,
        cadencesReset: cadenceCount || 0,
        testContact: typedExisting ? "updated" : "created",
      },
    });
  } catch (error: any) {
    console.error("Setup test data error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to setup test data" },
      { status: 500 }
    );
  }
}
