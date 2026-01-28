-- Email Verification Schema Updates
-- Adds fields to track email verification status and data quality

-- ===========================================
-- Add email verification fields to lead_people
-- ===========================================

ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS email_verification_method TEXT; -- syntax, dns, smtp, api

ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT FALSE;

ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- ===========================================
-- Add index for verification queries
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_lead_people_verified 
  ON lead_people(user_id, email_verified, email_status);

CREATE INDEX IF NOT EXISTS idx_lead_people_review 
  ON lead_people(user_id, needs_manual_review) 
  WHERE needs_manual_review = TRUE;

-- ===========================================
-- Update email_status enum values (add new statuses)
-- ===========================================

-- Current values: found, guessed, verified, bounced, unknown
-- New values: verified_dns, verified_smtp, verified_api

COMMENT ON COLUMN lead_people.email_status IS 
  'Status: unknown, found, guessed, verified, verified_dns, verified_smtp, verified_api, bounced';

COMMENT ON COLUMN lead_people.email_verification_method IS 
  'How the email was verified: syntax, dns, smtp, api (e.g., zerobounce)';

-- ===========================================
-- Add data quality view
-- ===========================================

CREATE OR REPLACE VIEW lead_data_quality AS
SELECT 
  lp.user_id,
  lc.industry_tag,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE lp.email IS NOT NULL) as with_email,
  COUNT(*) FILTER (WHERE lp.email_status = 'found' OR lp.source LIKE 'apollo%') as from_apollo,
  COUNT(*) FILTER (WHERE lp.source LIKE 'scrape%') as from_scrape,
  COUNT(*) FILTER (WHERE lp.email_status = 'guessed') as email_guessed,
  COUNT(*) FILTER (WHERE lp.email_verified = TRUE) as email_verified,
  COUNT(*) FILTER (WHERE lp.needs_manual_review = TRUE) as needs_review,
  COUNT(*) FILTER (WHERE lp.linkedin_url IS NOT NULL) as has_linkedin,
  COUNT(*) FILTER (WHERE lp.phone IS NOT NULL) as has_phone,
  ROUND(
    AVG(lp.confidence_score)::NUMERIC, 1
  ) as avg_confidence
FROM lead_people lp
JOIN lead_companies lc ON lp.lead_company_id = lc.id
GROUP BY lp.user_id, lc.industry_tag;

-- ===========================================
-- Add contact quality score function
-- ===========================================

CREATE OR REPLACE FUNCTION calculate_contact_quality(
  p_email_status TEXT,
  p_email_verified BOOLEAN,
  p_source TEXT,
  p_has_phone BOOLEAN,
  p_has_linkedin BOOLEAN,
  p_confidence INTEGER
) RETURNS TEXT AS $$
BEGIN
  -- Verified DM: High confidence, verified email from Apollo
  IF p_email_verified = TRUE AND p_source LIKE 'apollo%' AND p_email_status IN ('found', 'verified') THEN
    RETURN 'verified_dm';
  END IF;
  
  -- Likely DM: Found name + verified email
  IF p_email_verified = TRUE OR (p_email_status = 'found' AND p_confidence >= 60) THEN
    RETURN 'likely_dm';
  END IF;
  
  -- Unverified: Has email but not verified
  IF p_email_status IN ('found', 'guessed') AND p_confidence >= 40 THEN
    RETURN 'unverified';
  END IF;
  
  -- Needs Review: Low confidence or issues
  IF p_confidence < 40 OR p_email_status = 'bounced' THEN
    RETURN 'needs_review';
  END IF;
  
  RETURN 'unknown';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ===========================================
-- Add quality badge column (computed on read)
-- ===========================================

-- This is computed, so we'll add it as a generated column
ALTER TABLE lead_people 
ADD COLUMN IF NOT EXISTS quality_badge TEXT 
GENERATED ALWAYS AS (
  CASE
    WHEN email_verified = TRUE AND source LIKE 'apollo%' THEN 'verified_dm'
    WHEN email_verified = TRUE OR (email_status = 'found' AND confidence_score >= 60) THEN 'likely_dm'
    WHEN email_status IN ('found', 'guessed') AND confidence_score >= 40 THEN 'unverified'
    WHEN confidence_score < 40 OR email_status = 'bounced' THEN 'needs_review'
    ELSE 'unknown'
  END
) STORED;

CREATE INDEX IF NOT EXISTS idx_lead_people_quality 
  ON lead_people(user_id, quality_badge);

-- ===========================================
-- Done
-- ===========================================

SELECT 'Email verification schema added!' as result;
