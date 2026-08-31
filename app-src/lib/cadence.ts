// Cadence habits — the ones with a rhythm rather than a day (PLAN §2).
//
// A daily habit asks "did you, today?". A cadence habit asks "how long has it
// been, and is that too long?" — so there is no level and no streak, only an
// elapsed count rendered as decay. Doing the laundry on day 5 of a 7-day
// rhythm is not a miss, and nothing here should ever say it was.

/** A habit definition with no `kind` predates cadence and is daily. */
export type HabitKind = 'daily' | 'cadence'

export type CadenceTone = 'fresh' | 'due' | 'over'

export type CadenceState = {
  /** Whole days between the last event and today; null when never done. */
  daysSince: number | null
  /** daysSince / everyDays, clamped to 1 for the bar. Never done reads as full. */
  ratio: number
  tone: CadenceTone
  /** 'never' · '5d' · 'today' — what the number column says. */
  elapsed: string
  /** 'fresh' · 'due' · '2d over' — what the status column says. */
  status: string
}

export const MIN_EVERY_DAYS = 1
export const MAX_EVERY_DAYS = 365

/** Clamp whatever came out of the config jsonb into a usable rhythm. */
export function normalizeEveryDays(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 7
  return Math.min(Math.max(n, MIN_EVERY_DAYS), MAX_EVERY_DAYS)
}

// Date keys are YYYY-MM-DD in the user's timezone, so the difference between
// two of them is a difference of calendar days — parse as UTC and subtract, or
// a DST boundary turns 7 days into 6.96 and floors to 6.
function daysBetween(fromKey: string, toKey: string): number | null {
  const from = Date.parse(`${fromKey}T00:00:00Z`)
  const to = Date.parse(`${toKey}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.round((to - from) / 86_400_000)
}

/**
 * The whole of a cadence row's state, from its rhythm and the day it was last
 * done. `lastDate` is null when there is no event yet.
 */
export function cadenceState(everyDays: number, lastDate: string | null, today: string): CadenceState {
  const every = normalizeEveryDays(everyDays)
  const daysSince = lastDate ? daysBetween(lastDate, today) : null

  if (daysSince === null || daysSince < 0) {
    // Never done — or a future date, which only a hand-edited row can be. Both
    // want the same answer: this row has nothing to decay from.
    return { daysSince: null, ratio: 1, tone: 'over', elapsed: 'never', status: 'never done' }
  }

  const raw = daysSince / every
  const over = daysSince - every

  return {
    daysSince,
    ratio: Math.min(raw, 1),
    // 0.7 is where the bar starts meaning "soon" rather than "done recently".
    tone: over > 0 ? 'over' : raw >= 0.7 ? 'due' : 'fresh',
    elapsed: daysSince === 0 ? 'today' : `${daysSince}d`,
    status: over > 0 ? `${over}d over` : raw >= 0.7 ? 'due' : 'fresh',
  }
}

/** Colour on a cadence row means time, same as everywhere else. */
export const CADENCE_COLOR: Record<CadenceTone, string> = {
  fresh: 'var(--slate)',
  due: 'var(--amber)',
  over: 'var(--coral)',
}

/** Most overdue first, then the longest-waiting, then by name. */
export function byMostOverdue<T extends { state: CadenceState; name: string }>(a: T, b: T): number {
  const r = b.state.ratio - a.state.ratio
  if (r !== 0) return r
  const d = (b.state.daysSince ?? 0) - (a.state.daysSince ?? 0)
  if (d !== 0) return d
  return a.name.localeCompare(b.name)
}
