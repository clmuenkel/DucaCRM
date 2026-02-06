import { insforge } from "@/lib/insforge/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";
import { getTelnyxConfig } from "./client";

export interface TelnyxNumber {
  id: string;
  phone_number: string;
  daily_call_count: number;
  daily_call_limit: number;
  last_used_at: string | null;
  is_active: boolean;
  spam_score: number | null;
}

/**
 * Initialize Telnyx numbers in database from environment variables
 * Call this once on startup or when numbers are added
 */
export async function initializeTelnyxNumbers(): Promise<{
  created: number;
  updated: number;
  errors: string[];
}> {
  const userId = DEFAULT_USER_ID;
  const config = getTelnyxConfig();

  if (!config.hasPhoneNumbers) {
    return { created: 0, updated: 0, errors: ["No phone numbers found in environment variables"] };
  }

  const created: string[] = [];
  const updated: string[] = [];
  const errors: string[] = [];

  for (const phoneNumber of config.phoneNumbers) {
    try {
      // Check if number already exists
      const { data: existing } = await insforge.database
        .from("telnyx_numbers")
        .select("id")
        .eq("user_id", userId)
        .eq("phone_number", phoneNumber)
        .single();

      const typedExisting = existing as { id: string } | null;
      if (typedExisting) {
        // Update existing number (ensure it's active)
        const { error } = await (insforge.database as any)
          .from("telnyx_numbers")
          .update({
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", typedExisting.id);

        if (error) {
          errors.push(`Failed to update ${phoneNumber}: ${error.message}`);
        } else {
          updated.push(phoneNumber);
        }
      } else {
        // Create new number record
        const { error } = await (insforge.database as any).from("telnyx_numbers").insert([{
          user_id: userId,
          phone_number: phoneNumber,
          daily_call_count: 0,
          daily_call_limit: 50, // Default limit
          is_active: true,
        }]);

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
 * Get the next available Telnyx number for calling
 * Selects number with lowest daily call count that hasn't hit limit
 */
export async function getNextAvailableNumber(): Promise<{
  number: TelnyxNumber | null;
  error?: string;
}> {
  const userId = DEFAULT_USER_ID;

  try {
    // First, ensure numbers are initialized
    await initializeTelnyxNumbers();

    // Get all active numbers, ordered by daily_call_count ascending
    const { data: numbers, error } = await insforge.database
      .from("telnyx_numbers")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("daily_call_count", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (error) {
      return { number: null, error: error.message };
    }

    const typedNumbers = (numbers || []) as TelnyxNumber[];
    if (typedNumbers.length === 0) {
      return {
        number: null,
        error: "No active Telnyx numbers found. Please configure phone numbers in environment variables.",
      };
    }

    // Find first number that hasn't hit its daily limit
    const availableNumber = typedNumbers.find(
      (n) => n.daily_call_count < n.daily_call_limit
    );

    if (!availableNumber) {
      return {
        number: null,
        error: "All Telnyx numbers have reached their daily call limit. Please wait or increase limits.",
      };
    }

    return { number: availableNumber as TelnyxNumber };
  } catch (error: any) {
    return { number: null, error: error.message || "Failed to get next available number" };
  }
}

/**
 * Increment call count for a Telnyx number
 */
export async function incrementCallCount(
  numberId: string
): Promise<{ success: boolean; error?: string }> {
  const userId = DEFAULT_USER_ID;

  try {
    // Get current count
    const { data: number, error: fetchError } = await insforge.database
      .from("telnyx_numbers")
      .select("daily_call_count")
      .eq("id", numberId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !number) {
      return { success: false, error: fetchError?.message || "Number not found" };
    }

    const typedNumber = number as { daily_call_count: number | null };
    // Increment count and update last_used_at
    const { error: updateError } = await (insforge.database as any)
      .from("telnyx_numbers")
      .update({
        daily_call_count: (typedNumber.daily_call_count || 0) + 1,
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
 * Get all Telnyx numbers with their usage stats
 */
export async function getAllTelnyxNumbers(): Promise<{
  numbers: TelnyxNumber[];
  error?: string;
}> {
  const userId = DEFAULT_USER_ID;

  try {
    const { data: numbers, error } = await insforge.database
      .from("telnyx_numbers")
      .select("*")
      .eq("user_id", userId)
      .order("phone_number", { ascending: true });

    if (error) {
      return { numbers: [], error: error.message };
    }

    return { numbers: (numbers as TelnyxNumber[]) || [] };
  } catch (error: any) {
    return { numbers: [], error: error.message };
  }
}
