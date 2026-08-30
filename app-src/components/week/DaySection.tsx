'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Markdown, { inline } from '@/lib/markdown'
import {
  clock, committedMinutes, dayKey, dayTitle, entityCode, longHours, matchTask, meridiem,
  overlaps, rowEntity, rowTitle,
  type DayStatus, type Entity, type MatchableTask, type WeekDay, type WeekRow,
} from '@/lib/weekDoc'
import StartFocusButton from '../pomodoro/StartFocusButton'
import { cardStyle, Empty, RegionHead } from '../jobs/ui'

function Schedule({
  day, checked, onToggle, tasks, vocabulary,
}: {
  day: WeekDay
  checked: Set<string>
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  tasks: MatchableTask[]
  vocabulary: Entity[]
}) {
  const date = dayKey(day)

  return (
    <div className="sched">
      {day.rows.map((row) => {
        // A collision inside the day is the thing the flat table states as a
        // footnote and never shows — two 🔵 meetings sitting inside a class.
        const clash = day.rows.some((other) => other.id !== row.id && overlaps(row, other))
        // A row is an hour spent on something, not a due date, so the day it
        // sits on never disqualifies a task — which is why the bar to clear is
        // higher here than it is for a deadline (see `matchTask`).
        const task = date
          ? matchTask({ title: rowTitle(row), date }, tasks, {
              requireDate: false, threshold: 0.8, minTokens: 2,
            })
          : null
        return (
          <Row
            key={row.id}
            row={row}
            clash={clash}
            done={checked.has(row.id)}
            onToggle={onToggle}
            task={task}
            entity={rowEntity(row, vocabulary)}
          />
        )
      })}
    </div>
  )
}

function Row({
  row, clash, done, onToggle, task, entity,
}: {
  row: WeekRow
  clash: boolean
  done: boolean
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  task: MatchableTask | null
  entity: Entity | null
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
      {/* The right slot, in priority order: a collision is the only thing here
          that is *wrong*, so it outranks everything; then the fact that a real
          task row is behind this hour; then, failing both, what the hour is
          for. Only one of the three ever shows — three tags on a schedule line
          is a legend, not a schedule. */}
      <span className="sched-rt">
        {clash ? (
          <span style={{ color: 'var(--coral)' }}>overlaps</span>
        ) : task ? (
          <>
            <span title={`Tracked as “${task.title}”`}>tracked</span>
            {/* The ▶ rides along free: a row joined to a task can start a focus
                session against it, and the time lands under the task rather
                than under nothing. */}
            <StartFocusButton taskId={task.id} taskTitle={task.title} className="" />
          </>
        ) : entity ? (
          <span title={entity.name}>{entityCode(entity).toLowerCase()}</span>
        ) : null}
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
  day, status, checked, onToggle, tasks, vocabulary,
}: {
  day: WeekDay
  status: DayStatus
  checked: Set<string>
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  tasks: MatchableTask[]
  vocabulary: Entity[]
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
        ? <Schedule day={day} checked={checked} onToggle={onToggle} tasks={tasks} vocabulary={vocabulary} />
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
