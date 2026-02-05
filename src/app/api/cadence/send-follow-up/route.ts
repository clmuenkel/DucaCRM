/**
 * POST /api/cadence/send-follow-up
 * Send follow-up emails to contacts 7 days after call
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { sendEmailWithTemplate } from "@/lib/resend/template-sender";
import { getIndustryForTemplate } from "@/lib/utils";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";

export const dynamic = 'force-dynamic';

interface SendFollowUpRequest {
  contactIds?: string[]; // Optional - if not provided, finds all due contacts
}

export async function POST(request: NextRequest) {
  try {
    // Check for Vercel cron authorization (if called by cron, no body will be sent)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // If CRON_SECRET is set and this is a cron call, verify authorization
    // Allow manual calls (with body) to bypass cron auth
    let body: SendFollowUpRequest = { contactIds: undefined };
    try {
      body = await request.json();
    } catch {
      // No body - this is a cron call, verify auth
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }
    
    // If body was provided but no auth header, this is a manual call - allow it
    // If auth header is present, verify it matches cron secret
    if (body.contactIds && cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const { contactIds } = body;

        const userId = DEFAULT_USER_ID;

    // Get Resend config
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;

    if (!resendApiKey || !resendFromEmail) {
      return NextResponse.json(
        { error: "Resend API not configured (missing API key or from email)" },
        { status: 500 }
      );
    }

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    // Build query to find contacts due for follow-up
    let query = supabase
      .from("contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("cadence_status", "active")
      .in("cadence_outcome", ["no_answer", "voicemail", "busy", "gatekeeper"])
      .eq("last_call_attempt_date", sevenDaysAgoStr)
      .eq("wrong_number_flag", false)
      .not("email", "is", null);

    // If specific contact IDs provided, filter by them
    if (contactIds && contactIds.length > 0) {
      query = query.in("id", contactIds);
    }

    const { data: contacts, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching contacts for follow-up:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: "No contacts due for follow-up",
      });
    }

    // Get "Follow Up" template
    const { data: templates } = await supabase
      .from("email_templates")
      .select("*")
      .eq("user_id", userId)
      .or("category.eq.follow_up,name.ilike.%follow%")
      .order("is_default", { ascending: false })
      .order("use_count", { ascending: false })
      .limit(1);

    const template = (templates?.[0] as EmailTemplate | undefined) || null;

    if (!template) {
      return NextResponse.json(
        { error: "No follow-up email template found. Please create one in Templates." },
        { status: 400 }
      );
    }

    // Get user profile for sender info
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, calendar_link")
      .eq("id", userId)
      .single();

    const typedProfile = profile as { full_name: string | null; calendar_link: string | null } | null;

    let sent = 0;
    let failed = 0;
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    for (const contact of contacts) {
      const typedContact = contact as Contact;

      if (!typedContact.email) {
        failed++;
        continue;
      }

      try {
        // Build variables (industry is included in sendEmailWithTemplate via contact)
        const variables: Record<string, string> = {
          sender_name: typedProfile?.full_name || "Your Name",
          sender_calendar: typedProfile?.calendar_link || "[Calendar Link]",
        };

        // Send follow-up email
        const sendResult = await sendEmailWithTemplate({
          apiKey: resendApiKey,
          fromEmail: resendFromEmail,
          contact: typedContact,
          template,
          variables,
        });

        if (sendResult.success) {
          // Update contact
          await (supabase as any)
            .from("contacts")
            .update({
              last_email_sent_at: new Date().toISOString(),
              cadence_step: 2, // Follow-up email step
              next_action_type: "call", // Return to calling queue
              next_action_date: tomorrowStr, // Available for calling tomorrow
              last_call_attempt_date: null, // Reset call attempt date
            })
            .eq("id", typedContact.id);

          sent++;

          // Log activity
          try {
            await (supabase as any)
              .from("activity_log")
              .insert({
                user_id: userId,
                contact_id: typedContact.id,
                activity_type: "follow_up_sent",
                summary: `Follow-up email sent 7 days after call`,
                metadata: {
                template_id: template.id,
                resend_email_id: sendResult.emailId,
              },
              });
          } catch (logError) {
            console.warn("Failed to log activity:", logError);
          }
        } else {
          failed++;
          console.error(`Failed to send follow-up to ${typedContact.email}:`, sendResult.error);
        }
      } catch (error: any) {
        console.error(`Error sending follow-up to ${typedContact.email}:`, error);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: contacts.length,
      message: `Sent ${sent} follow-up emails${failed > 0 ? `, ${failed} failed` : ""}`,
    });
  } catch (error: any) {
    console.error("Send follow-up error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send follow-up emails" },
      { status: 500 }
    );
  }
}

// GET handler for Vercel cron jobs (cron calls GET by default)
export async function GET(request: NextRequest) {
  return POST(request);
}
