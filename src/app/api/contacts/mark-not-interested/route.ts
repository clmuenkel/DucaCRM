import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact } from "@/types/database";

export const dynamic = 'force-dynamic';

interface MarkNotInterestedRequest {
  contactId: string;
  notes?: string;
}

/**
 * POST /api/contacts/mark-not-interested
 * Mark contact as not interested (lost) and hide from bottom table
 */
export async function POST(request: NextRequest) {
  try {
    const body: MarkNotInterestedRequest = await request.json();
    const { contactId, notes } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get contact
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

    // Update contact: mark as lost
    const { error: updateError } = await (supabase as any)
      .from("contacts")
      .update({
        cadence_outcome: "lost",
        cadence_status: "completed",
        stage: "lost",
        cadence_step: null,
        next_action_date: null,
        next_action_type: null,
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
    await (supabase as any)
      .from("activity_log")
      .insert({
        user_id: userId,
        contact_id: contactId,
        activity_type: "marked_not_interested",
        summary: "Contact marked as not interested",
        metadata: {
          notes: notes || null,
        },
      });

    // Add note if provided
    if (notes) {
      await (supabase as any)
        .from("notes")
        .insert({
          user_id: userId,
          contact_id: contactId,
          content: notes,
        });
    }

    return NextResponse.json({
      success: true,
      message: "Contact marked as not interested",
    });
  } catch (error: any) {
    console.error("Mark not interested error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark as not interested" },
      { status: 500 }
    );
  }
}
