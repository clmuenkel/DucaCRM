import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { sendEmailWithTemplate } from "@/lib/instantly/template-sender";
import { getIndustryForTemplate } from "@/lib/utils";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";

export const dynamic = 'force-dynamic';

interface StartCadenceRequest {
  contactIds: string[];
  pushToInstantly?: boolean;
  templateId?: string; // Optional - defaults to "Cold Email"
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
    let sentToInstantly = 0;
    let errors = 0;
    const today = new Date().toISOString().split("T")[0];

    for (const contactId of contactIds) {
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

        if (!typedContact.email) {
          console.error(`Contact ${contactId} has no email address`);
          errors++;
          continue;
        }

        // Build variables for template rendering
        const variables: Record<string, string> = {
          sender_name: typedProfile?.full_name || "Your Name",
          sender_calendar: typedProfile?.calendar_link || "[Calendar Link]",
        };

        // Send email directly to Instantly (no queue)
        if (pushToInstantly && instantlyApiKey && instantlyCampaignId) {
          try {
            const sendResult = await sendEmailWithTemplate({
              apiKey: instantlyApiKey,
              campaignId: instantlyCampaignId,
              contact: typedContact,
              template,
              variables,
            });

            if (sendResult.success) {
              // Update contact with email sent info
              await (supabase as any)
                .from("contacts")
                .update({ 
                  instantly_lead_id: sendResult.leadId || "pushed",
                  last_email_sent_at: new Date().toISOString(),
                })
                .eq("id", contactId);

              sentToInstantly++;
            } else {
              console.error(`Failed to send email for contact ${contactId}:`, sendResult.error);
              errors++;
              continue;
            }
          } catch (instantlyError: any) {
            console.error(`Failed to send email for contact ${contactId}:`, instantlyError);
            errors++;
            continue;
          }
        }

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

        // Log activity
        try {
          await (supabase as any)
            .from("activity_log")
            .insert({
              user_id: userId,
              contact_id: contactId,
              activity_type: "cadence_started",
              summary: `Sales cadence started - email sent via Instantly`,
              metadata: {
                template_id: template.id,
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
      message: `Started cadence for ${started} contacts. ${sentToInstantly} emails sent to Instantly${errors > 0 ? `, ${errors} errors` : ""}`,
      stats: {
        started,
        sentToInstantly,
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
