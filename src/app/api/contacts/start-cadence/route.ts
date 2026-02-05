import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { sendEmailWithTemplate } from "@/lib/resend/template-sender";
import { getIndustryForTemplate } from "@/lib/utils";
import { EMAIL_TEMPLATE_CATEGORIES } from "@/lib/constants";

export const dynamic = 'force-dynamic';

interface StartCadenceRequest {
  contactIds: string[];
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
      templateId,
    } = body;

    if (!contactIds || contactIds.length === 0) {
      return NextResponse.json(
        { error: "No contacts selected" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get Resend config from environment variables (backend only)
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;

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
    let emailsSent = 0;
    let errors = 0;
    const errorDetails: string[] = []; // Track error messages
    const today = new Date().toISOString().split("T")[0];
    
    // Stagger emails: 1 per minute (60 seconds delay between sends)
    const STAGGER_DELAY_MS = 60000; // 60 seconds = 1 minute

    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      
      // Add delay between emails (except for the first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS));
      }
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
          errorDetails.push(`Contact ${contactId}: ${fetchError?.message || "Not found"}`);
          continue;
        }

        const typedContact = contact as Contact;

        if (!typedContact.email) {
          const errorMsg = `Contact ${typedContact.first_name} ${typedContact.last_name || ""} has no email address`;
          console.error(errorMsg);
          errors++;
          errorDetails.push(errorMsg);
          continue;
        }

        // Build variables for template rendering
        const variables: Record<string, string> = {
          sender_name: typedProfile?.full_name || "Your Name",
          sender_calendar: typedProfile?.calendar_link || "[Calendar Link]",
        };

        // Send email via Resend
        let emailSent = false;
        if (resendApiKey && resendFromEmail) {
          try {
            const sendResult = await sendEmailWithTemplate({
              apiKey: resendApiKey,
              fromEmail: resendFromEmail,
              contact: typedContact,
              template,
              variables,
            });

            if (sendResult.success) {
              // Update contact with email sent info
              await (supabase as any)
                .from("contacts")
                .update({ 
                  resend_email_id: sendResult.emailId,
                  last_email_sent_at: new Date().toISOString(),
                })
                .eq("id", contactId);

              emailsSent++;
              emailSent = true;
            } else {
              const errorMsg = `Failed to send email: ${sendResult.error || "Unknown error"}`;
              console.error(`Failed to send email for contact ${contactId}:`, sendResult.error);
              errorDetails.push(`${typedContact.first_name} ${typedContact.last_name || ""}: ${errorMsg}`);
              // Don't continue here - still update cadence status even if email fails
            }
          } catch (resendError: any) {
            const errorMsg = `Email send error: ${resendError.message || "Unknown error"}`;
            console.error(`Failed to send email for contact ${contactId}:`, resendError);
            errorDetails.push(`${typedContact.first_name} ${typedContact.last_name || ""}: ${errorMsg}`);
            // Don't continue here - still update cadence status even if email fails
          }
        } else {
          // Resend not configured
          const errorMsg = "Resend API not configured (missing API key or from email)";
          errorDetails.push(errorMsg);
          console.warn(errorMsg);
        }

        // Update cadence status (even if email failed)
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
          const errorMsg = `Failed to update cadence status: ${updateError.message}`;
          errors++;
          errorDetails.push(errorMsg);
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
              summary: emailSent 
                ? `Sales cadence started - email sent via Resend`
                : `Sales cadence started - email send failed`,
              metadata: {
                template_id: template.id,
                email_sent: emailSent,
                sent_via_resend: resendApiKey && resendFromEmail && typedContact.email,
              },
            });
        } catch (logError) {
          console.warn("Failed to log activity:", logError);
        }

      } catch (e: any) {
        const errorMsg = `Unexpected error: ${e.message || "Unknown error"}`;
        console.error(`Error starting cadence for contact ${contactId}:`, e);
        errors++;
        errorDetails.push(errorMsg);
      }
    }

    return NextResponse.json({
      success: errors === 0,
      message: `Started cadence for ${started} contact${started !== 1 ? "s" : ""}. ${emailsSent} email${emailsSent !== 1 ? "s" : ""} sent via Resend${errors > 0 ? `, ${errors} error${errors !== 1 ? "s" : ""}` : ""}`,
      stats: {
        started,
        emailsSent,
        errors,
        total: contactIds.length,
      },
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined, // Include error details
    });
  } catch (error: any) {
    console.error("Start cadence error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start cadence" },
      { status: 500 }
    );
  }
}
