import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

// In-memory cache for last call timestamps (resets on server restart)
// In production, consider using Redis for distributed systems
const lastCallTimestamps = new Map<string, number>();

// Default pacing configuration
const DEFAULT_MIN_DELAY_SECONDS = 30; // Minimum 30 seconds between calls
const DEFAULT_MAX_DELAY_SECONDS = 60; // Maximum 60 seconds between calls
const CALL_COUNT_THRESHOLD = 10; // After 10 calls, increase delay

export interface PacingConfig {
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
  callCountThreshold?: number;
}

/**
 * Check if we should throttle the next call
 * Returns true if enough time has passed, false if we need to wait
 */
export function shouldThrottle(
  userId: string = DEFAULT_USER_ID,
  config: PacingConfig = {}
): { canCall: boolean; waitSeconds?: number; lastCallAgo?: number } {
  const minDelay = config.minDelaySeconds || DEFAULT_MIN_DELAY_SECONDS;
  const maxDelay = config.maxDelaySeconds || DEFAULT_MAX_DELAY_SECONDS;
  const threshold = config.callCountThreshold || CALL_COUNT_THRESHOLD;

  const lastCallTime = lastCallTimestamps.get(userId) || 0;
  const now = Date.now();
  const timeSinceLastCall = (now - lastCallTime) / 1000; // Convert to seconds

  // If no previous call, allow immediately
  if (lastCallTime === 0) {
    return { canCall: true };
  }

  // Calculate dynamic delay based on recent call count
  // For now, use static delay (async call count check would require making this async)
  // In production, consider caching recent call count or using Redis
  const dynamicDelay = minDelay; // Start with min delay, can be enhanced with async call count

  if (timeSinceLastCall >= dynamicDelay) {
    return { canCall: true, lastCallAgo: timeSinceLastCall };
  }

  const waitSeconds = dynamicDelay - timeSinceLastCall;
  return { canCall: false, waitSeconds, lastCallAgo: timeSinceLastCall };
}

/**
 * Get the delay needed before next call
 */
export function getNextCallDelay(
  userId: string = DEFAULT_USER_ID,
  config: PacingConfig = {}
): number {
  const { waitSeconds } = shouldThrottle(userId, config);
  return waitSeconds || 0;
}

/**
 * Record that a call was made (update last call timestamp)
 */
export function recordCall(userId: string = DEFAULT_USER_ID): void {
  lastCallTimestamps.set(userId, Date.now());
}

/**
 * Get recent call count from database (last hour)
 * This helps determine if we need to increase pacing
 */
async function getRecentCallCount(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("started_at", oneHourAgo);

    if (error) {
      console.error("Error getting recent call count:", error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error("Error getting recent call count:", error);
    return 0;
  }
}

/**
 * Get pacing statistics for a user
 */
export async function getPacingStats(
  userId: string = DEFAULT_USER_ID
): Promise<{
  lastCallAgo: number | null; // Seconds since last call
  recentCallCount: number; // Calls in last hour
  canCallNow: boolean;
  waitSeconds: number;
}> {
  const lastCallTime = lastCallTimestamps.get(userId) || 0;
  const lastCallAgo = lastCallTime > 0 ? (Date.now() - lastCallTime) / 1000 : null;
  const recentCallCount = await getRecentCallCount(userId);
  const { canCall, waitSeconds } = shouldThrottle(userId);

  return {
    lastCallAgo,
    recentCallCount,
    canCallNow: canCall,
    waitSeconds: waitSeconds || 0,
  };
}

/**
 * Reset pacing (useful for testing or manual override)
 */
export function resetPacing(userId: string = DEFAULT_USER_ID): void {
  lastCallTimestamps.delete(userId);
}

/**
 * Get all pacing data (for debugging/admin)
 */
export function getAllPacingData(): Map<string, number> {
  return new Map(lastCallTimestamps);
}
