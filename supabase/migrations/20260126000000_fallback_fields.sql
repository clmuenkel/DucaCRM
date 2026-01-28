-- Add fallback fields to lead_companies for when DM info is not available
-- This ensures every company has SOME contact info even if Apollo doesn't find decision makers

-- Add fallback contact fields
ALTER TABLE lead_companies 
  ADD COLUMN IF NOT EXISTS fallback_email TEXT,
  ADD COLUMN IF NOT EXISTS fallback_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'pending'; -- dm, fallback, pending

-- contact_type values:
-- 'dm' = Decision maker found (has lead_people with high confidence)
-- 'fallback' = Using company-level contact (info@domain + company phone)
-- 'pending' = Not yet enriched

-- Add index for filtering by contact type
CREATE INDEX IF NOT EXISTS idx_lead_companies_contact_type 
  ON lead_companies(user_id, contact_type);

-- Update existing companies to have fallback values
-- For companies that have a domain, set fallback_email to info@domain
UPDATE lead_companies 
SET 
  fallback_email = CONCAT('info@', domain),
  fallback_phone = phone
WHERE domain IS NOT NULL 
  AND fallback_email IS NULL;

-- For companies without domain but with phone, just set fallback_phone
UPDATE lead_companies 
SET fallback_phone = phone
WHERE fallback_phone IS NULL 
  AND phone IS NOT NULL;

-- Create a function to get the best contact info for a company
-- Returns DM info if available, otherwise fallback
CREATE OR REPLACE FUNCTION get_company_best_contact(company_uuid UUID)
RETURNS TABLE (
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_title TEXT,
  contact_type TEXT,
  confidence INTEGER
) AS $$
DECLARE
  dm_record RECORD;
  company_record RECORD;
BEGIN
  -- First try to get a decision maker
  SELECT 
    lp.full_name,
    lp.email,
    lp.phone,
    lp.title,
    lp.confidence_score
  INTO dm_record
  FROM lead_people lp
  WHERE lp.lead_company_id = company_uuid
    AND lp.email IS NOT NULL
  ORDER BY 
    lp.is_primary_contact DESC,
    lp.confidence_score DESC
  LIMIT 1;

  IF dm_record.email IS NOT NULL THEN
    -- Return DM info
    RETURN QUERY SELECT 
      dm_record.full_name::TEXT,
      dm_record.email::TEXT,
      COALESCE(dm_record.phone, (SELECT lc.fallback_phone FROM lead_companies lc WHERE lc.id = company_uuid))::TEXT,
      dm_record.title::TEXT,
      'dm'::TEXT,
      dm_record.confidence_score::INTEGER;
  ELSE
    -- Return fallback info
    SELECT 
      lc.name,
      lc.fallback_email,
      lc.fallback_phone
    INTO company_record
    FROM lead_companies lc
    WHERE lc.id = company_uuid;

    RETURN QUERY SELECT 
      company_record.name::TEXT,
      company_record.fallback_email::TEXT,
      company_record.fallback_phone::TEXT,
      'Owner'::TEXT,
      'fallback'::TEXT,
      20::INTEGER; -- Low confidence for fallback
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Done!
SELECT 'Fallback fields added to lead_companies!' as result;
