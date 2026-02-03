import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Phone number normalization for Twilio E.164 format

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Check if a phone number is valid (has at least 10 digits)
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10;
}

/**
 * Get the first valid phone number from phone or mobile, with proper fallback
 */
export function getValidPhone(phone: string | null | undefined, mobile: string | null | undefined): string | null {
  // Check phone first, but only if it's valid
  if (isValidPhone(phone)) {
    return phone!;
  }
  // Fallback to mobile if phone is invalid or empty
  if (isValidPhone(mobile)) {
    return mobile!;
  }
  return null;
}

/**
 * Normalize phone number to E.164 format required by Twilio
 * E.164 format: +[country code][number] (max 15 digits total)
 * Examples:
 *   "+18322941575" -> "+18322941575" (already correct)
 *   "(832) 294-1575" -> "+18322941575"
 *   "832-294-1575" -> "+18322941575"
 *   "18322941575" -> "+18322941575"
 *   "8322941575" -> "+18322941575"
 */
export function normalizeToE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");
  
  // If it already starts with +, validate and return
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    // E.164 allows 1-15 digits after the +
    if (digits.length >= 1 && digits.length <= 15 && /^\d+$/.test(digits)) {
      return cleaned;
    }
    // If invalid format, try to fix it
    if (digits.length > 15) {
      // Too long, truncate to 15 digits
      return `+${digits.slice(0, 15)}`;
    }
  }
  
  // Remove leading + if present for processing
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }
  
  // If it's 11 digits starting with 1 (US/Canada with country code)
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }
  
  // If it's 10 digits (US/Canada without country code)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // If it's already digits but not matching above patterns
  if (cleaned.length > 0 && /^\d+$/.test(cleaned)) {
    // If starts with 1 and is 11 digits, add +
    if (cleaned.startsWith("1") && cleaned.length === 11) {
      return `+${cleaned}`;
    }
    // If 10 digits, assume US and add +1
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    // For other lengths, assume it's already correct format and add +
    // But limit to 15 digits max
    if (cleaned.length <= 15) {
      return `+${cleaned}`;
    }
  }
  
  // If we can't normalize it, return null
  return null;
}

export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/**
 * Get industry for template rendering
 * Returns "home services" if industry is "not_found", "other", or empty
 */
export function getIndustryForTemplate(contact: { industries?: string[] | null; industry?: string | null }): string {
  const industry = contact.industries?.[0] || contact.industry || "";
  // Replace "not_found" or "other" with "home services"
  if (industry === "not_found" || industry === "other" || !industry) {
    return "home services";
  }
  return industry;
}
