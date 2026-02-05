import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { renderTemplate } from "@/lib/email-template-renderer";
import { sendEmailWithTemplate } from "@/lib/resend/template-sender";
import { getIndustryForTemplate } from "@/lib/utils";

export const dynamic = 'force-dynamic';

interface ScheduleMeetingRequest {
  contactId: string;
  templateId?: string;
}

/**
 * POST /api/contacts/schedule-meeting
 * Send scheduling email to contact and add to scheduling queue
 */
export async function POST(request: NextRequest) {
  try {
    const body: ScheduleMeetingRequest = await request.json();
    const { contactId, templateId } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 }
      );
    }

        const userId = DEFAULT_USER_ID;

    // Get contact
    const { data: contact, error: fetchError } = await insforge.database
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

    const typedContact = contact as Contact;

    if (!typedContact.email) {
      return NextResponse.json(
        { error: "Contact has no email address" },
        { status: 400 }
      );
    }

    // Find email template (prefer schedule meeting template)
    let template: EmailTemplate | null = null;
    if (templateId) {
      const { data: templateData } = await insforge.database
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .eq("user_id", userId)
        .single();
      template = templateData as EmailTemplate | null;
    } else {
      // Find template with "schedule" in name or category "meeting"
      const { data: templates } = await insforge.database
        .from("email_templates")
        .select("*")
        .eq("user_id", userId)
        .or("category.eq.meeting,name.ilike.%schedule%")
        .limit(1);
      template = (templates?.[0] as EmailTemplate | undefined) || null;
    }

    if (!template) {
      return NextResponse.json(
        { error: "No scheduling email template found. Please create one in Templates." },
        { status: 400 }
      );
    }

    // Get user profile for calendar link
    const { data: profile } = await insforge.database
      .from("profiles")
      .select("calendar_link, full_name")
      .eq("id", userId)
      .single();

    const typedProfile = profile as { calendar_link: string | null; full_name: string | null } | null;

    // Render template with variables
    const variables = {
      first_name: typedContact.first_name || "",
      last_name: typedContact.last_name || "",
      full_name: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
      company: typedContact.company_name || "",
      title: typedContact.title || "",
      email: typedContact.email || "",
      phone: typedContact.phone || typedContact.mobile || "",
      industry: getIndustryForTemplate(typedContact),
      sender_name: typedProfile?.full_name || "Your Name",
      sender_calendar: typedProfile?.calendar_link || "[Calendar Link]",
    };

    // Render template with variables
    const subject = renderTemplate(template.subject_template, variables);
    const emailBody = renderTemplate(template.body_template, variables);

    // Send email via Resend if configured (from environment)
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;

    if (resendApiKey && resendFromEmail && template) {
      try {
        // Send email via Resend
        const sendResult = await sendEmailWithTemplate({
          apiKey: resendApiKey,
          fromEmail: resendFromEmail,
          contact: typedContact,
          template,
          variables,
        });

        if (!sendResult.success) {
          console.error("Failed to send email via Resend:", sendResult.error);
        }
      } catch (error) {
        console.error("Error sending email via Resend:", error);
        // Continue even if email send fails - we still update the contact
      }
    }

    // Update contact
    await insforge.database
      .from("contacts")
      .update({
        meeting_scheduling_status: "link_sent",
        scheduling_link_sent_at: new Date().toISOString(),
        cadence_outcome: "meeting_scheduled",
        cadence_status: "completed",
        next_action_date: null,
        next_action_type: null,
      })
      .eq("id", contactId);

    // Add to scheduling queue
    await insforge.database
      .from("meeting_scheduling_queue")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        scheduling_link_sent_at: new Date().toISOString(),
        status: "pending",
      }]);

    // Log activity
    await insforge.database
      .from("activity_log")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        activity_type: "meeting_scheduling_sent",
        summary: "Scheduling email sent to contact",
        metadata: {
          template_id: template.id,
          subject,
        },
      }]);

    return NextResponse.json({
      success: true,
      message: "Scheduling email sent successfully",
      emailContent: {
        subject,
        body: emailBody,
        to: typedContact.email,
      },
    });
  } catch (error: any) {
    console.error("Schedule meeting error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send scheduling email" },
      { status: 500 }
    );
  }
}
