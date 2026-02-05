# Vercel Deployment Setup

## Environment Variables

Add these environment variables in your Vercel project settings:

### InsForge Configuration
```
NEXT_PUBLIC_INSFORGE_BASE_URL=https://ynq36v7w.eu-central.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=<your-anon-key>
```

To get your anon key, you can:
1. Use the InsForge MCP tool: `get-anon-key`
2. Or get it from your InsForge dashboard

### Optional: Server-side (if needed)
```
INSFORGE_BASE_URL=https://ynq36v7w.eu-central.insforge.app
INSFORGE_ANON_KEY=<your-anon-key>
```

### Other Environment Variables
Make sure to also set:
- `RESEND_API_KEY` - For email sending
- `RESEND_FROM_EMAIL` - Email address for sending
- `TWILIO_*` - If using Twilio integration
- `CRON_SECRET` - For securing cron jobs (optional but recommended)

## Deployment Steps

1. **Connect Repository to Vercel**
   - Go to https://vercel.com
   - Import your Git repository
   - Vercel will auto-detect Next.js

2. **Add Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all variables listed above
   - Make sure to add them for Production, Preview, and Development

3. **Deploy**
   - Push to your main branch or use Vercel CLI:
   ```bash
   vercel --prod
   ```

## Cron Jobs

The following cron jobs are configured in `vercel.json`:
- `/api/email-queue/process` - Runs daily at 9 AM
- `/api/cadence/send-follow-up` - Runs daily at 10 AM  
- `/api/cadence/advance` - Runs daily at 11 AM

Make sure `CRON_SECRET` is set if you want to secure these endpoints.

## Notes

- The app uses `NEXT_PUBLIC_` prefix for client-side access to InsForge
- For single-user CRM mode, authentication is handled via `DEFAULT_USER_ID`
- All database operations now go through InsForge instead of Supabase
