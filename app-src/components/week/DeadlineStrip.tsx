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
 * one.
 */
export default function DeadlineStrip({
  deadlines, tasks,
}: { deadlines: Deadline[]; tasks: MatchableTask[] }) {
  if (!deadlines.length) return null

  return (
    <div style={{ ...cardStyle, padding: '12px 16px' }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>Deadlines behind this week</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {deadlines.map((d) => {
          const task = matchTask(d, tasks)
          const color = TONE_COLOR[deadlineTone(d.date)]
          return (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${color}`, background: 'var(--ink-1)',
                minWidth: 0,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                color, whiteSpace: 'nowrap',
              }}>
                {shortDate(d.date)}{d.time ? ` · ${d.time}` : ''}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-6)' }}>{d.title}</span>
              {task ? (
                <Link
                  href="/tasks"
                  title={`Tracked as “${task.title}”`}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                    color: 'var(--ok)', textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  tracked
                </Link>
              ) : (
                <span
                  title="Stated in the week doc, with no matching task row"
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                    color: 'var(--warn)', whiteSpace: 'nowrap',
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
