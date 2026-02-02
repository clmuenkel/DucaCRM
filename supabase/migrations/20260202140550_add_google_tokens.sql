-- Add Google Calendar OAuth tokens to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS google_calendar_access_token TEXT;
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT;
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS google_calendar_token_expires_at TIMESTAMPTZ;
