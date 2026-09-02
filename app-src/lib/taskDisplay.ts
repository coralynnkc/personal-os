// Shared presentation rules for task chips — one vocabulary everywhere.
//
// Before this, a task could carry a "due today" chip on the dashboard and a
// "today" chip on /tasks (one meaning due_date === today, the other meaning
// the urgency bucket), plus a bare "week"/"month" that read as a date but
// wasn't one. All of that now collapses into a single date-shaped label.

import { USER_TZ } from './dateKey'

export type Urgency = 'today' | 'week' | 'month' | 'someday'

/** now → soon → this horizon → far. Every chip colour comes from here. */
export type Tone = 'danger' | 'warn' | 'accent' | 'muted'

/**
 * Colour on a row only ever means time, and it runs warm to cool: coral is
 * late, amber is due this week, lavender is still on the horizon. A task with
 * no date at all is not on the scale, so it stays slate.
 */
export const TONE_COLOR: Record<Tone, string> = {
  danger: 'var(--coral)',
  warn: 'var(--amber)',
  accent: 'var(--lavender)',
  muted: 'var(--slate)',
}

export function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(new Date())
}

/** Whole days from today to `due` (negative = overdue). Noon-anchored so DST can't shift it. */
export function daysUntil(due: string, today = localToday()): number {
  const a = new Date(today + 'T12:00:00').getTime()
  const b = new Date(due + 'T12:00:00').getTime()
  return Math.round((b - a) / 86_400_000)
}

function fmt(due: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(due + 'T12:00:00').toLocaleDateString('en-US', opts)
}

/**
 * The one date chip. A due date always wins — it's the concrete fact — and the
 * urgency bucket only speaks when there is no date to speak for it. `someday`
 * gets no chip at all: it's the default, and a chip that every task carries is
 * not information.
 */
export function dueLabel(
  task: { due_date?: string | null; urgency?: string | null },
  today = localToday(),
): { text: string; tone: Tone } | null {
  if (task.due_date) {
    const n = daysUntil(task.due_date, today)
    if (n < -1) return { text: `${-n}d late`, tone: 'danger' }
    if (n === -1) return { text: 'yesterday', tone: 'danger' }
    if (n === 0) return { text: 'today', tone: 'danger' }
    if (n === 1) return { text: 'tomorrow', tone: 'warn' }
    if (n <= 6) return { text: fmt(task.due_date, { weekday: 'short' }), tone: 'warn' }
    const text = fmt(task.due_date, { month: 'short', day: 'numeric' })
    return { text, tone: n <= 30 ? 'accent' : 'muted' }
  }
  switch (task.urgency) {
    case 'today': return { text: 'today', tone: 'danger' }
    case 'week':  return { text: 'this week', tone: 'warn' }
    case 'month': return { text: 'this month', tone: 'accent' }
    default:      return null
  }
}

// ── Tags ───────────────────────────────────────────────────────────────────

/** Namespaced tags (`application:<uuid>:applied`) are machine markers, never UI. */
const INTERNAL_TAG = /:/

/** A tag on this share of all tasks separates nothing, so it stops rendering. */
const UBIQUITOUS = 0.5
const MIN_SAMPLE = 8

export type TagFreq = { count: Record<string, number>; total: number }

/**
 * Frequency is measured over open tasks only — the archive is much larger than
 * the working set and would drag every share below the threshold, letting
 * blanket tags creep back onto the cards.
 */
export function tagFrequency(tasks: { tags?: string[] | null; completed_at?: string | null }[]): TagFreq {
  const open = tasks.filter(t => !t.completed_at)
  const count: Record<string, number> = {}
  for (const t of open) {
    for (const tag of t.tags ?? []) {
      if (INTERNAL_TAG.test(tag)) continue
      count[tag] = (count[tag] ?? 0) + 1
    }
  }
  return { count, total: open.length }
}

export const EMPTY_TAG_FREQ: TagFreq = { count: {}, total: 0 }

/**
 * Rarest tags first — a tag on 4 tasks tells you more than one on 96 — then
 * capped, because the point of the row is to identify the task at a glance,
 * not to mirror the database.
 */
export function displayTags(
  tags: string[] | null | undefined,
  freq: TagFreq,
  max = 2,
): { shown: string[]; hidden: string[] } {
  const useFreq = freq.total >= MIN_SAMPLE
  const visible = (tags ?? [])
    .filter(t => !INTERNAL_TAG.test(t))
    .filter(t => !useFreq || (freq.count[t] ?? 0) / freq.total < UBIQUITOUS)
    .sort((a, b) => (freq.count[a] ?? 0) - (freq.count[b] ?? 0) || a.localeCompare(b))
  return { shown: visible.slice(0, max), hidden: visible.slice(max) }
}

// The ten-hue tag palette is retired: a row that carries two coloured chips
// spends its colour budget on something that is not time, and then coral means
// nothing. Tags are quiet text now, ordered rarest-first by displayTags above —
// which is the part that was actually doing the identifying work.

// ── Key tasks ──────────────────────────────────────────────────────────────

/**
 * A due date outranks the urgency bucket, on the same rolling windows the
 * board columns use: on Aug 29 a Sep 8 deadline is three weeks of runway, not
 * "someday".
 */
export function urgencyFromDate(due: string): Urgency {
  const today = localToday()
  if (due <= today) return 'today'
  const dueDate = new Date(due + 'T12:00:00')
  const now = new Date()
  const in7 = new Date(now); in7.setDate(now.getDate() + 7)
  if (dueDate <= in7) return 'week'
  const in30 = new Date(now); in30.setDate(now.getDate() + 30)
  if (dueDate <= in30) return 'month'
  return 'someday'
}

export function effectiveUrgency(task: { due_date?: string | null; urgency?: string | null }): Urgency {
  if (task.due_date) return urgencyFromDate(task.due_date)
  return (task.urgency as Urgency | null) ?? 'someday'
}

/**
 * Two ways to earn a star: the `key` flag, or being due today. Only the flag
 * is yours to set, which is why the star renders them in different colours —
 * see `KeyStar`.
 */
export function isEffectivelyKey(task: { key?: boolean; due_date?: string | null; urgency?: string | null }): boolean {
  return !!task.key || effectiveUrgency(task) === 'today'
}
