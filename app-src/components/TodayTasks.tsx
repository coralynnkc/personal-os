'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { toDateKey, USER_TZ } from '@/lib/dateKey'

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

const URGENCY_COLOR: Record<string, string> = {
  today: 'var(--danger)',
  week: 'var(--warn)',
  month: 'var(--accent)',
  someday: 'var(--ink-4)',
}

type Placement = { top: number; left: number; width: number }

const TOOLTIP_GAP = 4
const TOOLTIP_INSET = 8   // keep this far off every viewport edge
const TOOLTIP_INDENT = 24 // line up with the task row, not the checkbox

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
        padding: '6px 8px', borderRadius: 6,
        background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 6px 18px oklch(0 0 0 / 0.35)',
        fontSize: 11, lineHeight: 1.4, color: 'var(--ink-5)',
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

  useEffect(() => {
    fetch('/api/tasks?effective_today=true&status=open')
      .then(r => r.json())
      .then(data => {
        setTasks(data ?? [])
        setLoading(false)
      })
      .catch(err => {
        console.error('TodayTasks fetch error:', err)
        setLoading(false)
      })
  }, [])

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
    } finally {
      setCompleting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const openTask = (id: string) => {
    router.push(`/tasks?task=${id}`)
  }

  return (
    <div style={{
      background: 'var(--glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
      minHeight: 160,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.14em', color: 'var(--ink-4)', textTransform: 'uppercase',
        }}>
          Today's Key Tasks
        </span>
        <button
          onClick={() => router.push('/tasks')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontFamily: 'var(--font-mono)',
          }}
        >
          All <ArrowRight size={11} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loading && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '6px 4px' }}>
            Loading…
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '6px 4px' }}>
            No key tasks for today.
          </div>
        )}

        {tasks.map(task => (
          <div
            key={task.id}
            onMouseEnter={e => setHovered({ id: task.id, el: e.currentTarget })}
            onMouseLeave={() => setHovered(h => (h?.id === task.id ? null : h))}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
            }}
          >
            {/* Complete button */}
            <button
              onClick={e => completeTask(e, task.id)}
              disabled={completing.has(task.id)}
              title="Mark complete"
              style={{
                flexShrink: 0,
                width: 18, height: 18,
                borderRadius: 4,
                border: '1px solid var(--ink-3)',
                background: completing.has(task.id) ? 'var(--accent)' : 'transparent',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => {
                if (!completing.has(task.id)) {
                  e.currentTarget.style.background = 'var(--accent-dim)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }
              }}
              onMouseLeave={e => {
                if (!completing.has(task.id)) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--ink-3)'
                }
              }}
            >
              {completing.has(task.id) && <Check size={11} strokeWidth={3} color="var(--bg)" />}
            </button>

            {/* Task row */}
            <button
              onClick={() => openTask(task.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 7,
                background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s', minWidth: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ink-3)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
            >
              <span style={{ color: 'var(--accent)', fontSize: 10, flexShrink: 0 }}>★</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--ink-6)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                {task.title}
              </span>
              {task.points != null && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)', background: 'var(--accent-dim)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                }}>
                  {task.points}pt
                </span>
              )}
              {(() => {
                const today = toDateKey(new Date(), USER_TZ)
                const overdue = task.due_date && task.due_date < today
                const label = overdue ? 'overdue' : task.due_date === today ? 'due today' : task.urgency
                const color = (overdue || task.urgency === 'today') ? 'var(--danger)' : URGENCY_COLOR[task.urgency ?? ''] ?? 'var(--ink-4)'
                return label ? (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                    textTransform: 'uppercase', color, border: `1px solid ${color}`,
                    borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                  }}>
                    {label}
                  </span>
                ) : null
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
