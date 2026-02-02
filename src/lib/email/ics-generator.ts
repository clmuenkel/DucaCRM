/**
 * ICS (iCalendar) File Generator
 * Generates calendar invite files that can be attached to emails
 */

export interface GenerateICSFileParams {
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName: string;
  location?: string;
  meetingLink?: string;
  eventId?: string;
}

/**
 * Generate ICS file content for a calendar invite
 */
export function generateICSFile(params: GenerateICSFileParams): string {
  const {
    summary,
    description,
    startTime,
    endTime,
    organizerEmail,
    organizerName,
    attendeeEmail,
    attendeeName,
    location,
    meetingLink,
    eventId,
  } = params;

  // Format date in UTC (ICS format: YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };

  // Escape text for ICS format
  const escapeICS = (text: string): string => {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  // Generate unique ID if not provided
  const uid = eventId || `meeting-${Date.now()}-${Math.random().toString(36).substring(7)}@${organizerEmail.split("@")[1] || "crm"}`;
  const now = formatICSDate(new Date());
  const dtstart = formatICSDate(startTime);
  const dtend = formatICSDate(endTime);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRM//Calendar Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    location ? `LOCATION:${escapeICS(location)}` : "",
    `ORGANIZER;CN="${escapeICS(organizerName)}":mailto:${organizerEmail}`,
    `ATTENDEE;CN="${escapeICS(attendeeName)}";RSVP=TRUE:mailto:${attendeeEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    meetingLink ? `URL:${meetingLink}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // Filter out empty lines
  return lines.filter((line) => line !== "").join("\r\n");
}

/**
 * Convert ICS string to base64 for email attachment
 */
export function icsToBase64(icsContent: string): string {
  return Buffer.from(icsContent, "utf-8").toString("base64");
}
