'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Markdown from '@/lib/markdown'
import {
  clock, committedMinutes, formatHours, meridiem, overlaps,
  type DayStatus, type WeekDay, type WeekRow,
} from '@/lib/weekDoc'
import { cardStyle } from '../jobs/ui'

function Schedule({ day }: { day: WeekDay }) {
  if (!day.rows.length) return null

  return (
    <div style={{ display: 'grid', gap: 2 }}>
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
    <div style={{
      display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', gap: 'var(--s3)',
      alignItems: 'baseline', padding: 'var(--s3) var(--s3) var(--s3) 0',
      borderBottom: '1px solid var(--rule-2)',
      borderLeft: `1px solid ${row.meeting ? 'var(--champagne)' : 'transparent'}`,
      paddingLeft: row.meeting ? 'var(--s3)' : 0,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
        color: row.kind === 'timed' ? 'var(--ash)' : 'var(--slate)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {when}
      </span>
      <span style={{ fontSize: 13, color: row.anchor ? 'var(--ivory)' : 'var(--ash)', lineHeight: 1.5, minWidth: 0 }}>
        <Markdown md={row.rawWhat} compact />
        {clash && (
          <span style={{
            marginLeft: 'var(--s2)', fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.06em', color: 'var(--coral)',
          }}>
            overlaps
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * Today expanded, past collapsed, future summarised.
 *
 * The file renders seven days flat, so on Wednesday you scroll past four you
 * can't act on any more. The document's own structure knows which day is
 * which; this is that structure spent.
 */
export default function DaySection({
  day, status, defaultOpen,
}: { day: WeekDay; status: DayStatus; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [showProse, setShowProse] = useState(status === 'today')
  const minutes = committedMinutes(day)
  const isToday = status === 'today'

  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <section
      id={day.id}
      style={{
        ...cardStyle,
        borderLeft: isToday ? '1px solid var(--champagne)' : 0,
        paddingLeft: isToday ? 'var(--s4)' : 0,
        scrollMarginTop: 64,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', width: '100%',
          padding: 'var(--s2) 0', background: 'transparent', border: 0,
          borderBottom: '1px solid var(--rule)',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Chevron size={14} color="var(--ink-4)" aria-hidden />
        <span style={{
          fontSize: 14, fontWeight: 400, letterSpacing: '0.04em',
          color: isToday ? 'var(--champagne)' : status === 'past' ? 'var(--slate)' : 'var(--ivory)',
        }}>
          {day.heading}
        </span>
        {isToday && (
          <span className="mono" style={{
            fontSize: 10, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--champagne)',
          }}>
            today
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--s3)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate)' }}>
          {day.rows.length > 0 && <span>{day.rows.length} rows</span>}
          <span>{formatHours(minutes)}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: 'var(--s3) 0 var(--s4)' }}>
          {day.rows.length > 0 ? <Schedule day={day} /> : (
            <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>
              Nothing scheduled.
            </div>
          )}

          {day.prose && (
            showProse ? (
              // The prose is the *why* — why notes come before quizzes, why
              // Thursday morning is protected. It is never chopped into
              // fields; a future day just doesn't lead with it.
              <div style={{ marginTop: 'var(--s4)', paddingTop: 'var(--s4)', borderTop: '1px solid var(--rule)' }}>
                <Markdown md={day.prose} />
              </div>
            ) : (
              <button
                onClick={() => setShowProse(true)}
                style={{
                  marginTop: 'var(--s3)', fontFamily: 'var(--font-mono)', fontSize: 10,
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
        </div>
      )}
    </section>
  )
}
