// US State to Timezone mapping
// Uses IANA timezone identifiers

export const US_STATE_TIMEZONES: Record<string, string> = {
  // Eastern Time
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York", // Most of FL is Eastern
  GA: "America/New_York",
  IN: "America/Indiana/Indianapolis", // Most of IN is Eastern
  KY: "America/Kentucky/Louisville", // Eastern part
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  NH: "America/New_York",
  NJ: "America/New_York",
  NY: "America/New_York",
  NC: "America/New_York",
  OH: "America/New_York",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  VT: "America/New_York",
  VA: "America/New_York",
  WV: "America/New_York",

  // Central Time
  AL: "America/Chicago",
  AR: "America/Chicago",
  IL: "America/Chicago",
  IA: "America/Chicago",
  KS: "America/Chicago", // Most of KS is Central
  LA: "America/Chicago",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  NE: "America/Chicago", // Most of NE is Central
  ND: "America/Chicago", // Most of ND is Central
  OK: "America/Chicago",
  SD: "America/Chicago", // Most of SD is Central
  TN: "America/Chicago", // Most of TN is Central
  TX: "America/Chicago", // Most of TX is Central
  WI: "America/Chicago",

  // Mountain Time
  AZ: "America/Phoenix", // No DST (except Navajo Nation)
  CO: "America/Denver",
  ID: "America/Boise", // Most of ID is Mountain
  MT: "America/Denver",
  NV: "America/Los_Angeles", // Most populated areas use Pacific
  NM: "America/Denver",
  UT: "America/Denver",
  WY: "America/Denver",

  // Pacific Time
  CA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",

  // Alaska Time
  AK: "America/Anchorage",

  // Hawaii Time
  HI: "America/Honolulu",

  // US Territories
  PR: "America/Puerto_Rico",
  VI: "America/Virgin",
  GU: "Pacific/Guam",
  AS: "Pacific/Pago_Pago",
};

// Full state names mapping
export const US_STATE_NAMES: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

/**
 * Get timezone from location (city, state, country)
 * Defaults to US Eastern if state not found
 */
export function getTimezoneFromLocation(
  city?: string | null,
  state?: string | null,
  country?: string | null
): string {
  // Default to Eastern for US if no state
  if (!state) {
    return "America/New_York";
  }

  // Normalize state - check if it's a full name or abbreviation
  let stateCode = state.toUpperCase().trim();

  // If it's longer than 2 chars, try to find the abbreviation
  if (stateCode.length > 2) {
    const normalized = Object.entries(US_STATE_NAMES).find(
      ([name]) => name.toLowerCase() === state.toLowerCase()
    );
    if (normalized) {
      stateCode = normalized[1];
    }
  }

  return US_STATE_TIMEZONES[stateCode] || "America/New_York";
}

/**
 * Get the current local time in a given timezone
 */
export function getLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  } catch {
    // Fallback if timezone is invalid
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());
  }
}

/**
 * Get timezone abbreviation (e.g., "EST", "PST", "CST", "MST", "HST")
 * Returns standard US abbreviations for common timezones
 */
export function getTimezoneAbbreviation(timezone: string): string {
  // Map IANA timezones to common abbreviations
  // This gives more consistent, recognizable abbreviations
  const abbreviationMap: Record<string, { standard: string; dst: string }> = {
    "America/New_York": { standard: "EST", dst: "EDT" },
    "America/Detroit": { standard: "EST", dst: "EDT" },
    "America/Indiana/Indianapolis": { standard: "EST", dst: "EDT" },
    "America/Kentucky/Louisville": { standard: "EST", dst: "EDT" },
    "America/Chicago": { standard: "CST", dst: "CDT" },
    "America/Denver": { standard: "MST", dst: "MDT" },
    "America/Boise": { standard: "MST", dst: "MDT" },
    "America/Phoenix": { standard: "MST", dst: "MST" }, // Arizona doesn't observe DST
    "America/Los_Angeles": { standard: "PST", dst: "PDT" },
    "America/Anchorage": { standard: "AKST", dst: "AKDT" },
    "America/Honolulu": { standard: "HST", dst: "HST" }, // Hawaii doesn't observe DST
    "America/Puerto_Rico": { standard: "AST", dst: "AST" },
    "Pacific/Guam": { standard: "ChST", dst: "ChST" },
  };

  const mapping = abbreviationMap[timezone];
  if (mapping) {
    // Check if DST is currently active
    const now = new Date();
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    
    try {
      const janOffset = new Date(jan.toLocaleString("en-US", { timeZone: timezone })).getTime() - jan.getTime();
      const julOffset = new Date(jul.toLocaleString("en-US", { timeZone: timezone })).getTime() - jul.getTime();
      const nowOffset = new Date(now.toLocaleString("en-US", { timeZone: timezone })).getTime() - now.getTime();
      
      // If current offset matches July (summer), it's DST
      const isDST = Math.abs(nowOffset - julOffset) < Math.abs(nowOffset - janOffset);
      return isDST ? mapping.dst : mapping.standard;
    } catch {
      return mapping.standard;
    }
  }

  // Fallback to Intl API for unknown timezones
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((part) => part.type === "timeZoneName");
    return tzPart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * Get full timezone display string (e.g., "2:30 PM EST")
 */
export function getTimezoneDisplay(timezone: string): string {
  const time = getLocalTime(timezone);
  const abbr = getTimezoneAbbreviation(timezone);
  return `${time} ${abbr}`;
}

/**
 * Check if it's currently business hours (9 AM - 5 PM) in a timezone
 */
export function isBusinessHours(
  timezone: string,
  startHour: number = 9,
  endHour: number = 17
): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(now), 10);
    return hour >= startHour && hour < endHour;
  } catch {
    return true; // Default to true if we can't determine
  }
}

/**
 * Get a friendly timezone name
 */
export function getFriendlyTimezoneName(timezone: string): string {
  const mapping: Record<string, string> = {
    "America/New_York": "Eastern",
    "America/Chicago": "Central",
    "America/Denver": "Mountain",
    "America/Los_Angeles": "Pacific",
    "America/Phoenix": "Arizona",
    "America/Anchorage": "Alaska",
    "America/Honolulu": "Hawaii",
    "America/Detroit": "Eastern",
    "America/Indiana/Indianapolis": "Eastern (Indiana)",
    "America/Kentucky/Louisville": "Eastern (Kentucky)",
    "America/Boise": "Mountain",
    "America/Puerto_Rico": "Atlantic",
  };

  return mapping[timezone] || timezone.split("/").pop()?.replace(/_/g, " ") || timezone;
}

/**
 * Get list of US timezones for selector dropdown
 */
export function getUSTimezones(): Array<{ value: string; label: string }> {
  return [
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "America/Phoenix", label: "Arizona (MST)" },
    { value: "America/Anchorage", label: "Alaska Time (AKT)" },
    { value: "America/Honolulu", label: "Hawaii Time (HST)" },
  ];
}

/**
 * Get the timezone offset in minutes for a given timezone at a specific date
 * Returns the offset from UTC (positive = ahead of UTC, negative = behind UTC)
 */
export function getTimezoneOffset(timezone: string, date: Date = new Date()): number {
  try {
    // Create a formatter for the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
    });
    
    // Get the offset string (e.g., "GMT-5" or "GMT+8")
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    
    if (offsetPart) {
      // Parse offset string like "GMT-05:00" or "GMT+08:00"
      const offsetStr = offsetPart.value.replace('GMT', '').trim();
      const sign = offsetStr.startsWith('-') ? -1 : 1;
      const [hours, minutes = 0] = offsetStr.replace(/[+-]/, '').split(':').map(Number);
      return sign * (hours * 60 + minutes);
    }
    
    // Fallback: calculate offset by comparing UTC time with timezone time
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  } catch (error) {
    console.warn(`Failed to get timezone offset for ${timezone}:`, error);
    return 0; // Default to UTC
  }
}

/**
 * Create a Date object representing a specific date/time in a given timezone
 * This properly handles timezone conversion so the Date object represents the correct UTC time
 * 
 * @param year - Year (e.g., 2024)
 * @param month - Month (1-12, not 0-indexed)
 * @param day - Day of month (1-31)
 * @param hours - Hours (0-23)
 * @param minutes - Minutes (0-59)
 * @param timezone - IANA timezone identifier (e.g., "America/New_York")
 * @returns Date object representing the UTC time that corresponds to the local time in the timezone
 */
export function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  try {
    // Create a date string representing the desired local time in the timezone
    // Format: YYYY-MM-DDTHH:mm:ss
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    
    // We need to find the UTC time that, when displayed in the target timezone, equals our desired time
    // Strategy: Start with a guess (treating the time as UTC), then adjust based on the timezone offset
    
    // First, create a date as if it were UTC
    let candidateDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
    
    // Get what this UTC time looks like in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    // Iteratively adjust until we get the correct time in the target timezone
    // This handles DST and timezone offsets correctly
    for (let attempts = 0; attempts < 10; attempts++) {
      const parts = formatter.formatToParts(candidateDate);
      const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      
      // Check if we have the correct time
      if (tzHour === hours && tzMinute === minutes) {
        return candidateDate;
      }
      
      // Calculate the difference in minutes
      const diffMinutes = (hours * 60 + minutes) - (tzHour * 60 + tzMinute);
      
      // Adjust the candidate date
      candidateDate = new Date(candidateDate.getTime() + diffMinutes * 60 * 1000);
    }
    
    // If iteration didn't converge, use the last candidate
    console.warn(`createDateInTimezone: Could not perfectly match time for ${timezone}, using approximation`);
    return candidateDate;
  } catch (error) {
    console.error(`Error creating date in timezone ${timezone}:`, error);
    // Fallback: return date as if it were UTC (not ideal but better than crashing)
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  }
}
