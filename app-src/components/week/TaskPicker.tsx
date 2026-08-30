'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  NO_TASK, scoreTask, shortDate, suggestTasks,
  type MatchableTask, type Score,
} from '@/lib/weekDoc'
import { labelStyle } from '../jobs/ui'

/**
 * Why a task is being offered, in the row's own words.
 *
 * The score is a fraction and means nothing on the page; what a person reads a
 * suggestion by is which of *their* words it accounts for. So a full cover
 * says so, a near miss names the word it is missing, and the date — the thing
 * the matcher only ever treats as a tiebreak — says itself out loud.
 */
function why({ want, missing, dated }: Score): string {
  const cover = missing.length === 0
    ? `all ${want.length} words`
    : `missing ${missing.slice(0, 2).map((w) => `“${w}”`).join(', ')}`
  return dated ? `${cover} · due that day` : cover
}

function Option({
  task, note, current, onPick,
}: {
  task: MatchableTask
  note: string
  current: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      className="pick-opt tap"
      onClick={onPick}
      aria-pressed={current}
    >
      <span className="pick-mark">{current && <Check size={11} strokeWidth={3} />}</span>
      <span className="pick-body">
        <span style={{
          color: current ? 'var(--champagne)' : 'var(--ivory)',
          textDecoration: task.completed_at ? 'line-through' : undefined,
        }}>
          {task.title}
        </span>
        <span className="pick-note">
          {[note, task.due_date && shortDate(task.due_date), task.completed_at && 'done']
            .filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}

/**
 * Choosing the task behind a schedule row.
 *
 * The fuzzy matcher joins about half the rows and is deliberately shy about
 * the rest — a wrong automatic join is worse than none. This is the other half
 * of that bargain: the near misses it wouldn't take on its own are exactly
 * what a person needs to see, so they lead, ranked, each saying which of the
 * row's words it accounts for. Everything else is a word away behind the
 * search field.
 *
 * Three answers, not two. A task joins the row; `NO_TASK` is the answer
 * "nothing tracks this", which a row needs to be able to give or a wrong guess
 * could never be dismissed; and clearing hands the row back to the matcher.
 */
export default function TaskPicker({
  title, date, tasks, link, matched, onPick, onClose,
}: {
  /** The row's title — what the suggestions are ranked against. */
  title: string
  date: string
  tasks: MatchableTask[]
  /** What the day has stored for this row: a task id, `NO_TASK`, or nothing. */
  link: string | undefined
  /** The task the row resolves to right now, however it got there. */
  matched: MatchableTask | null
  onPick: (taskId: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const returnTo = useRef<Element | null>(null)

  useEffect(() => {
    returnTo.current = document.activeElement
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // The row's own control is where the tap came from and where the eye is.
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus()
    }
  }, [onClose])

  const suggestions = useMemo(
    () => suggestTasks({ title, date }, tasks, { limit: 6 }),
    [title, date, tasks],
  )

  // The search is a plain substring over every task, open or done, because the
  // reason you are typing at all is that the ranking above didn't have it.
  // Open first, so a stale duplicate never sits above the live one.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .sort((a, b) => (
        Number(Boolean(a.completed_at)) - Number(Boolean(b.completed_at))
        || a.title.localeCompare(b.title)
      ))
      .slice(0, 12)
  }, [query, tasks])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 200 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Task for “${title}”`}
        className="pick"
      >
        <header className="pick-head">
          <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>Tracked by</div>
            <div style={{ fontSize: 14, color: 'var(--ivory)', marginTop: 4 }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap"
            style={{
              flexShrink: 0, background: 'transparent', border: 0, padding: 4,
              color: 'var(--slate)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </header>

        <div className="pick-body-scroll">
          <div style={{ ...labelStyle, padding: 'var(--s3) 0 var(--s2)' }}>Suggested</div>
          {suggestions.length ? (
            suggestions.map(({ task, ...score }) => (
              <Option
                key={task.id}
                task={task}
                note={why(score)}
                current={matched?.id === task.id}
                onPick={() => onPick(task.id)}
              />
            ))
          ) : (
            <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>
              Nothing shares a word with this row — search below.
            </div>
          )}

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every task…"
            aria-label="Search tasks"
            className="pick-search"
          />
          {query.trim() && (
            found.length ? found.map((task) => (
              <Option
                key={task.id}
                task={task}
                note={why(scoreTask({ title, date }, task))}
                current={matched?.id === task.id}
                onPick={() => onPick(task.id)}
              />
            )) : (
              <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>
                No task by that name.
              </div>
            )
          )}
        </div>

        {/* The two answers that aren't a task. "Nothing tracks this" is a real
            answer and sticks; clearing only puts the row back in the matcher's
            hands, so it shows up once there is something to clear. */}
        <footer className="pick-foot">
          <button type="button" className="pick-alt tap" onClick={() => onPick(NO_TASK)}>
            {link === NO_TASK ? '✓ nothing tracks this' : 'nothing tracks this'}
          </button>
          {link && (
            <button type="button" className="pick-alt tap" onClick={() => onPick(null)}>
              back to the automatic match
            </button>
          )}
        </footer>
      </div>
    </>
  )
}
