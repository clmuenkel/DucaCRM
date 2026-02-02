import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/webhook
 * Handle Instantly webhooks for email events (opens, replies, bounces)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, email, campaign_id, ...otherData } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Find contact by email
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email_open_count")
      .eq("user_id", userId)
      .eq("email", email)
      .single();

    if (!contact) {
      console.warn(`Contact not found for email: ${email}`);
      return NextResponse.json({ success: true, message: "Contact not found" });
    }

    const typedContact = contact as { id: string; email_open_count: number | null };

    // Update based on event type
    const updates: any = {};

    switch (event) {
      case "email_opened":
        updates.email_opened = true;
        updates.email_open_count = (typedContact.email_open_count || 0) + 1;
        break;
      case "email_replied":
        updates.email_replied = true;
        updates.cadence_status = "completed"; // Stop automation on reply
        updates.cadence_outcome = "replied";
        updates.next_action_date = null;
        updates.next_action_type = null;
        break;
      case "email_bounced":
        // Mark as bounced, might want to flag contact
        break;
      case "email_unsubscribed":
        // Mark as unsubscribed
        break;
    }

    if (Object.keys(updates).length > 0) {
      await (supabase as any)
        .from("contacts")
        .update(updates)
        .eq("id", typedContact.id);

      // Log activity
      await (supabase as any)
        .from("activity_log")
        .insert({
          user_id: userId,
          contact_id: typedContact.id,
          activity_type: `instantly_${event}`,
          summary: `Instantly event: ${event}`,
          metadata: otherData,
        });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Instantly webhook error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
