-- Work Queue Redesign & Power Dialer Quick Actions Migration
-- Adds fields for wrong number tracking, meeting scheduling, and call attempt tracking

-- ============================================
-- ADD COLUMNS TO CONTACTS TABLE
-- ============================================

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS wrong_number_flag BOOLEAN DEFAULT FALSE;

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS wrong_number_phone TEXT;

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS last_call_attempt_date DATE;

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS meeting_scheduling_status TEXT DEFAULT 'none' 
  CHECK (meeting_scheduling_status IN ('none', 'link_sent', 'scheduled'));

ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS scheduling_link_sent_at TIMESTAMPTZ;

-- ============================================
-- CREATE MEETING SCHEDULING QUEUE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_scheduling_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  scheduling_link_sent_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'expired')),
  calendar_event_id TEXT, -- for future Gmail Calendar integration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contacts_wrong_number 
  ON contacts(user_id, wrong_number_flag) WHERE wrong_number_flag = TRUE;

CREATE INDEX IF NOT EXISTS idx_contacts_last_call_attempt 
  ON contacts(user_id, last_call_attempt_date) WHERE last_call_attempt_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_meeting_scheduling 
  ON contacts(user_id, meeting_scheduling_status) WHERE meeting_scheduling_status != 'none';

CREATE INDEX IF NOT EXISTS idx_scheduling_queue_user 
  ON meeting_scheduling_queue(user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduling_queue_contact 
  ON meeting_scheduling_queue(contact_id);

-- ============================================
-- TRIGGER: Update meeting_scheduling_queue updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_scheduling_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scheduling_queue_updated_at ON meeting_scheduling_queue;
CREATE TRIGGER trigger_scheduling_queue_updated_at
  BEFORE UPDATE ON meeting_scheduling_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduling_queue_updated_at();

-- ============================================
-- DISABLE RLS FOR SINGLE-USER MODE
-- ============================================

ALTER TABLE meeting_scheduling_queue DISABLE ROW LEVEL SECURITY;

SELECT 'Work queue updates migration completed!' as result;
