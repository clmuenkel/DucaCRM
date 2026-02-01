# Testing Guide - Cadence System

## Manual Testing Checklist

### Prerequisites
- ✅ Instantly API key configured in `.env.local`
- ✅ Instantly Campaign ID configured in `.env.local`
- ✅ Campaign created in Instantly UI with email sequence
- ✅ Webhook URL configured in Instantly: `https://duca-crm.vercel.app/api/instantly/webhook`

### Test 1: Create Test Contact
1. ✅ Call `POST /api/contacts/create-test` or create manually:
   - Name: Carl-Luca Muenkel
   - Email: 18cmuenkel@gmail.com
   - Company: Test Company
   - Industry: HVAC
   - Status: Active
2. ✅ Verify contact appears in "All Contacts" bottom table in Work Queue
3. ✅ Verify contact has no `cadence_status` (should be NULL or "none")

### Test 2: Start Cadence
1. ✅ Go to Work Queue page
2. ✅ Select test contact from bottom table
3. ✅ Click "Start Cadence" button
4. ✅ Verify success message shows:
   - Number of contacts started
   - Number of emails sent to Instantly
   - Any errors (should be 0)
5. ✅ Verify contact **immediately** moves to top table "Active Cadence"
6. ✅ Verify contact shows:
   - `next_action_type` badge (should be "Email" - blue)
   - Step name (should be "Email 1")
   - Correct priority score

### Test 3: Verify Email Sent
1. ✅ Check Instantly dashboard
   - Lead should appear in campaign
   - Status should be "Active" or "Sent"
2. ✅ Check contact in CRM:
   - `instantly_lead_id` should be set
   - `last_email_sent_at` should be set
   - `cadence_status` should be "active"
   - `next_action_type` should be "email"
   - `cadence_step` should be 0

### Test 4: Campaign Verification
1. ✅ Go to Settings page
2. ✅ Find "Instantly Campaign Status" section
3. ✅ Click "Verify Campaign" button
4. ✅ Verify shows:
   - Green badge: "Campaign Verified"
   - Campaign name and status
5. ✅ If invalid, check:
   - Campaign ID in `.env.local` matches Instantly
   - API key is correct
   - Campaign exists in Instantly

### Test 5: Error Scenarios

#### 5.1 Contact Without Email
1. ✅ Create contact without email address
2. ✅ Start cadence
3. ✅ Verify:
   - Cadence starts successfully
   - Contact moves to top table
   - No email sent (but no error)
   - Stats show 0 emails sent

#### 5.2 Invalid Campaign ID
1. ✅ Set wrong `INSTANTLY_CAMPAIGN_ID` in `.env.local`
2. ✅ Restart server
3. ✅ Start cadence
4. ✅ Verify:
   - Error message shows in toast
   - Stats show errors > 0
   - Contact still moves to top table (cadence started)
   - No email sent

#### 5.3 Missing API Key
1. ✅ Remove `INSTANTLY_API_KEY` from `.env.local`
2. ✅ Restart server
3. ✅ Start cadence
4. ✅ Verify:
   - Cadence starts (no email sent)
   - No errors (graceful degradation)
   - Contact moves to top table

### Test 6: Multiple Contacts
1. ✅ Select 3-5 contacts from bottom table
2. ✅ Start cadence for all
3. ✅ Verify:
   - All contacts move to top table
   - Success message shows correct counts
   - All emails sent (if contacts have emails)
   - No errors

### Test 7: Webhook Events
1. ✅ Check Instantly webhook is configured
2. ✅ Wait for email to be sent
3. ✅ Check webhook receives events:
   - `email_opened` - updates `email_opened` and `email_open_count`
   - `email_replied` - updates `email_replied` and pauses cadence
4. ✅ Verify contact updates in CRM

## Automated Testing

### Run Test Script
```bash
# Set base URL (default: http://localhost:3000)
export BASE_URL=http://localhost:3000

# Run test script
./scripts/test-cadence-flow.sh
```

### Expected Output
- ✅ Test contact created
- ✅ Cadence started
- ✅ Campaign verified

## Common Issues

### Issue: Contact doesn't appear in top table
**Check:**
- `cadence_status` = "active" in database
- Query doesn't have restrictive filters
- Browser console for errors
- Network tab for API errors

### Issue: Email not sent
**Check:**
- Instantly API key is correct
- Campaign ID matches Instantly
- Contact has email address
- Campaign is active in Instantly
- Browser console for API errors
- Server logs for Instantly API errors

### Issue: Campaign verification fails
**Check:**
- Campaign ID in `.env.local` matches Instantly
- API key is correct and has permissions
- Campaign exists in Instantly
- Network connectivity

## Database Verification

### Check Contact State
```sql
SELECT 
  id,
  first_name,
  last_name,
  email,
  cadence_status,
  cadence_step,
  next_action_type,
  next_action_date,
  instantly_lead_id,
  last_email_sent_at
FROM contacts
WHERE email = '18cmuenkel@gmail.com';
```

### Expected After Starting Cadence
- `cadence_status` = 'active'
- `cadence_step` = 0
- `next_action_type` = 'email'
- `next_action_date` = today's date
- `instantly_lead_id` = not null (if email sent)
- `last_email_sent_at` = timestamp (if email sent)

## Success Criteria

✅ All tests pass
✅ No console errors
✅ No silent failures
✅ Clear error messages
✅ Contacts appear in correct tables
✅ Emails sent successfully
✅ Webhook events processed
