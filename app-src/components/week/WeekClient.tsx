'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Markdown from '@/lib/markdown'
import { localToday } from '@/lib/taskDisplay'
import {
  committedMinutes, dayChipLabel, dayStatus, formatHours,
  type MatchableTask, type PlanningDoc,
} from '@/lib/weekDoc'
import { cardStyle, ErrorRow, labelStyle } from '../jobs/ui'
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
      <div style={{ padding: 'var(--s5)' }}>
        <div style={cardStyle}><ErrorRow message={error} onRetry={load} /></div>
      </div>
    )
  }

  if (!data) {
    return <div style={{ padding: 'var(--s5)', fontSize: 13, color: 'var(--slate)' }}>Loading…</div>
  }

  const doc = data.week
  const parsed = doc?.parsed

  if (!doc || !parsed) {
    return (
      <div style={{ padding: 'var(--s5)' }}>
        <div style={{ ...cardStyle, fontSize: 13, color: 'var(--ash)', lineHeight: 1.6 }}>
          No week document synced yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--ink-1)', borderRadius: 0, padding: '1px 5px' }}>
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
    <div style={{ padding: 'var(--s5)', display: 'grid', gap: 'var(--s6)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--s3)',
        paddingBottom: 'var(--s3)', borderBottom: '1px solid var(--rule)',
      }}>
        <h1 style={{ fontSize: 16, fontWeight: 400, letterSpacing: '0.04em', color: 'var(--ivory)' }}>
          {doc.title ?? doc.slug}
        </h1>
        {doc.synced_at && (
          <span style={{ ...labelStyle, fontSize: 10 }}>
            synced {new Date(doc.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {data.semester.map((s) => (
            <Link key={s.slug} href={`/week/${s.slug}`} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--champagne)', textDecoration: 'none',
            }}>
              {s.title ?? s.slug}
            </Link>
          ))}
        </span>
      </header>

      {/* Day strip: seven chips, today emphasised, each badged with the hours
          it has already committed. Click to jump. */}
      {/* Seven days across one rule — a strip of the week, not seven chips.
          Four columns below 720px so the numbers stay legible on a phone. */}
      <nav
        aria-label="Days this week"
        className="grid grid-cols-4 sm:grid-cols-7"
        style={{ borderBottom: '1px solid var(--rule)' }}
      >
        {parsed.days.map((day, i) => {
          const status = statuses[i]
          const active = status === 'today'
          return (
            <a
              key={day.id}
              href={`#${day.id}`}
              style={{
                display: 'flex', flexDirection: 'column',
                padding: 'var(--s3) 0 var(--s3) var(--s3)',
                borderRight: i === parsed.days.length - 1 ? 0 : '1px solid var(--rule-2)',
                textDecoration: 'none',
                opacity: status === 'past' ? 0.4 : 1,
                color: active ? 'var(--champagne)' : 'var(--ash)',
              }}
            >
              <span className="mono" style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: active ? 'var(--champagne)' : 'var(--slate)',
              }}>
                {dayChipLabel(day)}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: active ? 'var(--champagne)' : 'var(--slate)' }}>
                {formatHours(committedMinutes(day))}
              </span>
            </a>
          )
        })}
      </nav>

      <DeadlineStrip deadlines={parsed.deadlines} tasks={tasks} />

      {parsed.intro && (
        <section style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)' }}>{parsed.intro.heading}</div>
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
        <section key={section.id} id={section.id} style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)' }}>{section.heading}</div>
          <Markdown md={section.markdown} />
        </section>
      ))}
    </div>
  )
}
