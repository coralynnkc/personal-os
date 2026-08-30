'use client'

import Link from 'next/link'
import { TONE_COLOR } from '@/lib/taskDisplay'
import { deadlineTone, matchTask, shortDate, type Deadline, type MatchableTask } from '@/lib/weekDoc'
import { cardStyle, labelStyle } from '../jobs/ui'

/**
 * Every deadline in the week doc is written twice — once as prose here, once
 * as a real `tasks` row — and the two drift. This joins them and says which is
 * which: a deadline with no task behind it is called out as **not tracked**
 * rather than quietly trusted.
 *
 * Read-only on purpose. The document proposes; `tasks` stays the system of
 * record, and creating the missing row from here is the next step, not this
 * one. (The schedule's checkboxes *do* write through to the task — a deadline
 * is a date rather than an hour, so there is no gesture here to write with.)
 */
export default function DeadlineStrip({
  deadlines, tasks,
}: { deadlines: Deadline[]; tasks: MatchableTask[] }) {
  if (!deadlines.length) return null

  return (
    <div style={cardStyle}>
      <div style={{ ...labelStyle, marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)' }}>
        Deadlines behind this week
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {deadlines.map((d) => {
          const task = matchTask(d, tasks)
          const color = TONE_COLOR[deadlineTone(d.date)]
          return (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
                padding: 'var(--s2) 0', borderBottom: '1px solid var(--rule-2)',
                minWidth: 0, flexWrap: 'wrap',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                color, whiteSpace: 'nowrap',
              }}>
                {shortDate(d.date)}{d.time ? ` · ${d.time}` : ''}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ivory)', minWidth: 0, overflowWrap: 'anywhere' }}>{d.title}</span>
              {task ? (
                // The task list now includes finished tasks, so a deadline can
                // say the one thing it never could: that it is already done.
                <Link
                  href="/tasks"
                  title={`${task.completed_at ? 'Done' : 'Tracked'} as “${task.title}”`}
                  style={{
                    marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10,
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: task.completed_at ? 'var(--ok)' : 'var(--slate)',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  {task.completed_at ? 'done' : 'tracked'}
                </Link>
              ) : (
                <span
                  title="Stated in the week doc, with no matching task row"
                  style={{
                    marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10,
                    letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'var(--amber)', whiteSpace: 'nowrap',
                  }}
                >
                  not tracked
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
