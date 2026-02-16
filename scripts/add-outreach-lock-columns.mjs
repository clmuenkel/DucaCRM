#!/usr/bin/env node

/**
 * Add outreach_lock and allow_email_override columns to contacts table.
 *
 * outreach_lock: null | "call_connected" | "meeting_booked" | "email_replied"
 * allow_email_override: boolean (default false)
 *
 * Usage: node scripts/add-outreach-lock-columns.mjs
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ No DATABASE_URL or NEON_DATABASE_URL set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

try {
  await sql`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS outreach_lock text DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS allow_email_override boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS outreach_follow_up_date timestamptz DEFAULT NULL;
  `;
  console.log("✅ Added outreach_lock, allow_email_override, outreach_follow_up_date columns");

  await sql`
    DO $$ BEGIN
      ALTER TABLE contacts
        ADD CONSTRAINT contacts_outreach_lock_check
        CHECK (outreach_lock IS NULL OR outreach_lock IN ('call_connected', 'meeting_booked', 'email_replied'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;
  console.log("✅ Added check constraint on outreach_lock");
} catch (e) {
  console.error("❌ Migration failed:", e.message);
  process.exit(1);
}
