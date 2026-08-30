'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { dueLabel, TONE_COLOR } from '@/lib/taskDisplay'
import StartFocusButton from './pomodoro/StartFocusButton'
import { ErrorRow, RegionHead } from './jobs/ui'

type Task = {
  id: string
  title: string
  description: string | null
  urgency: 'today' | 'week' | 'month' | 'someday' | null
  key: boolean
  points: number | null
  due_date: string | null
  completed_at: string | null
}

type Placement = { top: number; left: number; width: number }

const TOOLTIP_GAP = 4
const TOOLTIP_INSET = 8   // keep this far off every viewport edge
const TOOLTIP_INDENT = 52 // line up with the task row, past the checkbox and ▶

function place(anchor: HTMLElement, height: number): Placement {
  const r = anchor.getBoundingClientRect()
  const width = Math.max(120, r.width - TOOLTIP_INDENT)
  const below = r.bottom + TOOLTIP_GAP
  const above = r.top - TOOLTIP_GAP - height
  // Flip up only when below genuinely doesn't fit and above does.
  const flip = below + height > window.innerHeight - TOOLTIP_INSET && above >= TOOLTIP_INSET
  const maxLeft = window.innerWidth - width - TOOLTIP_INSET
  return {
    top: Math.max(TOOLTIP_INSET, flip ? above : below),
    left: Math.min(Math.max(TOOLTIP_INSET, r.left + TOOLTIP_INDENT), Math.max(TOOLTIP_INSET, maxLeft)),
    width,
  }
}

/**
 * Portalled to <body> with fixed coordinates so no clipping or stacking
 * context upstream can slice it off, and so it can flip above the row when it
 * would otherwise run off the bottom of the window.
 */
function DescriptionTooltip({ anchor, text }: { anchor: HTMLElement; text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Placement>(() => place(anchor, 0))

  useLayoutEffect(() => {
    // The first pass measures at height 0; re-place with the real height
    // before paint so a flip never flickers.
    const reposition = () => setPos(place(anchor, ref.current?.offsetHeight ?? 0))
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [anchor, text])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
        maxHeight: `calc(100vh - ${pos.top + TOOLTIP_INSET}px)`, overflowY: 'auto',
        zIndex: 60, pointerEvents: 'none',
        padding: 'var(--s2)', borderRadius: 0,
        background: 'var(--tint)', border: '1px solid var(--rule)',
        fontSize: 12, lineHeight: 1.45, color: 'var(--ash)',
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}
    >
      {text}
    </div>,
    document.body,
  )
}

export default function TodayTasks() {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<{ id: string; el: HTMLElement } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/tasks?effective_today=true&status=open')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setTasks(data ?? [])
        setLoading(false)
      })
      .catch(err => {
        console.error('TodayTasks fetch error:', err)
        setError("Couldn't load today's tasks.")
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const completeTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setCompleting(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to complete task:', err)
      setError("Couldn't complete that task.")
    } finally {
      setCompleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const openTask = (id: string) => {
    router.push(`/tasks?task=${id}`)
  }

  return (
    <section className="region region-log">
      <RegionHead title="today" right={tasks.length > 0 ? `${tasks.length} open` : undefined} />

      {error && <ErrorRow message={error} onRetry={load} />}

      {loading && !error && (
        <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>Loading…</div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>
          No key tasks for today.
        </div>
      )}

      {tasks.map(task => {
        const due = dueLabel(task)
        return (
          <div
            key={task.id}
            className="row-hover row-line"
            onMouseEnter={e => setHovered({ id: task.id, el: e.currentTarget })}
            onMouseLeave={() => setHovered(h => (h?.id === task.id ? null : h))}
            style={{
              display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto',
              gap: 'var(--s3)', alignItems: 'baseline',
              padding: 'var(--s2) 0', position: 'relative',
            }}
          >
            {/* The completion circle — a target, so it is the one round thing. */}
            <button
              onClick={e => completeTask(e, task.id)}
              disabled={completing.has(task.id)}
              className="check-circle"
              data-done={completing.has(task.id)}
              title="Mark complete" aria-label="Mark complete"
              style={{ alignSelf: 'center' }}
            >
              <Check size={8} strokeWidth={3} />
            </button>

            {/* The line itself: mark, title, tag — read as one sentence. */}
            <button
              onClick={() => openTask(task.id)}
              style={{
                minWidth: 0, display: 'block', background: 'none', border: 0, padding: 0,
                cursor: 'pointer', textAlign: 'left',
                fontSize: 13.5, color: 'var(--ivory)', lineHeight: 1.35,
                overflowWrap: 'anywhere',
              }}
            >
              {/* One line of text, so a long title wraps under itself rather
                  than pushing the star and the point count onto rows of
                  their own. */}
              <span style={{ color: 'var(--rose)', fontSize: 10, marginRight: 6 }}>★</span>
              {task.title}
              {task.points != null && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--slate)', marginLeft: 8 }}>
                  {task.points}pt
                </span>
              )}
            </button>

            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', whiteSpace: 'nowrap' }}>
              {due && (
                <span className="mono" style={{ fontSize: 11, letterSpacing: '0.03em', color: TONE_COLOR[due.tone] }}>
                  {due.text}
                </span>
              )}
              <StartFocusButton taskId={task.id} taskTitle={task.title} size={16} />
            </span>

            {/* Description tooltip — portalled, so nothing upstream can clip it */}
            {hovered?.id === task.id && task.description && (
              <DescriptionTooltip anchor={hovered.el} text={task.description} />
            )}
          </div>
        )
      })}

      <button
        onClick={() => router.push('/tasks')}
        className="quiet-link"
        style={{
          display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
          padding: 'var(--s3) 0 0', background: 'none', border: 0,
          color: 'var(--slate)', fontSize: 13, cursor: 'pointer',
        }}
      >
        <ArrowRight size={11} /> all tasks
      </button>
    </section>
  )
}
