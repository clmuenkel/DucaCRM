import { DEFAULT_USER_ID } from "@/lib/default-user";

// In-memory cache for last call timestamps (resets on server restart)
const lastCallTimestamps = new Map<string, number>();

// Default pacing configuration
const DEFAULT_MIN_DELAY_SECONDS = 30;
const DEFAULT_MAX_DELAY_SECONDS = 60;

export interface PacingConfig {
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
}

/**
 * Check if we should throttle the next call
 */
export function shouldThrottle(
  userId: string = DEFAULT_USER_ID,
  config: PacingConfig = {}
): { canCall: boolean; waitSeconds?: number; lastCallAgo?: number } {
  const minDelay = config.minDelaySeconds || DEFAULT_MIN_DELAY_SECONDS;

  const lastCallTime = lastCallTimestamps.get(userId) || 0;
  const now = Date.now();
  const timeSinceLastCall = (now - lastCallTime) / 1000;

  if (lastCallTime === 0) {
    return { canCall: true };
  }

  if (timeSinceLastCall >= minDelay) {
    return { canCall: true, lastCallAgo: timeSinceLastCall };
  }

  const waitSeconds = minDelay - timeSinceLastCall;
  return { canCall: false, waitSeconds, lastCallAgo: timeSinceLastCall };
}

/**
 * Record that a call was made
 */
export function recordCall(userId: string = DEFAULT_USER_ID): void {
  lastCallTimestamps.set(userId, Date.now());
}

/**
 * Reset pacing (useful for testing)
 */
export function resetPacing(userId: string = DEFAULT_USER_ID): void {
  lastCallTimestamps.delete(userId);
}
