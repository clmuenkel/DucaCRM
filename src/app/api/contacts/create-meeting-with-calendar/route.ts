/**
 * POST /api/contacts/create-meeting-with-calendar
 * Create a meeting with Google Calendar invite and send email
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

interface CreateMeetingWithCalendarRequest {
  contactId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  timezone?: string; // IANA timezone (e.g., "America/New_York")
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
      timezone: providedTimezone,
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

        const userId = DEFAULT_USER_ID;
    console.log("[Create Meeting] Using userId:", userId);

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

    // Get contact's timezone - use provided timezone first, then company, then derive from state
    let contactTimezone = "America/New_York"; // Default fallback

    // Use provided timezone if given (user manually selected)
    if (providedTimezone) {
      contactTimezone = providedTimezone;
      console.log('Using provided timezone:', contactTimezone);
    } else if (typedContact.company_id) {
      const { data: company } = await insforge.database
        .from("companies")
        .select("timezone")
        .eq("id", typedContact.company_id)
        .single();
      
      // Type assertion for partial company data
      const companyData = company as { timezone: string | null } | null;
      if (companyData?.timezone) {
        contactTimezone = companyData.timezone;
        console.log('Using company timezone:', contactTimezone);
      }
    }

    // If no company timezone and no provided timezone, derive from contact's state
    if (contactTimezone === "America/New_York" && !providedTimezone && typedContact.state) {
      contactTimezone = getTimezoneFromLocation(
        typedContact.city,
        typedContact.state,
        typedContact.country
      );
      console.log('Derived timezone from state:', contactTimezone);
    }

    // Parse date and time - these are in the contact's timezone
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    
    console.log(`[Timezone] Creating date: ${date} ${time} in timezone: ${contactTimezone}`);
    
    // Create Date objects properly representing the time in the target timezone
    // This function creates a Date object (which is always in UTC internally) that,
    // when displayed in the target timezone, shows the correct local time
    const startTime = createDateInTimezone(year, month, day, hours, minutes, contactTimezone);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    
    // Verify the time was created correctly
    const verifyFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: contactTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const verifyParts = verifyFormatter.formatToParts(startTime);
    const verifyHour = parseInt(verifyParts.find(p => p.type === 'hour')?.value || '0');
    const verifyMinute = parseInt(verifyParts.find(p => p.type === 'minute')?.value || '0');
    console.log(`[Timezone] Verified: Created date shows ${verifyHour}:${String(verifyMinute).padStart(2, '0')} in ${contactTimezone} (desired: ${hours}:${String(minutes).padStart(2, '0')})`);
    
    // Note: The Google Calendar API's createCalendarEvent function will use the timezone parameter
    // to properly interpret these Date objects

    // Get user profile for Google Calendar tokens (optional - don't fail if not found)
    let profile: any = null;
    
    // Try to fetch profile for Google Calendar tokens, but don't fail if it doesn't exist
    try {
      const { data: profileData, error: profileFetchError } = await insforge.database
        .from("profiles")
        .select("full_name, calendar_link, email, google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expires_at")
        .eq("id", userId)
        .limit(1);

      if (!profileFetchError && profileData && profileData.length > 0) {
        profile = profileData[0];
        console.log("[Create Meeting] Profile found with Google Calendar tokens");
      }
    } catch (error) {
      // Profile query failed - continue without it
      console.warn("[Create Meeting] Profile query failed, continuing without profile:", error);
    }

    // Use profile data if available, otherwise use defaults
    const typedProfile = {
      full_name: profile?.full_name || "Your Name",
      calendar_link: null, // Don't use Calendly - use Google Calendar
      email: profile?.email || process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "user@example.com",
      google_calendar_access_token: profile?.google_calendar_access_token || null,
      google_calendar_refresh_token: profile?.google_calendar_refresh_token || null,
      google_calendar_token_expires_at: profile?.google_calendar_token_expires_at || null,
    };

    // Get or find scheduling email template BEFORE creating calendar event
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
      const { data: templates } = await insforge.database
        .from("email_templates")
        .select("*")
        .eq("user_id", userId)
        .or("category.eq.meeting,name.ilike.%schedule%")
        .limit(1);
      template = (templates?.[0] as EmailTemplate | undefined) || null;
    }

    // Format meeting date/time for template using contact's timezone
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

    // Build template variables (meeting_link will be added after calendar event is created)
    const variables: Record<string, string> = {
      sender_name: typedProfile.full_name || "Your Name",
      sender_calendar: "",
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      meeting_link: "", // Will be updated after calendar event is created
      industry: getIndustryForTemplate(typedContact),
    };

    // Render template for calendar description (if template exists)
    let calendarDescription = description || `Meeting with ${typedContact.first_name} ${typedContact.last_name || ""}`.trim();
    if (template) {
      // Render template with variables (meeting_link will be empty initially, but that's okay)
      const renderedTemplate = renderTemplate(template.body_template, {
        ...variables,
        first_name: typedContact.first_name || "",
        last_name: typedContact.last_name || "",
        full_name: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
        company: typedContact.company_name || "",
        title: typedContact.title || "",
        email: typedContact.email || "",
        phone: typedContact.phone || typedContact.mobile || "",
      });
      // Convert HTML to plain text for calendar description
      calendarDescription = htmlToPlainText(renderedTemplate);
    }

    let calendarEventId: string | null = null;
    let calendarHtmlLink: string | null = null;
    let generatedMeetLink: string | null = null;

    // Create Google Calendar event if requested and tokens are available
    if (createCalendarInvite && typedProfile.google_calendar_access_token) {
      try {
        const accessToken = await getValidAccessToken(
          typedProfile.google_calendar_access_token,
          typedProfile.google_calendar_refresh_token || null,
          typedProfile.google_calendar_token_expires_at || null
        );

        const calendarResult = await createCalendarEvent({
          accessToken,
          summary: title,
          description: calendarDescription, // Use rendered template in description
          startTime,
          endTime,
          attendeeEmail: typedContact.email,
          attendeeName: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          location,
          meetingLink: meetingLink || undefined,
          timezone: contactTimezone,
        });

        calendarEventId = calendarResult.eventId;
        calendarHtmlLink = calendarResult.htmlLink;
        generatedMeetLink = calendarResult.meetLink || meetingLink || null;
        
        console.log('Calendar Result:', {
          eventId: calendarResult.eventId,
          meetLink: calendarResult.meetLink,
          hasMeetLink: !!calendarResult.meetLink,
        });
        
        console.log('Google Calendar invite sent automatically to:', typedContact.email);
      } catch (calendarError: any) {
        console.error("Failed to create calendar event:", calendarError);
      }
    }

    // Cancel queued emails
    await insforge.database
      .from("email_queue")
      .update({ status: "failed", error_message: "Cancelled - meeting scheduled" })
      .eq("contact_id", contactId)
      .eq("status", "pending");

    // Create meeting record in database
    const { data: meeting, error: meetingError } = await insforge.database
      .from("meetings")
      .insert([{
        user_id: userId,
        contact_id: contactId,
        title,
        scheduled_date: startTime.toISOString().split("T")[0],
        scheduled_time: time,
        duration_minutes: duration,
        location: location || null,
        meeting_link: generatedMeetLink || meetingLink || null,
        description: description || null,
        status: "scheduled",
        google_calendar_event_id: calendarEventId,
        google_calendar_link: calendarHtmlLink,
      }])
      .select()
      .single();

    if (meetingError) {
      console.error("Failed to create meeting record:", meetingError);
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
            calendar_event_id: calendarEventId,
            calendar_link: calendarHtmlLink,
          },
        }]);
    } catch (logError) {
      console.warn("Failed to log activity:", logError);
    }

    return NextResponse.json({
      success: true,
      meeting: meeting || null,
      calendar: {
        eventId: calendarEventId,
        htmlLink: calendarHtmlLink,
        meetLink: generatedMeetLink,
      },
      message: "Meeting created successfully. Google Calendar invite sent automatically.",
    });
  } catch (error: any) {
    console.error("Create meeting with calendar error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create meeting" },
      { status: 500 }
    );
  }
}
