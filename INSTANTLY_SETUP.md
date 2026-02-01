# Instantly.ai Setup Guide

## Overview

This guide will help you set up Instantly.ai email automation in your CRM. The configuration is done via environment variables (backend only) for security.

## Prerequisites

1. Instantly.ai account with API access
2. Instantly.ai campaign created with email sequence
3. Access to your `.env.local` file

## Step 1: Get Your Instantly API Key

1. Log in to [Instantly.ai](https://instantly.ai)
2. Go to **Settings** → **Integrations** → **API**
3. Click **Generate API Key** (V2)
4. Copy the API key (it will be a long base64-encoded string)

**Important**: The API key format should look like: `OGRkNzRiNzQtOTg4YS00NzdlLTlhNTItYjBhNjM4MzJkNjg5OlFyempVZnVucW9leA==`

## Step 2: Create a Campaign in Instantly

1. In Instantly.ai, go to **Campaigns**
2. Click **Create Campaign**
3. Name it (e.g., "Duca Outreach")
4. Configure your email sequence:
   - Email 1: Introduction email (sends immediately)
   - Email 2: Follow-up email (sends after 4 days)
   - Email 3: Breakup email (sends after 11 days)
5. Set up webhook URL: `https://duca-crm.vercel.app/api/instantly/webhook`
   - Go to Campaign Settings → Webhooks
   - Add webhook URL
   - Enable events: `email_opened`, `email_replied`, `email_bounced`
6. Save the campaign
7. **Copy the Campaign ID** (you'll need this)

## Step 3: Configure Environment Variables

### Local Development (.env.local)

1. Open your `.env.local` file in the project root
2. Add these lines (replace with your actual values):

```env
# Instantly.ai Configuration (Backend Only)
INSTANTLY_API_KEY=OGRkNzRiNzQtOTg4YS00NzdlLTlhNTItYjBhNjM4MzJkNjg5OlFyempVZnVucW9leA==
INSTANTLY_CAMPAIGN_ID=70dcbe9f-6410-4708-912e-1a5adbf15f5c
```

**CRITICAL FORMATTING RULES**:
- ❌ **NO QUOTES** around values
- ❌ **NO SPACES** around the `=` sign
- ✅ Use exact format: `KEY=value` (no quotes, no spaces)

**Wrong**:
```env
INSTANTLY_API_KEY="OGRkNzRiNzQtOTg4YS00NzdlLTlhNTItYjBhNjM4MzJkNjg5OlFyempVZnVucW9leA=="
INSTANTLY_API_KEY = OGRkNzRiNzQtOTg4YS00NzdlLTlhNTItYjBhNjM4MzJkNjg5OlFyempVZnVucW9leA==
```

**Correct**:
```env
INSTANTLY_API_KEY=OGRkNzRiNzQtOTg4YS00NzdlLTlhNTItYjBhNjM4MzJkNjg5OlFyempVZnVucW9leA==
INSTANTLY_CAMPAIGN_ID=70dcbe9f-6410-4708-912e-1a5adbf15f5c
```

### Vercel Deployment

If you're deploying to Vercel, you **MUST** also add these environment variables in the Vercel dashboard:

1. Go to your Vercel project
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - `INSTANTLY_API_KEY` = (your API key)
   - `INSTANTLY_CAMPAIGN_ID` = (your campaign ID)
4. Select **Production**, **Preview**, and **Development** environments
5. Click **Save**
6. **Redeploy** your application for changes to take effect

**Note**: `.env.local` only works locally. Vercel needs env vars in its dashboard.

## Step 4: Verify Configuration

### Method 1: Using Settings Page

1. Start your dev server: `npm run dev`
2. Go to **Settings** page in your CRM
3. Find **Instantly Campaign Status** section
4. Click **"Debug Env"** button to see if env vars are loaded
5. Click **"Verify Campaign"** button to test the connection

### Method 2: Using API Endpoints

**Check environment variables**:
```bash
curl http://localhost:3000/api/instantly/debug-env
```

**Verify campaign**:
```bash
curl http://localhost:3000/api/instantly/verify-campaign
```

### Expected Results

**Debug Env should show**:
```json
{
  "hasApiKey": true,
  "apiKeyLength": 88,
  "hasCampaignId": true,
  "campaignId": "70dcbe9f-6410-4708-912e-1a5adbf15f5c",
  "apiKeyHasQuotes": false,
  "campaignIdHasQuotes": false
}
```

**Verify Campaign should show**:
```json
{
  "valid": true,
  "campaign": {
    "id": "70dcbe9f-6410-4708-912e-1a5adbf15f5c",
    "name": "Duca Outreach",
    "status": "active"
  }
}
```

## Step 5: Test Email Sending

1. Go to **Work Queue**
2. Select a contact with an email address
3. Click **"Start Cadence"**
4. Check:
   - Contact moves to top table
   - Success message shows email count
   - Check Instantly dashboard - lead should appear
   - Email should be sent within a few minutes

## Troubleshooting

### Issue: "API key or campaign ID not configured in .env.local"

**Possible causes**:
1. Server not restarted after adding env vars
   - **Fix**: Stop server (Ctrl+C) and restart: `npm run dev`
2. Wrong file location
   - **Fix**: `.env.local` must be in project root (same folder as `package.json`)
3. Formatting issues (quotes, spaces)
   - **Fix**: Remove all quotes and spaces around `=`
4. Typo in variable names
   - **Fix**: Check exact spelling: `INSTANTLY_API_KEY` and `INSTANTLY_CAMPAIGN_ID`

**Debug steps**:
1. Click **"Debug Env"** button in Settings
2. Check if `hasApiKey` and `hasCampaignId` are `true`
3. If `false`, check `.env.local` format
4. Restart server and try again

### Issue: "Campaign not found or API error"

**Possible causes**:
1. Wrong Campaign ID
   - **Fix**: Double-check Campaign ID in Instantly dashboard
2. Campaign doesn't exist
   - **Fix**: Create campaign in Instantly first
3. API key doesn't have permissions
   - **Fix**: Regenerate API key in Instantly
4. API key is wrong
   - **Fix**: Copy API key again from Instantly

**Debug steps**:
1. Verify Campaign ID in Instantly dashboard matches `.env.local`
2. Test API key manually:
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
        https://api.instantly.ai/api/v2/campaigns
   ```
3. Check Instantly dashboard for campaign status

### Issue: "API key appears to have quotes"

**Fix**: Remove quotes from `.env.local`:
```env
# Wrong
INSTANTLY_API_KEY="your_key"

# Correct
INSTANTLY_API_KEY=your_key
```

### Issue: Emails not sending

**Check**:
1. Campaign is active in Instantly
2. Email sequence is configured
3. Contact has valid email address
4. Check Instantly dashboard for lead status
5. Check browser console for errors
6. Check server logs for Instantly API errors

### Issue: Env vars work locally but not on Vercel

**Fix**: Add env vars to Vercel dashboard:
1. Go to Vercel project → Settings → Environment Variables
2. Add `INSTANTLY_API_KEY` and `INSTANTLY_CAMPAIGN_ID`
3. Redeploy application

## Common Mistakes

1. ❌ Adding quotes around values in `.env.local`
2. ❌ Adding spaces around `=` sign
3. ❌ Not restarting server after adding env vars
4. ❌ Using wrong Campaign ID (copying wrong campaign)
5. ❌ Forgetting to add env vars to Vercel (if deployed)
6. ❌ Using V1 API key instead of V2
7. ❌ Campaign not active in Instantly

## Verification Checklist

- [ ] API key copied from Instantly (V2)
- [ ] Campaign created in Instantly
- [ ] Campaign ID copied
- [ ] Webhook URL configured in Instantly
- [ ] `.env.local` has correct format (no quotes, no spaces)
- [ ] Server restarted after adding env vars
- [ ] "Debug Env" shows env vars loaded
- [ ] "Verify Campaign" shows campaign found
- [ ] Test email sending works
- [ ] Lead appears in Instantly dashboard
- [ ] If on Vercel, env vars added to Vercel dashboard

## Support

If you're still having issues:
1. Check server console logs for detailed errors
2. Use "Debug Env" button to see what's loaded
3. Verify format in `.env.local` matches examples above
4. Test API key manually with curl command
5. Check Instantly dashboard for campaign status
