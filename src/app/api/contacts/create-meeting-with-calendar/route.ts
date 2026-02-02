/**
 * POST /api/contacts/create-meeting-with-calendar
 * Create a meeting with Google Calendar invite and send email
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { renderTemplate } from "@/lib/email-template-renderer";
import { createCalendarEvent, getValidAccessToken } from "@/lib/google-calendar/client";
import { generateICSFile } from "@/lib/email/ics-generator";
import { sendEmailWithTemplate } from "@/lib/resend/template-sender";
import { getIndustryForTemplate } from "@/lib/utils";

export const dynamic = 'force-dynamic';

interface CreateMeetingWithCalendarRequest {
  contactId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  location?: string;
  meetingLink?: string;
  description?: string;
  templateId?: string; // Scheduling template
  createCalendarInvite?: boolean; // Default: true
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateMeetingWithCalendarRequest = await request.json();
    const {
      contactId,
      title,
      date,
      time,
      duration,
      location,
      meetingLink,
      description,
      templateId,
      createCalendarInvite = true,
    } = body;

    if (!contactId || !title || !date || !time || !duration) {
      return NextResponse.json(
        { error: "Missing required fields: contactId, title, date, time, duration" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get contact
    const { data: contact, error: fetchError } = await supabase
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

    // Parse date and time
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const startTime = new Date(year, month - 1, day, hours, minutes);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, calendar_link, email, google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expires_at")
      .eq("id", userId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const typedProfile = profile as {
      full_name: string | null;
      calendar_link: string | null;
      email: string;
      google_calendar_access_token: string | null;
      google_calendar_refresh_token: string | null;
      google_calendar_token_expires_at: string | null;
    };

    let calendarEventId: string | null = null;
    let calendarHtmlLink: string | null = null;
    let icsContent: string | null = null;

    // Create Google Calendar event if requested and tokens are available
    if (createCalendarInvite && typedProfile.google_calendar_access_token) {
      try {
        const accessToken = await getValidAccessToken(
          typedProfile.google_calendar_access_token,
          typedProfile.google_calendar_refresh_token,
          typedProfile.google_calendar_token_expires_at
        );

        // Update tokens if refreshed
        if (accessToken !== typedProfile.google_calendar_access_token) {
          const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
          await (supabase as any)
            .from("profiles")
            .update({
              google_calendar_access_token: accessToken,
              google_calendar_token_expires_at: expiresAt,
            })
            .eq("id", userId);
        }

        const calendarResult = await createCalendarEvent({
          accessToken,
          summary: title,
          description: description || `Meeting with ${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          startTime,
          endTime,
          attendeeEmail: typedContact.email,
          attendeeName: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          location,
          meetingLink,
        });

        calendarEventId = calendarResult.eventId;
        calendarHtmlLink = calendarResult.htmlLink;

        // Generate ICS file for email attachment
        icsContent = generateICSFile({
          summary: title,
          description: description || `Meeting with ${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          startTime,
          endTime,
          organizerEmail: typedProfile.email || "noreply@crm.com",
          organizerName: typedProfile.full_name || "CRM User",
          attendeeEmail: typedContact.email,
          attendeeName: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          location,
          meetingLink,
          eventId: calendarResult.eventId,
        });
      } catch (calendarError: any) {
        console.error("Failed to create calendar event:", calendarError);
        // Continue without calendar event - still send email
      }
    }

    // Get or find scheduling email template
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
      const { data: templates } = await supabase
        .from("email_templates")
        .select("*")
        .eq("user_id", userId)
        .or("category.eq.meeting,name.ilike.%schedule%")
        .limit(1);
      template = (templates?.[0] as EmailTemplate | undefined) || null;
    }

    // Format meeting date/time for template
    const meetingDate = startTime.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const meetingTime = startTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    // Build variables for template
    const variables: Record<string, string> = {
      sender_name: typedProfile.full_name || "Your Name",
      sender_calendar: typedProfile.calendar_link || "[Calendar Link]",
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      industry: getIndustryForTemplate(typedContact), // Add industry for template rendering
    };

    // Send email via Resend if template exists
    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM;
    let emailSent = false;

    if (template && resendApiKey && resendFromEmail) {
      try {
        const sendResult = await sendEmailWithTemplate({
          apiKey: resendApiKey,
          fromEmail: resendFromEmail,
          contact: typedContact,
          template,
          variables,
        });

        if (sendResult.success) {
          emailSent = true;
          // Update contact with resend email ID
          await (supabase as any)
            .from("contacts")
            .update({ resend_email_id: sendResult.emailId })
            .eq("id", contactId);
        }
      } catch (emailError: any) {
        console.error("Failed to send email:", emailError);
      }
    }

    // Cancel queued emails
    await (supabase as any)
      .from("email_queue")
      .update({ status: "failed", error_message: "Cancelled - meeting scheduled" })
      .eq("contact_id", contactId)
      .eq("status", "pending");

    // Create meeting record in database
    const { data: meeting, error: meetingError } = await (supabase as any)
      .from("meetings")
      .insert({
        user_id: userId,
        contact_id: contactId,
        title,
        scheduled_date: startTime.toISOString().split("T")[0],
        scheduled_time: time,
        duration_minutes: duration,
        location: location || null,
        meeting_link: meetingLink || null,
        description: description || null,
        status: "scheduled",
        google_calendar_event_id: calendarEventId,
        google_calendar_link: calendarHtmlLink,
      })
      .select()
      .single();

    if (meetingError) {
      console.error("Failed to create meeting record:", meetingError);
    }

    // Update contact - stop cadence
    await (supabase as any)
      .from("contacts")
      .update({
        cadence_status: "completed",
        cadence_outcome: "meeting_scheduled",
        next_action_date: null,
        next_action_type: null,
        meeting_scheduling_status: "scheduled",
      })
      .eq("id", contactId);

    // Log activity
    try {
      await (supabase as any)
        .from("activity_log")
        .insert({
          user_id: userId,
          contact_id: contactId,
          activity_type: "meeting_scheduled",
          summary: `Meeting scheduled: ${title} on ${meetingDate} at ${meetingTime}`,
          metadata: {
            meeting_id: meeting?.id,
            calendar_event_id: calendarEventId,
            calendar_link: calendarHtmlLink,
          },
        });
    } catch (logError) {
      console.warn("Failed to log activity:", logError);
    }

    return NextResponse.json({
      success: true,
      meeting: meeting || null,
      calendar: {
        eventId: calendarEventId,
        htmlLink: calendarHtmlLink,
        icsContent: icsContent ? Buffer.from(icsContent).toString("base64") : null,
      },
      emailSent,
      message: "Meeting created successfully",
    });
  } catch (error: any) {
    console.error("Create meeting with calendar error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create meeting" },
      { status: 500 }
    );
  }
}
