-- Clear email_queue and reset all active cadences
-- Run this in Supabase SQL Editor

-- Clear all email_queue entries
DELETE FROM email_queue
WHERE user_id = '00000000-0000-0000-0000-000000000000';

-- Reset all active cadences
UPDATE contacts
SET 
  cadence_status = NULL,
  cadence_step = NULL,
  cadence_outcome = NULL,
  next_action_date = NULL,
  next_action_type = NULL,
  cadence_day_started = NULL,
  cadence_started_at = NULL
WHERE 
  user_id = '00000000-0000-0000-0000-000000000000'
  AND cadence_status = 'active';

-- Show results
SELECT 
  (SELECT COUNT(*) FROM email_queue WHERE user_id = '00000000-0000-0000-0000-000000000000') as remaining_queue_entries,
  (SELECT COUNT(*) FROM contacts WHERE user_id = '00000000-0000-0000-0000-000000000000' AND cadence_status = 'active') as remaining_active_cadences;
