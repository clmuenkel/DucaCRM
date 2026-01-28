# LeadFlow - Home Services Lead Generation CRM

A personal CRM and lead generation system designed for cold calling home services companies (HVAC, plumbing, roofing, electrical, solar, general contractors). Built with Next.js 14, Supabase, and Tailwind CSS.

## Features

- **Multi-Source Lead Generation**: Find home services companies via Google Places, enrich with Apollo
- **Apollo Integration**: Import leads directly from Apollo with industry/employee filters
- **Power Dialer**: Click-to-call via Google Voice with call timer, notes, and outcome logging
- **Pipeline Management**: Kanban board to track leads through stages (Fresh → Won)
- **Task Management**: Follow-ups, reminders, and action items linked to contacts
- **Email Templates**: Create and use templates with variable substitution
- **Dashboard**: Track daily calls, meetings booked, and pipeline overview
- **Command Palette**: Quick navigation with ⌘K

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: React Query + Zustand

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Apollo account (for lead enrichment)
- Google Places API key (for lead sourcing)

### Setup

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Set up Supabase**:
   - Create a new project at [supabase.com](https://supabase.com)
   - Go to SQL Editor and run the migration in `supabase/migrations/complete_single_user_schema.sql`
   - Then run incremental migrations in timestamp order
   - Get your project URL and anon key from Project Settings → API

3. **Configure environment variables**:
   Create `.env.local` with your credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   APOLLO_API_KEY=your-apollo-key
   GOOGLE_PLACES_API_KEY=your-places-key
   WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io   # For mobile phone reveals
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)**

### Apollo Setup

1. Get your Apollo API key from Apollo Settings → API
2. Add it in Settings or set it in `.env.local`

### Mobile Phone Reveals (ngrok Setup)

Apollo requires a webhook to deliver mobile phone numbers. To enable this:

1. **Install ngrok**:
   - Download from [ngrok.com/download](https://ngrok.com/download)
   - Create a free account at ngrok.com
   - Copy your authtoken from the ngrok dashboard

2. **Run ngrok** (in a separate terminal):
   ```bash
   ngrok http 3000
   ```
   You'll see a URL like `https://abc123.ngrok.io`

3. **Add the webhook URL to `.env.local`**:
   ```
   WEBHOOK_BASE_URL=https://abc123.ngrok.io
   ```

4. **How it works**:
   - When you extract leads, Apollo receives your webhook URL
   - Apollo sends mobile phone numbers to `/api/apollo/webhook` 2-5 minutes later
   - The webhook automatically updates your contacts with mobile numbers

**Note**: The ngrok URL changes each time you restart ngrok. Update `.env.local` accordingly.

## Usage

### Lead Generation Pipeline

1. Go to **Lead Gen** page
2. Select industry (HVAC, Plumbing, Roofing, Electrical, Solar, General Contractor)
3. Enter target location (city/state)
4. Click **Find Companies** to search via Google Places
5. Click **Enrich** to find decision makers via Apollo
6. Export leads to CSV or push to your CRM

### Target Audience

- **Industries**: HVAC, plumbing, roofing, electrical, solar, general contractors
- **Company Size**: 10-50 employees
- **Decision Makers**: Owners, CEOs, Founders, Presidents
- **Location**: USA

### Power Dialer

1. Go to **Power Dialer**
2. Click **Start Calling Session**
3. Click **Dial** to initiate call via Google Voice
4. Take notes during the call
5. Select outcome and disposition
6. Click **Save & Next** to move to the next contact

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ⌘K | Open command palette |
| D | Dial (in dialer) |
| C | Copy phone number |
| S | Skip contact |
| Enter | Save and next |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/       # Main app pages
│   └── api/               # API routes
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── contacts/          # Contact components
│   ├── dialer/            # Power dialer components
│   ├── dashboard/         # Dashboard widgets
│   ├── pipeline/          # Kanban board
│   ├── tasks/             # Task management
│   ├── emails/            # Email templates
│   └── layout/            # Sidebar, header
├── hooks/                 # React Query hooks
├── lib/
│   ├── supabase/          # Supabase clients
│   └── apollo/            # Apollo API client
├── stores/                # Zustand stores
└── types/                 # TypeScript types
```

## Database Schema

Key tables:
- `contacts` - Contact information with Apollo data
- `companies` - Company records
- `lead_companies` - Companies sourced from Google Places
- `lead_people` - Decision makers found via enrichment
- `calls` - Call logs with outcomes and notes
- `tasks` - Follow-ups and action items
- `email_templates` - Reusable email templates
- `activity_log` - Timeline of all activities

See `supabase/migrations/complete_single_user_schema.sql` for the full schema.

## Deployment

1. Push to GitHub
2. Connect to [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

## License

MIT
