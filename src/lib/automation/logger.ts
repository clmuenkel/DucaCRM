/**
 * Automation logger — writes structured logs to automation_logs table.
 */

import { insforge } from "@/lib/neon/server";
import { DEFAULT_USER_ID } from "@/lib/default-user";

export type AutomationAction =
  | "campaign_start"
  | "campaign_complete"
  | "email_sent"
  | "email_failed"
  | "harvest_start"
  | "harvest_complete"
  | "harvest_error"
  | "phone_collected"
  | "phone_error"
  | "cron_start"
  | "cron_complete"
  | "cron_error"
  | "schema_sync";

export async function logAutomation(
  action: AutomationAction,
  details: Record<string, any> = {},
  level: "info" | "warn" | "error" = "info"
): Promise<void> {
  try {
    await insforge.database.from("automation_logs").insert([
      {
        user_id: DEFAULT_USER_ID,
        action,
        details: JSON.stringify(details),
        level,
      },
    ]);
  } catch (e: any) {
    // Don't let logging failures break the pipeline
    console.error(`[AutoLog] Failed to write log: ${e.message}`, { action, details });
  }
}
