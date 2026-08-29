// The shape of documents.parsed, plus the reading of it that both the week tab
// and the deadline strip need.
//
// Nothing here parses markdown — that happens once in
// scripts/parse-planning-doc.mjs at sync time. This file only asks questions of
// the result: which day is today, how many hours a day is holding, and whether
// a deadline the document states has a real `tasks` row behind it.

import { localToday, daysUntil, type Tone } from './taskDisplay'

export type WeekRow = {
  id: string
  rawTime: string
  rawWhat: string
  meeting: boolean
  anchor: boolean
} & (
  | { kind: 'timed'; start: string; end: string; durationMin: number }
  | { kind: 'duration'; durationMin: number }
  | { kind: 'untimed' }
)

export type WeekDay = {
  id: string
  heading: string
  weekday: string
  label: string | null
  dates: string[]
  rows: WeekRow[]
  prose: string
  raw: string
}

export type DocSection = { id: string; heading: string; markdown: string }

export type Deadline = {
  id: string
  title: string
  date: string
  time: string | null
  source: 'blockquote' | 'intro'
}

export type ParsedDoc = {
  intro: DocSection | null
  days: WeekDay[]
  sections: DocSection[]
  deadlines: Deadline[]
}

export type PlanningDoc = {
  id: string
  slug: string
  kind: 'week' | 'semester'
  title: string | null
  week_start: string | null
  body: string
  frontmatter: Record<string, string> | null
  parsed: ParsedDoc | null
  source_path: string | null
  synced_at: string | null
}

export type DayStatus = 'past' | 'today' | 'future'

export function dayStatus(day: WeekDay, today = localToday()): DayStatus {
  if (!day.dates.length) return 'future'
  const last = day.dates[day.dates.length - 1]
  if (last < today) return 'past'
  if (day.dates[0] <= today) return 'today'
  return 'future'
}

/** `Sat 29`, or `Sat 5–6` for a heading that spans two days. */
export function dayChipLabel(day: WeekDay): string {
  const weekday = day.weekday.slice(0, 3)
  if (!day.dates.length) return weekday
  const nums = day.dates.map((d) => Number(d.slice(8, 10)))
  return nums.length > 1 ? `${weekday} ${nums[0]}–${nums[1]}` : `${weekday} ${nums[0]}`
}

/**
 * Committed hours for a day: timed rows contribute their span, `~90 min` rows
 * their budget, untimed rows nothing — an untimed row is real work, but it has
 * no claim on the clock and pretending otherwise inflates the number.
 */
export function committedMinutes(day: WeekDay): number {
  return day.rows.reduce((n, r) => n + ('durationMin' in r ? r.durationMin : 0), 0)
}

export function formatHours(minutes: number): string {
  if (!minutes) return '—'
  const h = minutes / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`
}

/** '14:30' → '2:30' — the docs never write a leading zero or a meridiem. */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')}`
}

export function meridiem(hhmm: string): string {
  return Number(hhmm.slice(0, 2)) < 12 ? 'am' : 'pm'
}

/** Two timed rows overlapping is the collision the flat table can't show. */
export function overlaps(a: WeekRow, b: WeekRow): boolean {
  if (a.kind !== 'timed' || b.kind !== 'timed') return false
  return a.start < b.end && b.start < a.end
}

export type MatchableTask = {
  id: string
  title: string
  due_date: string | null
  completed_at: string | null
}

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'of', 'to', 'in', 'is', 'due', 'my'])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
}

/**
 * Join a deadline the document states to the `tasks` row that actually tracks
 * it. Titles are written twice by hand and drift ("ACT 420 HW 2" vs "ACT 420
 * Homework 2"), so this is deliberately fuzzy: most of the document's words
 * have to appear in the task, and the due date has to agree if the task has
 * one. The doc proposes; `tasks` stays the system of record, so a wrong match
 * is worse than no match and the threshold sits high.
 */
export function matchTask(deadline: Deadline, tasks: MatchableTask[]): MatchableTask | null {
  const want = tokens(deadline.title)
  if (!want.length) return null

  let best: { task: MatchableTask; score: number } | null = null
  for (const task of tasks) {
    if (task.due_date && task.due_date !== deadline.date) continue
    const have = new Set(tokens(task.title))
    const hits = want.filter((t) => have.has(t)).length
    const score = hits / want.length + (task.due_date === deadline.date ? 0.15 : 0)
    if (score >= 0.6 && (!best || score > best.score)) best = { task, score }
  }
  return best?.task ?? null
}

export function deadlineTone(date: string, today = localToday()): Tone {
  const n = daysUntil(date, today)
  if (n <= 0) return 'danger'
  if (n <= 2) return 'warn'
  return 'accent'
}

/** `Tue Sep 8`, the deadline strip's date. */
export function shortDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
