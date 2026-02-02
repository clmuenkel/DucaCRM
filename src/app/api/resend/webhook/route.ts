import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * POST /api/resend/webhook
 * Handle Resend webhooks for email events (opens, clicks, bounces, replies)
 * 
 * Resend webhook events:
 * - email.sent: Email was sent
 * - email.delivered: Email was delivered
 * - email.opened: Email was opened
 * - email.clicked: Link in email was clicked
 * - email.replied: Email was replied to
 * - email.bounced: Email bounced
 * - email.complained: Email was marked as spam
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // Resend webhook structure:
    // {
    //   type: "email.opened",
    //   created_at: "2024-01-01T00:00:00Z",
    //   data: {
    //     email_id: "abc123",
    //     from: "sender@example.com",
    //     to: ["recipient@example.com"],
    //     subject: "Subject",
    //     created_at: "2024-01-01T00:00:00Z"
    //   }
    // }

    const email = Array.isArray(data?.to) ? data.to[0] : data?.to;
    const emailId = data?.email_id;

    if (!email) {
      console.warn("Resend webhook missing email address:", body);
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = DEFAULT_USER_ID;

    // Find contact by email
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email_open_count")
      .eq("user_id", userId)
      .eq("email", email)
      .maybeSingle();

    if (!contact) {
      console.warn(`Contact not found for email: ${email}`);
      return NextResponse.json({ success: true, message: "Contact not found" });
    }

    const typedContact = contact as { id: string; email_open_count: number | null };

    // Update based on event type
    const updates: any = {};

    switch (type) {
      case "email.sent":
        // Track that email was sent
        updates.last_email_sent_at = new Date().toISOString();
        if (emailId) {
          updates.resend_email_id = emailId;
        }
        break;

      case "email.delivered":
        // Track delivery
        updates.last_email_sent_at = new Date().toISOString();
        if (emailId) {
          updates.resend_email_id = emailId;
        }
        break;

      case "email.opened":
        updates.email_opened = true;
        updates.email_open_count = (typedContact.email_open_count || 0) + 1;
        updates.last_email_opened_at = new Date().toISOString();
        break;

      case "email.clicked":
        // Track clicks (could add a click_count field if needed)
        // For now, just log in activity
        break;

      case "email.replied":
        updates.email_replied = true;
        updates.cadence_status = "completed"; // Stop automation on reply
        updates.cadence_outcome = "replied";
        updates.next_action_date = null;
        updates.next_action_type = null;
        break;

      case "email.bounced":
        // Mark as bounced
        updates.email_bounced = true;
        break;

      case "email.complained":
        // Mark as spam complaint
        updates.email_complained = true;
        break;
    }

    if (Object.keys(updates).length > 0) {
      await (supabase as any)
        .from("contacts")
        .update(updates)
        .eq("id", typedContact.id);

      // Log activity
      try {
        await (supabase as any)
          .from("activity_log")
          .insert({
            user_id: userId,
            contact_id: typedContact.id,
            activity_type: `resend_${type.replace('.', '_')}`,
            summary: `Resend event: ${type}`,
            metadata: {
              email_id: emailId,
              event_type: type,
              event_data: data,
            },
          });
      } catch (logError) {
        console.warn("Failed to log activity:", logError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Resend webhook error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
