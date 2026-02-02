# Resend Setup Guide

## Overview

This guide will help you set up Resend email automation in your CRM. The configuration is done via environment variables (backend only) for security.

## Prerequisites

1. Resend account with API access
2. Verified domain in Resend
3. Access to your `.env.local` file

## Step 1: Sign Up for Resend

1. Go to [resend.com](https://resend.com)
2. Sign up for an account
3. Verify your email address

## Step 2: Get Your API Key

1. Log in to [Resend Dashboard](https://resend.com/api-keys)
2. Go to **API Keys**
3. Click **Create API Key**
4. Give it a name (e.g., "CRM Production")
5. Copy the API key (it will start with `re_`)

**Important**: The API key format should look like: `re_xxxxxxxxxxxxx`

## Step 3: Verify Your Domain

1. In Resend Dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records provided by Resend:
   - **SPF Record**: Add to your DNS
   - **DKIM Records**: Add 3 CNAME records to your DNS
5. Wait for verification (usually takes a few minutes)
6. Once verified, you can send emails from addresses on that domain

## Step 4: Configure Webhook

1. In Resend Dashboard, go to **Webhooks**
2. Click **Add Webhook**
3. Enter the webhook URL: `https://duca-crm.vercel.app/api/resend/webhook`
   - For local development: `http://localhost:3000/api/resend/webhook`
4. Select the following events:
   - `email.sent` - Track when emails are sent
   - `email.delivered` - Track delivery
   - `email.opened` - Track email opens
   - `email.clicked` - Track link clicks
   - `email.replied` - Track replies (stops cadence)
   - `email.bounced` - Track bounces
   - `email.complained` - Track spam complaints
5. Save the webhook

## Step 5: Configure Environment Variables

### Local Development (.env.local)

1. Open your `.env.local` file in the project root
2. Add these lines (replace with your actual values):

```env
# Resend Configuration (Backend Only)
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=sales@yourdomain.com
```

**CRITICAL FORMATTING RULES**:
- ❌ **NO QUOTES** around values
- ❌ **NO SPACES** around the `=` sign
- ✅ Use exact format: `KEY=value` (no quotes, no spaces)

**Wrong**:
```env
RESEND_API_KEY="re_xxxxxxxxxxxxx"
RESEND_FROM_EMAIL = sales@yourdomain.com
```

**Correct**:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=sales@yourdomain.com
```

### Vercel Deployment

If you're deploying to Vercel, you **MUST** also add these environment variables in the Vercel dashboard:

1. Go to your Vercel project
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - `RESEND_API_KEY` = (your API key)
   - `RESEND_FROM_EMAIL` = (your from email, e.g., `sales@yourdomain.com`)
4. Select **Production**, **Preview**, and **Development** environments
5. Click **Save**
6. **Redeploy** your application for changes to take effect

**Note**: `.env.local` only works locally. Vercel needs env vars in its dashboard.

## Step 6: Test Email Sending

1. Go to **Work Queue**
2. Select a contact with an email address
3. Click **"Start Cadence"**
4. Check:
   - Contact moves to top table
   - Email appears in Resend dashboard under **Emails**
   - Contact record updated with `resend_email_id`

## Step 7: Verify Webhook

1. Send a test email to yourself
2. Open the email (this triggers `email.opened` webhook)
3. Check your CRM:
   - Contact's `email_opened` should be `true`
   - `email_open_count` should increment
   - Activity log should show `resend_email_opened` event

## Troubleshooting

### Emails Not Sending

1. **Check API Key**: Verify `RESEND_API_KEY` is set correctly in `.env.local` and Vercel
2. **Check From Email**: Verify `RESEND_FROM_EMAIL` matches a verified domain in Resend
3. **Check Domain Verification**: Ensure your domain is verified in Resend dashboard
4. **Check Resend Dashboard**: Look for error messages in the Resend dashboard

### Webhooks Not Working

1. **Check Webhook URL**: Verify the webhook URL is correct in Resend dashboard
2. **Check Vercel Deployment**: Ensure your latest code is deployed
3. **Check Webhook Events**: Ensure all required events are enabled
4. **Check Logs**: Check Vercel logs for webhook errors

### Email Delivery Issues

1. **Check SPF/DKIM**: Ensure DNS records are correctly configured
2. **Check Domain Reputation**: New domains may need warmup
3. **Check Bounce Rate**: High bounce rates can affect deliverability
4. **Check Resend Dashboard**: Look for delivery errors or warnings

## Email Limits

Resend free tier includes:
- 3,000 emails/month
- 100 emails/day

For production use, consider upgrading to a paid plan.

## Best Practices

1. **Use Verified Domains**: Always send from verified domains
2. **Monitor Bounce Rate**: Keep bounce rate below 5%
3. **Warm Up New Domains**: Gradually increase sending volume
4. **Use Reply-To**: Set a reply-to address for better deliverability
5. **Monitor Webhooks**: Check webhook delivery in Resend dashboard

## Support

- Resend Documentation: https://resend.com/docs
- Resend Support: support@resend.com
- CRM Issues: Check Vercel logs and database
