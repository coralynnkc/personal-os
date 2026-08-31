'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import Markdown, { inline } from '@/lib/markdown'
import { eventsOnDate, rowClash, type CalEvent, type Clash } from '@/lib/dayTimeline'
import {
  chosenArm, clock, committedMinutes, dayKey, dayTitle, entityCode, longHours,
  meridiem, rowEntity, rowTask, rowTitle, rowWhat,
  type ArmId, type DayState, type DayStatus, type Entity, type MatchableTask, type WeekDay,
  type WeekRow,
} from '@/lib/weekDoc'
import StartFocusButton from '../pomodoro/StartFocusButton'
import TaskPicker from './TaskPicker'
import Timeline from './Timeline'
import { cardStyle, Empty, RegionHead } from '../jobs/ui'

type Choose = (row: WeekRow, arm: ArmId | null) => void
/** Joining a row to a task by hand — a task id, `NO_TASK`, or null to clear. */
type Link = (row: WeekRow, taskId: string | null) => void
/**
 * The matched task rides along with the tick. The join is computed here, where
 * the row is drawn, and the writer needs it to complete the task in the same
 * gesture — recomputing it a second time up there would be the same fuzzy
 * match run twice on the same row.
 */
type Toggle = (row: WeekRow, next: boolean, task: MatchableTask | null) => void

function Schedule({
  day, state, onToggle, onChoose, onLink, tasks, vocabulary, events,
}: {
  day: WeekDay
  state: DayState
  onToggle: Toggle | null
  onChoose: Choose | null
  onLink: Link | null
  tasks: MatchableTask[]
  vocabulary: Entity[]
  events: CalEvent[]
}) {
  const date = dayKey(day)
  // Resolved once for the day, not once per row: every row asks the same
  // question of the same events, and re-reading the calendar per line is the
  // difference between a render and a stall on a nine-row Tuesday.
  const eventSpans = useMemo(
    () => (date ? eventsOnDate(events, date).timed : []),
    [events, date],
  )
  // Which row's picker is open, if any. One at a time, and it lives here
  // rather than in the row so that opening a second closes the first.
  const [picking, setPicking] = useState<WeekRow | null>(null)

  return (
    <div className="sched">
      {day.rows.map((row) => {
        // Which way this row's fork went, if it has one and the week answered.
        const choice = state.branches[row.id]
        // A collision inside the day *or* with the calendar. The lecture is
        // the one the flat table could never see: it lives in another system,
        // and a plan written through it looks fine until you are in the room.
        const clash = rowClash(row, day.rows, eventSpans)
        // A row is an hour spent on something, not a due date, so the day it
        // sits on never disqualifies a task — which is why the bar to clear is
        // higher here than it is for a deadline (see `matchTask`). A link the
        // week wrote by hand outranks that guess entirely.
        const link = state.links[row.id]
        const task = rowTask(row, date, tasks, choice, link)
        return (
          <Row
            key={row.id}
            row={row}
            clash={clash}
            // A joined row has one answer to "is this done", and it is the
            // task's — completing it on the tasks tab has to show up here, and
            // `notes.week.checked` is only the record for rows that stand
            // alone. The tick writes both, so the two never disagree.
            done={task ? Boolean(task.completed_at) : state.checked.includes(row.id)}
            choice={choice}
            onToggle={onToggle}
            onChoose={onChoose}
            task={task}
            linked={Boolean(link)}
            onPick={onLink ? () => setPicking(row) : null}
            entity={rowEntity(row, vocabulary, choice)}
          />
        )
      })}
      {picking && date && onLink && (
        <TaskPicker
          title={rowTitle(picking, state.branches[picking.id])}
          date={date}
          tasks={tasks}
          link={state.links[picking.id]}
          matched={rowTask(picking, date, tasks, state.branches[picking.id], state.links[picking.id])}
          onPick={(taskId) => { onLink(picking, taskId); setPicking(null) }}
          onClose={() => setPicking(null)}
        />
      )}
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

/**
 * The right slot's word, as a control when the day can hold an answer and as
 * plain text when it can't — a dateless day has nowhere to write a link, the
 * same reason its check circle stays away.
 */
function Tracked({
  label, title, onPick,
}: { label: string; title: string; onPick: (() => void) | null }) {
  if (!onPick) return <span title={title}>{label}</span>
  return (
    <button type="button" className="sched-link tap" title={title} onClick={onPick}>
      {label}
    </button>
  )
}

/** The right slot is one nowrap line; a lecture's full name would push it off. */
function short(name: string): string {
  return name.length > 16 ? `${name.slice(0, 15).trimEnd()}\u2026` : name
}

function Row({
  row, clash, done, choice, onToggle, onChoose, task, linked, onPick, entity,
}: {
  row: WeekRow
  /** What this hour runs into: another row of the same day, or the calendar. */
  clash: Clash | null
  done: boolean
  choice: string | undefined
  onToggle: Toggle | null
  onChoose: Choose | null
  task: MatchableTask | null
  /** Whether the join was chosen by hand rather than guessed. */
  linked: boolean
  /** Opens the picker. Null on a day with nowhere to write the answer. */
  onPick: (() => void) | null
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
            onClick={() => onToggle(row, !done, task)}
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
        {/* An hour the calendar already owns, named. Not an error and not
            coral: a row can be *for* the event it sits inside ("On the plane"
            during the flight), so this states the fact in the colour that
            means someone else booked it and leaves the judgement alone. It
            goes before the rest rather than instead of it — losing the link
            and the ▶ to a lecture you knew about is the worse trade. */}
        {!skipped && clash?.kind === 'calendar' && (
          <span style={{ color: 'var(--royal)' }} title={`During “${clash.name}” on your calendar`}>
            during {short(clash.name)}
          </span>
        )}
        {/* A row the week decided against isn't an hour any more, so it claims
            nothing here — least of all a ▶ that would start a timer on it. */}
        {skipped ? null : clash?.kind === 'row' ? (
          <span style={{ color: 'var(--coral)' }} title="Overlaps another row this day">overlaps</span>
        ) : task ? (
          <>
            {/* "tracked" is now a promise about the checkbox, not a footnote:
                the circle to the left of this row completes that task. It is
                also the way back into the picker — the thing you want when the
                promise is about the wrong task. */}
            <Tracked
              label={linked ? 'linked' : 'tracked'}
              title={
                `${linked ? 'Linked to' : 'Tracked as'} “${task.title}” — ticking this row `
                + `${done ? 'reopens' : 'completes'} it`
                + (onPick ? '. Click to change.' : '')
              }
              onPick={onPick}
            />
            {/* The ▶ rides along free: a row joined to a task can start a focus
                session against it, and the time lands under the task rather
                than under nothing. */}
            <StartFocusButton taskId={task.id} taskTitle={task.title} className="" />
          </>
        ) : (
          <>
            {entity && <span title={entity.name}>{entityCode(entity).toLowerCase()}</span>}
            {/* Half the rows never find a task on their own — the titles are
                written twice by hand and drift — so an unjoined row offers the
                one gesture that fixes it rather than staying silent. */}
            {onPick && (
              <Tracked
                label="link"
                title="Choose the task this row is about"
                onPick={onPick}
              />
            )}
          </>
        )}
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
  day, status, state, onToggle, onChoose, onLink, tasks, vocabulary, events, calError, onRetryCal,
}: {
  day: WeekDay
  status: DayStatus
  state: DayState
  onToggle: Toggle | null
  onChoose: Choose | null
  onLink: Link | null
  tasks: MatchableTask[]
  vocabulary: Entity[]
  /** What the calendar already owns of this day — the other half of the axis. */
  events: CalEvent[]
  calError: string | null
  onRetryCal: () => void
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

      {/* The shape of the day first, then the day as a list. The axis is what
          says an hour is *taken*; the list is what you tick. */}
      <Timeline
        day={day} state={state} events={events} calError={calError} onRetryCal={onRetryCal}
      />

      {day.rows.length > 0
        ? (
          <Schedule
            day={day} state={state} onToggle={onToggle} onChoose={onChoose} onLink={onLink}
            tasks={tasks} vocabulary={vocabulary} events={events}
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
