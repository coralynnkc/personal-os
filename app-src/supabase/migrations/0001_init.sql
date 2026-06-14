-- Personal OS schema
-- Run in Supabase: Dashboard → SQL Editor → paste and run

-- Projects / entities for CRM grouping
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  name       text not null,
  kind       text,
  metadata   jsonb,
  created_at timestamptz default now()
);

-- Tasks (CRM)
create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  title            text not null,
  description      text,
  urgency          text check (urgency in ('today','week','month','someday')) default 'someday',
  key              boolean default false,
  priority_score   int default 0,
  points           int,
  time_estimate_min int,
  tags             text[],
  due_date         date,
  owner            text,
  entity_id        uuid references entities(id) on delete set null,
  completed_at     timestamptz,
  created_at       timestamptz default now()
);

-- Daily logs — one row per user per day
-- notes shape: {
--   habits: { [habitId]: levelIndex },
--   sleep:  { bedtime: string, waketime: string, hours: number }
-- }
create table if not exists daily_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  log_date   date not null,
  notes      jsonb default '{}',
  mood       int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, log_date)
);

-- Habit definitions — one config row per user
-- habits shape: Array<{ id, name, levels: Array<{ id, label }>, isSleep?: boolean, isStoryPoints?: boolean }>
create table if not exists habit_config (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null unique,
  habits     jsonb not null default '[]',
  updated_at timestamptz default now()
);

-- Audit log
create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  action        text,
  resource_type text,
  resource_id   uuid,
  metadata      jsonb,
  created_at    timestamptz default now()
);

-- RLS: deny all by default; service role key bypasses RLS
alter table entities    enable row level security;
alter table tasks       enable row level security;
alter table daily_logs  enable row level security;
alter table habit_config enable row level security;
alter table audit_logs  enable row level security;

-- Updated_at trigger for daily_logs
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger daily_logs_updated_at
  before update on daily_logs
  for each row execute function update_updated_at();
