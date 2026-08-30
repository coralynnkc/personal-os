'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Markdown from '@/lib/markdown'
import { localToday } from '@/lib/taskDisplay'
import {
  carriedOver, committedMinutes, dayChipParts, dayKey, dayStatus, entityVocabulary,
  formatHours, weekDates,
  type Entity, type MatchableTask, type PlanningDoc, type WeekRow,
} from '@/lib/weekDoc'
import { cardStyle, ErrorRow, labelStyle } from '../jobs/ui'
import CarriesOver from './CarriesOver'
import DaySection from './DaySection'
import DeadlineStrip from './DeadlineStrip'
import EntityLoad from './EntityLoad'

type Index = { slug: string; title: string | null }
type Payload = { week: PlanningDoc | null; weeks: Index[]; semester: Index[] }

export default function WeekClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [tasks, setTasks] = useState<MatchableTask[]>([])
  // The names the schedule's rows are read for. Entities are also the
  // job-search inventory, so this is not all of them — see `entityVocabulary`.
  const [entities, setEntities] = useState<Entity[]>([])
  const [error, setError] = useState<string | null>(null)
  // Which rows are done, by day date. Lives in daily_logs.notes.week, so it is
  // state *about* the document rather than in it — the .md file stays the
  // source of truth and a re-sync never touches a check.
  const [checked, setChecked] = useState<Record<string, string[]>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  // Which day the left column is spending itself on. Null until the document
  // arrives, then today — or day one, for a week that is over or not yet begun.
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [docRes, taskRes, entityRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/tasks?status=open'),
        fetch('/api/entities'),
      ])
      if (!docRes.ok) throw new Error(`Documents failed (${docRes.status})`)
      const payload: Payload = await docRes.json()
      setData(payload)
      // The deadline strip degrades to "not tracked" without tasks, which is
      // wrong rather than empty — so a task failure is an error too.
      if (!taskRes.ok) throw new Error(`Tasks failed (${taskRes.status})`)
      setTasks(await taskRes.json())
      // Same reasoning: without entities a row that *is* ActBlue work renders
      // as an untagged row, which reads as "this belongs to nothing".
      if (!entityRes.ok) throw new Error(`Entities failed (${entityRes.status})`)
      setEntities(await entityRes.json())

      // The dates come out of the document, so this is a second round trip
      // rather than a third parallel one. A day with no boxes ticked simply
      // isn't in the response.
      const dates = weekDates(payload.week?.parsed?.days ?? [])
      if (dates.length) {
        const stateRes = await fetch(`/api/week/state?dates=${dates.join(',')}`)
        if (!stateRes.ok) throw new Error(`Week state failed (${stateRes.status})`)
        setChecked(await stateRes.json())
      } else {
        setChecked({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Optimistic, with a rollback: a check that didn't reach the database must
  // not sit there looking saved (PLAN §0). The date is the day's own key, not
  // today's — you tick Tuesday's rows on Tuesday, but also on Wednesday.
  const toggle = useCallback(async (date: string, row: WeekRow, next: boolean) => {
    setSaveError(null)
    const before = checked[date] ?? []
    const after = next ? [...before, row.id] : before.filter((id) => id !== row.id)
    setChecked((prev) => ({ ...prev, [date]: after }))

    try {
      const res = await fetch('/api/week/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, rowId: row.id, checked: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.error('Failed to save week row state:', err)
      setChecked((prev) => ({ ...prev, [date]: before }))
      setSaveError("Couldn't save that — tap it again.")
    }
  }, [checked])

  const days = data?.week?.parsed?.days
  const vocabulary = useMemo(() => entityVocabulary(entities), [entities])
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
  const selectedKey = dayKey(day)
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

      {saveError && (
        <div style={cardStyle}><ErrorRow message={saveError} onRetry={load} /></div>
      )}

      {/* One day in full, beside the things that are true of the whole week. */}
      <div className="week-two">
        <DaySection
          day={day}
          status={statuses[selectedIndex]}
          checked={new Set(selectedKey ? checked[selectedKey] ?? [] : [])}
          onToggle={selectedKey ? (row, next) => toggle(selectedKey, row, next) : null}
          tasks={tasks}
          vocabulary={vocabulary}
        />
        <div className="week-stack">
          <DeadlineStrip deadlines={parsed.deadlines} tasks={tasks} />
          <EntityLoad days={parsed.days} vocabulary={vocabulary} />
          <CarriesOver items={carriedOver(parsed.days, checked)} />
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
