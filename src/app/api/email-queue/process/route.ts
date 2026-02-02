/**
 * POST /api/email-queue/process
 * Process queued emails that are due to be sent
 * This endpoint should be called by a cron job every minute
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { sendEmailWithTemplate } from "@/lib/instantly/template-sender";
import type { Contact, EmailTemplate } from "@/types/database";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization check here
    // For now, we'll use a simple secret key check
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get Instantly config
    const instantlyApiKey = process.env.INSTANTLY_API_KEY;
    const instantlyCampaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    if (!instantlyApiKey || !instantlyCampaignId) {
      return NextResponse.json(
        { error: "Instantly API not configured" },
        { status: 500 }
      );
    }

    const now = new Date();

    // Find emails that are due to be sent
    const { data: queuedEmails, error: fetchError } = await supabase
      .from("email_queue")
      .select(`
        *,
        contacts (*),
        email_templates (*)
      `)
      .eq("user_id", userId)
      .eq("status", "pending")
      .lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(10); // Process 10 at a time to avoid rate limits

    if (fetchError) {
      console.error("Error fetching queued emails:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch queued emails" },
        { status: 500 }
      );
    }

    if (!queuedEmails || queuedEmails.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No emails to process",
      });
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;

    // Get user profile for sender info
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, calendar_link")
      .eq("id", userId)
      .single();

    for (const queuedEmail of queuedEmails) {
      try {
        const contact = queuedEmail.contacts as Contact;
        const template = queuedEmail.email_templates as EmailTemplate;

        if (!contact || !template || !contact.email) {
          // Mark as failed
          await supabase
            .from("email_queue")
            .update({
              status: "failed",
              error_message: "Missing contact, template, or email",
            })
            .eq("id", queuedEmail.id);
          failed++;
          continue;
        }

        // Update status to "sending"
        await supabase
          .from("email_queue")
          .update({ status: "sending" })
          .eq("id", queuedEmail.id);

        // Build variables
        const variables: Record<string, string> = {
          sender_name: profile?.full_name || "Your Name",
          sender_calendar: profile?.calendar_link || "[Calendar Link]",
        };

        // Send email via Instantly
        const sendResult = await sendEmailWithTemplate({
          apiKey: instantlyApiKey,
          campaignId: instantlyCampaignId,
          contact,
          template,
          variables,
        });

        if (sendResult.success) {
          // Update queue entry
          await supabase
            .from("email_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              instantly_lead_id: sendResult.leadId,
            })
            .eq("id", queuedEmail.id);

          // Update contact
          await (supabase as any)
            .from("contacts")
            .update({
              instantly_lead_id: sendResult.leadId || "pushed",
              last_email_sent_at: new Date().toISOString(),
            })
            .eq("id", contact.id);

          sent++;
        } else {
          // Mark as failed
          await supabase
            .from("email_queue")
            .update({
              status: "failed",
              error_message: sendResult.error || "Unknown error",
            })
            .eq("id", queuedEmail.id);
          failed++;
        }

        processed++;
      } catch (error: any) {
        console.error(`Error processing queued email ${queuedEmail.id}:`, error);
        
        // Mark as failed
        await supabase
          .from("email_queue")
          .update({
            status: "failed",
            error_message: error.message || "Processing error",
          })
          .eq("id", queuedEmail.id);
        
        failed++;
        processed++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      sent,
      failed,
      message: `Processed ${processed} emails: ${sent} sent, ${failed} failed`,
    });
  } catch (error: any) {
    console.error("Email queue processor error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process email queue" },
      { status: 500 }
    );
  }
}
