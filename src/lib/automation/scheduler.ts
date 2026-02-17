/**
 * Scheduling utilities for CST business-hours email sending.
 */

import { SEND_TIMEZONE, SEND_START_HOUR, SEND_END_HOUR, SEND_DAYS } from "./config";

/**
 * Check if the current time is within CST business hours (Mon-Fri 9-5).
 */
export function isWithinSendWindow(): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SEND_TIMEZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";

  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const dayNum = dayMap[weekday] ?? -1;

  return SEND_DAYS.includes(dayNum) && hour >= SEND_START_HOUR && hour < SEND_END_HOUR;
}

/**
 * Get today's date string in CST (YYYY-MM-DD).
 */
export function todayCST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEND_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Get the sender index for today (rotates daily: 0, 1, 2, 0, 1, 2…).
 * Uses day-of-year so rotation is deterministic.
 */
export function todaySenderStartIndex(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dayOfYear % 3; // 3 senders
}
