import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { sendEmailWithTemplate } from "@/lib/instantly/template-sender";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";

export const dynamic = 'force-dynamic';

interface StartCadenceRequest {
  contactIds: string[];
  pushToInstantly?: boolean;
  templateId?: string; // Optional - defaults to "Cold Email"
  staggerMinutes?: number; // Default: 1 minute between emails
  sendImmediately?: boolean; // Default: true
}

/**
 * POST /api/contacts/start-cadence
 * Start sales cadence for selected contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body: StartCadenceRequest = await request.json();
    const { 
      contactIds, 
      pushToInstantly = true,
      templateId,
      staggerMinutes = 1,
      sendImmediately = true,
    } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "No contacts selected" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get Instantly config from environment variables (backend only)
    const instantlyApiKey = process.env.INSTANTLY_API_KEY;
    const instantlyCampaignId = process.env.INSTANTLY_CAMPAIGN_ID;

    // Get "Cold Email" template from CRM (or use provided templateId)
    let template: EmailTemplate | null = null;
    if (templateId) {
      const { data: templateData } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .eq("user_id", userId)
        .single();
      template = templateData as EmailTemplate | null;
    } else {
      // Find "Cold Email" template by category or name
      const { data: templateData } = await supabase
        .from("email_templates")
        .select("*")
        .eq("user_id", userId)
        .or(`category.eq.initial_outreach,name.ilike.%cold%`)
        .order("is_default", { ascending: false })
        .order("use_count", { ascending: false })
        .limit(1)
        .maybeSingle();
      template = templateData as EmailTemplate | null;
    }

    if (!template) {
      return NextResponse.json(
        { error: "No email template found. Please create a 'Cold Email' template first." },
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

    let started = 0;
    let queued = 0;
    let pushedToInstantly = 0;
    let errors = 0;
    const now = new Date();

    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      try {
        // Get contact details
        const { data: contact, error: fetchError } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .eq("user_id", userId)
          .single();

        if (fetchError || !contact) {
          errors++;
          continue;
        }

        const typedContact = contact as Contact;
        const today = new Date().toISOString().split("T")[0];

        // Calculate scheduled send time (staggered by index)
        const scheduledAt = new Date(now);
        scheduledAt.setMinutes(scheduledAt.getMinutes() + (i * staggerMinutes));

        // Build variables for template rendering
        const variables: Record<string, string> = {
          sender_name: typedProfile?.full_name || "Your Name",
          sender_calendar: typedProfile?.calendar_link || "[Calendar Link]",
        };

        // Render template to get subject and body
        const { renderTemplate } = await import("@/lib/email-template-renderer");
        const contactVariables = {
          first_name: typedContact.first_name || "",
          last_name: typedContact.last_name || "",
          full_name: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          company: typedContact.company_name || "",
          title: typedContact.title || "",
          email: typedContact.email || "",
          phone: typedContact.phone || typedContact.mobile || "",
          ...variables,
        };
        const renderedSubject = renderTemplate(template.subject_template, contactVariables);
        const renderedBody = renderTemplate(template.body_template, contactVariables);

        // Queue email in database for staggered sending
        const { error: queueError } = await (supabase as any)
          .from("email_queue")
          .insert({
            user_id: userId,
            contact_id: contactId,
            template_id: template.id,
            rendered_subject: renderedSubject,
            rendered_body: renderedBody,
            scheduled_at: scheduledAt.toISOString(),
            status: "pending",
          });

        if (queueError) {
          console.error(`Failed to queue email for contact ${contactId}:`, queueError);
          errors++;
          continue;
        }

        queued++;

        // Update cadence status
        const { error: updateError } = await (supabase as any)
          .from("contacts")
          .update({
            cadence_status: "active",
            cadence_step: 0,
            cadence_day_started: today,
            cadence_outcome: "in_progress",
            next_action_date: today,
            next_action_type: "call", // Immediately ready for calling queue
            cadence_started_at: new Date().toISOString(),
            stage: "fresh",
            email_opened: false,
            email_replied: false,
            call_attempts: 0,
          })
          .eq("id", contactId);

        if (updateError) {
          errors++;
          continue;
        }

        started++;

        // If sendImmediately is true and it's time to send (first email), send immediately
        // Otherwise, the email_queue processor will handle it
        if (sendImmediately && i === 0 && pushToInstantly && instantlyApiKey && instantlyCampaignId && typedContact.email) {
          try {
            const sendResult = await sendEmailWithTemplate({
              apiKey: instantlyApiKey,
              campaignId: instantlyCampaignId,
              contact: typedContact,
              template,
              variables,
            });

            if (sendResult.success) {
              // Update email_queue with instantly_lead_id
              await (supabase as any)
                .from("email_queue")
                .update({
                  instantly_lead_id: sendResult.leadId,
                  status: "sent",
                  sent_at: new Date().toISOString(),
                })
                .eq("contact_id", contactId)
                .eq("status", "pending")
                .order("created_at", { ascending: true })
                .limit(1);

              // Update contact
              await (supabase as any)
                .from("contacts")
                .update({ 
                  instantly_lead_id: sendResult.leadId || "pushed",
                  last_email_sent_at: new Date().toISOString(),
                })
                .eq("id", contactId);

              pushedToInstantly++;
            }
          } catch (instantlyError: any) {
            console.error(`Failed to send email for contact ${contactId}:`, instantlyError);
            // Don't fail - email is queued and will be processed later
          }
        }

        // Log activity
        try {
          await (supabase as any)
            .from("activity_log")
            .insert({
              user_id: userId,
              contact_id: contactId,
              activity_type: "cadence_started",
              summary: `Sales cadence started - email queued for ${scheduledAt.toLocaleString()}`,
              metadata: {
                template_id: template.id,
                scheduled_at: scheduledAt.toISOString(),
                pushed_to_instantly: pushToInstantly && instantlyApiKey && instantlyCampaignId && typedContact.email,
              },
            });
        } catch (logError) {
          console.warn("Failed to log activity:", logError);
        }

      } catch (e: any) {
        console.error(`Error starting cadence for contact ${contactId}:`, e);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Started cadence for ${started} contacts. ${queued} emails queued${pushedToInstantly > 0 ? `, ${pushedToInstantly} sent immediately` : ""}`,
      stats: {
        started,
        queued,
        pushedToInstantly,
        errors,
        total: contactIds.length,
      },
    });
  } catch (error: any) {
    console.error("Start cadence error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start cadence" },
      { status: 500 }
    );
  }
}
