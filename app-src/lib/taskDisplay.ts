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

export const TONE_COLOR: Record<Tone, string> = {
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  accent: 'var(--accent)',
  muted: 'var(--ink-4)',
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

/** Namespaced tags (`rhythm:2026-08-29:lc-new`) are machine markers, never UI. */
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

// Ten well-separated hues, hashed into a ring so a tag keeps its colour across
// every view without a colour table to maintain by hand.
//
// This is the one place colour is built outside globals.css: a generated
// palette can't live there, because Tailwind's pipeline drops :root custom
// properties that no CSS rule references. Lightness and chroma are fixed, so
// only the hue varies — every tag chip is the same weight against the dark
// ground.
const TAG_HUES = [265, 232, 200, 168, 140, 110, 75, 45, 20, 330]

export function tagColor(tag: string): { fg: string; bg: string; border: string } {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0
  const hue = TAG_HUES[Math.abs(h) % TAG_HUES.length]
  return {
    fg: `oklch(0.82 0.10 ${hue})`,
    bg: `oklch(0.72 0.14 ${hue} / 0.15)`,
    border: `oklch(0.72 0.14 ${hue} / 0.30)`,
  }
}
