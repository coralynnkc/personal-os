'use client'

import { useEffect, useState } from 'react'
import Markdown, { inline } from '@/lib/markdown'
import {
  clock, committedMinutes, dayTitle, longHours, meridiem, overlaps,
  type DayStatus, type WeekDay, type WeekRow,
} from '@/lib/weekDoc'
import { cardStyle, Empty, RegionHead } from '../jobs/ui'

function Schedule({ day }: { day: WeekDay }) {
  return (
    <div className="sched">
      {day.rows.map((row) => {
        // A collision inside the day is the thing the flat table states as a
        // footnote and never shows — two 🔵 meetings sitting inside a class.
        const clash = day.rows.some((other) => other.id !== row.id && overlaps(row, other))
        return <Row key={row.id} row={row} clash={clash} />
      })}
    </div>
  )
}

function Row({ row, clash }: { row: WeekRow; clash: boolean }) {
  const when =
    row.kind === 'timed' ? `${clock(row.start)}–${clock(row.end)}${meridiem(row.end)}`
    : row.kind === 'duration' ? `${row.durationMin} min`
    : row.rawTime || '—'

  return (
    <>
      <span className="sched-tm">{when}</span>
      {/* `inline` rather than `<Markdown>`: a row is one table cell, and the
          block renderer wraps it in a paragraph whose margins break the
          baseline the three columns share. */}
      <span
        className="sched-what"
        style={{
          color: row.anchor ? 'var(--ivory)' : 'var(--ash)',
          borderLeft: `1px solid ${row.meeting ? 'var(--champagne)' : 'transparent'}`,
          paddingLeft: row.meeting ? 'var(--s3)' : 0,
        }}
      >
        {inline(row.rawWhat, row.id)}
      </span>
      {/* The right slot. Overlaps are the only thing that claims it today; a
          matched task's state and the row's entity land here next (PLAN §4C),
          which is why the column exists before it is full. */}
      <span className="sched-rt" style={clash ? { color: 'var(--coral)' } : undefined}>
        {clash ? 'overlaps' : ''}
      </span>
    </>
  )
}

/**
 * One day, in full.
 *
 * The file renders seven days flat, and the first pass at this tab rendered
 * seven accordions — which is the same wall with a lid on it. Seven days is
 * not a thing you read; one day is. The strip above picks which, and this
 * spends the whole column on it.
 */
export default function DaySection({ day, status }: { day: WeekDay; status: DayStatus }) {
  const [showProse, setShowProse] = useState(status === 'today')
  const minutes = committedMinutes(day)

  // Switching days must not carry the previous day's disclosure with it: the
  // reasoning leads on today and stays folded everywhere else.
  useEffect(() => { setShowProse(status === 'today') }, [day.id, status])

  return (
    // The id stays so `#day-saturday-august-29` links from before still land.
    <section id={day.id} style={{ ...cardStyle, scrollMarginTop: 64 }}>
      <RegionHead title={dayTitle(day)} right={longHours(minutes)} />

      {day.label && (
        <div className="eyebrow" style={{ marginTop: 'calc(-1 * var(--s3))', marginBottom: 'var(--s3)' }}>
          {day.label}
        </div>
      )}

      {day.rows.length > 0 ? <Schedule day={day} /> : <Empty>Nothing scheduled.</Empty>}

      {day.prose && (
        showProse ? (
          // The prose is the *why* — why notes come before quizzes, why
          // Thursday morning is protected. It is never chopped into fields;
          // a day you are only glancing at just doesn't lead with it.
          <div style={{ marginTop: 'var(--s4)', paddingTop: 'var(--s4)', borderTop: '1px solid var(--rule)' }}>
            <Markdown md={day.prose} />
          </div>
        ) : (
          <button
            onClick={() => setShowProse(true)}
            className="mono tap"
            style={{
              marginTop: 'var(--s4)', fontSize: 10,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'var(--slate)', background: 'transparent',
              border: 0, borderBottom: '1px solid var(--rule)', borderRadius: 0,
              padding: '0 0 2px', cursor: 'pointer',
            }}
          >
            Show the reasoning
          </button>
        )
      )}
    </section>
  )
}
