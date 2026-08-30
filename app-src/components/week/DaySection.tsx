'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Markdown, { inline } from '@/lib/markdown'
import {
  clock, committedMinutes, dayTitle, longHours, meridiem, overlaps,
  type DayStatus, type WeekDay, type WeekRow,
} from '@/lib/weekDoc'
import { cardStyle, Empty, RegionHead } from '../jobs/ui'

function Schedule({
  day, checked, onToggle,
}: { day: WeekDay; checked: Set<string>; onToggle: ((row: WeekRow, next: boolean) => void) | null }) {
  return (
    <div className="sched">
      {day.rows.map((row) => {
        // A collision inside the day is the thing the flat table states as a
        // footnote and never shows — two 🔵 meetings sitting inside a class.
        const clash = day.rows.some((other) => other.id !== row.id && overlaps(row, other))
        return (
          <Row
            key={row.id}
            row={row}
            clash={clash}
            done={checked.has(row.id)}
            onToggle={onToggle}
          />
        )
      })}
    </div>
  )
}

function Row({
  row, clash, done, onToggle,
}: {
  row: WeekRow
  clash: boolean
  done: boolean
  onToggle: ((row: WeekRow, next: boolean) => void) | null
}) {
  const when =
    row.kind === 'timed' ? `${clock(row.start)}–${clock(row.end)}${meridiem(row.end)}`
    : row.kind === 'duration' ? `${row.durationMin} min`
    : row.rawTime || '—'

  // The What cell is markdown; an aria-label reads the asterisks aloud.
  const label = row.rawWhat.replace(/[*`]/g, '').trim() || 'this row'

  return (
    <>
      {/* A day with no date behind it has nowhere to write a check, so the
          column holds its width and stays empty rather than offering a
          control that would drop the tap. */}
      <span className="sched-ck">
        {onToggle && (
          <button
            type="button"
            className="check-circle"
            data-done={done}
            aria-pressed={done}
            aria-label={`Mark “${label}” ${done ? 'not done' : 'done'}`}
            onClick={() => onToggle(row, !done)}
          >
            <Check size={8} strokeWidth={3} />
          </button>
        )}
      </span>
      <span className="sched-tm" style={done ? { opacity: 0.5 } : undefined}>{when}</span>
      {/* `inline` rather than `<Markdown>`: a row is one table cell, and the
          block renderer wraps it in a paragraph whose margins break the
          baseline the three columns share. */}
      <span
        className="sched-what"
        style={{
          color: done ? 'var(--slate)' : row.anchor ? 'var(--ivory)' : 'var(--ash)',
          textDecoration: done ? 'line-through' : undefined,
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
export default function DaySection({
  day, status, checked, onToggle,
}: {
  day: WeekDay
  status: DayStatus
  checked: Set<string>
  onToggle: ((row: WeekRow, next: boolean) => void) | null
}) {
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

      {day.rows.length > 0
        ? <Schedule day={day} checked={checked} onToggle={onToggle} />
        : <Empty>Nothing scheduled.</Empty>}

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
