-- Replace Instantly with Resend Migration
-- Removes instantly_lead_id and adds resend_email_id column

-- Remove instantly_lead_id column
ALTER TABLE contacts DROP COLUMN IF EXISTS instantly_lead_id;

-- Add resend_email_id column
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS resend_email_id TEXT;

-- Add index for resend_email_id lookups (optional, but useful for webhook lookups)
CREATE INDEX IF NOT EXISTS idx_contacts_resend_email_id ON contacts(resend_email_id) WHERE resend_email_id IS NOT NULL;
