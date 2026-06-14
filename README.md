# personal-os

A single-page personal dashboard. Password-gated, self-hosted, built for one.

![dashboard mockup](design/mockup.html)

## Widgets

| Widget | What it does |
|---|---|
| **Today's Tasks** | Tasks scoped to today/this week, pulled from Supabase |
| **Calendar** | 7-day strip synced from a Google Calendar iCal feed |
| **Job Search** | CRM-style tracker for job applications |
| **Habit Tracker** | Configurable daily habits with multi-level completion |

## Stack

- **Next.js** (App Router) — frontend + API routes
- **Supabase** — Postgres database, accessed via service role key from API routes
- **Vercel** — deployment
- Password-based auth gate (no OAuth, no accounts — just a shared secret)

## Setup

### 1. Database

Run `app-src/supabase/migrations/0001_init.sql` in your Supabase project's SQL editor. It creates the `tasks`, `entities`, `daily_logs`, `habit_config`, and `audit_logs` tables with RLS enabled (all access goes through the service role key in API routes).

### 2. Environment variables

```bash
cp app-src/.env.local.example app-src/.env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=      # from your Supabase project dashboard
SUPABASE_ANON_KEY=             # from Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=     # from Supabase → Settings → API

AUTH_SECRET=                   # openssl rand -hex 32
DASHBOARD_PASSWORD=            # whatever you want to type at login
API_SECRET=                    # openssl rand -hex 16

GOOGLE_CALENDAR_ICAL_URL=      # Calendar settings → "Secret address in iCal format" (optional)

USER_TIMEZONE=America/Los_Angeles
USER_ID=yourname
```

### 3. Run locally

```bash
cd app-src
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login` on first visit.

### 4. Deploy

Push to GitHub and import into Vercel. Add the environment variables from step 2 in the Vercel dashboard under Settings → Environment Variables.

## Project structure

```
app-src/
  app/
    api/          # API routes (auth, tasks, habits, calendar)
    login/        # Login page
    tasks/        # Full task list view
  components/     # Dashboard widgets
  lib/            # Supabase client, auth helpers
  supabase/
    migrations/   # DB schema
design/
  mockup.html     # Original HTML mockup
```
