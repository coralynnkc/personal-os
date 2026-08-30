// Pomodoro timer — types and pure helpers shared by the client provider and
// the API route.
//
// The one rule that matters: a running timer is stored as a *target
// timestamp*, never as a remaining-seconds counter that something decrements.
// Browsers throttle timers hard in background tabs, so a decrementing interval
// loses minutes over a 25-minute session. Everything here derives remaining
// time from `endsAt - Date.now()`, which is correct no matter how badly the
// interval that triggers the repaint was throttled.

export type Phase = 'idle' | 'focus' | 'short_break' | 'long_break'
export type ActivePhase = Exclude<Phase, 'idle'>

export type PomodoroSettings = {
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  longBreakEvery: number
  chime: boolean
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
  chime: true,
}

export type PomodoroState = {
  phase: Phase
  endsAt: number | null              // epoch ms; null when paused or idle
  pausedRemainingMs: number | null   // set only while paused / armed
  completedFocusSessions: number
  taskId: string | null
  taskTitle: string | null
  startedAt: number | null           // epoch ms; cleared once the phase is logged
}

export const IDLE_STATE: PomodoroState = {
  phase: 'idle',
  endsAt: null,
  pausedRemainingMs: null,
  completedFocusSessions: 0,
  taskId: null,
  taskTitle: null,
  startedAt: null,
}

export type PomodoroSession = {
  taskId: string | null
  taskTitle: string | null
  phase: ActivePhase
  startedAt: string
  endedAt: string
  durationMs: number
}

export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Idle',
  focus: 'Focus',
  short_break: 'Short break',
  long_break: 'Long break',
}

// A running clock is the one thing in the rail that is about time passing, so
// focus gets the accent; a break is the absence of that, and reads quieter.
export const PHASE_COLOR: Record<Phase, string> = {
  idle: 'var(--slate)',
  focus: 'var(--champagne)',
  short_break: 'var(--violet)',
  long_break: 'var(--violet)',
}

const MIN_DURATION_MIN = 1
const MAX_DURATION_MIN = 180

function clampMin(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, Math.round(n)))
}

/** Coerce whatever came back from the DB into a usable settings object. */
export function normalizeSettings(raw: unknown): PomodoroSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    focusMin: clampMin(r.focusMin, DEFAULT_SETTINGS.focusMin),
    shortBreakMin: clampMin(r.shortBreakMin, DEFAULT_SETTINGS.shortBreakMin),
    longBreakMin: clampMin(r.longBreakMin, DEFAULT_SETTINGS.longBreakMin),
    longBreakEvery: Math.min(12, Math.max(1, Math.round(Number(r.longBreakEvery)) || DEFAULT_SETTINGS.longBreakEvery)),
    chime: typeof r.chime === 'boolean' ? r.chime : DEFAULT_SETTINGS.chime,
  }
}

export function phaseDurationMs(phase: Phase, s: PomodoroSettings): number {
  switch (phase) {
    case 'focus': return s.focusMin * 60_000
    case 'short_break': return s.shortBreakMin * 60_000
    case 'long_break': return s.longBreakMin * 60_000
    case 'idle': return 0
  }
}

/**
 * What follows the phase that just finished. A focus session leads to a long
 * break every `longBreakEvery`th completion; any break leads back to focus.
 * `completedFocusSessions` is the count *including* the one just finished.
 *
 * The `> 0` guard matters: a *skipped* focus phase does not increment the
 * count, so without it the very first skip would hand out a long break off
 * `0 % 4 === 0`.
 */
export function nextPhase(finished: ActivePhase, completedFocusSessions: number, s: PomodoroSettings): ActivePhase {
  if (finished !== 'focus') return 'focus'
  const earned = completedFocusSessions > 0 && completedFocusSessions % s.longBreakEvery === 0
  return earned ? 'long_break' : 'short_break'
}

/** Milliseconds left on the clock, whether running, paused, or armed. */
export function remainingMs(state: PomodoroState, now: number, s: PomodoroSettings): number {
  if (state.phase === 'idle') return phaseDurationMs('focus', s)
  if (state.endsAt != null) return Math.max(0, state.endsAt - now)
  return state.pausedRemainingMs ?? phaseDurationMs(state.phase, s)
}

/** `25:00`, or `1:05:00` once an hour is on the clock. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** `3h 20m` / `45m` / `0m` — for the daily focus total. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Validate one session posted by the client before it goes into jsonb. */
export function parseSession(raw: unknown): PomodoroSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const phase = r.phase
  if (phase !== 'focus' && phase !== 'short_break' && phase !== 'long_break') return null

  const startedAt = typeof r.startedAt === 'string' ? new Date(r.startedAt) : null
  const endedAt = typeof r.endedAt === 'string' ? new Date(r.endedAt) : null
  if (!startedAt || !endedAt) return null
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) return null
  if (endedAt <= startedAt) return null

  return {
    taskId: typeof r.taskId === 'string' ? r.taskId : null,
    taskTitle: typeof r.taskTitle === 'string' ? r.taskTitle : null,
    phase,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
  }
}

/** Total focus time and session count from a day's logged sessions. */
export function focusTotals(sessions: PomodoroSession[]): { focusMs: number; focusSessions: number } {
  const focus = sessions.filter(s => s.phase === 'focus')
  return {
    focusMs: focus.reduce((sum, s) => sum + s.durationMs, 0),
    focusSessions: focus.length,
  }
}
