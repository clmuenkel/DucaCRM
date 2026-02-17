/**
 * Add automation tables to the Neon database.
 * Run: node scripts/add-automation-tables.mjs
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_zf1eWn4bqVMc@ep-weathered-frost-ai6jcha1.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Adding automation tables...\n");

  await sql`
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
      sender_stats JSONB DEFAULT '{}',
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ email_campaigns");

  await sql`
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
  `;
  console.log("✓ email_sends");

  await sql`
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
  `;
  console.log("✓ cold_calling_queue");

  await sql`
    CREATE TABLE IF NOT EXISTS automation_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ automation_logs");

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_date ON email_campaigns(campaign_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_campaigns_user ON email_campaigns(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON email_sends(campaign_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_to ON email_sends(to_email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_sends_resend_id ON email_sends(resend_email_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_status ON cold_calling_queue(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_date ON cold_calling_queue(collected_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cold_calling_queue_contact ON cold_calling_queue(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_automation_logs_action ON automation_logs(action)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at)`;
  console.log("✓ indexes");

  console.log("\n✅ Automation tables created successfully!");
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
