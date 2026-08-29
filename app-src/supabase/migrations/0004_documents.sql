-- Week plan documents
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- The planning docs live in ~/Documents/1-school/planning/ and are edited in a
-- text editor. Production is Vercel, where that directory does not exist, so a
-- local script (scripts/sync-planning-docs.mjs) parses them and upserts the
-- result here — the same service-role pattern as the job-search import.
--
-- The .md files stay the source of truth: this table is written only by the
-- sync script and read-only in the app. Per-day interaction state (checked
-- rows, resolved branches) belongs in daily_logs.notes.week, not here.

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  slug        text not null,          -- 'week_2026-08-31'
  kind        text not null           -- 'week' | 'semester'
              check (kind in ('week','semester')),
  title       text,
  week_start  date,                   -- null for semester docs; drives "which week is current"
  body        text not null,          -- raw markdown, kept verbatim
  frontmatter jsonb,
  parsed      jsonb,                  -- { intro, days[], sections[], deadlines[] }, extracted at sync time
  source_path text,
  synced_at   timestamptz default now(),
  unique(user_id, slug)
);

create index if not exists documents_user_kind_week_idx
  on documents (user_id, kind, week_start desc);

alter table documents enable row level security;
