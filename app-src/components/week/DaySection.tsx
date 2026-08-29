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
      display: 'grid', gridTemplateColumns: '108px 1fr', gap: 12,
      alignItems: 'baseline', padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      background: row.meeting ? 'var(--accent-dim)' : 'transparent',
      borderLeft: `2px solid ${clash ? 'var(--danger)' : row.meeting ? 'var(--accent-border)' : 'transparent'}`,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
        color: row.kind === 'timed' ? 'var(--ink-5)' : 'var(--ink-4)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {when}
      </span>
      <span style={{ fontSize: 13, color: row.anchor ? 'var(--ink-6)' : 'var(--ink-5)', lineHeight: 1.5 }}>
        <Markdown md={row.rawWhat} compact />
        {clash && (
          <span style={{
            marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.06em', color: 'var(--danger)',
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
        borderColor: isToday ? 'var(--accent-border)' : 'var(--glass-border)',
        scrollMarginTop: 64,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '10px 14px', background: 'transparent', border: 0,
          borderBottom: open ? '1px solid var(--glass-border)' : 0,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Chevron size={14} color="var(--ink-4)" aria-hidden />
        <span style={{
          fontSize: 14, fontWeight: 600,
          color: isToday ? 'var(--accent)' : status === 'past' ? 'var(--ink-4)' : 'var(--ink-6)',
        }}>
          {day.heading}
        </span>
        {isToday && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--accent)',
            border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 6px',
          }}>
            today
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>
          {day.rows.length > 0 && <span>{day.rows.length} rows</span>}
          <span>{formatHours(minutes)}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '10px 14px 14px' }}>
          {day.rows.length > 0 ? <Schedule day={day} /> : (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', padding: '2px 10px' }}>
              Nothing scheduled.
            </div>
          )}

          {day.prose && (
            showProse ? (
              // The prose is the *why* — why notes come before quizzes, why
              // Thursday morning is protected. It is never chopped into
              // fields; a future day just doesn't lead with it.
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                <Markdown md={day.prose} />
              </div>
            ) : (
              <button
                onClick={() => setShowProse(true)}
                style={{
                  marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--ink-4)', background: 'transparent',
                  border: '1px solid var(--glass-border)', borderRadius: 6,
                  padding: '4px 10px', cursor: 'pointer',
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
