-- Sales Cadence System Migration
-- Adds priority scoring and cadence tracking to contacts

-- Add priority and cadence fields to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_status TEXT DEFAULT 'none';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cadence_started_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_count_this_week INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS call_count_this_week INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instantly_lead_id TEXT;

-- Create index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(user_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_cadence ON contacts(user_id, cadence_status);

-- Create cadence_settings table for user preferences
CREATE TABLE IF NOT EXISTS cadence_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emails_per_week INTEGER DEFAULT 3,
  calls_per_week INTEGER DEFAULT 5,
  instantly_api_key TEXT,
  instantly_campaign_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Disable RLS for single-user mode
ALTER TABLE cadence_settings DISABLE ROW LEVEL SECURITY;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_cadence_settings_updated_at ON cadence_settings;
CREATE TRIGGER update_cadence_settings_updated_at 
  BEFORE UPDATE ON cadence_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate priority score
CREATE OR REPLACE FUNCTION calculate_contact_priority(
  p_source TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_mobile TEXT,
  p_industry TEXT
) RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Verified DM (Apollo found): +40 points
  IF p_source IS NOT NULL AND (p_source ILIKE '%apollo%' OR p_source ILIKE '%lead gen%') THEN
    score := score + 40;
  END IF;
  
  -- Email verified (not generic): +30 points
  IF p_email IS NOT NULL AND p_email NOT ILIKE '%info@%' AND p_email NOT ILIKE '%contact@%' AND p_email NOT ILIKE '%sales@%' THEN
    score := score + 30;
  END IF;
  
  -- Has direct phone: +20 points
  IF p_phone IS NOT NULL OR p_mobile IS NOT NULL THEN
    score := score + 20;
  END IF;
  
  -- Industry match: +10 points
  IF p_industry IS NOT NULL AND p_industry IN ('hvac', 'plumbing', 'roofing', 'electrical', 'solar', 'construction') THEN
    score := score + 10;
  END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Update existing contacts with priority scores
UPDATE contacts 
SET priority_score = calculate_contact_priority(source, email, phone, mobile, industry)
WHERE priority_score = 0 OR priority_score IS NULL;

SELECT 'Sales cadence tables and fields created!' as result;
