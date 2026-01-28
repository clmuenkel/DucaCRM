import { getTwilioClient } from "./client";
import { updateSpamScore, deactivateNumber, getAllTwilioNumbers } from "./number-rotation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

// Spam score thresholds
const HIGH_SPAM_THRESHOLD = 50; // Numbers with score > 50 are considered high spam
const CRITICAL_SPAM_THRESHOLD = 75; // Numbers with score > 75 should be deactivated

/**
 * Check spam score for a specific call
 * Note: Twilio doesn't provide spam scores directly via API for outbound calls
 * This would need to be implemented via webhook data or Twilio Insights API
 */
export async function checkSpamScore(
  callSid: string
): Promise<{ spamScore: number | null; error?: string }> {
  try {
    const client = getTwilioClient();
    
    // Try to get call details (spam score may be in call metadata)
    const call = await client.calls(callSid).fetch();
    
    // Note: Twilio doesn't expose spam scores directly in call object
    // This would need to be implemented via:
    // 1. Twilio Insights API (if available)
    // 2. Webhook data from carrier
    // 3. Manual tracking based on call outcomes
    
    // For now, return null (to be implemented with actual spam detection)
    return { spamScore: null };
  } catch (error: any) {
    return { spamScore: null, error: error.message };
  }
}

/**
 * Flag a number with high spam score and optionally deactivate it
 */
export async function flagHighSpamNumber(
  numberId: string,
  spamScore: number,
  autoDeactivate: boolean = false
): Promise<{ success: boolean; deactivated: boolean; error?: string }> {
  try {
    // Update spam score
    const { success, error } = await updateSpamScore(numberId, spamScore);
    if (!success) {
      return { success: false, deactivated: false, error };
    }

    let deactivated = false;

    // Auto-deactivate if score is critical
    if (autoDeactivate && spamScore >= CRITICAL_SPAM_THRESHOLD) {
      const deactivateResult = await deactivateNumber(numberId);
      deactivated = deactivateResult.success;
    }

    return { success: true, deactivated };
  } catch (error: any) {
    return { success: false, deactivated: false, error: error.message };
  }
}

/**
 * Get spam report for all numbers
 */
export async function getSpamReport(): Promise<{
  numbers: Array<{
    id: string;
    phoneNumber: string;
    spamScore: number | null;
    dailyCallCount: number;
    isActive: boolean;
    status: "healthy" | "warning" | "critical" | "inactive";
  }>;
  error?: string;
}> {
  try {
    const { numbers, error } = await getAllTwilioNumbers();
    if (error) {
      return { numbers: [], error };
    }

    const report = numbers.map((n) => {
      let status: "healthy" | "warning" | "critical" | "inactive" = "healthy";
      
      if (!n.is_active) {
        status = "inactive";
      } else if (n.spam_score === null) {
        status = "healthy"; // No spam data yet
      } else if (n.spam_score >= CRITICAL_SPAM_THRESHOLD) {
        status = "critical";
      } else if (n.spam_score >= HIGH_SPAM_THRESHOLD) {
        status = "warning";
      }

      return {
        id: n.id,
        phoneNumber: n.phone_number,
        spamScore: n.spam_score,
        dailyCallCount: n.daily_call_count,
        isActive: n.is_active,
        status,
      };
    });

    return { numbers: report };
  } catch (error: any) {
    return { numbers: [], error: error.message };
  }
}

/**
 * Calculate spam score based on call outcomes
 * This is a heuristic approach since Twilio doesn't provide direct spam scores
 */
export async function calculateSpamScoreFromOutcomes(
  numberId: string
): Promise<{ spamScore: number | null; error?: string }> {
  try {
    const supabase = createClient();
    const userId = DEFAULT_USER_ID;

    // Get recent calls for this number (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: calls, error } = await supabase
      .from("twilio_calls")
      .select("status")
      .eq("user_id", userId)
      .eq("twilio_number_id", numberId)
      .gte("created_at", sevenDaysAgo);

    if (error) {
      return { spamScore: null, error: error.message };
    }

    if (!calls || calls.length === 0) {
      return { spamScore: null }; // No data yet
    }

    // Calculate spam score based on call outcomes
    // Higher ratio of failed/busy/no-answer = higher spam score
    const totalCalls = calls.length;
    const failedCalls = calls.filter(
      (c) => c.status === "failed" || c.status === "busy" || c.status === "no-answer"
    ).length;
    const completedCalls = calls.filter((c) => c.status === "completed").length;

    // Spam score: 0-100
    // Higher score = more likely spam
    const failureRate = failedCalls / totalCalls;
    const completionRate = completedCalls / totalCalls;

    // Base score on failure rate (0-70 points)
    // Plus penalty for low completion rate (0-30 points)
    const spamScore = Math.round(
      failureRate * 70 + (1 - completionRate) * 30
    );

    // Update the number's spam score
    await updateSpamScore(numberId, spamScore);

    return { spamScore };
  } catch (error: any) {
    return { spamScore: null, error: error.message };
  }
}

/**
 * Check all numbers and flag/deactivate high spam ones
 */
export async function checkAndFlagHighSpamNumbers(
  autoDeactivate: boolean = false
): Promise<{
  checked: number;
  flagged: number;
  deactivated: number;
  errors: string[];
}> {
  const { numbers } = await getAllTwilioNumbers();
  let checked = 0;
  let flagged = 0;
  let deactivated = 0;
  const errors: string[] = [];

  for (const number of numbers) {
    if (!number.is_active) continue;

    try {
      checked++;
      const { spamScore } = await calculateSpamScoreFromOutcomes(number.id);

      if (spamScore !== null && spamScore >= HIGH_SPAM_THRESHOLD) {
        flagged++;
        const result = await flagHighSpamNumber(number.id, spamScore, autoDeactivate);
        if (result.deactivated) {
          deactivated++;
        }
      }
    } catch (error: any) {
      errors.push(`Error checking ${number.phone_number}: ${error.message}`);
    }
  }

  return { checked, flagged, deactivated, errors };
}
