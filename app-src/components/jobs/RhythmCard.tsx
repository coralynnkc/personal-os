'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Panel, Empty, ErrorRow, labelStyle } from './ui'

type RhythmTask = {
  slot: string
  title: string
  tag: string
  points: number
  task_id: string | null
  completed_at: string | null
}

const TAG_COLOR: Record<string, string> = {
  lc:       'oklch(0.82 0.18 260)',
  apps:     'oklch(0.82 0.17 55)',
  stories:  'oklch(0.80 0.16 300)',
  design:   'oklch(0.80 0.16 180)',
  research: 'oklch(0.82 0.16 85)',
  admin:    'var(--ink-4)',
  rest:     'var(--ink-3)',
}

/**
 * The daily LC rhythm, rehomed from the deleted home-screen widget.
 *
 * The difference that matters: these are real `tasks` rows now, not localStorage
 * state that only became a task at the moment you ticked it. They show up in
 * Today's Tasks and count toward story points whether you tick them here or not.
 */
export default function RhythmCard() {
  const [tasks, setTasks] = useState<RhythmTask[]>([])
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  // POST rather than GET: visiting the job-search tab is what materialises the
  // day's rhythm. It's idempotent, so landing here twice creates nothing new.
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs/rhythm', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTasks(data.tasks ?? [])
      setDate(data.date ?? '')
    } catch (e) {
      console.error('rhythm load error:', e)
      setError('Could not load today’s rhythm.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (t: RhythmTask) => {
    if (!t.task_id) return
    const completing = !t.completed_at
    const next = completing ? new Date().toISOString() : null

    setBusy(prev => new Set(prev).add(t.slot))
    setTasks(prev => prev.map(x => x.slot === t.slot ? { ...x, completed_at: next } : x))

    try {
      const res = await fetch(`/api/tasks/${t.task_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_at: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Habit tracker's story-point counter listens on this channel.
      const bc = new BroadcastChannel('pos-tasks')
      bc.postMessage({ type: 'task_completed' })
      bc.close()
    } catch (e) {
      console.error('rhythm toggle error:', e)
      // Roll the optimistic update back rather than leaving the UI lying.
      setTasks(prev => prev.map(x => x.slot === t.slot ? { ...x, completed_at: t.completed_at } : x))
      setError('Could not save that. Try again.')
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(t.slot); return s })
    }
  }

  const doneCount = tasks.filter(t => t.completed_at).length
  const totalPoints = tasks.reduce((s, t) => s + t.points, 0)
  const earnedPoints = tasks.filter(t => t.completed_at).reduce((s, t) => s + t.points, 0)

  return (
    <Panel
      title="Daily rhythm" aria-label="Daily rhythm"
      right={
        tasks.length > 0 ? (
          <span style={{ ...labelStyle, color: doneCount === tasks.length ? 'var(--ok)' : 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>
            {doneCount}/{tasks.length} · {earnedPoints}/{totalPoints} pts
          </span>
        ) : null
      }
    >
      {error && <ErrorRow message={error} onRetry={load} />}
      {loading && <Empty>Loading…</Empty>}

      {!loading && !error && tasks.length === 0 && (
        <Empty>Rest day{date ? ` (${date})` : ''} — no rhythm tasks.</Empty>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tasks.map(t => {
          const done = !!t.completed_at
          return (
            <div key={t.slot} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 18px' }}>
              <button
                onClick={() => toggle(t)}
                disabled={busy.has(t.slot) || !t.task_id}
                aria-label={done ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                className="tap"
                style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: 999,
                  border: `1.5px solid ${done ? 'var(--ok)' : 'var(--ink-3)'}`,
                  background: done ? 'var(--ok)' : 'transparent',
                  cursor: t.task_id ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {done && <Check size={11} strokeWidth={3} color="var(--ink-0)" />}
              </button>

              <span style={{
                flex: 1, fontSize: 'var(--text-base)', lineHeight: 1.45, minWidth: 0,
                color: done ? 'var(--ink-3)' : 'var(--ink-6)',
                textDecoration: done ? 'line-through' : 'none',
              }}>
                {t.title}
              </span>

              <span className="meta" style={{ flexShrink: 0, color: done ? 'var(--ok)' : 'var(--ink-3)' }}>
                {t.points}pt
              </span>
              <span
                className="chip"
                style={{
                  color: TAG_COLOR[t.tag] ?? 'var(--ink-4)',
                  background: `color-mix(in oklch, ${TAG_COLOR[t.tag] ?? 'var(--ink-4)'} 15%, transparent)`,
                }}
              >
                {t.tag}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
