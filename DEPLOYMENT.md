# 🚀 Deployment Guide

## Git Push ✅

Your code has been pushed to GitHub:
- Repository: `https://github.com/clmuenkel/DucaCRM.git`
- Branch: `telnyx-integration`
- Commits: Migration to InsForge completed

## Vercel Deployment

### Option 1: Via Vercel Dashboard (Recommended)

1. **Go to [Vercel Dashboard](https://vercel.com)**
2. **Import Project**
   - Click "Add New" → "Project"
   - Import from GitHub: `clmuenkel/DucaCRM`
   - Select the `telnyx-integration` branch
3. **Configure Project**
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)
4. **Add Environment Variables**
   Click "Environment Variables" and add:
   ```
   NEXT_PUBLIC_INSFORGE_BASE_URL=https://ynq36v7w.eu-central.insforge.app
   NEXT_PUBLIC_INSFORGE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDk1Mjd9.YYOZwHNFmVJ2DSPKx3UpPkxjiYPaDCpPPV-8y_y8kwo
   ```
   
   Also add any other variables you need:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `TWILIO_*` (if using Twilio)
   - `CRON_SECRET` (optional, for securing cron jobs)
5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live!

### Option 2: Via Vercel CLI

If you prefer using the command line:

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Link project (first time only)
vercel link

# Deploy to production
npm run deploy
# or
vercel --prod
```

Or use the deployment script:
```bash
./scripts/deploy-vercel.sh
```

### Option 3: Automatic Deployments

Once connected via dashboard, Vercel will automatically deploy:
- **Production**: Every push to your main branch
- **Preview**: Every push to other branches (like `telnyx-integration`)

## Environment Variables Checklist

Make sure these are set in Vercel for **Production**, **Preview**, and **Development**:

- [x] `NEXT_PUBLIC_INSFORGE_BASE_URL`
- [x] `NEXT_PUBLIC_INSFORGE_ANON_KEY`
- [ ] `RESEND_API_KEY` (if using email)
- [ ] `RESEND_FROM_EMAIL` (if using email)
- [ ] `TWILIO_ACCOUNT_SID` (if using Twilio)
- [ ] `TWILIO_AUTH_TOKEN` (if using Twilio)
- [ ] `CRON_SECRET` (optional, for cron security)

## Cron Jobs

Your `vercel.json` is configured with these cron jobs:
- `/api/email-queue/process` - Daily at 9 AM
- `/api/cadence/send-follow-up` - Daily at 10 AM
- `/api/cadence/advance` - Daily at 11 AM

These will run automatically once deployed. Make sure `CRON_SECRET` is set if you want to secure them.

## Post-Deployment

After deployment:

1. **Test the app**
   - Visit your Vercel URL
   - Try uploading a CSV file
   - Verify data is stored in InsForge

2. **Check logs**
   - Go to Vercel Dashboard → Your Project → Logs
   - Monitor for any errors

3. **Set up custom domain** (optional)
   - Vercel Dashboard → Settings → Domains
   - Add your custom domain

## Troubleshooting

### Build Fails
- Check that all environment variables are set
- Verify `NEXT_PUBLIC_INSFORGE_ANON_KEY` is correct
- Check build logs in Vercel dashboard

### Runtime Errors
- Check Vercel function logs
- Verify InsForge connection
- Ensure database schema is set up correctly

### Environment Variables Not Working
- Make sure variables are set for the correct environment (Production/Preview/Development)
- Variables starting with `NEXT_PUBLIC_` are exposed to the browser
- Restart deployment after adding new variables

---

**Your code is pushed to GitHub and ready for Vercel deployment! 🎉**
