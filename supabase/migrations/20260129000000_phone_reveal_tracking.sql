-- Phone Reveal Request Tracking
-- Tracks pending phone number reveal requests sent to Apollo via webhook

CREATE TABLE IF NOT EXISTS phone_reveal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  apollo_id TEXT NOT NULL,
  
  -- Request details
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Result (filled by webhook)
  mobile_number TEXT,
  phone_numbers JSONB, -- Full array from Apollo for debugging
  
  -- Metadata
  webhook_url TEXT,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up by apollo_id (webhook matching)
CREATE INDEX idx_phone_reveal_apollo_id ON phone_reveal_requests(apollo_id);

-- Index for finding pending requests
CREATE INDEX idx_phone_reveal_pending ON phone_reveal_requests(status, requested_at) 
  WHERE status = 'pending';

-- Index for user queries
CREATE INDEX idx_phone_reveal_user ON phone_reveal_requests(user_id, created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_phone_reveal_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER phone_reveal_updated_at
  BEFORE UPDATE ON phone_reveal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_phone_reveal_timestamp();

-- Auto-expire old pending requests (run via cron or manually)
-- Requests older than 1 hour are likely failed
CREATE OR REPLACE FUNCTION expire_old_phone_requests()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE phone_reveal_requests
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND requested_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE phone_reveal_requests IS 'Tracks phone reveal requests sent to Apollo via webhook';
COMMENT ON COLUMN phone_reveal_requests.apollo_id IS 'Apollo person ID used to match webhook responses';
COMMENT ON COLUMN phone_reveal_requests.status IS 'pending=waiting for webhook, completed=got phone, failed=error, expired=timed out';
