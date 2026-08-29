-- Pomodoro timer
-- Run in Supabase: Dashboard → SQL Editor → paste and run
--
-- No new table. Two things need storing and both have a home already:
--
--   1. Durations — per-user config, exactly what habit_config is, so it rides
--      along in a second jsonb column rather than a one-row table of its own.
--   2. Completed sessions — per-day data, which is what daily_logs is for.
--      They append to notes.pomodoros, alongside notes.habits and notes.sleep.

-- pomodoro shape: { focusMin, shortBreakMin, longBreakMin, longBreakEvery, chime }
alter table habit_config add column if not exists pomodoro jsonb;

-- daily_logs.notes gains:
--   pomodoros: Array<{
--     taskId: string | null,
--     taskTitle: string | null,
--     phase: 'focus' | 'short_break' | 'long_break',
--     startedAt: string,   -- ISO
--     endedAt: string,     -- ISO
--     durationMs: number
--   }>
--
-- Sessions are filed under the habit day (before 4am counts as the night
-- before, same grace window as habits), so a 1am focus block lands on the day
-- of the work rather than the calendar day of the clock.
