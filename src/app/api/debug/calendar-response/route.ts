/**
 * Debug endpoint to test Google Calendar API response
 * Shows raw API response and Meet link extraction
 */

import { NextRequest, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { getValidAccessToken, createCalendarEvent } from "@/lib/google-calendar/client";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
        const userId = DEFAULT_USER_ID;

    // Get user profile with Google Calendar tokens
    const { data: profile } = await insforge.database
      .from("profiles")
      .select("full_name, email, google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expires_at")
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
      email: string;
      google_calendar_access_token: string | null;
      google_calendar_refresh_token: string | null;
      google_calendar_token_expires_at: string | null;
    };

    if (!typedProfile.google_calendar_access_token) {
      return NextResponse.json(
        { error: "No Google Calendar access token found. Please connect Google Calendar first." },
        { status: 400 }
      );
    }

    // Get valid access token
    const accessToken = await getValidAccessToken(
      typedProfile.google_calendar_access_token,
      typedProfile.google_calendar_refresh_token,
      typedProfile.google_calendar_token_expires_at
    );

    // Create a test calendar event
    const testStartTime = new Date();
    testStartTime.setHours(testStartTime.getHours() + 24); // Tomorrow same time
    const testEndTime = new Date(testStartTime.getTime() + 60 * 60 * 1000); // 1 hour later

    // Call Google Calendar API directly to see raw response
    const event = {
      summary: "Test Meeting - Debug",
      description: "This is a test meeting to debug Meet link generation",
      start: {
        dateTime: testStartTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: testEndTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      attendees: [
        {
          email: typedProfile.email,
          displayName: typedProfile.full_name || "Test User",
        },
      ],
      conferenceData: {
        createRequest: {
          requestId: `test-meeting-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    // Make direct API call to see raw response
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none",
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
      return NextResponse.json(
        {
          error: "Failed to create calendar event",
          status: response.status,
          statusText: response.statusText,
          errorDetails: errorText,
        },
        { status: response.status }
      );
    }

    const eventData = await response.json();

    // Try to extract Meet link using our current logic
    let extractedMeetLink = null;
    let extractionMethod = null;

    if (eventData.conferenceData) {
      // Try entryPoints
      if (eventData.conferenceData.entryPoints && eventData.conferenceData.entryPoints.length > 0) {
        const entryPoint = eventData.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video' || ep.uri?.includes('meet.google.com')
        ) || eventData.conferenceData.entryPoints[0];
        extractedMeetLink = entryPoint?.uri;
        extractionMethod = 'entryPoints';
      }
      // Try hangoutLink
      if (!extractedMeetLink && eventData.conferenceData.hangoutLink) {
        extractedMeetLink = eventData.conferenceData.hangoutLink;
        extractionMethod = 'hangoutLink';
      }
    }

    // Also try using our createCalendarEvent function
    let functionResult = null;
    try {
      functionResult = await createCalendarEvent({
        accessToken,
        summary: "Test Meeting - Function Test",
        description: "Testing createCalendarEvent function",
        startTime: testStartTime,
        endTime: testEndTime,
        attendeeEmail: typedProfile.email,
        attendeeName: typedProfile.full_name || "Test User",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (funcError: any) {
      console.error("Function test error:", funcError);
    }

    return NextResponse.json({
      success: true,
      rawApiResponse: {
        id: eventData.id,
        htmlLink: eventData.htmlLink,
        summary: eventData.summary,
        hasConferenceData: !!eventData.conferenceData,
        conferenceDataStructure: eventData.conferenceData ? {
          conferenceId: eventData.conferenceData.conferenceId,
          conferenceSolution: eventData.conferenceData.conferenceSolution,
          entryPoints: eventData.conferenceData.entryPoints,
          hangoutLink: eventData.conferenceData.hangoutLink,
          notes: eventData.conferenceData.notes,
          signature: eventData.conferenceData.signature,
        } : null,
        fullConferenceData: eventData.conferenceData, // Full object for inspection
      },
      extraction: {
        extractedMeetLink,
        extractionMethod,
        hasLink: !!extractedMeetLink,
      },
      functionTest: functionResult ? {
        eventId: functionResult.eventId,
        htmlLink: functionResult.htmlLink,
        meetLink: functionResult.meetLink,
        hasMeetLink: !!functionResult.meetLink,
      } : null,
      debugInfo: {
        requestEvent: event,
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries()),
      },
    });
  } catch (error: any) {
    console.error("Debug calendar response error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to debug calendar response",
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
