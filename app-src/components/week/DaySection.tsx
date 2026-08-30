'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import Markdown, { inline } from '@/lib/markdown'
import {
  chosenArm, clock, committedMinutes, dayKey, dayTitle, entityCode, longHours, matchTask,
  meridiem, overlaps, rowEntity, rowTitle, rowWhat,
  type ArmId, type DayState, type DayStatus, type Entity, type MatchableTask, type WeekDay,
  type WeekRow,
} from '@/lib/weekDoc'
import StartFocusButton from '../pomodoro/StartFocusButton'
import { cardStyle, Empty, RegionHead } from '../jobs/ui'

type Choose = (row: WeekRow, arm: ArmId | null) => void

function Schedule({
  day, state, onToggle, onChoose, tasks, vocabulary,
}: {
  day: WeekDay
  state: DayState
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  onChoose: Choose | null
  tasks: MatchableTask[]
  vocabulary: Entity[]
}) {
  const date = dayKey(day)

  return (
    <div className="sched">
      {day.rows.map((row) => {
        // Which way this row's fork went, if it has one and the week answered.
        const choice = state.branches[row.id]
        // A collision inside the day is the thing the flat table states as a
        // footnote and never shows — two 🔵 meetings sitting inside a class.
        const clash = day.rows.some((other) => other.id !== row.id && overlaps(row, other))
        // A row is an hour spent on something, not a due date, so the day it
        // sits on never disqualifies a task — which is why the bar to clear is
        // higher here than it is for a deadline (see `matchTask`).
        const task = date
          ? matchTask({ title: rowTitle(row, choice), date }, tasks, {
              requireDate: false, threshold: 0.8, minTokens: 2,
            })
          : null
        return (
          <Row
            key={row.id}
            row={row}
            clash={clash}
            done={state.checked.includes(row.id)}
            choice={choice}
            onToggle={onToggle}
            onChoose={onChoose}
            task={task}
            entity={rowEntity(row, vocabulary, choice)}
          />
        )
      })}
    </div>
  )
}

/**
 * A row that states two futures, before the week has picked one.
 *
 * Rendered flat, "**HW 2 starts here** if Saturday cleared HW 1 — otherwise
 * HW 1, due 8 AM tomorrow" states both and means neither: on Monday afternoon
 * you have to re-derive Saturday to read your own schedule. So the condition
 * leads, the two futures sit under it as the choice they are, and answering it
 * once collapses the row to what it actually was.
 */
function Fork({ row, onChoose }: { row: WeekRow; onChoose: Choose }) {
  const branch = row.branch!
  return (
    <div className="branch" role="group" aria-label={`If ${branch.condition}`}>
      <div className="branch-if">if {branch.condition}</div>
      {branch.arms.map((arm) => (
        <button
          key={arm.id}
          type="button"
          className="branch-arm tap"
          onClick={() => onChoose(row, arm.id)}
        >
          <span className="branch-mark">{arm.id === 'if' ? 'then' : 'else'}</span>
          <span>
            {/* A missing `else` arm is not missing data — it is the answer
                "this doesn't happen", and it has to be sayable. */}
            {arm.what ? inline(arm.what, `${row.id}-${arm.id}`) : <em>it doesn’t happen</em>}
          </span>
        </button>
      ))}
    </div>
  )
}

function Row({
  row, clash, done, choice, onToggle, onChoose, task, entity,
}: {
  row: WeekRow
  clash: boolean
  done: boolean
  choice: string | undefined
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  onChoose: Choose | null
  task: MatchableTask | null
  entity: Entity | null
}) {
  const when =
    row.kind === 'timed' ? `${clock(row.start)}–${clock(row.end)}${meridiem(row.end)}`
    : row.kind === 'duration' ? `${row.durationMin} min`
    : row.rawTime || '—'

  const arm = chosenArm(row, choice)
  // A day with nowhere to write can't hold an answer either, so an unanswerable
  // fork renders as the sentence the file wrote — never as a dead control.
  const open = Boolean(row.branch && !arm && onChoose)
  const skipped = arm?.what === null
  const what = rowWhat(row, choice)

  // The What cell is markdown; an aria-label reads the asterisks aloud.
  const label = what.replace(/[*`]/g, '').trim() || 'this row'

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
          color: done || skipped ? 'var(--slate)' : row.anchor ? 'var(--ivory)' : 'var(--ash)',
          borderLeft: `1px solid ${row.meeting ? 'var(--champagne)' : 'transparent'}`,
          paddingLeft: row.meeting ? 'var(--s3)' : 0,
        }}
      >
        {/* The rule through the text is on the text, not on the cell: a
            decoration set on an ancestor paints straight through every
            descendant, and the `change` link below is not struck out. */}
        {open ? (
          <Fork row={row} onChoose={onChoose!} />
        ) : (
          <span style={{ textDecoration: done || skipped ? 'line-through' : undefined }}>
            {inline(what, row.id)}
          </span>
        )}
        {/* An answered fork keeps its question in the margin: the condition is
            why the row says what it says, and it is the thing you re-read when
            the answer turns out to have been wrong. */}
        {row.branch && arm && onChoose && (
          <button
            type="button"
            className="branch-back tap"
            onClick={() => onChoose(row, null)}
            aria-label={`Reopen: if ${row.branch.condition}`}
          >
            if {row.branch.condition} · change
          </button>
        )}
      </span>
      {/* The right slot, in priority order: a collision is the only thing here
          that is *wrong*, so it outranks everything; then the fact that a real
          task row is behind this hour; then, failing both, what the hour is
          for. Only one of the three ever shows — three tags on a schedule line
          is a legend, not a schedule. */}
      <span className="sched-rt">
        {/* A row the week decided against isn't an hour any more, so it claims
            nothing here — least of all a ▶ that would start a timer on it. */}
        {skipped ? null : clash ? (
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
  day, status, state, onToggle, onChoose, tasks, vocabulary,
}: {
  day: WeekDay
  status: DayStatus
  state: DayState
  onToggle: ((row: WeekRow, next: boolean) => void) | null
  onChoose: Choose | null
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
        ? (
          <Schedule
            day={day} state={state} onToggle={onToggle} onChoose={onChoose}
            tasks={tasks} vocabulary={vocabulary}
          />
        )
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
