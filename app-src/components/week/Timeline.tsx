'use client'

import { useMemo, type CSSProperties } from 'react'
import {
  axisRange, calendarCovers, eventsOnDate, hourLabel, packLane, rowSpans, spanClashes, spanLabel,
  type CalEvent, type Span,
} from '@/lib/dayTimeline'
import { rowTitle, type DayState, type WeekDay } from '@/lib/weekDoc'
import { ErrorRow, labelStyle } from '../jobs/ui'

/** A minute is this many pixels: an hour is 44px, which fits a two-line block. */
const PX_PER_MIN = 44 / 60

/**
 * The day drawn against the clock, with what the calendar already owns of it
 * beside it.
 *
 * The schedule below is a list: it has clock times and no hours. Two things
 * booked over each other read as two consecutive lines, and a plan written
 * straight through a lecture reads as nothing at all, because the lecture is
 * in a different system. Here both lanes hang off one axis, so the collision
 * is a shape rather than a footnote. A plan block sitting inside an hour the
 * calendar already owns takes that lane's colour rather than an alarm one: it
 * is often exactly right ("On the plane" during the flight), and the geometry
 * is what makes the case where it isn't obvious.
 */
export default function Timeline({
  day, state, events, calError, onRetryCal,
}: {
  day: WeekDay
  state: DayState
  events: CalEvent[]
  calError: string | null
  onRetryCal: () => void
}) {
  // A weekend written as one heading owns two dates and one set of rows; the
  // first is the day its state is written under, so it is the day the
  // calendar is asked about too (see `dayKey`).
  const date = day.dates[0] ?? null

  const { plan, cal, allDay, range, unplaced } = useMemo(() => {
    const spans = rowSpans(day.rows, (row) => rowTitle(row, state.branches[row.id]))
    const dayEvents = date ? eventsOnDate(events, date) : { timed: [], allDay: [] }
    return {
      plan: packLane(spans),
      cal: packLane(dayEvents.timed),
      allDay: dayEvents.allDay,
      range: axisRange([...spans, ...dayEvents.timed]),
      // Budgets and untimed rows have no place on the clock. Saying how many
      // keeps the axis from reading as the whole day when it is half of it.
      unplaced: day.rows.length - spans.length,
    }
  }, [day, state.branches, events, date])

  // Nothing on the clock at all — the list below is the whole day, and an
  // empty axis would just be furniture.
  if (!range) return null

  const hours: number[] = []
  for (let m = range.from; m <= range.to; m += 60) hours.push(m)
  const height = (range.to - range.from) * PX_PER_MIN

  const outsideWindow = date ? !calendarCovers(date) : true

  return (
    <div className="tl" style={{ marginBottom: 'var(--s4)' }}>
      <div className="tl-head">
        <span style={labelStyle}>the clock</span>
        <span className="tl-key">
          <i className="tl-swatch tl-swatch-plan" /> planned
          <i className="tl-swatch tl-swatch-cal" /> calendar
        </span>
      </div>

      {allDay.length > 0 && (
        <div className="tl-allday">
          {allDay.map((ev) => <span key={ev.id} className="tl-chip">{ev.title}</span>)}
        </div>
      )}

      <div
        className="tl-body"
        style={{ height, '--tl-hour': `${PX_PER_MIN * 60}px` } as CSSProperties}
      >
        <div className="tl-hours">
          {hours.map((m) => (
            <div key={m} className="tl-hour" style={{ top: (m - range.from) * PX_PER_MIN }}>
              {hourLabel(m)}
            </div>
          ))}
        </div>

        <Lane spans={plan} from={range.from} against={cal} />
        <Lane spans={cal} from={range.from} against={[]} calendar />
      </div>

      {/* The calendar half of the axis has three ways of being empty, and
          only one of them means a clear day. */}
      {calError ? (
        <div style={{ marginTop: 'var(--s2)' }}>
          <ErrorRow message={calError} onRetry={onRetryCal} />
        </div>
      ) : outsideWindow ? (
        <div className="tl-note">outside the calendar window — events unknown here</div>
      ) : cal.length === 0 && allDay.length === 0 ? (
        <div className="tl-note">nothing on the calendar</div>
      ) : null}

      {unplaced > 0 && (
        <div className="tl-note">
          {unplaced} {unplaced === 1 ? 'row has' : 'rows have'} no place on the clock
        </div>
      )}
    </div>
  )
}

/**
 * One lane. Blocks are absolutely placed against the shared axis, and the
 * sub-columns `packLane` worked out are what keeps two overlapping blocks
 * both visible rather than one hidden behind the other.
 */
function Lane({
  spans, from, against, calendar = false,
}: {
  spans: Span[]
  from: number
  against: { startMin: number; endMin: number }[]
  calendar?: boolean
}) {
  return (
    <div className="tl-lane">
      {spans.map((span) => {
        const clash = spanClashes(span, against)
        const width = 100 / span.columns
        // A half-hour block is 22px tall, which is one line and a bit — the
        // stacked time and title would be cut through the middle. Short blocks
        // set the two on one line instead of losing half of both.
        const short = span.endMin - span.startMin < 45
        return (
          <div
            key={span.id}
            className={[
              'tl-block', short && 'tl-block-short',
              calendar && 'tl-block-cal', clash && 'tl-block-clash',
            ].filter(Boolean).join(' ')}
            style={{
              top: (span.startMin - from) * PX_PER_MIN,
              height: Math.max(16, (span.endMin - span.startMin) * PX_PER_MIN - 2),
              left: `${span.column * width}%`,
              width: `calc(${width}% - 2px)`,
            }}
            title={`${spanLabel(span)} · ${span.title}${clash ? ' — inside an hour the calendar owns' : ''}`}
          >
            <span className="tl-when">{spanLabel(span)}</span>
            <span className="tl-what">{span.title}</span>
          </div>
        )
      })}
    </div>
  )
}
