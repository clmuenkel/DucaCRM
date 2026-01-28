import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { getTwilioConfig } from "./client";

export interface TwilioNumber {
  id: string;
  phone_number: string;
  daily_call_count: number;
  daily_call_limit: number;
  last_used_at: string | null;
  is_active: boolean;
  spam_score: number | null;
}

/**
 * Initialize Twilio numbers in database from environment variables
 * Call this once on startup or when numbers are added
 */
export async function initializeTwilioNumbers(): Promise<{
  created: number;
  updated: number;
  errors: string[];
}> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;
  const config = getTwilioConfig();

  if (!config.hasPhoneNumbers) {
    return { created: 0, updated: 0, errors: ["No phone numbers found in environment variables"] };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const errors: string[] = [];

  for (const phoneNumber of config.phoneNumbers) {
    try {
      // Check if number already exists
      const { data: existing } = await supabase
        .from("twilio_numbers")
        .select("id")
        .eq("user_id", userId)
        .eq("phone_number", phoneNumber)
        .single();

      if (existing) {
        // Update existing number (ensure it's active)
        const { error } = await supabase
          .from("twilio_numbers")
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) {
          errors.push(`Failed to update ${phoneNumber}: ${error.message}`);
        } else {
          updated.push(phoneNumber);
        }
      } else {
        // Create new number record
        const { error } = await supabase.from("twilio_numbers").insert({
          user_id: userId,
          phone_number: phoneNumber,
          daily_call_count: 0,
          daily_call_limit: 50, // Default limit
          is_active: true,
        });

        if (error) {
          errors.push(`Failed to create ${phoneNumber}: ${error.message}`);
        } else {
          created.push(phoneNumber);
        }
      }
    } catch (error: any) {
      errors.push(`Error processing ${phoneNumber}: ${error.message}`);
    }
  }

  return {
    created: created.length,
    updated: updated.length,
    errors,
  };
}

/**
 * Get the next available Twilio number for calling
 * Selects number with lowest daily call count that hasn't hit limit
 */
export async function getNextAvailableNumber(): Promise<{
  number: TwilioNumber | null;
  error?: string;
}> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    // First, ensure numbers are initialized
    await initializeTwilioNumbers();

    // Get all active numbers, ordered by daily_call_count ascending
    // Prefer numbers that haven't hit their daily limit
    const { data: numbers, error } = await supabase
      .from("twilio_numbers")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("daily_call_count", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (error) {
      return { number: null, error: error.message };
    }

    if (!numbers || numbers.length === 0) {
      return {
        number: null,
        error: "No active Twilio numbers found. Please configure phone numbers in environment variables.",
      };
    }

    // Find first number that hasn't hit its daily limit
    const availableNumber = numbers.find(
      (n) => n.daily_call_count < n.daily_call_limit
    );

    if (!availableNumber) {
      return {
        number: null,
        error: "All Twilio numbers have reached their daily call limit. Please wait or increase limits.",
      };
    }

    return { number: availableNumber as TwilioNumber };
  } catch (error: any) {
    return { number: null, error: error.message || "Failed to get next available number" };
  }
}

/**
 * Increment call count for a Twilio number
 */
export async function incrementCallCount(
  numberId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    // Get current count
    const { data: number, error: fetchError } = await supabase
      .from("twilio_numbers")
      .select("daily_call_count")
      .eq("id", numberId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !number) {
      return { success: false, error: fetchError?.message || "Number not found" };
    }

    // Increment count and update last_used_at
    const { error: updateError } = await supabase
      .from("twilio_numbers")
      .update({
        daily_call_count: (number.daily_call_count || 0) + 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", numberId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if a number has reached its daily limit
 */
export async function checkDailyLimits(
  numberId: string
): Promise<{ withinLimit: boolean; current: number; limit: number; error?: string }> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    const { data: number, error } = await supabase
      .from("twilio_numbers")
      .select("daily_call_count, daily_call_limit")
      .eq("id", numberId)
      .eq("user_id", userId)
      .single();

    if (error || !number) {
      return {
        withinLimit: false,
        current: 0,
        limit: 0,
        error: error?.message || "Number not found",
      };
    }

    const current = number.daily_call_count || 0;
    const limit = number.daily_call_limit || 50;

    return {
      withinLimit: current < limit,
      current,
      limit,
    };
  } catch (error: any) {
    return {
      withinLimit: false,
      current: 0,
      limit: 0,
      error: error.message,
    };
  }
}

/**
 * Get all Twilio numbers with their usage stats
 */
export async function getAllTwilioNumbers(): Promise<{
  numbers: TwilioNumber[];
  error?: string;
}> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    const { data: numbers, error } = await supabase
      .from("twilio_numbers")
      .select("*")
      .eq("user_id", userId)
      .order("phone_number", { ascending: true });

    if (error) {
      return { numbers: [], error: error.message };
    }

    return { numbers: (numbers as TwilioNumber[]) || [] };
  } catch (error: any) {
    return { numbers: [], error: error.message };
  }
}

/**
 * Update spam score for a number
 */
export async function updateSpamScore(
  numberId: string,
  spamScore: number | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    const { error } = await supabase
      .from("twilio_numbers")
      .update({
        spam_score: spamScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", numberId)
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Deactivate a number (e.g., due to high spam score)
 */
export async function deactivateNumber(
  numberId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const userId = DEFAULT_USER_ID;

  try {
    const { error } = await supabase
      .from("twilio_numbers")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", numberId)
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
