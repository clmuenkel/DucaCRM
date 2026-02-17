/**
 * POST /api/automation/setup-tables
 * Idempotent migration endpoint to provision automation tables.
 * Creates: email_campaigns, email_sends, cold_calling_queue, automation_logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/neon/sql";
import { logAutomation } from "@/lib/automation/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function checkAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

const TABLE_STATEMENTS: { label: string; sql: string }[] = [
  {
    label: "extension",
    sql: 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
  },
  {
    label: "email_campaigns",
    sql: `
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL,
        campaign_date TEXT NOT NULL,
        template_key TEXT NOT NULL DEFAULT 'short',
        status TEXT NOT NULL DEFAULT 'pending',
        total_sent INTEGER DEFAULT 0,
        total_failed INTEGER DEFAULT 0,
        total_opened INTEGER DEFAULT 0,
        total_replied INTEGER DEFAULT 0,
        sender_stats JSONB DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  },
  {
    label: "email_sends",
    sql: `
      CREATE TABLE IF NOT EXISTS email_sends (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
        user_id TEXT NOT NULL,
        contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        sender_email TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_text TEXT NOT NULL,
        body_html TEXT,
        template_key TEXT NOT NULL,
        resend_email_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        opened_at TIMESTAMPTZ,
        replied_at TIMESTAMPTZ,
        bounced_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  },
  {
    label: "cold_calling_queue",
    sql: `
      CREATE TABLE IF NOT EXISTS cold_calling_queue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL,
        contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        first_name TEXT NOT NULL,
        last_name TEXT,
        company_name TEXT,
        industry TEXT,
        phone TEXT NOT NULL,
        phone_type TEXT DEFAULT 'unknown',
        source TEXT DEFAULT 'apollo',
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        call_attempts INTEGER DEFAULT 0,
        last_call_at TIMESTAMPTZ,
        last_outcome TEXT,
        notes TEXT,
        collected_date TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  },
  {
    label: "automation_logs",
    sql: `
      CREATE TABLE IF NOT EXISTS automation_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  },
];

const INDEX_STATEMENTS: { label: string; sql: string }[] = [
  { label: "idx_email_campaigns_date", sql: "CREATE INDEX IF NOT EXISTS idx_email_campaigns_date ON email_campaigns(campaign_date)" },
  { label: "idx_email_campaigns_user", sql: "CREATE INDEX IF NOT EXISTS idx_email_campaigns_user ON email_campaigns(user_id)" },
  { label: "idx_email_sends_campaign", sql: "CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id)" },
  { label: "idx_email_sends_contact", sql: "CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id)" },
  { label: "idx_email_sends_status", sql: "CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status)" },
  { label: "idx_email_sends_to", sql: "CREATE INDEX IF NOT EXISTS idx_email_sends_to ON email_sends(to_email)" },
  { label: "idx_email_sends_resend_id", sql: "CREATE INDEX IF NOT EXISTS idx_email_sends_resend_id ON email_sends(resend_email_id)" },
  { label: "idx_cold_calling_queue_status", sql: "CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_status ON cold_calling_queue(status)" },
  { label: "idx_cold_calling_queue_date", sql: "CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_date ON cold_calling_queue(collected_date)" },
  { label: "idx_cold_calling_queue_contact", sql: "CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_contact ON cold_calling_queue(contact_id)" },
  { label: "idx_automation_logs_action", sql: "CREATE INDEX IF NOT EXISTS idx_automation_logs_action ON automation_logs(action)" },
  { label: "idx_automation_logs_created", sql: "CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at)" },
];

async function runStatements(statements: { label: string; sql: string }[]) {
  const results: { label: string; ok: boolean; error?: string }[] = [];
  for (const stmt of statements) {
    try {
      await query(stmt.sql);
      results.push({ label: stmt.label, ok: true });
    } catch (err: any) {
      results.push({ label: stmt.label, ok: false, error: err.message });
    }
  }
  return results;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tableResults = await runStatements(TABLE_STATEMENTS);
  const indexResults = await runStatements(INDEX_STATEMENTS);

  const failed = [...tableResults, ...indexResults].filter((r) => !r.ok);

  await logAutomation("schema_sync", {
    success: failed.length === 0,
    tables: tableResults.map((t) => ({ label: t.label, ok: t.ok })),
    indexes: indexResults.map((i) => ({ label: i.label, ok: i.ok })),
  }, failed.length ? "warn" : "info");

  const status = failed.length > 0 ? 500 : 200;

  return NextResponse.json(
    {
      success: failed.length === 0,
      tables: tableResults,
      indexes: indexResults,
      failed,
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  return POST(request);
}
