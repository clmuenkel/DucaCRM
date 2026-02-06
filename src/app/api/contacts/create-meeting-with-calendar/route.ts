/**
 * POST /api/contacts/create-meeting-with-calendar
 * Create a meeting with Google Calendar invite and send email
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import type { Contact, EmailTemplate } from "@/types/database";
import { renderTemplate } from "@/lib/email-template-renderer";
import { createCalendarEvent, getValidAccessToken } from "@/lib/google-calendar/client";
import { generateICSFile } from "@/lib/email/ics-generator";
import { sendEmailWithTemplate } from "@/lib/resend/template-sender";
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

    let calendarEventId: string | null = null;
    let calendarHtmlLink: string | null = null;
    let icsContent: string | null = null;
    let generatedMeetLink: string | null = null;

    // Create Google Calendar event if requested and tokens are available
    // Note: Google Calendar tokens are not currently stored in profiles table
    // Calendar functionality will be skipped if tokens are not available
    if (createCalendarInvite && typedProfile.google_calendar_access_token) {
      try {
        const accessToken = await getValidAccessToken(
          typedProfile.google_calendar_access_token,
          typedProfile.google_calendar_refresh_token || null,
          typedProfile.google_calendar_token_expires_at || null
        );

        // Update tokens if refreshed
        // Note: Google Calendar token fields are not currently in profiles table
        // Token refresh is handled in memory for this session only
        // TODO: Add google_calendar_* fields to profiles table if calendar integration is needed
        // if (accessToken !== typedProfile.google_calendar_access_token) {
        //   const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour
        //   await insforge.database
        //     .from("profiles")
        //     .update({
        //       google_calendar_access_token: accessToken,
        //       google_calendar_token_expires_at: expiresAt,
        //     })
        //     .eq("id", userId);
        // }

        const calendarResult = await createCalendarEvent({
          accessToken,
          summary: title,
          description: description || `Meeting with ${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          startTime,
          endTime,
          attendeeEmail: typedContact.email,
          attendeeName: `${typedContact.first_name} ${typedContact.last_name || ""}`.trim(),
          location,
          meetingLink: meetingLink || undefined, // Only pass if user provided custom
          timezone: contactTimezone, // Use contact's timezone
        });

        calendarEventId = calendarResult.eventId;
        calendarHtmlLink = calendarResult.htmlLink;
        // Extract generated Meet link (or use custom if provided)
        generatedMeetLink = calendarResult.meetLink || meetingLink || null;
        
        // Log calendar result for debugging
        console.log('Calendar Result:', {
          eventId: calendarResult.eventId,
          meetLink: calendarResult.meetLink,
          hasMeetLink: !!calendarResult.meetLink,
          meetLinkLength: calendarResult.meetLink?.length || 0,
        });
        
        // Log final link being used
        console.log('Final Meet Link for template:', generatedMeetLink ? `${generatedMeetLink.substring(0, 50)}...` : 'NULL');
        console.log('Google Calendar invite sent automatically to:', typedContact.email);

        // Note: Google Calendar automatically sends invite email to attendee via sendUpdates=all
        // ICS file is optional - only generate if needed for backup or custom email
        // For now, we'll skip ICS since Google handles the invite
        icsContent = null; // Google sends the official invite, no need for ICS
      } catch (calendarError: any) {
        console.error("Failed to create calendar event:", calendarError);
        // Continue without calendar event - still send email
      }
    }

    // Get or find scheduling email template
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
      timeZone: contactTimezone, // Use contact's timezone
      timeZoneName: "short",
    });

    // Build variables for template (use generated Meet link or custom link)
    const finalMeetLink = generatedMeetLink || meetingLink || null;
    const variables: Record<string, string> = {
      sender_name: typedProfile.full_name || "Your Name",
      sender_calendar: "", // Don't use calendar link - Google Calendar handles this
      meeting_date: meetingDate,
      meeting_time: meetingTime,
      meeting_link: finalMeetLink || "", // Google Meet link from calendar event
      industry: getIndustryForTemplate(typedContact), // Add industry for template rendering
    };
    
    // Log variables being sent to template (truncate meeting_link for logging)
    console.log('Template variables:', {
      ...variables,
      meeting_link: finalMeetLink ? `${finalMeetLink.substring(0, 50)}...` : 'EMPTY',
      meeting_time: meetingTime,
      contact_timezone: contactTimezone,
    });

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
          await insforge.database
            .from("contacts")
            .update({ resend_email_id: sendResult.emailId })
            .eq("id", contactId);
        }
      } catch (emailError: any) {
        console.error("Failed to send email:", emailError);
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
