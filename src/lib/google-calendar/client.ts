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
  } = params;

  // Format dates in RFC3339 format
  const formatDate = (date: Date): string => {
    return date.toISOString();
  };

  const event = {
    summary,
    description: description || "",
    start: {
      dateTime: formatDate(startTime),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: formatDate(endTime),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  // Add query parameter to get conference data (Meet link)
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
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

  // Extract Meet link from response
  const generatedMeetLink = eventData.conferenceData?.entryPoints?.[0]?.uri || null;

  return {
    eventId: eventData.id,
    htmlLink: eventData.htmlLink,
    iCalUID: eventData.iCalUID,
    meetLink: generatedMeetLink || meetingLink || null,
  };
}
