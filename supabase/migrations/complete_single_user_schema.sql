-- PezCRM Complete Schema for Single-User Mode (No Authentication)
-- Run this entire file in your Supabase SQL Editor

-- ============================================
-- PROFILES (standalone, no auth.users reference)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  title TEXT,
  calendar_link TEXT,
  email_signature TEXT,
  daily_call_goal INTEGER DEFAULT 50,
  daily_email_goal INTEGER DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTACTS
-- ============================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Apollo reference
  apollo_id TEXT,
  enrichment_status TEXT DEFAULT 'pending',
  enriched_at TIMESTAMPTZ,
  
  -- Person info
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  linkedin_url TEXT,
  title TEXT,
  seniority TEXT,
  department TEXT,
  
  -- Company info
  company_name TEXT,
  company_domain TEXT,
  company_linkedin TEXT,
  industry TEXT,
  industry_code TEXT,
  employee_count INTEGER,
  employee_range TEXT,
  annual_revenue TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  timezone TEXT,
  
  -- CRM fields
  stage TEXT DEFAULT 'fresh',
  status TEXT DEFAULT 'active',
  source TEXT,
  source_list TEXT,
  lead_score INTEGER DEFAULT 0,
  
  -- Qualification (BANT)
  has_budget BOOLEAN DEFAULT FALSE,
  is_authority BOOLEAN DEFAULT FALSE,
  has_need BOOLEAN DEFAULT FALSE,
  has_timeline BOOLEAN DEFAULT FALSE,
  
  -- Tags
  tags TEXT[] DEFAULT '{}',
  
  -- Tracking
  last_contacted_at TIMESTAMPTZ,
  next_follow_up TIMESTAMPTZ,
  total_calls INTEGER DEFAULT 0,
  total_emails INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_next_follow_up ON contacts(user_id, next_follow_up);
CREATE INDEX IF NOT EXISTS idx_contacts_apollo_id ON contacts(apollo_id);

-- ============================================
-- CALLS
-- ============================================
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  outcome TEXT NOT NULL,
  disposition TEXT,
  notes TEXT,
  tags_applied TEXT[] DEFAULT '{}',
  
  confirmed_budget BOOLEAN,
  confirmed_authority BOOLEAN,
  confirmed_need BOOLEAN,
  confirmed_timeline BOOLEAN,
  
  follow_up_date TIMESTAMPTZ,
  follow_up_task_id UUID,
  timestamped_notes JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(user_id, started_at);

-- ============================================
-- TASKS
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'follow_up',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  
  due_date TIMESTAMPTZ,
  due_time TIME,
  reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);

-- Add foreign key for follow_up_task_id in calls
ALTER TABLE calls ADD CONSTRAINT fk_calls_follow_up_task
  FOREIGN KEY (follow_up_task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- ============================================
-- NOTES
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_contact_id ON notes(contact_id);

-- ============================================
-- EMAIL TEMPLATES
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  category TEXT,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  
  use_count INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);

-- ============================================
-- EMAILS (composed/sent)
-- ============================================
CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
);

CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_contact_id ON emails(contact_id);

-- ============================================
-- CALL LISTS
-- ============================================
CREATE TABLE IF NOT EXISTS call_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  filter_stages TEXT[] DEFAULT '{}',
  filter_tags TEXT[] DEFAULT '{}',
  filter_industries TEXT[] DEFAULT '{}',
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_lists_user_id ON call_lists(user_id);

-- ============================================
-- CALL LIST ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS call_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  position INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  
  called_at TIMESTAMPTZ,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_list_items_list ON call_list_items(call_list_id, position);

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  activity_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  summary TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_contact ON activity_log(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, created_at DESC);

-- ============================================
-- CALL SCRIPTS
-- ============================================
CREATE TABLE IF NOT EXISTS call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
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
);

CREATE INDEX IF NOT EXISTS idx_call_scripts_user_id ON call_scripts(user_id);

-- ============================================
-- USER SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  
  apollo_api_key TEXT,
  
  default_call_script_id UUID REFERENCES call_scripts(id) ON DELETE SET NULL,
  default_email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  
  reminder_email BOOLEAN DEFAULT TRUE,
  reminder_browser BOOLEAN DEFAULT TRUE,
  reminder_minutes_before INTEGER DEFAULT 15,
  
  theme TEXT DEFAULT 'light',
  timezone TEXT DEFAULT 'America/New_York',
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  
  work_start_time TIME DEFAULT '09:00',
  work_end_time TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMPANIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(user_id, industry);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(user_id, name);

-- ============================================
-- MODIFY CONTACTS TABLE - Add company & referral columns
-- ============================================
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS direct_referral_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS direct_referral_note TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_referral ON contacts(direct_referral_contact_id);

-- ============================================
-- PERSONA SETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS persona_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  titles TEXT[] DEFAULT '{}',
  industries TEXT[] DEFAULT '{}',
  employee_ranges TEXT[] DEFAULT '{}',
  include_intent_data BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_sets_user_id ON persona_sets(user_id);

-- ============================================
-- DISABLE ROW LEVEL SECURITY (Single-User Mode)
-- ============================================
-- Since this is a single-user CRM without auth, we disable RLS
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE calls DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_list_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_scripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE persona_sets DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGERS for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_scripts_updated_at ON call_scripts;
CREATE TRIGGER update_call_scripts_updated_at BEFORE UPDATE ON call_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_persona_sets_updated_at ON persona_sets;
CREATE TRIGGER update_persona_sets_updated_at BEFORE UPDATE ON persona_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION get_company_contact_count(company_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM contacts WHERE company_id = company_uuid;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_company_last_contacted(company_uuid UUID)
RETURNS TIMESTAMPTZ AS $$
  SELECT MAX(c.last_contacted_at) 
  FROM contacts c 
  WHERE c.company_id = company_uuid;
$$ LANGUAGE SQL STABLE;

-- ============================================
-- CREATE DEFAULT USER FOR SINGLE-USER MODE
-- ============================================
INSERT INTO profiles (id, full_name, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'CRM User', 'user@pezcrm.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_settings (user_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- SEED DUMMY DATA
-- ============================================

-- Insert sample companies
INSERT INTO companies (id, user_id, name, domain, industry, employee_count, employee_range, city, state, country, timezone, intent_score, intent_topics)
VALUES 
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 
   'Acme Healthcare Systems', 'acmehealthcare.com', 'Healthcare', 250, '201-500', 
   'Chicago', 'IL', 'US', 'America/Chicago', 85, ARRAY['Revenue Cycle Management', 'Healthcare IT']),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 
   'First National Credit Union', 'firstnationalcu.org', 'Financial Services', 150, '101-200', 
   'Denver', 'CO', 'US', 'America/Denver', 72, ARRAY['Digital Banking', 'Member Experience']),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 
   'Midwest Regional Hospital', 'midwestregional.org', 'Healthcare', 800, '501-1000', 
   'Minneapolis', 'MN', 'US', 'America/Chicago', 90, ARRAY['Patient Engagement', 'Healthcare IT']),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 
   'Pacific Coast Bank', 'pacificcoastbank.com', 'Financial Services', 320, '201-500', 
   'San Francisco', 'CA', 'US', 'America/Los_Angeles', 68, ARRAY['Digital Transformation']),
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 
   'Sunshine Medical Group', 'sunshinemedical.com', 'Healthcare', 95, '51-100', 
   'Miami', 'FL', 'US', 'America/New_York', 55, ARRAY['Revenue Cycle Management']);

-- Insert sample contacts with company references
INSERT INTO contacts (id, user_id, company_id, first_name, last_name, email, phone, title, seniority, department, company_name, company_domain, industry, city, state, country, stage, source)
VALUES 
  -- Acme Healthcare contacts
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Sarah', 'Johnson', 'sjohnson@acmehealthcare.com', '312-555-0101', 'CFO', 'C-Suite', 'Finance',
   'Acme Healthcare Systems', 'acmehealthcare.com', 'Healthcare', 'Chicago', 'IL', 'US', 'fresh', 'Apollo Import'),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Mike', 'Chen', 'mchen@acmehealthcare.com', '312-555-0102', 'VP of Operations', 'VP', 'Operations',
   'Acme Healthcare Systems', 'acmehealthcare.com', 'Healthcare', 'Chicago', 'IL', 'US', 'contacted', 'Apollo Import'),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Jennifer', 'Williams', 'jwilliams@acmehealthcare.com', '312-555-0103', 'Director of IT', 'Director', 'IT',
   'Acme Healthcare Systems', 'acmehealthcare.com', 'Healthcare', 'Chicago', 'IL', 'US', 'fresh', 'Apollo Import'),
   
  -- First National Credit Union contacts
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   'Robert', 'Martinez', 'rmartinez@firstnationalcu.org', '720-555-0201', 'CEO', 'C-Suite', 'Executive',
   'First National Credit Union', 'firstnationalcu.org', 'Financial Services', 'Denver', 'CO', 'US', 'qualified', 'Apollo Import'),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
   'Lisa', 'Thompson', 'lthompson@firstnationalcu.org', '720-555-0202', 'VP of Member Services', 'VP', 'Operations',
   'First National Credit Union', 'firstnationalcu.org', 'Financial Services', 'Denver', 'CO', 'US', 'fresh', 'Apollo Import'),

  -- Midwest Regional Hospital contacts
  ('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'David', 'Anderson', 'danderson@midwestregional.org', '612-555-0301', 'CIO', 'C-Suite', 'IT',
   'Midwest Regional Hospital', 'midwestregional.org', 'Healthcare', 'Minneapolis', 'MN', 'US', 'meeting', 'Apollo Import'),
  ('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
   'Amanda', 'Lee', 'alee@midwestregional.org', '612-555-0302', 'Director of Revenue Cycle', 'Director', 'Finance',
   'Midwest Regional Hospital', 'midwestregional.org', 'Healthcare', 'Minneapolis', 'MN', 'US', 'contacted', 'Apollo Import'),
  
  -- Pacific Coast Bank contacts  
  ('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004',
   'Kevin', 'Nguyen', 'knguyen@pacificcoastbank.com', '415-555-0401', 'CFO', 'C-Suite', 'Finance',
   'Pacific Coast Bank', 'pacificcoastbank.com', 'Financial Services', 'San Francisco', 'CA', 'US', 'fresh', 'Apollo Import'),
  
  -- Sunshine Medical Group contacts
  ('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005',
   'Patricia', 'Brown', 'pbrown@sunshinemedical.com', '305-555-0501', 'Practice Manager', 'Manager', 'Operations',
   'Sunshine Medical Group', 'sunshinemedical.com', 'Healthcare', 'Miami', 'FL', 'US', 'fresh', 'Apollo Import');

-- Add some referral context (Mike Chen referred us to CFO Sarah)
UPDATE contacts 
SET direct_referral_contact_id = 'a0000000-0000-0000-0000-000000000002',
    direct_referral_note = 'Mike said Sarah handles all vendor decisions'
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- Insert sample calls
INSERT INTO calls (id, user_id, contact_id, started_at, ended_at, duration_seconds, outcome, disposition, notes, timestamped_notes)
VALUES 
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '5 minutes', 300,
   'connected', 'interested', 'Great call with Mike. He''s interested in our solution and suggested I speak with Sarah the CFO.',
   '[{"time": "00:32", "note": "Introduced myself, mentioned healthcare focus"}, {"time": "01:45", "note": "Mike confirmed they are evaluating vendors"}, {"time": "03:20", "note": "Suggested I talk to Sarah Johnson (CFO)"}, {"time": "04:50", "note": "Scheduled follow-up for next week"}]'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '8 minutes', 480,
   'connected', 'meeting_booked', 'Robert is very interested. We have a demo scheduled for next Tuesday.',
   '[{"time": "00:15", "note": "CEO picked up directly"}, {"time": "02:00", "note": "Discussed credit union challenges"}, {"time": "05:30", "note": "Booked demo for Tuesday 2pm MT"}]'::jsonb),
  ('b0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '12 minutes', 720,
   'connected', 'meeting_booked', 'David wants a full technical demo. Very engaged on integration capabilities.',
   '[{"time": "00:45", "note": "CIO interested in technical capabilities"}, {"time": "04:00", "note": "Discussed HL7 integration requirements"}, {"time": "08:30", "note": "Will loop in Amanda from Revenue Cycle"}, {"time": "11:00", "note": "Demo scheduled for Thursday"}]'::jsonb);

-- Update contact last_contacted_at based on calls
UPDATE contacts SET last_contacted_at = NOW() - INTERVAL '2 days', total_calls = 1 WHERE id = 'a0000000-0000-0000-0000-000000000002';
UPDATE contacts SET last_contacted_at = NOW() - INTERVAL '3 days', total_calls = 1 WHERE id = 'a0000000-0000-0000-0000-000000000004';
UPDATE contacts SET last_contacted_at = NOW() - INTERVAL '1 day', total_calls = 1 WHERE id = 'a0000000-0000-0000-0000-000000000006';

-- Insert sample tasks
INSERT INTO tasks (id, user_id, contact_id, title, description, type, priority, status, due_date)
VALUES 
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Call Sarah Johnson at Acme Healthcare', 'Follow up call - Mike Chen referred me', 'call', 'high', 'todo', NOW() + INTERVAL '1 day'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004',
   'Demo with Robert Martinez', 'Tuesday 2pm MT - First National Credit Union demo', 'meeting', 'high', 'todo', NOW() + INTERVAL '3 days'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006',
   'Technical demo with David Anderson', 'Thursday - Include integration discussion', 'meeting', 'high', 'todo', NOW() + INTERVAL '4 days'),
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007',
   'Follow up with Amanda Lee', 'David said to loop her in on Revenue Cycle discussion', 'call', 'medium', 'todo', NOW() + INTERVAL '2 days'),
  ('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008',
   'Initial outreach to Kevin Nguyen', 'CFO at Pacific Coast Bank - cold call', 'call', 'medium', 'todo', NOW());

-- Insert sample persona sets
INSERT INTO persona_sets (id, user_id, name, titles, industries, employee_ranges, include_intent_data, is_default)
VALUES 
  ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Healthcare C-Suite', ARRAY['CFO', 'CEO', 'CIO', 'COO'], ARRAY['Healthcare', 'Hospital & Health Care'], 
   ARRAY['51-100', '101-200', '201-500', '501-1000'], true, true),
  ('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Credit Union Leadership', ARRAY['CEO', 'CFO', 'VP of Operations', 'VP of Member Services'], 
   ARRAY['Financial Services', 'Banking'], ARRAY['51-100', '101-200', '201-500'], true, false),
  ('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'Healthcare Directors', ARRAY['Director of IT', 'Director of Revenue Cycle', 'Director of Operations'], 
   ARRAY['Healthcare', 'Hospital & Health Care'], ARRAY['201-500', '501-1000', '1001-5000'], false, false);

-- Insert sample notes
INSERT INTO notes (user_id, contact_id, call_id, content, is_pinned)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'Mike mentioned they are in active evaluation phase. Timeline is Q2. Budget approved.', true),
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002',
   'Robert is the key decision maker. Very direct, prefers data-driven conversations.', true),
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000003',
   'David is technical and wants to understand integration architecture in detail.', false);

-- Done!
SELECT 'Schema and seed data created successfully!' as result;
