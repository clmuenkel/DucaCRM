import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_zf1eWn4bqVMc@ep-weathered-frost-ai6jcha1.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const sql = postgres(DATABASE_URL);

async function createSchema() {
  console.log("Creating Neon database schema...");

  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
  console.log("✓ UUID extension enabled");

  // ─── profiles ───
  await sql`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company_name TEXT,
      title TEXT,
      calendar_link TEXT,
      email_signature TEXT,
      daily_call_goal INTEGER DEFAULT 50,
      daily_email_goal INTEGER DEFAULT 20,
      google_calendar_access_token TEXT,
      google_calendar_refresh_token TEXT,
      google_calendar_token_expires_at TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ profiles");

  // ─── companies ───
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      domain TEXT,
      industry TEXT,
      industries TEXT[] DEFAULT '{}',
      employee_count INTEGER,
      employee_range TEXT,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'US',
      timezone TEXT,
      website TEXT,
      linkedin_url TEXT,
      annual_revenue TEXT,
      intent_score INTEGER,
      intent_topics TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ companies");

  // ─── contacts ───
  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      apollo_id TEXT,
      enrichment_status TEXT DEFAULT 'pending',
      enriched_at TIMESTAMPTZ,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      mobile TEXT,
      linkedin_url TEXT,
      title TEXT,
      seniority TEXT,
      department TEXT,
      company_name TEXT,
      company_domain TEXT,
      company_linkedin TEXT,
      industry TEXT,
      industries TEXT[] DEFAULT '{}',
      industry_code TEXT,
      employee_count INTEGER,
      employee_range TEXT,
      annual_revenue TEXT,
      city TEXT,
      state TEXT,
      country TEXT,
      stage TEXT DEFAULT 'fresh',
      status TEXT DEFAULT 'active',
      source TEXT,
      source_list TEXT,
      lead_score INTEGER DEFAULT 0,
      has_budget BOOLEAN DEFAULT FALSE,
      is_authority BOOLEAN DEFAULT FALSE,
      has_need BOOLEAN DEFAULT FALSE,
      has_timeline BOOLEAN DEFAULT FALSE,
      tags TEXT[] DEFAULT '{}',
      last_contacted_at TIMESTAMPTZ,
      next_follow_up TIMESTAMPTZ,
      total_calls INTEGER DEFAULT 0,
      total_emails INTEGER DEFAULT 0,
      direct_referral_contact_id UUID,
      direct_referral_note TEXT,
      priority_score INTEGER DEFAULT 0,
      cadence_status TEXT DEFAULT 'none',
      cadence_started_at TIMESTAMPTZ,
      last_email_sent_at TIMESTAMPTZ,
      email_count_this_week INTEGER DEFAULT 0,
      call_count_this_week INTEGER DEFAULT 0,
      resend_email_id TEXT,
      cadence_step INTEGER,
      cadence_day_started TEXT,
      next_action_date TEXT,
      next_action_type TEXT,
      snooze_until TEXT,
      cadence_outcome TEXT,
      email_opened BOOLEAN DEFAULT FALSE,
      email_replied BOOLEAN DEFAULT FALSE,
      email_open_count INTEGER DEFAULT 0,
      last_email_opened_at TIMESTAMPTZ,
      call_attempts INTEGER DEFAULT 0,
      last_call_outcome TEXT,
      wrong_number_flag BOOLEAN DEFAULT FALSE,
      wrong_number_phone TEXT,
      last_call_attempt_date TIMESTAMPTZ,
      meeting_scheduling_status TEXT DEFAULT 'none',
      scheduling_link_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ contacts");

  // ─── persona_sets ───
  await sql`
    CREATE TABLE IF NOT EXISTS persona_sets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      titles TEXT[] DEFAULT '{}',
      industries TEXT[] DEFAULT '{}',
      employee_ranges TEXT[] DEFAULT '{}',
      include_intent_data BOOLEAN DEFAULT FALSE,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ persona_sets");

  // ─── calls ───
  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      outcome TEXT NOT NULL,
      disposition TEXT,
      phone_used TEXT,
      telnyx_call_id TEXT,
      telnyx_number_used TEXT,
      notes TEXT,
      timestamped_notes JSONB DEFAULT '[]',
      tags_applied TEXT[] DEFAULT '{}',
      confirmed_budget BOOLEAN,
      confirmed_authority BOOLEAN,
      confirmed_need BOOLEAN,
      confirmed_timeline BOOLEAN,
      follow_up_date TEXT,
      follow_up_task_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ calls");

  // ─── telnyx_numbers ───
  await sql`
    CREATE TABLE IF NOT EXISTS telnyx_numbers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      daily_call_count INTEGER DEFAULT 0,
      daily_call_limit INTEGER DEFAULT 100,
      last_used_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT TRUE,
      spam_score INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ telnyx_numbers");

  // ─── telnyx_calls ───
  await sql`
    CREATE TABLE IF NOT EXISTS telnyx_calls (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      call_control_id TEXT,
      call_leg_id TEXT,
      user_id TEXT NOT NULL,
      contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
      telnyx_number_id UUID REFERENCES telnyx_numbers(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      duration INTEGER,
      from_number TEXT NOT NULL,
      to_number TEXT NOT NULL,
      direction TEXT DEFAULT 'outbound',
      started_at TIMESTAMPTZ,
      answered_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ telnyx_calls");

  // ─── tasks ───
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
      meeting_id UUID,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'follow_up',
      priority TEXT DEFAULT 'medium',
      importance INTEGER,
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      due_time TEXT,
      reminder_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_pattern TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ tasks");

  // ─── meetings ───
  await sql`
    CREATE TABLE IF NOT EXISTS meetings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_at TIMESTAMPTZ NOT NULL,
      duration_minutes INTEGER DEFAULT 30,
      location TEXT,
      meeting_link TEXT,
      status TEXT DEFAULT 'scheduled',
      reminder_at TIMESTAMPTZ,
      reminder_sent BOOLEAN DEFAULT FALSE,
      outcome TEXT,
      outcome_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ meetings");

  // ─── meeting_notes ───
  await sql`
    CREATE TABLE IF NOT EXISTS meeting_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_action_item BOOLEAN DEFAULT FALSE,
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ meeting_notes");

  // ─── notes ───
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      is_pinned BOOLEAN DEFAULT FALSE,
      is_company_wide BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ notes");

  // ─── email_templates ───
  await sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      subject_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      use_count INTEGER DEFAULT 0,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ email_templates");

  // ─── emails ───
  await sql`
    CREATE TABLE IF NOT EXISTS emails (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ emails");

  // ─── call_lists ───
  await sql`
    CREATE TABLE IF NOT EXISTS call_lists (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      filter_stages TEXT[] DEFAULT '{}',
      filter_tags TEXT[] DEFAULT '{}',
      filter_industries TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ call_lists");

  // ─── call_list_items ───
  await sql`
    CREATE TABLE IF NOT EXISTS call_list_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      called_at TIMESTAMPTZ,
      call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
      added_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ call_list_items");

  // ─── activity_log ───
  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      metadata JSONB DEFAULT '{}',
      summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ activity_log");

  // ─── call_scripts ───
  await sql`
    CREATE TABLE IF NOT EXISTS call_scripts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      industry TEXT,
      opener TEXT,
      value_prop TEXT,
      qualifying_questions TEXT[] DEFAULT '{}',
      objection_handlers JSONB DEFAULT '{}',
      close TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ call_scripts");

  // ─── dialer_drafts ───
  await sql`
    CREATE TABLE IF NOT EXISTS dialer_drafts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ dialer_drafts");

  // ─── cadence_settings ───
  await sql`
    CREATE TABLE IF NOT EXISTS cadence_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      emails_per_week INTEGER DEFAULT 10,
      calls_per_week INTEGER DEFAULT 25,
      instantly_api_key TEXT,
      instantly_campaign_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ cadence_settings");

  // ─── meeting_scheduling_queue ───
  await sql`
    CREATE TABLE IF NOT EXISTS meeting_scheduling_queue (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id TEXT NOT NULL,
      contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      scheduling_link_sent_at TIMESTAMPTZ NOT NULL,
      status TEXT DEFAULT 'pending',
      calendar_event_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ meeting_scheduling_queue");

  // ─── user_settings ───
  await sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      apollo_api_key TEXT,
      default_call_script_id UUID,
      default_email_template_id UUID,
      reminder_email BOOLEAN DEFAULT TRUE,
      reminder_browser BOOLEAN DEFAULT TRUE,
      reminder_minutes_before INTEGER DEFAULT 15,
      theme TEXT DEFAULT 'system',
      timezone TEXT DEFAULT 'America/New_York',
      date_format TEXT DEFAULT 'MM/dd/yyyy',
      work_start_time TEXT DEFAULT '09:00',
      work_end_time TEXT DEFAULT '17:00',
      work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ user_settings");

  // ─── Indexes ───
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_cadence_status ON contacts(cadence_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notes_contact_id ON notes(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_meetings_contact_id ON meetings(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_contact_id ON activity_log(contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_telnyx_numbers_user_id ON telnyx_numbers(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_telnyx_calls_user_id ON telnyx_calls(user_id)`;
  console.log("✓ indexes created");

  console.log("\n✅ All tables and indexes created successfully!");
  await sql.end();
}

createSchema().catch(async (e) => {
  console.error("Schema creation failed:", e);
  await sql.end();
  process.exit(1);
});
