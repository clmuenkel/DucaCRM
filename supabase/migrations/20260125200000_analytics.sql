-- PezCRM Schema Enhancement: Analytics Tables
-- Run this migration in your Supabase SQL Editor

-- ============================================
-- USER_TARGETS TABLE
-- Store editable daily and weekly targets
-- ============================================
CREATE TABLE IF NOT EXISTS user_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('daily', 'weekly')),
  calls_target INT NOT NULL DEFAULT 50,
  connected_target INT NOT NULL DEFAULT 15,
  meetings_target INT NOT NULL DEFAULT 3,
  voicemails_target INT NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_user_targets_user_id ON user_targets(user_id);

-- ============================================
-- DIALER_SESSIONS TABLE
-- Auto-detected calling sessions (30+ min gap = new session)
-- ============================================
CREATE TABLE IF NOT EXISTS dialer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INT GENERATED ALWAYS AS (
    CASE 
      WHEN ended_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INT
      ELSE NULL
    END
  ) STORED,
  total_calls INT NOT NULL DEFAULT 0,
  connected_calls INT NOT NULL DEFAULT 0,
  meetings_booked INT NOT NULL DEFAULT 0,
  voicemails INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  no_answers INT NOT NULL DEFAULT 0,
  gatekeepers INT NOT NULL DEFAULT 0,
  wrong_numbers INT NOT NULL DEFAULT 0,
  busy INT NOT NULL DEFAULT 0,
  total_talk_time_seconds INT NOT NULL DEFAULT 0,
  avg_call_duration_seconds INT GENERATED ALWAYS AS (
    CASE 
      WHEN connected_calls > 0 
      THEN total_talk_time_seconds / connected_calls
      ELSE 0
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dialer_sessions_user_id ON dialer_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dialer_sessions_started_at ON dialer_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialer_sessions_user_date ON dialer_sessions(user_id, started_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_targets DISABLE ROW LEVEL SECURITY;
ALTER TABLE dialer_sessions DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGER: Update user_targets updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_user_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_targets_updated_at ON user_targets;
CREATE TRIGGER trigger_user_targets_updated_at
  BEFORE UPDATE ON user_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_targets_updated_at();

-- ============================================
-- INSERT DEFAULT TARGETS FOR EXISTING USERS
-- ============================================
INSERT INTO user_targets (user_id, target_type, calls_target, connected_target, meetings_target, voicemails_target)
SELECT id, 'daily', 50, 15, 3, 20
FROM profiles
ON CONFLICT (user_id, target_type) DO NOTHING;

INSERT INTO user_targets (user_id, target_type, calls_target, connected_target, meetings_target, voicemails_target)
SELECT id, 'weekly', 250, 75, 15, 100
FROM profiles
ON CONFLICT (user_id, target_type) DO NOTHING;

-- ============================================
-- HELPER VIEW: Daily Call Stats
-- ============================================
CREATE OR REPLACE VIEW daily_call_stats AS
SELECT 
  user_id,
  DATE(started_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE outcome = 'connected') as connected,
  COUNT(*) FILTER (WHERE outcome = 'voicemail') as voicemails,
  COUNT(*) FILTER (WHERE outcome = 'no_answer') as no_answers,
  COUNT(*) FILTER (WHERE outcome = 'skipped') as skipped,
  COUNT(*) FILTER (WHERE outcome = 'gatekeeper') as gatekeepers,
  COUNT(*) FILTER (WHERE outcome = 'wrong_number') as wrong_numbers,
  COUNT(*) FILTER (WHERE outcome = 'busy') as busy,
  COALESCE(SUM(duration_seconds) FILTER (WHERE outcome = 'connected'), 0) as total_talk_time,
  COALESCE(AVG(duration_seconds) FILTER (WHERE outcome = 'connected'), 0) as avg_call_duration,
  MIN(started_at) as first_call_at,
  MAX(started_at) as last_call_at,
  ROUND(
    COUNT(*) FILTER (WHERE outcome = 'connected')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE outcome != 'skipped'), 0) * 100, 
    1
  ) as answer_rate
FROM calls
GROUP BY user_id, DATE(started_at);

-- ============================================
-- HELPER VIEW: Weekly Call Stats
-- ============================================
CREATE OR REPLACE VIEW weekly_call_stats AS
SELECT 
  user_id,
  DATE_TRUNC('week', started_at)::DATE as week_start,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE outcome = 'connected') as connected,
  COUNT(*) FILTER (WHERE outcome = 'voicemail') as voicemails,
  COUNT(*) FILTER (WHERE outcome = 'no_answer') as no_answers,
  COUNT(*) FILTER (WHERE outcome = 'skipped') as skipped,
  COALESCE(SUM(duration_seconds) FILTER (WHERE outcome = 'connected'), 0) as total_talk_time,
  COALESCE(AVG(duration_seconds) FILTER (WHERE outcome = 'connected'), 0) as avg_call_duration,
  COUNT(DISTINCT DATE(started_at)) as days_called,
  ROUND(
    COUNT(*) FILTER (WHERE outcome = 'connected')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE outcome != 'skipped'), 0) * 100, 
    1
  ) as answer_rate
FROM calls
GROUP BY user_id, DATE_TRUNC('week', started_at);

-- ============================================
-- HELPER VIEW: Hourly Performance (for heatmap)
-- ============================================
CREATE OR REPLACE VIEW hourly_performance AS
SELECT 
  user_id,
  EXTRACT(DOW FROM started_at)::INT as day_of_week, -- 0=Sunday, 6=Saturday
  EXTRACT(HOUR FROM started_at)::INT as hour_of_day,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE outcome = 'connected') as connected,
  ROUND(
    COUNT(*) FILTER (WHERE outcome = 'connected')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE outcome != 'skipped'), 0) * 100, 
    1
  ) as answer_rate
FROM calls
WHERE outcome != 'skipped'
GROUP BY user_id, EXTRACT(DOW FROM started_at), EXTRACT(HOUR FROM started_at);

-- ============================================
-- ENSURE TIMEZONE EXISTS ON CONTACTS
-- ============================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS timezone TEXT;

-- ============================================
-- HELPER VIEW: Timezone Performance
-- ============================================
CREATE OR REPLACE VIEW timezone_performance AS
SELECT 
  c.user_id,
  COALESCE(co.timezone, 'Unknown') as timezone,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE c.outcome = 'connected') as connected,
  ROUND(
    COUNT(*) FILTER (WHERE c.outcome = 'connected')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE c.outcome != 'skipped'), 0) * 100, 
    1
  ) as answer_rate
FROM calls c
LEFT JOIN contacts co ON c.contact_id = co.id
WHERE c.outcome != 'skipped'
GROUP BY c.user_id, COALESCE(co.timezone, 'Unknown');

-- Done!
SELECT 'Analytics tables and views created!' as result;
