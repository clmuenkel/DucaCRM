import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export const dynamic = 'force-dynamic';

/**
 * POST /api/instantly/test-webhook
 * Simulate a webhook event to test webhook handling
 */
export async function POST(request: NextRequest) {
  try {
    const { event = "email_opened", email } = await request.json();

    if (!email) {
      return NextResponse.json({
        success: false,
        message: "Email is required for webhook test",
      }, { status: 400 });
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Find contact by email
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, email, email_open_count")
      .eq("user_id", userId)
      .eq("email", email)
      .single();

    if (!contact) {
      return NextResponse.json({
        success: false,
        message: `Contact not found with email: ${email}`,
        suggestion: "Use an email from an existing contact",
      }, { status: 404 });
    }

    const typedContact = contact as { id: string; email: string; email_open_count: number | null };

    // Simulate webhook by calling the webhook handler
    const webhookResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/instantly/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event,
          email: typedContact.email,
          campaign_id: process.env.INSTANTLY_CAMPAIGN_ID,
          test: true,
        }),
      }
    ).catch(() => null);

    // Also update directly to test
    const updates: any = {};
    switch (event) {
      case "email_opened":
        updates.email_opened = true;
        updates.email_open_count = (typedContact.email_open_count || 0) + 1;
        break;
      case "email_replied":
        updates.email_replied = true;
        updates.cadence_status = "completed";
        updates.cadence_outcome = "replied";
        updates.next_action_date = null;
        updates.next_action_type = null;
        break;
    }

    if (Object.keys(updates).length > 0) {
      await (supabase as any)
        .from("contacts")
        .update(updates)
        .eq("id", typedContact.id);
    }

    return NextResponse.json({
      success: true,
      message: `Webhook event '${event}' simulated successfully`,
      contact: {
        id: typedContact.id,
        email: typedContact.email,
      },
      updates,
      webhookResponse: webhookResponse ? await webhookResponse.json().catch(() => null) : null,
    });
  } catch (error: any) {
    console.error("Test webhook error:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Failed to simulate webhook",
    }, { status: 500 });
  }
}
