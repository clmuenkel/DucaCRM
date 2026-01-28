-- Fresh Start: Clear all contact and company data
-- Run this in Supabase SQL Editor to wipe the slate clean

-- Clear activity and interaction data first (foreign key dependencies)
DELETE FROM activity_log WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM calls WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM emails WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM notes WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM tasks WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM meetings WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM meeting_notes WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM dialer_drafts WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Clear contacts and companies
DELETE FROM contacts WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM companies WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Clear lead staging tables
DELETE FROM lead_people WHERE user_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM lead_companies WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Verify cleanup
SELECT 'contacts' as table_name, COUNT(*) as remaining FROM contacts WHERE user_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'companies', COUNT(*) FROM companies WHERE user_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'lead_people', COUNT(*) FROM lead_people WHERE user_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'lead_companies', COUNT(*) FROM lead_companies WHERE user_id = '00000000-0000-0000-0000-000000000001';
