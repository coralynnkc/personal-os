-- Job search: the daily note
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- The /jobs tab's Notes view is mostly *derived* — what's open, what's gone
-- quiet, what interview is coming — because the pipeline already knows all of
-- that and re-typing it would only let it go stale. This table holds the one
-- part nothing can derive: what Cora is thinking on a given day. What to learn
-- next, what a recruiter said, which posting to watch for.
--
-- One row per day rather than an append log: the note is a page you edit
-- through the day, not a stream of events, and the primary key makes the
-- autosave a plain upsert.
--
-- It is deliberately NOT daily_logs.notes — that row belongs to the habit day
-- and is written by the tracker, so sharing it would mean two editors racing
-- for one text column.

create table if not exists job_notes (
  user_id    text not null,
  note_date  date not null,
  body       text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, note_date)
);

alter table job_notes enable row level security;

-- Reuses update_updated_at() from 0001_init.sql
drop trigger if exists job_notes_updated_at on job_notes;
create trigger job_notes_updated_at
  before update on job_notes
  for each row execute function update_updated_at();
