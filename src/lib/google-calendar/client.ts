/**
 * Google Calendar API Client
 * Creates calendar events and manages OAuth tokens
 */

export interface CreateCalendarEventParams {
  accessToken: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail: string;
  attendeeName: string;
  location?: string;
  meetingLink?: string;
  timezone?: string; // Contact's timezone for calendar event
}

export interface CalendarEventResult {
  eventId: string;
  htmlLink: string;
  iCalUID?: string;
  meetLink?: string | null; // Add this - generated Google Meet link
}

/**
 * Refresh Google OAuth access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  return response.json();
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(
  accessToken: string | null,
  refreshToken: string | null,
  expiresAt: string | null
): Promise<string> {
  // If no tokens, throw error
  if (!accessToken || !refreshToken) {
    throw new Error("No Google Calendar access token available");
  }

  // Check if token is expired or about to expire (within 5 minutes)
  if (expiresAt) {
    const expires = new Date(expiresAt);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expires <= fiveMinutesFromNow) {
      // Token expired or about to expire, refresh it
      const refreshed = await refreshAccessToken(refreshToken);
      return refreshed.access_token;
    }
  }

  return accessToken;
}

/**
 * Create a Google Calendar event
 */
export async function createCalendarEvent(
  params: CreateCalendarEventParams
): Promise<CalendarEventResult> {
  const {
    accessToken,
    summary,
    description,
    startTime,
    endTime,
    attendeeEmail,
    attendeeName,
    location,
    meetingLink,
    timezone,
  } = params;

  // Format dates in RFC3339 format without timezone
  // Google Calendar will interpret this according to the timeZone field
  const formatDate = (date: Date, tz?: string): string => {
    // If timezone is provided, format the date as if it's in that timezone
    // We need to convert the Date to the specified timezone's local time
    if (tz) {
      console.log(`[Calendar API] Formatting date for timezone: ${tz}`);
      console.log(`[Calendar API] Input Date (UTC): ${date.toISOString()}`);
      
      // Use Intl.DateTimeFormat to get the date components in the specified timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      const parts = formatter.formatToParts(date);
      const year = parts.find(p => p.type === 'year')?.value || '';
      const month = parts.find(p => p.type === 'month')?.value || '';
      const day = parts.find(p => p.type === 'day')?.value || '';
      const hour = parts.find(p => p.type === 'hour')?.value || '';
      const minute = parts.find(p => p.type === 'minute')?.value || '';
      const second = parts.find(p => p.type === 'second')?.value || '00';
      
      // Format as RFC3339 without timezone (Google Calendar will use timeZone field)
      // Ensure all parts are defined
      if (!year || !month || !day || !hour || !minute) {
        console.warn(`[Calendar API] Failed to format date parts, using ISO fallback`);
        // Fallback to ISO string if formatting fails
        return date.toISOString();
      }
      
      const formatted = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      console.log(`[Calendar API] Formatted date string: ${formatted} (timezone: ${tz})`);
      return formatted;
    }
    console.log(`[Calendar API] No timezone provided, using ISO: ${date.toISOString()}`);
    return date.toISOString();
  };

  const eventTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const startDateTime = formatDate(startTime, timezone);
  const endDateTime = formatDate(endTime, timezone);
  
  console.log(`[Calendar API] Creating event with timezone: ${eventTimezone}`);
  console.log(`[Calendar API] Start: ${startDateTime}, End: ${endDateTime}`);
  
  const event = {
    summary,
    description: description || "",
    start: {
      dateTime: startDateTime,
      timeZone: eventTimezone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: eventTimezone,
    },
    attendees: [
      {
        email: attendeeEmail,
        displayName: attendeeName,
      },
    ],
    location: location || undefined,
    // Always request Google Meet link unless custom meetingLink is provided
    conferenceData: !meetingLink
      ? {
          createRequest: {
            requestId: `meeting-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        }
      : undefined,
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 15 }, // 15 minutes before
      ],
    },
  };

  // Add query parameters:
  // - conferenceDataVersion=1: Get Google Meet link in response
  // - sendUpdates=all: Automatically send calendar invites to all attendees
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create calendar event: ${errorText}`);
  }

  const eventData = await response.json();

  // Debug logging
  console.log('Google Calendar API Response - Conference Data:', JSON.stringify(eventData.conferenceData, null, 2));
  console.log('Google Calendar API Response - Full Event:', {
    id: eventData.id,
    hasConferenceData: !!eventData.conferenceData,
    conferenceDataType: eventData.conferenceData?.conferenceSolution?.key?.type,
  });

  // Extract Meet link - try multiple paths with comprehensive fallbacks
  let generatedMeetLink = null;
  let extractionMethod = null;
  
  if (eventData.conferenceData) {
    console.log('Conference Data Structure:', {
      hasEntryPoints: !!eventData.conferenceData.entryPoints,
      entryPointsCount: eventData.conferenceData.entryPoints?.length || 0,
      hasHangoutLink: !!eventData.conferenceData.hangoutLink,
      conferenceId: eventData.conferenceData.conferenceId,
      conferenceSolution: eventData.conferenceData.conferenceSolution,
    });

    // Method 1: Try entryPoints array (most common)
    if (eventData.conferenceData.entryPoints && eventData.conferenceData.entryPoints.length > 0) {
      // First, try to find video entry point
      const videoEntryPoint = eventData.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video' || ep.entryPointType === 'hangoutsMeet'
      );
      
      if (videoEntryPoint?.uri) {
        generatedMeetLink = videoEntryPoint.uri;
        extractionMethod = 'entryPoints[video]';
      } else {
        // Fallback to first entry point that contains meet.google.com
        const meetEntryPoint = eventData.conferenceData.entryPoints.find(
          (ep: any) => ep.uri?.includes('meet.google.com')
        );
        if (meetEntryPoint?.uri) {
          generatedMeetLink = meetEntryPoint.uri;
          extractionMethod = 'entryPoints[meet.google.com]';
        } else {
          // Last resort: use first entry point
          const firstEntryPoint = eventData.conferenceData.entryPoints[0];
          if (firstEntryPoint?.uri) {
            generatedMeetLink = firstEntryPoint.uri;
            extractionMethod = 'entryPoints[0]';
          }
        }
      }
      console.log('Extracted Meet Link from entryPoints:', generatedMeetLink, 'Method:', extractionMethod);
    }
    
    // Method 2: Try hangoutLink property (older format)
    if (!generatedMeetLink && eventData.conferenceData.hangoutLink) {
      generatedMeetLink = eventData.conferenceData.hangoutLink;
      extractionMethod = 'hangoutLink';
      console.log('Extracted Meet Link from hangoutLink:', generatedMeetLink);
    }
    
    // Method 3: Try to construct from conferenceId if available
    if (!generatedMeetLink && eventData.conferenceData.conferenceId) {
      // Some Meet links can be constructed from conference ID
      // Format: https://meet.google.com/[conference-id]
      const conferenceId = eventData.conferenceData.conferenceId;
      if (conferenceId && typeof conferenceId === 'string') {
        // Try to extract the meeting code from conference ID
        // Conference ID format varies, but sometimes contains the meeting code
        generatedMeetLink = `https://meet.google.com/${conferenceId}`;
        extractionMethod = 'conferenceId';
        console.log('Constructed Meet Link from conferenceId:', generatedMeetLink);
      }
    }
  } else {
    console.warn('No conferenceData in API response - Meet link may not have been generated');
  }

  console.log('Final Extracted Meet Link:', generatedMeetLink, 'Method:', extractionMethod);
  
  // Validate the link format
  if (generatedMeetLink && !generatedMeetLink.includes('meet.google.com')) {
    console.warn('Extracted link does not appear to be a Google Meet link:', generatedMeetLink);
  }

  return {
    eventId: eventData.id,
    htmlLink: eventData.htmlLink,
    iCalUID: eventData.iCalUID,
    meetLink: generatedMeetLink || meetingLink || null,
  };
}
