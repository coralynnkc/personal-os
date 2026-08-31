-- Cadence habits (PLAN §2 — the laundry problem)
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- Laundry has a rhythm but is not daily, so a daily checkbox is a false
-- negative six days in seven. What the row has to answer is "how long has it
-- been, and is that too long?", which needs the date it was last done — and
-- keeping only the last one throws away the history that would answer "has
-- this actually been every nine days all year?".
--
-- Hence a table rather than the usual daily_logs.notes append: notes is one
-- row per day, so a cadence entry there is either "last done" duplicated
-- forward or a scan of every month ever logged to find the most recent one.
-- Events are the thing with the lifecycle; the shape is one row per act.
--
-- The definition itself is still config, so it rides in habit_config.habits
-- alongside the daily habits, with kind: 'cadence' and everyDays:
--   { id, name, kind: 'cadence', everyDays: 7 }
-- A habit with no `kind` is daily, which is every habit that already exists.

create table if not exists habit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  habit_id   text not null,          -- matches habit_config.habits[].id
  event_date date not null,
  created_at timestamptz default now(),
  -- Doing the laundry twice on a Tuesday is once. The tap is idempotent, and
  -- the UI's undo is a delete of exactly this row.
  unique(user_id, habit_id, event_date)
);

-- The only read is "most recent event per habit", newest first.
create index if not exists habit_events_user_habit_date_idx
  on habit_events (user_id, habit_id, event_date desc);

alter table habit_events enable row level security;
