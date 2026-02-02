-- Add industries array field to contacts and companies tables
-- Supports multiple industries per company (e.g., plumbing, hvac, roofing)

-- Add industries array field to contacts table
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS industries TEXT[] DEFAULT '{}';

-- Add industries array field to companies table  
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS industries TEXT[] DEFAULT '{}';

-- Migrate existing industry data to industries array
UPDATE contacts 
SET industries = ARRAY[industry] 
WHERE industry IS NOT NULL AND industries = '{}';

UPDATE companies
SET industries = ARRAY[industry]
WHERE industry IS NOT NULL AND industries = '{}';

-- Create GIN index for efficient array searches
CREATE INDEX IF NOT EXISTS idx_contacts_industries 
  ON contacts USING GIN(industries);

CREATE INDEX IF NOT EXISTS idx_companies_industries
  ON companies USING GIN(industries);
