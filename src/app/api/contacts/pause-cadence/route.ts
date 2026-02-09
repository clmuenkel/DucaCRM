import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

interface PauseCadenceRequest {
  contactId: string;
}

/**
 * POST /api/contacts/pause-cadence
 * Pause sales cadence for a contact
 */
export async function POST(request: NextRequest) {
  try {
    const body: PauseCadenceRequest = await request.json();
    const { contactId } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Update cadence status to paused
    const { error: updateError } = await insforge.database
      .from("contacts")
      .update({ cadence_status: "paused" })
      .eq("id", contactId)
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log activity
    await insforge.database
      .from("activity_log")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        activity_type: "cadence_paused",
        summary: "Sales cadence paused",
      }]);

    return NextResponse.json({
      success: true,
      message: "Cadence paused",
    });
  } catch (error: any) {
    console.error("Pause cadence error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to pause cadence" },
      { status: 500 }
    );
  }
}
