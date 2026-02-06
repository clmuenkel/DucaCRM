/**
 * POST /api/contacts/create-meeting
 * Create a meeting with Google Calendar invite
 * Google Calendar automatically sends the invite email via sendUpdates=all
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { renderTemplate, htmlToPlainText } from "@/lib/email-template-renderer";
import { createCalendarEvent, getValidAccessToken } from "@/lib/google-calendar/client";
import { getIndustryForTemplate } from "@/lib/utils";
import { getTimezoneFromLocation, createDateInTimezone } from "@/lib/timezone";

export const dynamic = 'force-dynamic';

interface CreateMeetingRequest {
  contactId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timezone?: string; // IANA timezone (e.g., "America/New_York")
  duration: number; // minutes
  location?: string;
  meetingLink?: string;
  description?: string;
  templateId?: string; // Optional template to render in calendar description
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateMeetingRequest = await request.json();
    const {
      contactId,
      title,
      date,
      time,
      timezone: providedTimezone,
      duration,
      location,
      meetingLink,
      description,
      templateId,
    } = body;

    // Validate required fields
    if (!contactId || !title || !date || !time || !duration) {
      return NextResponse.json(
        { error: "Missing required fields: contactId, title, date, time, duration" },
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

    // Determine timezone - use provided, then company, then derive from state
    let contactTimezone = "America/New_York"; // Default fallback

    if (providedTimezone) {
      contactTimezone = providedTimezone;
    } else if (typedContact.company_id) {
      const { data: company } = await insforge.database
        .from("companies")
        .select("timezone")
        .eq("id", typedContact.company_id)
        .single();
      
      const companyData = company as { timezone: string | null } | null;
      if (companyData?.timezone) {
        contactTimezone = companyData.timezone;
      }
    }

    // If no company timezone and no provided timezone, derive from contact's state
    if (contactTimezone === "America/New_York" && !providedTimezone && typedContact.state) {
      contactTimezone = getTimezoneFromLocation(
        typedContact.city,
        typedContact.state,
        typedContact.country
      );
    }

    // Parse date and time - create Date objects in the contact's timezone
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    
    const startTime = createDateInTimezone(year, month, day, hours, minutes, contactTimezone);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // Get Google Calendar tokens from profile (REQUIRED - fail if missing)
    const { data: profileData, error: profileError } = await insforge.database
      .from("profiles")
      .select("full_name, email, google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expires_at")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { 
          error: "User profile not found. Please ensure your profile is set up.",
          success: false 
        },
        { status: 404 }
      );
    }

    const profile = profileData as {
      full_name: string | null;
      email: string;
      google_calendar_access_token: string | null;
      google_calendar_refresh_token: string | null;
      google_calendar_token_expires_at: string | null;
    };

    if (!profile.google_calendar_access_token || !profile.google_calendar_refresh_token) {
      return NextResponse.json(
        { 
          error: "Google Calendar not connected. Please connect Google Calendar in Settings first.",
          success: false 
        },
        { status: 400 }
      );
    }

    // Get template if provided
    let template: EmailTemplate | null = null;
    if (templateId) {
      const { data: templateData } = await insforge.database
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .eq("user_id", userId)
        .single();
      template = templateData as EmailTemplate | null;
    }

    // Format meeting date/time for template variables
    const meetingDate = startTime.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: contactTimezone,
    });
    const meetingTime = startTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: contactTimezone,
      timeZoneName: "short",
    });

    // Build template variables
    const variables: Record<string, string> = {
      sender_name: profile.full_name || "Your Name",
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      meeting_link: "", // Will be empty in description (Google Calendar handles the link)
      industry: getIndustryForTemplate(typedContact),
      first_name: typedContact.first_name || "",
      last_name: typedContact.last_name || "",
      full_name: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
      company: typedContact.company_name || "",
      title: typedContact.title || "",
      email: typedContact.email || "",
      phone: typedContact.phone || typedContact.mobile || "",
    };

    // Render template for calendar description (if template exists)
    let calendarDescription = description || `Meeting with ${typedContact.first_name} ${typedContact.last_name || ""}`.trim();
    if (template) {
      const renderedTemplate = renderTemplate(template.body_template, variables);
      // Convert HTML to plain text for calendar description
      calendarDescription = htmlToPlainText(renderedTemplate);
    }

    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(
      profile.google_calendar_access_token,
      profile.google_calendar_refresh_token,
      profile.google_calendar_token_expires_at
    );

    // Create Google Calendar event (sendUpdates=all automatically sends invite)
    const calendarResult = await createCalendarEvent({
      accessToken,
      summary: title,
      description: calendarDescription,
      startTime,
      endTime,
      attendeeEmail: typedContact.email,
      attendeeName: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
      location,
      meetingLink: meetingLink || undefined,
      timezone: contactTimezone,
    });

    // Create meeting record in database (using correct schema)
    const { data: meeting, error: meetingError } = await insforge.database
      .from("meetings")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        title,
        scheduled_at: startTime.toISOString(), // Use scheduled_at (ISO timestamp)
        duration_minutes: duration,
        location: location || null,
        meeting_link: calendarResult.meetLink || meetingLink || null,
        description: calendarDescription || null,
        status: "scheduled",
      }])
      .select()
      .single();

    if (meetingError) {
      console.error("Failed to create meeting record:", meetingError);
      return NextResponse.json(
        { 
          error: `Failed to create meeting record: ${meetingError.message}`,
          success: false 
        },
        { status: 500 }
      );
    }

    // Update contact - stop cadence
    await insforge.database
      .from("contacts")
      .update({
        cadence_status: "completed",
        cadence_outcome: "meeting_scheduled",
        next_action_date: null,
        next_action_type: null,
        meeting_scheduling_status: "scheduled",
      })
      .eq("id", contactId);

    // Cancel any queued emails for this contact
    await insforge.database
      .from("email_queue")
      .update({ status: "failed", error_message: "Cancelled - meeting scheduled" })
      .eq("contact_id", contactId)
      .eq("status", "pending");

    // Log activity
    try {
      await insforge.database
        .from("activity_log")
        .insert([{
          user_id: userId,
          contact_id: contactId,
          activity_type: "meeting_scheduled",
          summary: `Meeting scheduled: ${title} on ${meetingDate} at ${meetingTime}`,
          metadata: {
            meeting_id: meeting?.id,
            calendar_event_id: calendarResult.eventId,
            calendar_link: calendarResult.htmlLink,
            meet_link: calendarResult.meetLink,
          },
        }]);
    } catch (logError) {
      console.warn("Failed to log activity:", logError);
    }

    return NextResponse.json({
      success: true,
      meeting: meeting || null,
      calendar: {
        eventId: calendarResult.eventId,
        htmlLink: calendarResult.htmlLink,
        meetLink: calendarResult.meetLink,
      },
      message: "Meeting created successfully. Google Calendar invite sent automatically.",
    });
  } catch (error: any) {
    console.error("Create meeting error:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to create meeting",
        success: false 
      },
      { status: 500 }
    );
  }
}
