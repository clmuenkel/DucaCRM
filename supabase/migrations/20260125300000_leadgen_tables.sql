-- LeadFlow Lead Generation Tables
-- Tables for multi-source lead pipeline (Google Places → Apollo → Scrape)

-- ============================================
-- LEAD_COMPANIES - Companies found via Places/other sources
-- ============================================
CREATE TABLE IF NOT EXISTS lead_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Google Places data
  place_id TEXT,
  
  -- Company info
  name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  phone TEXT,
  
  -- Address
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  lat DECIMAL(10, 7),
  lng DECIMAL(10, 7),
  
  -- Categorization
  industry_tag TEXT,
  business_types TEXT[] DEFAULT '{}',
  
  -- Metadata
  source TEXT DEFAULT 'google_places',
  raw_payload JSONB DEFAULT '{}',
  
  -- Enrichment status
  enrichment_status TEXT DEFAULT 'pending', -- pending, enriched, failed, skipped
  enriched_at TIMESTAMPTZ,
  
  -- Dedupe
  dedupe_key TEXT GENERATED ALWAYS AS (
    COALESCE(domain, LOWER(REPLACE(name, ' ', ''))) || ':' || COALESCE(state, '') || ':' || COALESCE(city, '')
  ) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on place_id per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_companies_place_id 
  ON lead_companies(user_id, place_id) WHERE place_id IS NOT NULL;

-- Unique constraint on dedupe_key per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_companies_dedupe 
  ON lead_companies(user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_lead_companies_user_id ON lead_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_companies_domain ON lead_companies(user_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_companies_industry ON lead_companies(user_id, industry_tag);
CREATE INDEX IF NOT EXISTS idx_lead_companies_enrichment ON lead_companies(user_id, enrichment_status);
CREATE INDEX IF NOT EXISTS idx_lead_companies_city_state ON lead_companies(user_id, state, city);

-- ============================================
-- LEAD_PEOPLE - Decision makers found via enrichment
-- ============================================
CREATE TABLE IF NOT EXISTS lead_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lead_company_id UUID NOT NULL REFERENCES lead_companies(id) ON DELETE CASCADE,
  
  -- Person info
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  
  -- Contact info
  email TEXT,
  email_status TEXT DEFAULT 'unknown', -- found, guessed, verified, bounced, unknown
  phone TEXT,
  phone_type TEXT, -- mobile, direct, office
  linkedin_url TEXT,
  
  -- Metadata
  source TEXT DEFAULT 'apollo', -- apollo, scrape, guess
  confidence_score INTEGER DEFAULT 50, -- 0-100
  raw_payload JSONB DEFAULT '{}',
  
  -- Flags
  is_decision_maker BOOLEAN DEFAULT TRUE,
  is_primary_contact BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_people_user_id ON lead_people(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_people_company ON lead_people(lead_company_id);
CREATE INDEX IF NOT EXISTS idx_lead_people_email ON lead_people(user_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_people_source ON lead_people(user_id, source);
CREATE INDEX IF NOT EXISTS idx_lead_people_confidence ON lead_people(user_id, confidence_score DESC);

-- Unique constraint: one person per email per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_people_unique_email 
  ON lead_people(lead_company_id, email) WHERE email IS NOT NULL;

-- ============================================
-- LEAD_JOBS - Job queue for async processing
-- ============================================
CREATE TABLE IF NOT EXISTS lead_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Job type
  job_type TEXT NOT NULL, -- places_search, apollo_enrich, scrape_site, verify_email
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  
  -- Payload & results
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB DEFAULT '{}',
  
  -- Error handling
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  
  -- Scheduling
  run_after TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_jobs_user_id ON lead_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_jobs_status ON lead_jobs(status, run_after);
CREATE INDEX IF NOT EXISTS idx_lead_jobs_type ON lead_jobs(user_id, job_type);

-- ============================================
-- LEAD_SEARCHES - Track search history
-- ============================================
CREATE TABLE IF NOT EXISTS lead_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Search params
  industry TEXT NOT NULL,
  location TEXT NOT NULL, -- city, state or zip
  radius_miles INTEGER DEFAULT 25,
  
  -- Results
  companies_found INTEGER DEFAULT 0,
  companies_enriched INTEGER DEFAULT 0,
  people_found INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending', -- pending, searching, enriching, completed, failed
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_searches_user_id ON lead_searches(user_id);

-- ============================================
-- ROW LEVEL SECURITY (disabled for single-user)
-- ============================================
ALTER TABLE lead_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_people DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_searches DISABLE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGERS for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_lead_companies_updated_at ON lead_companies;
CREATE TRIGGER update_lead_companies_updated_at 
  BEFORE UPDATE ON lead_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lead_people_updated_at ON lead_people;
CREATE TRIGGER update_lead_people_updated_at 
  BEFORE UPDATE ON lead_people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_lead_jobs_updated_at ON lead_jobs;
CREATE TRIGGER update_lead_jobs_updated_at 
  BEFORE UPDATE ON lead_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER: Get best decision maker for a company
-- ============================================
CREATE OR REPLACE FUNCTION get_best_lead_contact(company_uuid UUID)
RETURNS TABLE (
  person_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  confidence INTEGER
) AS $$
  SELECT 
    id as person_id,
    full_name,
    email,
    phone,
    title,
    confidence_score as confidence
  FROM lead_people
  WHERE lead_company_id = company_uuid
    AND email IS NOT NULL
  ORDER BY 
    is_primary_contact DESC,
    confidence_score DESC,
    CASE 
      WHEN LOWER(title) LIKE '%owner%' THEN 1
      WHEN LOWER(title) LIKE '%founder%' THEN 2
      WHEN LOWER(title) LIKE '%ceo%' THEN 3
      WHEN LOWER(title) LIKE '%president%' THEN 4
      ELSE 5
    END,
    created_at ASC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Done!
SELECT 'Lead generation tables created!' as result;
