# personal-os

A single-page personal dashboard. Password-gated, self-hosted, built for one.

[View design mockup](design/mockup.html)

## Pages

| Page | What it does |
|---|---|
| **/** | Dashboard — today's tasks, calendar, habits |
| **/tasks** | Full task list |
| **/jobs** | Job search — application pipeline, company research, stale-portal queue |
| **/week** | This week's plan, synced from the school planning docs |

### Dashboard widgets

| Widget | What it does |
|---|---|
| **Today's Tasks** | Tasks scoped to today/this week, pulled from Supabase |
| **Calendar** | 7-day strip synced from a Google Calendar iCal feed |
| **Habit Tracker** | Configurable daily habits with multi-level completion |

### Pomodoro

Lives in the nav rail, so a session survives navigating between pages. Start
one from the ▶ on any task row to tag the session with that task. Timing runs
off a target timestamp held in `localStorage`, so a background tab, a refresh,
or a closed laptop can't drift it — a session that ends while the tab is shut
is recovered and logged with its true span on the next load.

Completed sessions append to `daily_logs.notes.pomodoros`; durations are
configurable and stored in `habit_config.pomodoro`.

## Stack

Next.js (App Router) for the frontend and API routes, Supabase for Postgres (accessed server-side via the service role key), and Vercel for deployment. Auth is a single shared password with no OAuth or user accounts.

## Setup

### 1. Database

Run the migrations in `app-src/supabase/migrations/` in your Supabase project's SQL editor, in order:

- `0001_init.sql` — `tasks`, `entities`, `daily_logs`, `habit_config`, `audit_logs`
- `0002_job_search.sql` — `applications` (the job-search pipeline)
- `0003_pomodoro.sql` — `habit_config.pomodoro` (timer durations)
- `0004_documents.sql` — `documents` (the synced week and semester planning docs)

All tables have RLS enabled; access goes through the service role key in API routes.

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

## Job search

`/jobs` replaces a two-sheet tracking spreadsheet.

- **Pipeline** — applications as a board (or a table, for bulk edits), grouped by status. Opening a card shows the research for that company alongside it.
- **Targets** — the company research library, filterable by industry, role category, and competitiveness. "Track" promotes a company into the pipeline with the research already linked.
- **Stale portals** — every watched application whose portal hasn't been checked in 14 days, oldest first. One click opens the portal and stamps today's date.
- **Daily rhythm** — the LeetCode/system-design cadence, materialised as real `tasks` rows so it shows up in Today's Tasks and counts toward story points.

Companies live in `entities` with `kind = 'company'` and their research in `metadata`; applications get their own table because they have a lifecycle worth filtering and sorting on.

### Importing an existing spreadsheet

A two-stage, re-runnable import. Stage 1 writes nothing to the database, so you can check the fuzzy company matches before committing them:

```bash
cd app-src
python3 scripts/parse-job-search-xlsx.py          # xlsx  → scripts/job-search-import.json
node scripts/import-job-search.mjs --dry-run      # report what would change
node scripts/import-job-search.mjs                # write to Supabase
```

Stage 1 promotes the things the spreadsheet stored as prose into real columns — the date inside `"Not open (checked Jul 10)"` becomes a `portal_last_checked` date, and the rest of that sentence becomes a constrained `status` — and prints every company link it made plus every row it could not match. Unmatched rows still import; link them by hand in the pipeline drawer.

## Week plan

`/week` renders the week document from `~/Documents/1-school/planning/` — today's
day expanded, past days collapsed, future days showing their schedule without
the prose — with the deadlines stated in the doc checked against real `tasks`
rows.

Those files live outside this repo and outside Vercel, so a local script parses
them and writes the result to the `documents` table. The `.md` files stay the
source of truth; nothing in the app writes back to them.

```bash
cd app-src
node scripts/sync-planning-docs.mjs --dry-run --verbose   # print the parse, write nothing
node scripts/sync-planning-docs.mjs                       # upsert into Supabase
```

Re-run it after editing a week doc. Parsing happens once, here, and the result
is stored in `documents.parsed`: `days[]` with their schedule rows, the
deadlines pulled out of the intro, and the thematic sections. The parser is
deliberately lenient — anything it can't classify keeps its raw text and
renders as written, because these are handwritten documents and dropping a row
is worse than failing to structure it.

The semester docs (`fall26_workload_plan.md`, `assignments_fall26.md`) sync too
and render at `/week/<slug>`, so the week doc's `../fall26_workload_plan.md`
references resolve in-app instead of dead-ending.

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
    api/          # API routes (auth, tasks, entities, habits, pomodoro, calendar, mcp)
    login/        # Login page
    tasks/        # Full task list view
    jobs/         # Job search — pipeline, targets, stale portals
    week/         # Week plan — the current week, and a page per semester doc
  components/     # Dashboard widgets
    jobs/         # Job search tab components
    pomodoro/     # Rail timer, provider, task-row start button
    week/         # Week tab — day sections, deadline strip, long-form doc view
  lib/            # Supabase client, auth helpers, job-search domain types
    mcp/          # MCP tool definitions and argument validation
  scripts/        # Maintenance scripts (spreadsheet import, planning-doc sync)
  supabase/
    migrations/   # DB schema
design/
  mockup.html     # Original HTML mockup
```
