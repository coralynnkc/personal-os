-- Job search: applications pipeline
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- Companies are NOT a new table — they reuse `entities` with kind = 'company'
-- and the 16 research columns from the spreadsheet stored in `metadata` jsonb.
-- That data is read-mostly and never filtered on, so jsonb is the right shape
-- and it inherits the existing entity CRUD.
--
-- Applications DO get a table: they have a real lifecycle and need filtering
-- and sorting by status and date, which jsonb makes painful.

create table if not exists applications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  entity_id           uuid references entities(id) on delete set null,
  company_name        text not null,          -- denormalised; survives an unlinked entity
  role_title          text,
  wave                text,                   -- 'Wave 1' | 'Wave 2' | 'Wave 3' | 'Rolling' | 'GitHub'
  status              text not null default 'researching'
                        check (status in ('researching','not_open','open','applied',
                                          'oa','phone','onsite','offer','rejected','ghosted','no_roles')),
  portal_url          text,
  portal_last_checked date,                   -- promoted out of the Status prose
  applied_on          date,
  interview_on        date,
  outcome             text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists applications_user_status_idx
  on applications (user_id, status);
create index if not exists applications_user_portal_checked_idx
  on applications (user_id, portal_last_checked);

-- One application per company per wave. Makes the importer re-runnable and
-- stops a double-click in the UI from creating a duplicate pipeline card.
create unique index if not exists applications_user_company_wave_key
  on applications (user_id, lower(company_name), coalesce(wave, ''));

alter table applications enable row level security;

-- Reuses update_updated_at() from 0001_init.sql
drop trigger if exists applications_updated_at on applications;
create trigger applications_updated_at
  before update on applications
  for each row execute function update_updated_at();
