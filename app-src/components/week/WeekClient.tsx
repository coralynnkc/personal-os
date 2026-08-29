'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Markdown from '@/lib/markdown'
import { localToday } from '@/lib/taskDisplay'
import {
  committedMinutes, dayChipLabel, dayStatus, formatHours,
  type MatchableTask, type PlanningDoc,
} from '@/lib/weekDoc'
import { cardStyle, ErrorRow } from '../jobs/ui'
import DaySection from './DaySection'
import DeadlineStrip from './DeadlineStrip'

type Index = { slug: string; title: string | null }
type Payload = { week: PlanningDoc | null; weeks: Index[]; semester: Index[] }

export default function WeekClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [tasks, setTasks] = useState<MatchableTask[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [docRes, taskRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/tasks?status=open'),
      ])
      if (!docRes.ok) throw new Error(`Documents failed (${docRes.status})`)
      setData(await docRes.json())
      // The deadline strip degrades to "not tracked" without tasks, which is
      // wrong rather than empty — so a task failure is an error too.
      if (!taskRes.ok) throw new Error(`Tasks failed (${taskRes.status})`)
      setTasks(await taskRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (error) {
    return (
      <div style={{ padding: '16px 20px' }}>
        <div style={cardStyle}><ErrorRow message={error} onRetry={load} /></div>
      </div>
    )
  }

  if (!data) {
    return <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>Loading…</div>
  }

  const doc = data.week
  const parsed = doc?.parsed

  if (!doc || !parsed) {
    return (
      <div style={{ padding: '16px 20px' }}>
        <div style={{ ...cardStyle, padding: 16, fontSize: 13, color: 'var(--ink-4)', lineHeight: 1.6 }}>
          No week document synced yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--ink-1)', borderRadius: 6, padding: '1px 5px' }}>
            node scripts/sync-planning-docs.mjs
          </code>{' '}
          to pull <code style={{ fontFamily: 'var(--font-mono)' }}>~/Documents/1-school/planning/</code> into the app.
        </div>
      </div>
    )
  }

  const today = localToday()
  const statuses = parsed.days.map((d) => dayStatus(d, today))
  const todayIndex = statuses.indexOf('today')

  return (
    <div style={{ padding: '16px 20px', display: 'grid', gap: 12, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink-6)' }}>
          {doc.title ?? doc.slug}
        </h1>
        {doc.synced_at && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>
            synced {new Date(doc.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {data.semester.map((s) => (
            <Link key={s.slug} href={`/week/${s.slug}`} style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--accent)', textDecoration: 'none',
            }}>
              {s.title ?? s.slug}
            </Link>
          ))}
        </span>
      </header>

      {/* Day strip: seven chips, today emphasised, each badged with the hours
          it has already committed. Click to jump. */}
      <nav aria-label="Days this week" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {parsed.days.map((day, i) => {
          const status = statuses[i]
          const active = status === 'today'
          return (
            <a
              key={day.id}
              href={`#${day.id}`}
              className="tap"
              style={{
                display: 'flex', alignItems: 'baseline', gap: 7,
                padding: '6px 13px', borderRadius: 999, textDecoration: 'none',
                border: 'none',
                background: active ? 'var(--accent-dim)' : 'var(--ink-1)',
                color: active ? 'var(--accent)' : status === 'past' ? 'var(--ink-3)' : 'var(--ink-5)',
                fontSize: 'var(--text-base)', fontWeight: 500,
              }}
            >
              <span>{dayChipLabel(day)}</span>
              <span className="meta" style={{ color: 'var(--ink-4)' }}>
                {formatHours(committedMinutes(day))}
              </span>
            </a>
          )
        })}
      </nav>

      <DeadlineStrip deadlines={parsed.deadlines} tasks={tasks} />

      {parsed.intro && (
        <section style={{ ...cardStyle, padding: '12px 16px 16px' }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>{parsed.intro.heading}</div>
          <Markdown md={parsed.intro.markdown} />
        </section>
      )}

      {parsed.days.map((day, i) => (
        <DaySection
          key={day.id}
          day={day}
          status={statuses[i]}
          // Today open; everything else closed, except that a week already
          // over (or not yet started) would otherwise render as a wall of
          // shut drawers, so the first day stands in.
          defaultOpen={statuses[i] === 'today' || (todayIndex === -1 && i === 0)}
        />
      ))}

      {parsed.sections.map((section) => (
        <section key={section.id} id={section.id} style={{ ...cardStyle, padding: '12px 16px 16px' }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>{section.heading}</div>
          <Markdown md={section.markdown} />
        </section>
      ))}
    </div>
  )
}
