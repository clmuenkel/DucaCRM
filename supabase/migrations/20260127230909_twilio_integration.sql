-- Twilio Integration Tables
-- Supports browser-based calling with number rotation and spam monitoring

-- ============================================
-- TWILIO_NUMBERS
-- ============================================
-- Stores Twilio phone numbers with rotation metadata
CREATE TABLE IF NOT EXISTS twilio_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  twilio_sid TEXT, -- Twilio phone number SID (optional, for API lookups)
  
  -- Rotation tracking
  daily_call_count INTEGER DEFAULT 0,
  daily_call_limit INTEGER DEFAULT 50, -- Default 50 calls/day per number
  last_used_at TIMESTAMPTZ,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  spam_score NUMERIC(5,2), -- 0-100, higher = more spam
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, phone_number)
);

CREATE INDEX idx_twilio_numbers_user ON twilio_numbers(user_id, is_active);
CREATE INDEX idx_twilio_numbers_rotation ON twilio_numbers(user_id, daily_call_count, is_active) 
  WHERE is_active = TRUE;

-- ============================================
-- TWILIO_CALLS
-- ============================================
-- Tracks individual Twilio call records
CREATE TABLE IF NOT EXISTS twilio_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid TEXT NOT NULL UNIQUE, -- Twilio Call SID
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  twilio_number_id UUID REFERENCES twilio_numbers(id) ON DELETE SET NULL,
  
  -- Call details
  status TEXT NOT NULL, -- queued, ringing, in-progress, completed, failed, busy, no-answer
  duration INTEGER, -- Duration in seconds
  from_number TEXT NOT NULL, -- Twilio number used
  to_number TEXT NOT NULL, -- Contact's number
  
  -- Twilio metadata
  direction TEXT DEFAULT 'outbound-api',
  price TEXT, -- Call cost from Twilio
  price_unit TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_twilio_calls_user ON twilio_calls(user_id, created_at DESC);
CREATE INDEX idx_twilio_calls_contact ON twilio_calls(contact_id);
CREATE INDEX idx_twilio_calls_sid ON twilio_calls(call_sid);
CREATE INDEX idx_twilio_calls_status ON twilio_calls(status, created_at DESC);

-- ============================================
-- UPDATE CALLS TABLE
-- ============================================
-- Add Twilio-specific columns to existing calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_number_used TEXT;

-- Add foreign key to twilio_calls
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid);

-- ============================================
-- TRIGGERS
-- ============================================
-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_twilio_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER twilio_numbers_updated_at
  BEFORE UPDATE ON twilio_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_twilio_timestamp();

CREATE TRIGGER twilio_calls_updated_at
  BEFORE UPDATE ON twilio_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_twilio_timestamp();

-- ============================================
-- FUNCTIONS
-- ============================================
-- Reset daily call counts (run via cron or manually)
CREATE OR REPLACE FUNCTION reset_twilio_daily_counts()
RETURNS INTEGER AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE twilio_numbers
  SET daily_call_count = 0,
      updated_at = NOW()
  WHERE daily_call_count > 0;
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE twilio_numbers IS 'Stores Twilio phone numbers with rotation and usage tracking';
COMMENT ON TABLE twilio_calls IS 'Tracks individual Twilio call records from API';
COMMENT ON COLUMN twilio_numbers.daily_call_limit IS 'Maximum calls per day for this number (default 50)';
COMMENT ON COLUMN twilio_numbers.spam_score IS 'Spam score from Twilio (0-100, higher = more spam)';
COMMENT ON COLUMN twilio_calls.status IS 'Call status: queued, ringing, in-progress, completed, failed, busy, no-answer';
COMMENT ON COLUMN calls.twilio_call_sid IS 'Links to twilio_calls.call_sid for Twilio-specific call data';
COMMENT ON COLUMN calls.twilio_number_used IS 'Which Twilio phone number was used for this call';
