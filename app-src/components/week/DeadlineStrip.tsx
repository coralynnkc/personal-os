'use client'

import Link from 'next/link'
import { TONE_COLOR } from '@/lib/taskDisplay'
import { deadlineTone, matchTask, shortDate, type Deadline, type MatchableTask } from '@/lib/weekDoc'
import { cardStyle } from '../jobs/ui'

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
      <div className="panel-title" style={{ marginBottom: 12 }}>Deadlines behind this week</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {deadlines.map((d) => {
          const task = matchTask(d, tasks)
          const color = TONE_COLOR[deadlineTone(d.date)]
          return (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '9px 13px', borderRadius: 'var(--radius-sm)',
                // The urgency colour tints the fill instead of ringing the row;
                // three outlined boxes in a row read as a form, not a warning.
                background: `color-mix(in oklch, ${color} 11%, var(--ink-1))`,
                minWidth: 0,
              }}
            >
              <span className="meta" style={{ color, whiteSpace: 'nowrap' }}>
                {shortDate(d.date)}{d.time ? ` · ${d.time}` : ''}
              </span>
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--ink-6)' }}>{d.title}</span>
              {task ? (
                <Link
                  href="/tasks"
                  title={`Tracked as “${task.title}”`}
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--ok)', textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  tracked
                </Link>
              ) : (
                <span
                  title="Stated in the week doc, with no matching task row"
                  style={{
                    fontSize: 'var(--text-sm)',
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
