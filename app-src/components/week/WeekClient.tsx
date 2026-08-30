'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Markdown from '@/lib/markdown'
import { localToday } from '@/lib/taskDisplay'
import {
  committedMinutes, dayChipParts, dayStatus, formatHours,
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
  // Which day the left column is spending itself on. Null until the document
  // arrives, then today — or day one, for a week that is over or not yet begun.
  const [selected, setSelected] = useState<string | null>(null)

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

  const days = data?.week?.parsed?.days
  const statuses = useMemo(() => {
    const today = localToday()
    return (days ?? []).map((d) => dayStatus(d, today))
  }, [days])

  // Defaulting is an effect and not an initialiser because the days arrive
  // after mount. It settles once per document: a day you picked by hand
  // survives a refetch, and the rollover past midnight does not yank the
  // column out from under you mid-read.
  //
  // A `#day-…` hash wins over today. The seven anchors are gone, but the URLs
  // they minted are in notes and in history, and selecting the day they name
  // is what those links meant — scrolling to the one section on the page is
  // not.
  useEffect(() => {
    if (!days?.length) return
    setSelected((current) => {
      if (current && days.some((d) => d.id === current)) return current
      const hash = decodeURIComponent(window.location.hash.slice(1))
      if (hash && days.some((d) => d.id === hash)) return hash
      const i = statuses.indexOf('today')
      return days[i === -1 ? 0 : i].id
    })
  }, [days, statuses])

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

  const selectedIndex = Math.max(0, parsed.days.findIndex((d) => d.id === selected))
  const day = parsed.days[selectedIndex]
  const reference = [parsed.intro, ...parsed.sections].filter((s) => s !== null)

  return (
    <div style={{ padding: 'var(--s5)', display: 'grid', gap: 'var(--s6)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <header style={{
        display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--s3)',
        paddingBottom: 'var(--s3)', borderBottom: '1px solid var(--rule)',
      }}>
        {/* The semester documents are still at /week/<slug>; nothing links to
            them from here, because a nav to two long documents is not a thing
            you want in front of you mid-week. */}
        <h1 style={{ fontSize: 16, fontWeight: 400, letterSpacing: '0.04em', color: 'var(--ivory)' }}>
          {doc.title ?? doc.slug}
        </h1>
        {doc.synced_at && (
          <span style={{ ...labelStyle, fontSize: 10 }}>
            synced {new Date(doc.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </header>

      {/* The strip picks the day rather than scrolling to it — seven days
          across one rule, each badged with the hours it has committed. */}
      <div role="group" aria-label="Days this week" className="wstrip">
        {parsed.days.map((d, i) => {
          const status = statuses[i]
          const { weekday, num } = dayChipParts(d)
          const active = d.id === day.id
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d.id)}
              aria-pressed={active}
              className={[
                'wday tap',
                status === 'past' && 'wday-past',
                status === 'today' && 'wday-today',
                active && 'wday-selected',
              ].filter(Boolean).join(' ')}
            >
              <div className="d">{weekday}</div>
              <div className="n">{num || '—'}</div>
              <div className="h">{formatHours(committedMinutes(d))}</div>
            </button>
          )
        })}
      </div>

      {/* One day in full, beside the things that are true of the whole week. */}
      <div className="week-two">
        <DaySection day={day} status={statuses[selectedIndex]} />
        <div className="week-stack">
          <DeadlineStrip deadlines={parsed.deadlines} tasks={tasks} />
        </div>
      </div>

      {/* Intro and the thematic sections are reference, not the week: full
          width, below the fold, behind an eyebrow rather than a region title. */}
      {reference.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--s5)', paddingTop: 'var(--s5)', borderTop: '1px solid var(--rule)' }}>
          <div className="eyebrow">The week, written out</div>
          {reference.map((section) => (
            <section key={section.id} id={section.id} style={cardStyle}>
              <div style={{ ...labelStyle, marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)' }}>
                {section.heading}
              </div>
              <Markdown md={section.markdown} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
