export const STAGES = [
  { value: "fresh", label: "Fresh", color: "bg-slate-500" },
  { value: "contacted", label: "Contacted", color: "bg-blue-500" },
  { value: "qualified", label: "Qualified", color: "bg-yellow-500" },
  { value: "meeting", label: "Meeting", color: "bg-purple-500" },
  { value: "proposal", label: "Proposal", color: "bg-orange-500" },
  { value: "won", label: "Won", color: "bg-green-500" },
  { value: "lost", label: "Lost", color: "bg-red-500" },
] as const;

export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected", icon: "✅" },
  { value: "voicemail", label: "Voicemail", icon: "📧" },
  { value: "no_answer", label: "No Answer", icon: "📵" },
  { value: "busy", label: "Busy", icon: "🔴" },
  { value: "wrong_number", label: "Wrong Number", icon: "❌" },
  { value: "gatekeeper", label: "Gatekeeper", icon: "🚫" },
  { value: "skipped", label: "Skipped", icon: "⏭️" },
] as const;

// Outcomes shown in the UI selector (excludes skipped - that's set programmatically)
export const CALL_OUTCOMES_UI = CALL_OUTCOMES.filter(o => o.value !== "skipped");

export const CALL_DISPOSITIONS = [
  { value: "interested_meeting", label: "Interested - Book Meeting" },
  { value: "interested_info", label: "Interested - Send Info" },
  { value: "callback", label: "Callback Requested" },
  { value: "not_interested_fit", label: "Not Interested - Bad Fit" },
  { value: "not_interested_solution", label: "Not Interested - Has Solution" },
  { value: "not_interested_budget", label: "Not Interested - No Budget" },
  { value: "do_not_contact", label: "Do Not Contact" },
] as const;

export const TASK_TYPES = [
  { value: "call", label: "Call", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "follow_up", label: "Follow Up", icon: "🔄" },
  { value: "meeting_prep", label: "Meeting Prep", icon: "📋" },
  { value: "meeting", label: "Meeting", icon: "📅" },
  { value: "proposal", label: "Proposal", icon: "📝" },
  { value: "custom", label: "Custom", icon: "📌" },
  { value: "other", label: "Other", icon: "📌" },
] as const;

export const TASK_PRIORITIES = [
  { value: "low", label: "Low", color: "text-muted-foreground" },
  { value: "medium", label: "Medium", color: "text-yellow-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-500" },
] as const;

export const INDUSTRIES = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "solar", label: "Solar" },
  { value: "construction", label: "General Contractor" },
  { value: "swag", label: "Swag" },
  { value: "not_found", label: "Not Found" },
] as const;

export const EMPLOYEE_RANGES = [
  { value: "1-50", label: "1-50" },
  { value: "51-200", label: "51-200" },
  { value: "201-500", label: "201-500" },
  { value: "501-1000", label: "501-1,000" },
  { value: "1001-5000", label: "1,001-5,000" },
  { value: "5001+", label: "5,001+" },
] as const;

export const EMAIL_TEMPLATE_CATEGORIES = [
  { value: "initial_outreach", label: "Initial Outreach" },
  { value: "meeting", label: "Meeting" },
  { value: "follow_up", label: "Follow Up" },
  { value: "nurture", label: "Nurture" },
  { value: "closing", label: "Closing" },
] as const;

export const TEMPLATE_VARIABLES = [
  { key: "first_name", label: "First Name", example: "John" },
  { key: "last_name", label: "Last Name", example: "Smith" },
  { key: "full_name", label: "Full Name", example: "John Smith" },
  { key: "company", label: "Company", example: "Acme Corp" },
  { key: "title", label: "Title", example: "VP of Finance" },
  { key: "email", label: "Email", example: "john@acme.com" },
  { key: "phone", label: "Phone", example: "(555) 123-4567" },
  { key: "sender_name", label: "Your Name", example: "Your Name" },
  { key: "sender_calendar", label: "Calendar Link", example: "https://calendly.com/..." },
  { key: "meeting_date", label: "Meeting Date", example: "Tuesday, January 20th" },
  { key: "meeting_time", label: "Meeting Time", example: "2:00 PM EST" },
] as const;

// ============================================
// QUICK TASK PRESETS
// ============================================
export const QUICK_TASK_PRESETS = [
  {
    id: "call-1-day",
    label: "Follow up in 1 day",
    type: "call",
    daysFromNow: 1,
    priority: "medium",
  },
  {
    id: "call-3-days",
    label: "Follow up in 3 days",
    type: "call",
    daysFromNow: 3,
    priority: "medium",
  },
  {
    id: "call-1-week",
    label: "Follow up in 1 week",
    type: "call",
    daysFromNow: 7,
    priority: "low",
  },
  {
    id: "email-today",
    label: "Send email today",
    type: "email",
    daysFromNow: 0,
    priority: "high",
  },
  {
    id: "schedule-meeting",
    label: "Schedule meeting",
    type: "meeting",
    daysFromNow: 1,
    priority: "high",
  },
] as const;

// ============================================
// US STATE TIMEZONE MAPPINGS
// ============================================
export const US_STATES_TIMEZONES: Record<string, string> = {
  // Eastern Time
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  IN: "America/Indiana/Indianapolis",
  KY: "America/Kentucky/Louisville",
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
  KS: "America/Chicago",
  LA: "America/Chicago",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  NE: "America/Chicago",
  ND: "America/Chicago",
  OK: "America/Chicago",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  WI: "America/Chicago",

  // Mountain Time
  AZ: "America/Phoenix",
  CO: "America/Denver",
  ID: "America/Boise",
  MT: "America/Denver",
  NV: "America/Los_Angeles",
  NM: "America/Denver",
  UT: "America/Denver",
  WY: "America/Denver",

  // Pacific Time
  CA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",

  // Alaska & Hawaii
  AK: "America/Anchorage",
  HI: "America/Honolulu",
};

// Timezone friendly names
export const TIMEZONE_FRIENDLY_NAMES: Record<string, string> = {
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
};

// ============================================
// APOLLO INTENT TOPICS (for home services)
// ============================================
export const APOLLO_INTENT_TOPICS = [
  { id: "home_improvement", label: "Home Improvement" },
  { id: "construction", label: "Construction" },
  { id: "facility_management", label: "Facility Management" },
  { id: "real_estate", label: "Real Estate" },
  { id: "energy_efficiency", label: "Energy Efficiency" },
  { id: "sustainability", label: "Sustainability" },
] as const;

// ============================================
// REFERRAL CONTEXT TYPES
// ============================================
export const REFERRAL_CONTEXT_TYPES = [
  { 
    value: "direct", 
    label: "Direct Referral", 
    description: "Someone specifically told them to expect your call" 
  },
  { 
    value: "company", 
    label: "Company Reference", 
    description: "You've spoken with someone else at this company" 
  },
  { 
    value: "manual", 
    label: "Manual Reference", 
    description: "You're adding a custom opener reference" 
  },
] as const;
