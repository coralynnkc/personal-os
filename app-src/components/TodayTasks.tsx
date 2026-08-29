'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { dueLabel, TONE_COLOR } from '@/lib/taskDisplay'
import StartFocusButton from './pomodoro/StartFocusButton'
import { ErrorRow } from './jobs/ui'

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
 * The card clips its children (`overflow: hidden`, for the rounded header
 * border), so an absolutely-positioned tooltip on the last row got sliced off
 * at the card's bottom edge. Portalling to <body> with fixed coordinates takes
 * it out of that clipping context entirely, and lets it flip above the row
 * when it would otherwise run off the bottom of the window.
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
        padding: '8px 11px', borderRadius: 'var(--radius-xs)',
        background: 'var(--ink-2)', border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px oklch(0 0 0 / 0.4)',
        fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--ink-5)',
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
    <div className="card" style={{ minHeight: 160 }}>
      {/* Header. The divider under it is gone — the padding does that job, and
          three stacked widgets with ruled headers read as a form. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 8px',
      }}>
        <span className="panel-title">Today</span>
        <button
          className="tap"
          onClick={() => router.push('/tasks')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', borderRadius: 999,
            color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 'var(--text-sm)', padding: '3px 8px',
          }}
        >
          All <ArrowRight size={13} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {error && <ErrorRow message={error} onRetry={load} />}

        {loading && !error && (
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', padding: '8px 6px' }}>
            Loading…
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', padding: '8px 6px' }}>
            Nothing scheduled for today — enjoy it.
          </div>
        )}

        {tasks.map(task => (
          <div
            key={task.id}
            onMouseEnter={e => setHovered({ id: task.id, el: e.currentTarget })}
            onMouseLeave={() => setHovered(h => (h?.id === task.id ? null : h))}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, position: 'relative',
            }}
          >
            {/* Complete button */}
            <button
              onClick={e => completeTask(e, task.id)}
              disabled={completing.has(task.id)}
              title="Mark complete" aria-label="Mark complete"
              className="tap"
              style={{
                flexShrink: 0,
                width: 20, height: 20,
                borderRadius: 999,
                border: '1.5px solid var(--ink-3)',
                background: completing.has(task.id) ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              {completing.has(task.id) && <Check size={12} strokeWidth={3} color="var(--ink-0)" />}
            </button>

            {/* Start a focus session on this task */}
            <StartFocusButton taskId={task.id} taskTitle={task.title} size={16} />

            {/* Task row */}
            <button
              onClick={() => openTask(task.id)}
              className="tile"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px',
                cursor: 'pointer', textAlign: 'left', minWidth: 0,
              }}
            >
              <span style={{ color: 'var(--accent)', fontSize: 'var(--text-sm)', flexShrink: 0 }}>★</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--ink-6)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                {task.title}
              </span>
              {/* Points are a bare number in the gutter, not a chip. They rank
                  the row; they don't need to be boxed to do that. */}
              {task.points != null && (
                <span className="meta" style={{ color: 'var(--ink-4)', flexShrink: 0 }}>
                  {task.points}pt
                </span>
              )}
              {(() => {
                const due = dueLabel(task)
                if (!due) return null
                const color = TONE_COLOR[due.tone]
                return (
                  <span
                    className="chip"
                    style={{ color, background: `color-mix(in oklch, ${color} 15%, transparent)` }}
                  >
                    {due.text}
                  </span>
                )
              })()}
            </button>

            {/* Description tooltip — portalled, so the card's overflow can't clip it */}
            {hovered?.id === task.id && task.description && (
              <DescriptionTooltip anchor={hovered.el} text={task.description} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
