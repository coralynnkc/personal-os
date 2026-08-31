// Doc rows and calendar events, drawn against the same hours.
//
// The schedule table and the calendar have always been two lists of clock
// times that never met: the week doc says "2:30–3:45 ActBlue sync" and the
// calendar says "ACT 420 lecture, 2–3:15", and nothing in the app noticed
// they were the same ninety minutes. Everything here exists to put both on
// one axis and name the collision.
//
// Minutes since local midnight is the shared unit. Rows are already wall
// clock ("14:30"); events are instants, so they get read in the user's
// timezone — never `toISOString`, which would put a 9pm class on tomorrow.

import { USER_TZ } from './dateKey'
import { localToday, daysUntil } from './taskDisplay'
import type { WeekRow } from './weekDoc'

export type CalEvent = {
  id: string
  title: string
  start: string   // ISO timestamp, or YYYY-MM-DD when allDay
  end: string     // ISO timestamp, or YYYY-MM-DD when allDay
  location?: string
  allDay: boolean
}

/**
 * How far ahead `/api/calendar` reads, and one day back. A day outside that
 * window has no events *known*, which is not the same as no events — the
 * timeline says so rather than drawing an empty lane that would read as a
 * clear afternoon.
 */
export const CAL_WINDOW_DAYS = 30

export function calendarCovers(date: string, today = localToday()): boolean {
  const n = daysUntil(date, today)
  return n >= -1 && n <= CAL_WINDOW_DAYS
}

/** An hour on the axis: what it is, when it runs, and where it came from. */
export type Span = {
  id: string
  title: string
  startMin: number
  endMin: number
  /** Where the hour is written down — the two lanes of the timeline. */
  lane: 'plan' | 'calendar'
  /** 🔵 in the doc, i.e. something someone else scheduled. */
  meeting: boolean
  location?: string
  /** Filled by `packLane`: which sub-column of its lane the block sits in. */
  column: number
  columns: number
}

const TIME_PARTS = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = TIME_PARTS.get(tz)
  if (!f) {
    // h23 explicitly: `hour12: false` renders midnight as 24 in some ICU
    // builds, which would put the first event of the day at the bottom.
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
    TIME_PARTS.set(tz, f)
  }
  return f
}

/** Minutes since local midnight, for an instant read in `tz`. */
export function minutesInTz(iso: string, tz = USER_TZ): number {
  const parts = formatter(tz).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

function dateKeyInTz(iso: string, tz = USER_TZ): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Where a row sits on the clock, or null for a budget with no place on it. */
export function rowSpan(row: WeekRow): { startMin: number; endMin: number } | null {
  if (row.kind !== 'timed') return null
  const startMin = hhmmToMinutes(row.start)
  const endMin = hhmmToMinutes(row.end)
  // A row ending before it starts is the twelve-hour ambiguity the parser
  // couldn't settle. It is still an hour that happened; give it the minimum
  // height rather than a negative one.
  return { startMin, endMin: Math.max(endMin, startMin + 5) }
}

/**
 * The events touching one local date, clamped to it.
 *
 * An event that started yesterday and ends this morning is this morning's
 * problem too, so it enters the day at 00:00 rather than not at all — the
 * clamp is what keeps a multi-day event from drawing off the top of the axis.
 */
export function eventsOnDate(events: CalEvent[], date: string, tz = USER_TZ): {
  timed: Omit<Span, 'column' | 'columns'>[]
  allDay: CalEvent[]
} {
  const timed: Omit<Span, 'column' | 'columns'>[] = []
  const allDay: CalEvent[] = []

  for (const ev of events) {
    if (ev.allDay) {
      // iCal date-only DTEND is exclusive: a one-day event ends the next day.
      if (ev.start.slice(0, 10) <= date && date < ev.end.slice(0, 10)) allDay.push(ev)
      continue
    }
    const startKey = dateKeyInTz(ev.start, tz)
    const endKey = dateKeyInTz(ev.end, tz)
    if (startKey > date || endKey < date) continue

    const startMin = startKey === date ? minutesInTz(ev.start, tz) : 0
    const endMin = endKey === date ? minutesInTz(ev.end, tz) : 1440
    timed.push({
      id: ev.id,
      title: ev.title,
      startMin,
      endMin: Math.max(endMin, startMin + 5),
      lane: 'calendar',
      meeting: true,
      location: ev.location,
    })
  }

  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  return { timed, allDay }
}

/** The doc's own timed rows, as spans. Untimed and `~90 min` rows have no place here. */
export function rowSpans(rows: WeekRow[], titleOf: (row: WeekRow) => string): Omit<Span, 'column' | 'columns'>[] {
  const out: Omit<Span, 'column' | 'columns'>[] = []
  for (const row of rows) {
    const span = rowSpan(row)
    if (!span) continue
    out.push({ id: row.id, title: titleOf(row), ...span, lane: 'plan', meeting: row.meeting })
  }
  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
}

/**
 * Side-by-side columns for blocks that overlap inside one lane.
 *
 * Two 🔵 meetings booked over each other are the collision the flat table
 * states as a footnote; stacking them in one column would hide it a second
 * way. Greedy: a block takes the first column whose last block has ended,
 * and the whole overlapping cluster then shares the widest count so the
 * blocks in it line up.
 */
export function packLane(spans: Omit<Span, 'column' | 'columns'>[]): Span[] {
  const out: Span[] = []
  let cluster: Span[] = []
  let clusterEnd = -1
  const ends: number[] = []

  const close = () => {
    for (const s of cluster) s.columns = ends.length
    cluster = []
    ends.length = 0
    clusterEnd = -1
  }

  for (const span of spans) {
    if (span.startMin >= clusterEnd) close()
    let column = ends.findIndex((end) => end <= span.startMin)
    if (column === -1) { column = ends.length; ends.push(0) }
    ends[column] = span.endMin
    clusterEnd = Math.max(clusterEnd, span.endMin)
    const packed: Span = { ...span, column, columns: 1 }
    cluster.push(packed)
    out.push(packed)
  }
  close()
  return out
}

/** The hours the axis has to cover, rounded out to whole hours. */
export function axisRange(spans: { startMin: number; endMin: number }[]): { from: number; to: number } | null {
  if (!spans.length) return null
  const from = Math.min(...spans.map((s) => s.startMin))
  const to = Math.max(...spans.map((s) => s.endMin))
  return { from: Math.floor(from / 60) * 60, to: Math.min(1440, Math.ceil(to / 60) * 60) }
}

function spansOverlap(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin
}

/**
 * What a row runs into — the whole point of drawing the two lanes.
 *
 * Two kinds, and they are not the same fact. Two rows of one table booked over
 * each other is a plan contradicting *itself*: an error, and it keeps the coral
 * it has always had. A row sitting inside a calendar event is not an error —
 * "On the plane: The Elements of Scrum" during the flight to Los Angeles is
 * exactly right — it is an hour someone else already owns, which is what
 * `--royal` means. So the calendar collision is named and quiet, and the
 * judgement is left where it belongs.
 *
 * The doc-vs-doc case is checked first for the same reason: the wrong thing
 * outranks the merely true one.
 */
export type Clash = { kind: 'row' } | { kind: 'calendar'; name: string }

export function rowClash(
  row: WeekRow, rows: WeekRow[], eventSpans: { title: string; startMin: number; endMin: number }[],
): Clash | null {
  const span = rowSpan(row)
  if (!span) return null

  for (const other of rows) {
    if (other.id === row.id) continue
    const otherSpan = rowSpan(other)
    if (otherSpan && spansOverlap(span, otherSpan)) return { kind: 'row' }
  }
  for (const ev of eventSpans) {
    if (spansOverlap(span, ev)) return { kind: 'calendar', name: ev.title }
  }
  return null
}

/** Whether a plan block sits inside an hour the calendar already owns. */
export function spanClashes(
  span: { startMin: number; endMin: number }, others: { startMin: number; endMin: number }[],
): boolean {
  return others.some((other) => spansOverlap(span, other))
}

export function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${h < 12 ? 'a' : 'p'}`
}

export function spanLabel(span: { startMin: number; endMin: number }): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 24
    const hour = h % 12 === 0 ? 12 : h % 12
    return `${hour}:${String(m % 60).padStart(2, '0')}`
  }
  return `${fmt(span.startMin)}–${fmt(span.endMin)}`
}
