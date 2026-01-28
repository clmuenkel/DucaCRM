-- 14-Day Sales Cadence System Migration
-- Defines the cadence steps and adds tracking fields to contacts

-- Create cadence_steps table (defines the 6-step sequence)
CREATE TABLE IF NOT EXISTS cadence_steps (
  id SERIAL PRIMARY KEY,
  step_number INTEGER NOT NULL UNIQUE,
  day_offset INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('email', 'call')),
  action_name TEXT NOT NULL,
  description TEXT,
  is_auto BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the 6 cadence steps
INSERT INTO cadence_steps (step_number, day_offset, action_type, action_name, description, is_auto) VALUES
  (0, 0, 'email', 'Email 1 - Intro', 'Personalized introduction email', TRUE),
  (1, 0, 'call', 'Call 1', 'First call attempt (same day as email)', FALSE),
  (2, 4, 'email', 'Email 2 - Follow-up', 'Follow-up referencing call attempt', TRUE),
  (3, 7, 'call', 'Call 2', 'Second call attempt', FALSE),
  (4, 11, 'email', 'Email 3 - Breakup', 'Final email with urgency', TRUE),
  (5, 14, 'call', 'Call 3 - Final', 'Final call attempt before archive', FALSE)
ON CONFLICT (step_number) DO NOTHING;

-- Add cadence tracking fields to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_step INTEGER DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_day_started DATE DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_action_date DATE DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_action_type TEXT DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS snooze_until DATE DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_outcome TEXT DEFAULT NULL CHECK (
  cadence_outcome IS NULL OR cadence_outcome IN ('in_progress', 'won', 'lost', 'archived', 'callback')
);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_opened BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_replied BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_open_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_email_opened_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS call_attempts INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_call_outcome TEXT DEFAULT NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_contacts_next_action ON contacts(user_id, next_action_date, next_action_type);
CREATE INDEX IF NOT EXISTS idx_contacts_cadence_step ON contacts(user_id, cadence_step);
CREATE INDEX IF NOT EXISTS idx_contacts_cadence_outcome ON contacts(user_id, cadence_outcome);
CREATE INDEX IF NOT EXISTS idx_contacts_snooze ON contacts(user_id, snooze_until) WHERE snooze_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email_activity ON contacts(user_id, email_opened, email_replied);

-- Disable RLS for single-user mode
ALTER TABLE cadence_steps DISABLE ROW LEVEL SECURITY;

-- Function to calculate next action date based on step
CREATE OR REPLACE FUNCTION calculate_next_action(
  p_cadence_day_started DATE,
  p_step_number INTEGER
) RETURNS TABLE (
  next_date DATE,
  action_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p_cadence_day_started + cs.day_offset,
    cs.action_type
  FROM cadence_steps cs
  WHERE cs.step_number = p_step_number;
END;
$$ LANGUAGE plpgsql;

-- Function to advance contact to next cadence step
CREATE OR REPLACE FUNCTION advance_cadence_step(p_contact_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_current_step INTEGER;
  v_cadence_start DATE;
  v_next_step INTEGER;
  v_next_date DATE;
  v_next_type TEXT;
  v_max_step INTEGER := 5;
BEGIN
  -- Get current state
  SELECT cadence_step, cadence_day_started 
  INTO v_current_step, v_cadence_start
  FROM contacts 
  WHERE id = p_contact_id;
  
  -- Calculate next step
  v_next_step := COALESCE(v_current_step, -1) + 1;
  
  -- Check if cadence is complete
  IF v_next_step > v_max_step THEN
    -- Archive the contact
    UPDATE contacts SET
      cadence_step = NULL,
      cadence_outcome = 'archived',
      cadence_status = 'completed',
      next_action_date = NULL,
      next_action_type = NULL
    WHERE id = p_contact_id;
    
    RETURN jsonb_build_object('status', 'completed', 'outcome', 'archived');
  END IF;
  
  -- Get next action details
  SELECT 
    v_cadence_start + cs.day_offset,
    cs.action_type
  INTO v_next_date, v_next_type
  FROM cadence_steps cs
  WHERE cs.step_number = v_next_step;
  
  -- Update contact
  UPDATE contacts SET
    cadence_step = v_next_step,
    next_action_date = v_next_date,
    next_action_type = v_next_type,
    cadence_outcome = 'in_progress'
  WHERE id = p_contact_id;
  
  RETURN jsonb_build_object(
    'status', 'advanced',
    'step', v_next_step,
    'next_date', v_next_date,
    'next_type', v_next_type
  );
END;
$$ LANGUAGE plpgsql;

-- Function to start cadence for a contact
CREATE OR REPLACE FUNCTION start_contact_cadence(p_contact_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  UPDATE contacts SET
    cadence_status = 'active',
    cadence_step = 0,
    cadence_day_started = v_today,
    cadence_outcome = 'in_progress',
    next_action_date = v_today,
    next_action_type = 'email',
    email_opened = FALSE,
    email_replied = FALSE,
    call_attempts = 0
  WHERE id = p_contact_id;
  
  RETURN jsonb_build_object(
    'status', 'started',
    'step', 0,
    'start_date', v_today
  );
END;
$$ LANGUAGE plpgsql;

-- View for today's actions
CREATE OR REPLACE VIEW todays_actions AS
SELECT 
  c.*,
  cs.action_name,
  cs.description as step_description,
  cs.is_auto,
  CASE 
    WHEN c.email_opened AND NOT c.email_replied THEN 'hot'
    WHEN c.email_replied THEN 'replied'
    ELSE 'normal'
  END as lead_temperature
FROM contacts c
LEFT JOIN cadence_steps cs ON c.cadence_step = cs.step_number
WHERE c.cadence_status = 'active'
  AND c.cadence_outcome = 'in_progress'
  AND (
    c.next_action_date <= CURRENT_DATE
    OR (c.snooze_until IS NOT NULL AND c.snooze_until <= CURRENT_DATE)
  );

SELECT 'Cadence steps system created!' as result;
