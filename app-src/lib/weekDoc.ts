// The shape of documents.parsed, plus the reading of it that both the week tab
// and the deadline strip need.
//
// Nothing here parses markdown — that happens once in
// scripts/parse-planning-doc.mjs at sync time. This file only asks questions of
// the result: which day is today, how many hours a day is holding, and whether
// a deadline the document states has a real `tasks` row behind it.

import { localToday, daysUntil, type Tone } from './taskDisplay'
import { rowSkipped, rowTitle } from './taskMatch.mjs'

/**
 * The join — how a row or a deadline finds the task that tracks it — lives in
 * `taskMatch.mjs` rather than here, because `scripts/check-week-links.mjs`
 * has to ask it the same questions from node, which can't load this file.
 * Re-exported so the rest of the app still has one place to import from.
 */
export {
  chosenArm, matchTask, rowSkipped, rowTask, rowTitle, rowWhat, scoreTask, tokens, ROW_MATCH,
} from './taskMatch.mjs'
export type { Matchable, MatchOptions, Score } from './taskMatch.d.mts'

/**
 * A fork the document states and the week resolves. `if` is the arm the
 * condition buys; `else` is what happens otherwise, and a null `what` on it
 * means the row simply doesn't happen. See `parseBranch` in
 * scripts/parse-planning-doc.mjs for which rows earn one.
 */
export type ArmId = 'if' | 'else'
export type RowArm = { id: ArmId; what: string | null }
export type RowBranch = { condition: string; arms: RowArm[] }

export type WeekRow = {
  id: string
  rawTime: string
  rawWhat: string
  meeting: boolean
  anchor: boolean
  /** Absent on rows synced before branches existed, and on most rows after. */
  branch?: RowBranch | null
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

/**
 * The strip sets the weekday and the date number on two lines, at two sizes —
 * the number is what you actually read — so the label comes apart rather than
 * arriving pre-joined. `num` is empty for a heading with no date behind it,
 * and `5–6` for one that spans two days.
 */
export function dayChipParts(day: WeekDay): { weekday: string; num: string } {
  const weekday = day.weekday.slice(0, 3)
  if (!day.dates.length) return { weekday, num: '' }
  const nums = day.dates.map((d) => Number(d.slice(8, 10)))
  return { weekday, num: nums.length > 1 ? `${nums[0]}\u2013${nums[1]}` : String(nums[0]) }
}

/**
 * The day's own name, spelled out. The docs abbreviate in their headings
 * ("Sun · Aug 30"), and `sun` set in Italianno at 30px reads as a typo rather
 * than a title — so the date says the word when there is a date to ask.
 */
export function dayTitle(day: WeekDay): string {
  if (!day.dates.length) return day.weekday.toLowerCase()
  return day.dates
    .map((d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase())
    .join('\u2013')
}

/**
 * Committed hours for a day: timed rows contribute their span, `~90 min` rows
 * their budget, untimed rows nothing — an untimed row is real work, but it has
 * no claim on the clock and pretending otherwise inflates the number.
 */
export function committedMinutes(day: WeekDay): number {
  return day.rows.reduce((n, r) => n + ('durationMin' in r ? r.durationMin : 0), 0)
}

/** `5h 20m` — the day heading spends the exact figure the strip rounds. */
export function longHours(minutes: number): string {
  if (!minutes) return 'nothing committed'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${[h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ')} committed`
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

/**
 * The date a day's state is written under. A weekend written as one heading
 * ("Sat Sept 5 – Sun Sept 6") has two dates and one set of rows, so the first
 * one owns them; a heading with no date at all can't hold state, and returning
 * null is what makes the check circle stay away rather than write somewhere
 * arbitrary.
 */
export function dayKey(day: WeekDay): string | null {
  return day.dates[0] ?? null
}

/** Every date the week touches — what the state route needs asking for. */
export function weekDates(days: WeekDay[]): string[] {
  return days.map(dayKey).filter((d): d is string => d !== null)
}

export type Carried = { day: WeekDay; row: WeekRow; choice?: string }

/**
 * Everything the app remembers about one day of the plan: which rows got
 * checked off, and which way each fork went. Both are keyed by row id and both
 * live in `daily_logs.notes.week`, so they travel together.
 */
export type DayState = { checked: string[]; branches: Record<string, string> }

export const EMPTY_DAY: DayState = { checked: [], branches: {} }

export function dayState(state: Record<string, DayState>, key: string | null): DayState {
  return (key && state[key]) || EMPTY_DAY
}

/**
 * What you said you would do on a day that is over, and didn't check off.
 *
 * Unchecked is not the same as undone — most rows never get touched — so this
 * only counts days that have *some* state written against them. A week you
 * never checked a box in reads as nothing carried over, which is honest;
 * claiming eleven overdue items on a Wednesday because you never used the
 * feature is not.
 *
 * A fork you resolved to "it doesn't happen" is the one row that is neither
 * checked nor outstanding: you answered it, and the answer was no.
 *
 * `isDone` is the second way a row can be finished: a row joined to a real
 * task is done when *the task* is done, however that happened. Without it a
 * thing you completed from the tasks tab would sit here nagging, which is the
 * same two-systems problem the checkbox itself has.
 */
export function carriedOver(
  days: WeekDay[], state: Record<string, DayState>,
  { today = localToday(), isDone }: {
    today?: string
    isDone?: (day: WeekDay, row: WeekRow, choice?: string) => boolean
  } = {},
): Carried[] {
  const out: Carried[] = []
  for (const day of days) {
    if (dayStatus(day, today) !== 'past') continue
    const { checked, branches } = dayState(state, dayKey(day))
    if (!checked.length) continue
    for (const row of day.rows) {
      const choice = branches[row.id]
      if (checked.includes(row.id) || rowSkipped(row, choice)) continue
      if (isDone?.(day, row, choice)) continue
      out.push({ day, row, choice })
    }
  }
  return out
}

export type MatchableTask = {
  id: string
  title: string
  due_date: string | null
  completed_at: string | null
  entity_id?: string | null
}

export type Entity = {
  id: string
  name: string
  kind: string | null
  metadata?: { archived?: boolean; weekly_hours?: number } | null
}


/**
 * The short name an entity is called by in prose. `entities.name` is written
 * for the manage-projects list — "ACT 410 — Business Law", "Block (Square /
 * Cash App)" — and nobody writes that into a schedule row. The half before the
 * dash or the parenthesis is the half that gets typed.
 */
export function entityCode(entity: Entity): string {
  return entity.name.split(/\s+[\u2014\u2013]\s+|\s+\(/)[0].trim()
}

/**
 * Which entities are allowed to put their name on a row.
 *
 * Not all of them. `entities` is also the job-search inventory — seventy-odd
 * companies that exist because they might post a job one day, not because they
 * own any of your hours — and half a dozen of those are named after ordinary
 * words. Matching on the whole list means "Block out Thursday morning" comes
 * back tagged `Block`, and `Meta`, `Apple`, `Chime`, `Plaid`, `Visa` and
 * `Uber` are all waiting to do the same.
 *
 * So a code has to read as a *name* rather than a word: two words, a digit, an
 * interior capital, or long enough that nobody types it by accident. That
 * keeps `ActBlue`, `ACT 410`, `NGP VAN` and `Jane Street`, and drops exactly
 * the dozen short common nouns. The cost is a real entity called `Figma`
 * silently never tagging a row — which is the right way round, because a wrong
 * tag is worse than no tag.
 */
export function entityVocabulary(entities: Entity[]): Entity[] {
  return entities.filter((e) => {
    if (e.metadata?.archived) return false
    const code = entityCode(e)
    return /\s/.test(code) || /\d/.test(code) || /[A-Z]/.test(code.slice(1)) || code.length >= 6
  })
}

/**
 * Where a code is named, or -1. Word-boundary, so `ACT 410` doesn't hit
 * `ACT 4100` and `Meta` doesn't hit `metadata`.
 *
 * The patterns are cached because the aggregate below asks this of every row
 * against every entity, and rebuilding seventy regexes per row is the
 * difference between a render and a stall.
 */
const PATTERNS = new Map<string, RegExp>()

function mentionAt(text: string, code: string): number {
  let re = PATTERNS.get(code)
  if (!re) {
    const body = code.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
    re = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu')
    PATTERNS.set(code, re)
  }
  return re.exec(text)?.index ?? -1
}

/**
 * Which entity a schedule row is about. Rows have no entity field — the file is
 * prose — so this reads it back out of the text.
 *
 * Two things keep it honest. It reads the *title*, not the whole cell: the
 * commentary after the em dash is where a row explains itself, and "🔵 ActBlue
 * meeting — overlaps the ACT 420 lecture" is an ActBlue hour that names a
 * course in passing. And of the codes the title does name, the first one wins,
 * because that is the one the sentence is about; a longer code only breaks a
 * tie between two named at the same place.
 */
export function rowEntity(row: WeekRow, vocabulary: Entity[], choice?: string): Entity | null {
  const title = rowTitle(row, choice)
  let best: { entity: Entity; at: number; length: number } | null = null
  for (const entity of vocabulary) {
    const code = entityCode(entity)
    const at = mentionAt(title, code)
    if (at === -1) continue
    if (!best || at < best.at || (at === best.at && code.length > best.length)) {
      best = { entity, at, length: code.length }
    }
  }
  return best?.entity ?? null
}

export type EntityLoad = {
  entity: Entity
  minutes: number
  /** The hours the entity is *supposed* to get, from `metadata.weekly_hours`. */
  target: number | null
  /** 0–1: of the target if there is one, of the committed week if there isn't. */
  fraction: number
}

/**
 * How the week's committed hours are split between the things that own them.
 *
 * One pass over the rows, resolving each row's entity once — asking every
 * entity how many minutes it owns would re-read every row seventy times over.
 * Untimed rows contribute nothing here for the same reason they contribute
 * nothing to a day (see `committedMinutes`).
 *
 * A target turns the bar into a commitment you are behind or ahead of; without
 * one the denominator is the committed week, which still answers the softer
 * question — is this the week's centre of gravity, or a corner of it. Entities
 * with no hours at all are left out; a zero bar says nothing.
 */
export function entityLoads(days: WeekDay[], vocabulary: Entity[]): EntityLoad[] {
  const minutes = new Map<string, number>()
  let weekMinutes = 0

  for (const day of days) {
    for (const row of day.rows) {
      if (!('durationMin' in row)) continue
      weekMinutes += row.durationMin
      const entity = rowEntity(row, vocabulary)
      if (entity) minutes.set(entity.id, (minutes.get(entity.id) ?? 0) + row.durationMin)
    }
  }

  return vocabulary
    .filter((e) => minutes.has(e.id))
    .map((entity) => {
      const owned = minutes.get(entity.id) ?? 0
      const target = entity.metadata?.weekly_hours ?? null
      const denominator = target ? target * 60 : weekMinutes
      return {
        entity,
        minutes: owned,
        target,
        fraction: denominator ? Math.min(1, owned / denominator) : 0,
      }
    })
    .sort((a, b) => b.minutes - a.minutes)
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
