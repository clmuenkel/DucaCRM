-- CRM deduplication and lead counters

-- Remove duplicate contacts by email (keep most recent)
WITH ranked_contacts AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, LOWER(email)
      ORDER BY created_at DESC
    ) AS rn
  FROM contacts
  WHERE email IS NOT NULL
)
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM ranked_contacts WHERE rn > 1
);

-- Remove duplicate companies by domain (keep most recent)
WITH ranked_companies AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, LOWER(domain)
      ORDER BY updated_at DESC
    ) AS rn
  FROM companies
  WHERE domain IS NOT NULL
)
DELETE FROM companies
WHERE id IN (
  SELECT id FROM ranked_companies WHERE rn > 1
);

-- Unique indexes to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_email
  ON contacts(user_id, LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_unique_domain
  ON companies(user_id, LOWER(domain))
  WHERE domain IS NOT NULL;

-- Lead counters view
CREATE OR REPLACE VIEW lead_counts AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status = 'active') AS total_leads,
  COUNT(*) FILTER (
    WHERE status = 'active'
      AND (cadence_status IS NULL OR cadence_status = 'none')
  ) AS to_bework
FROM contacts
GROUP BY user_id;

SELECT 'CRM dedupe constraints and lead counts view created!' as result;
