# personal-os

A single-page personal dashboard. Password-gated, self-hosted, built for one.

[View design mockup](design/mockup.html)

## Widgets

| Widget | What it does |
|---|---|
| **Today's Tasks** | Tasks scoped to today/this week, pulled from Supabase |
| **Calendar** | 7-day strip synced from a Google Calendar iCal feed |
| **Job Search** | Daily prep checklist (LeetCode/system-design rhythm + application-wave milestones), stored in localStorage |
| **Habit Tracker** | Configurable daily habits with multi-level completion |

## Stack

Next.js (App Router) for the frontend and API routes, Supabase for Postgres (accessed server-side via the service role key), and Vercel for deployment. Auth is a single shared password with no OAuth or user accounts.

## Setup

### 1. Database

Run `app-src/supabase/migrations/0001_init.sql` in your Supabase project's SQL editor. It creates the `tasks`, `entities`, `daily_logs`, `habit_config`, and `audit_logs` tables with RLS enabled; all access goes through the service role key in API routes.

### 2. Environment variables

```bash
cp app-src/.env.local.example app-src/.env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=      # from your Supabase project dashboard
SUPABASE_SERVICE_ROLE_KEY=     # from Supabase → Settings → API

AUTH_SECRET=                   # openssl rand -hex 32
DASHBOARD_PASSWORD=            # whatever you want to type at login
API_SECRET=                    # openssl rand -hex 16
MCP_SECRET=                    # openssl rand -hex 32 (only if you want the MCP connector)

GOOGLE_CALENDAR_ICAL_URL=      # Calendar settings → "Secret address in iCal format" (optional)

NEXT_PUBLIC_USER_TIMEZONE=America/New_York   # IANA name; server-side fallback (browser auto-detects)
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

## MCP connector

`/api/mcp` is a streamable-HTTP [MCP](https://modelcontextprotocol.io) endpoint, so Claude (claude.ai, desktop, mobile) can read and write the dashboard directly.

### Setup

1. Generate a secret and set `MCP_SECRET` in Vercel → Settings → Environment Variables, then redeploy. Until it is set, the endpoint rejects every request.
2. In Claude → Settings → Connectors → **Add custom connector**, point it at:

   ```
   https://<your-deployment>/api/mcp?key=<MCP_SECRET>
   ```

   `MCP_SECRET` is separate from `API_SECRET` on purpose: rotating the connector's secret doesn't break scripts that call the REST routes with `x-api-secret`, and vice versa.

The endpoint prefers `Authorization: Bearer <MCP_SECRET>`, which is what to use from a client that can set headers:

```bash
claude mcp add --transport http personal-os https://<your-deployment>/api/mcp   --header "Authorization: Bearer $MCP_SECRET"
```

The `?key=` form exists because Claude's custom-connector UI has no field for a static header. It works identically, but the secret then appears in URLs and request logs — prefer the header wherever you can set one, and treat a leaked URL as a reason to rotate `MCP_SECRET`.

### Tools

| Tool | What it does |
|---|---|
| `list_tasks` | Filter by status, urgency, key-only, or `effective_today` (the dashboard's Today view) |
| `create_task` | Create a task; only `title` is required |
| `update_task` | Patch any mutable task field; null clears a field |
| `complete_task` | Stamp `completed_at`; no-ops on an already-complete task |
| `delete_task` | Permanently delete a task |
| `list_entities` / `create_entity` | Projects, people and companies tasks hang off |
| `get_habits` | Habit ids and level labels, for use with `log_habit` |
| `log_habit` | Set a habit's level for a day; defaults to the 4am-rollover habit day |
| `get_daily_log` | Habit levels and sleep for one day or a date range |

### Security

This is a public HTTPS endpoint with service-role database access behind one shared secret. Anyone holding `MCP_SECRET` can read and delete everything in the dashboard. There is no OAuth, no per-tool scoping, and no rate limiting — rotate the secret if you ever paste a connector URL somewhere it shouldn't be.

## Project structure

```
app-src/
  app/
    api/          # API routes (auth, tasks, entities, habits, calendar, mcp)
    login/        # Login page
    tasks/        # Full task list view
  components/     # Dashboard widgets
  lib/            # Supabase client, auth helpers
    mcp/          # MCP tool definitions and argument validation
  supabase/
    migrations/   # DB schema
design/
  mockup.html     # Original HTML mockup
```
