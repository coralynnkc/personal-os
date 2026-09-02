-- Job search: a "Don't want to apply" status
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- The board could record every way an application ends except the one you
-- choose yourself. Passing on a role is not a rejection and not a ghosting —
-- it's a decision, and it belongs in the archive with the rest of the record
-- so "how many did I look at, and what happened to them" stays answerable.

alter table applications drop constraint if exists applications_status_check;

alter table applications add constraint applications_status_check
  check (status in ('researching','not_open','open','applied',
                    'oa','phone','onsite','offer',
                    'rejected','ghosted','no_roles','passed'));
