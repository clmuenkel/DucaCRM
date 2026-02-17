/**
 * Email Automation Configuration
 * Central config for the EviosHQ outreach automation system.
 */

// ─── Sender Rotation ────────────────────────────────────────
export const SENDER_ADDRESSES = [
  { email: "c.muenkel@evioshq.com", name: "Carl-Luca Muenkel" },
  { email: "r.reid@evioshq.com", name: "Ryan Reid" },
  { email: "f.llamas@evioshq.com", name: "Francisco Llamas" },
] as const;

export const EMAILS_PER_SENDER = 17; // ~50 total / 3 senders
export const TOTAL_DAILY_EMAILS = 50;

// ─── Scheduling ─────────────────────────────────────────────
export const SEND_TIMEZONE = "America/Chicago"; // CST/CDT
export const SEND_START_HOUR = 9;  // 9 AM CST
export const SEND_END_HOUR = 17;   // 5 PM CST
export const SEND_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

// ─── Apollo Harvesting ──────────────────────────────────────
export const HARVEST_INDUSTRIES = [
  "plumbing",
  "hvac",
  "roofing",
  "landscaping",
  "pest_control",
] as const;

export const HARVEST_EMPLOYEE_RANGES = ["1,10", "11,20", "21,50"] as const;
export const HARVEST_DAILY_TARGET = 150; // 100-200 leads
export const HARVEST_PER_PAGE = 25;

// ─── Phone Collection ───────────────────────────────────────
export const PHONE_DAILY_TARGET = 50;
export const PHONE_QUEUE_TARGET = 150;

// ─── Rate Limiting ──────────────────────────────────────────
export const EMAIL_SEND_DELAY_MS = 3000;  // 3s between sends
export const APOLLO_REQUEST_DELAY_MS = 300; // ~3 req/s

// ─── Template IDs ───────────────────────────────────────────
export type TemplateKey = "original" | "short";
export const DEFAULT_TEMPLATE: TemplateKey = "short";
