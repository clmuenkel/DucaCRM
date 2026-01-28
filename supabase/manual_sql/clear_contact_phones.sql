-- Manual cleanup: clear existing contact phones before re-enrich
-- WARNING: Run intentionally in Supabase SQL editor

-- Option A: Clear phones only (keep contacts, re-enrich will fix them)
UPDATE contacts
SET phone = NULL,
    mobile = NULL
WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Option B: Delete all contacts and start fresh
-- DELETE FROM contacts WHERE user_id = '00000000-0000-0000-0000-000000000001';
