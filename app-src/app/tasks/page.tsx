'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { USER_TZ } from '@/lib/dateKey'

function useMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth <= 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
}

type Task = {
  id: string
  title: string
  description: string | null
  urgency: 'today' | 'week' | 'month' | 'someday' | null
  key: boolean
  priority_score: number
  points: number | null
  tags: string[] | null
  due_date: string | null
  entity_id: string | null
  owner: string | null
  completed_at: string | null
  created_at: string
}

type Entity = { id: string; name: string; kind: string | null; metadata?: { archived?: boolean } }
type View = 'kanban' | 'forecast' | 'category'
type Sort = 'priority' | 'due' | 'title' | 'points' | 'created'
type Urgency = 'today' | 'week' | 'month' | 'someday'

function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(new Date())
}

function urgencyFromDate(due: string): Urgency {
  const today = localToday()
  if (due <= today) return 'today'
  const dueDate = new Date(due + 'T12:00:00')
  const now = new Date()
  const in7 = new Date(now); in7.setDate(now.getDate() + 7)
  if (dueDate <= in7) return 'week'
  if (dueDate.getMonth() === now.getMonth() && dueDate.getFullYear() === now.getFullYear()) return 'month'
  return 'someday'
}

function effectiveUrgency(task: Task): Urgency {
  if (task.due_date) return urgencyFromDate(task.due_date)
  return task.urgency ?? 'someday'
}

function isEffectivelyKey(task: Task): boolean {
  return task.key || effectiveUrgency(task) === 'today'
}

const URGENCY_LABELS: Record<Urgency, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  someday: 'Someday',
}

const URGENCY_COLORS: Record<Urgency, string> = {
  today: 'var(--danger)',
  week: 'var(--warn)',
  month: 'var(--accent)',
  someday: 'var(--ink-4)',
}

function cardShell(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'var(--glass)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius)',
    backdropFilter: 'blur(16px)',
    overflow: 'hidden',
    ...extra,
  }
}

function chip(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color,
    border: `1px solid ${color}`,
    borderRadius: 4,
    padding: '1px 5px',
    whiteSpace: 'nowrap' as const,
  }
}

// ── Task card ──────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onComplete }: {
  task: Task
  onClick: () => void
  onComplete: (id: string) => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--ink-1)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--ink-3)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <button
          onClick={e => { e.stopPropagation(); onComplete(task.id) }}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--ink-3)',
            background: 'transparent', cursor: 'pointer', flexShrink: 0,
            padding: 0,
          }}
          title="Complete task"
        />
        <span style={{ fontSize: 12, color: 'var(--ink-6)', lineHeight: 1.4, flex: 1 }}>
          {isEffectivelyKey(task) && <span style={{ color: 'var(--accent)', marginRight: 4 }}>★</span>}
          {task.title}
        </span>
        {task.points != null && (
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--accent)', background: 'var(--accent-dim)',
            border: '1px solid var(--accent-border)', borderRadius: 4,
            padding: '1px 6px', flexShrink: 0,
          }}>
            {task.points}pt
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingLeft: 24 }}>
        {task.due_date && (
          <span style={chip('var(--ink-4)')}>{task.due_date}</span>
        )}
        {(task.tags ?? []).map(t => (
          <span key={t} style={chip('var(--ink-3)')}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// ── Kanban view ────────────────────────────────────────────────────────────

function KanbanView({ tasks, onSelect, onComplete }: {
  tasks: Task[]
  onSelect: (t: Task) => void
  onComplete: (id: string) => void
}) {
  const [doneOpen, setDoneOpen] = useState(false)
  const done = tasks.filter(t => t.completed_at)
  const open = tasks.filter(t => !t.completed_at)
  const tiers: Urgency[] = ['today', 'week', 'month', 'someday']

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
      {tiers.map(tier => {
        const tierTasks = open.filter(t => effectiveUrgency(t) === tier)
        return (
          <div key={tier} style={{ ...cardShell(), flex: '1 1 220px', minWidth: 200 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px 8px', borderBottom: '1px solid var(--glass-border)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: URGENCY_COLORS[tier] }}>
                {URGENCY_LABELS[tier]}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{tierTasks.length}</span>
            </div>
            <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80 }}>
              {tierTasks.map(t => (
                <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} onComplete={onComplete} />
              ))}
              {tierTasks.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 2px' }}>Empty</div>
              )}
            </div>
          </div>
        )
      })}

      {done.length > 0 && (
        <div style={{ ...cardShell(), flex: '0 0 220px', minWidth: 200 }}>
          <button
            onClick={() => setDoneOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              padding: '10px 14px 8px', background: 'transparent', border: 'none',
              borderBottom: doneOpen ? '1px solid var(--glass-border)' : 'none',
              cursor: 'pointer',
            }}
          >
            {doneOpen ? <ChevronDown size={12} color="var(--ink-4)" /> : <ChevronRight size={12} color="var(--ink-4)" />}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ok)' }}>
              Done
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto' }}>{done.length}</span>
          </button>
          {doneOpen && (
            <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {done.map(t => (
                <div key={t.id} style={{ opacity: 0.5 }}>
                  <TaskCard task={t} onClick={() => onSelect(t)} onComplete={onComplete} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Forecast view ──────────────────────────────────────────────────────────

function ForecastView({ tasks, onSelect, onComplete }: {
  tasks: Task[]
  onSelect: (t: Task) => void
  onComplete: (id: string) => void
}) {
  const open = tasks.filter(t => !t.completed_at)
  const now = new Date()
  const today = localToday()

  // Start from Monday of current week
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  startOfWeek.setHours(0, 0, 0, 0)

  const days: string[] = []
  for (let i = 0; i < 28; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    days.push(new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(d))
  }

  const overdue = open.filter(t => t.due_date && t.due_date < today)
  const tasksByDay: Record<string, Task[]> = {}
  for (const t of open) {
    if (t.due_date && t.due_date >= today) {
      tasksByDay[t.due_date] = [...(tasksByDay[t.due_date] ?? []), t]
    }
  }
  const noDueDate = open.filter(t => !t.due_date)

  const dayLabel = (d: string) => {
    const date = new Date(d + 'T12:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {overdue.length > 0 && (
        <div style={cardShell()}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--glass-border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--danger)' }}>
              Overdue
            </span>
          </div>
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {overdue.map(t => (
              <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} onComplete={onComplete} />
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {days.map(d => {
          const dayTasks = tasksByDay[d] ?? []
          const isToday = d === today
          const isPast = d < today
          return (
            <div key={d} style={{
              ...cardShell(),
              opacity: isPast ? 0.5 : 1,
              outline: isToday ? '1px solid var(--accent)' : 'none',
            }}>
              <div style={{
                padding: '6px 8px 4px',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: isToday ? 'var(--accent)' : 'var(--ink-4)', textTransform: 'uppercase' }}>
                  {dayLabel(d)}
                </span>
                {dayTasks.length > 0 && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                )}
              </div>
              <div style={{ padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
                {dayTasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => onSelect(t)}
                    style={{
                      fontSize: 10, color: 'var(--ink-5)', cursor: 'pointer', padding: '2px 4px',
                      borderRadius: 4, lineHeight: 1.3,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--ink-1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); onComplete(t.id) }}
                      style={{
                        width: 10, height: 10, borderRadius: 2, border: '1px solid var(--ink-3)',
                        background: 'transparent', cursor: 'pointer', flexShrink: 0,
                      }}
                    />
                    {isEffectivelyKey(t) && <span style={{ color: 'var(--accent)', fontSize: 8 }}>★</span>}
                    {t.title}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {noDueDate.length > 0 && (
        <div style={cardShell()}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--glass-border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
              No Due Date
            </span>
          </div>
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {noDueDate.map(t => (
              <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} onComplete={onComplete} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category view ──────────────────────────────────────────────────────────

function CategoryView({ tasks, entities, onSelect, onComplete }: {
  tasks: Task[]
  entities: Entity[]
  onSelect: (t: Task) => void
  onComplete: (id: string) => void
}) {
  const open = tasks.filter(t => !t.completed_at)
  const entityMap = Object.fromEntries(entities.map(e => [e.id, e]))

  const grouped: Record<string, Task[]> = {}
  for (const t of open) {
    const key = t.entity_id ?? '__none__'
    grouped[key] = [...(grouped[key] ?? []), t]
  }

  const entityIds = [...new Set(open.map(t => t.entity_id ?? '__none__'))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entityIds.map(eid => {
        const label = eid === '__none__' ? 'Uncategorised' : (entityMap[eid]?.name ?? eid)
        const kind = eid === '__none__' ? null : entityMap[eid]?.kind
        return (
          <div key={eid} style={cardShell()}>
            <div style={{
              padding: '10px 14px 8px', borderBottom: '1px solid var(--glass-border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-5)' }}>
                {label}
              </span>
              {kind && <span style={chip('var(--ink-3)')}>{kind}</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                {grouped[eid].length}
              </span>
            </div>
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grouped[eid].map(t => (
                <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} onComplete={onComplete} />
              ))}
            </div>
          </div>
        )
      })}
      {entityIds.length === 0 && (
        <div style={{ ...cardShell(), padding: '20px 16px', color: 'var(--ink-3)', fontSize: 11, fontStyle: 'italic' }}>
          No open tasks.
        </div>
      )}
    </div>
  )
}

// ── Task drawer ────────────────────────────────────────────────────────────

function TaskDrawer({ task, entities: initialEntities, onClose, onSave, onDelete, onUncomplete, isMobile }: {
  task: Task | null
  entities: Entity[]
  onClose: () => void
  onSave: (id: string, patch: Partial<Task>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onUncomplete: (id: string) => Promise<void>
  isMobile: boolean
}) {
  const [form, setForm] = useState<Partial<Task>>({})
  const [tagInput, setTagInput] = useState('')
  const [entities, setEntities] = useState<Entity[]>(initialEntities)

  useEffect(() => { setEntities(initialEntities) }, [initialEntities])

  useEffect(() => {
    if (task) {
      setForm({ ...task })
      setTagInput((task.tags ?? []).join(', '))
    }
  }, [task?.id])

  if (!task) return null

  const set = (k: keyof Task, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleClose = () => {
    const tags = tagInput.split(',').map(s => s.trim()).filter(Boolean)
    onSave(task.id, { ...form, tags: tags.length ? tags : null })
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
    borderRadius: 6, color: 'var(--ink-6)', fontSize: 12, padding: '7px 10px',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em',
    textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 4, display: 'block',
  }
  const rowStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }

  const isCompleted = !!task.completed_at

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }}
      />
      {/* Drawer */}
      <div style={isMobile ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, top: 'auto',
        maxHeight: '92dvh', borderRadius: '16px 16px 0 0',
        background: 'var(--glass)', backdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--glass-border)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      } : {
        position: 'fixed', top: 52, right: 0, bottom: 0, width: 380,
        background: 'var(--glass)', backdropFilter: 'blur(24px)',
        borderLeft: '1px solid var(--glass-border)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {isMobile && (
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--ink-3)', alignSelf: 'center', margin: '12px auto 4px' }} />
        )}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
            {isCompleted ? 'Completed Task' : 'Edit Task'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}
              title="Delete task"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <div style={rowStyle}>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title ?? ''} onChange={e => set('title', e.target.value)} />
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Urgency</label>
              {form.due_date ? (
                <div style={{ ...inputStyle, color: URGENCY_COLORS[urgencyFromDate(form.due_date)], fontSize: 11, display: 'flex', alignItems: 'center' }}>
                  {URGENCY_LABELS[urgencyFromDate(form.due_date)]} <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--ink-3)' }}>from due date</span>
                </div>
              ) : (
                <select style={inputStyle} value={form.urgency ?? 'someday'} onChange={e => set('urgency', e.target.value)}>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="someday">Someday</option>
                </select>
              )}
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Points</label>
              <input
                style={inputStyle} type="number" min={0}
                value={form.points ?? ''}
                onChange={e => set('points', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Due Date</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input style={{ ...inputStyle, flex: 1 }} type="date" value={form.due_date ?? ''} onChange={e => set('due_date', e.target.value || null)} />
                {form.due_date && (
                  <button
                    onClick={() => set('due_date', null)}
                    title="Clear date"
                    style={{
                      flexShrink: 0, padding: '0 8px', borderRadius: 6,
                      border: '1px solid var(--glass-border)', background: 'transparent',
                      color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Project</label>
              <ProjectSelect
                entities={entities}
                value={form.entity_id ?? ''}
                onChange={v => set('entity_id', v || null)}
                onCreated={e => setEntities(prev => [...prev, e].sort((a, b) => a.name.localeCompare(b.name)))}
                inputStyle={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={rowStyle}>
              <label style={labelStyle}>Owner</label>
              <input style={inputStyle} value={form.owner ?? ''} onChange={e => set('owner', e.target.value || null)} />
            </div>
            <div style={rowStyle}>
              <label style={labelStyle}>Tags (comma-sep)</label>
              <input style={inputStyle} value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="design, frontend" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={!!form.key}
                onChange={e => set('key', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>Key task ★</span>
            </label>
          </div>

          {isCompleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>
                Completed {new Date(task.completed_at!).toLocaleDateString()}
              </span>
              <button
                onClick={() => { onUncomplete(task.id); onClose() }}
                style={{
                  fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  padding: '3px 10px', borderRadius: 5,
                  border: '1px solid var(--glass-border)',
                  background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer',
                }}
              >
                Mark incomplete
              </button>
            </div>
          )}
        </div>

      </div>
    </>
  )
}

// ── Inline project creator ─────────────────────────────────────────────────

function ProjectSelect({ entities, value, onChange, onCreated, inputStyle }: {
  entities: Entity[]
  value: string
  onChange: (id: string) => void
  onCreated: (entity: Entity) => void
  inputStyle: React.CSSProperties
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    const res = await fetch('/api/entities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), kind: 'project' }),
    })
    if (res.ok) {
      const entity = await res.json()
      onCreated(entity)
      onChange(entity.id)
    }
    setSaving(false)
    setAdding(false)
    setName('')
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          ref={inputRef}
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Project name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setAdding(false) }}
        />
        <button
          onClick={create}
          disabled={saving || !name.trim()}
          style={{
            padding: '0 10px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#000', fontWeight: 600,
            fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: saving || !name.trim() ? 0.6 : 1,
          }}
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          onClick={() => setAdding(false)}
          style={{ padding: '0 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select style={{ ...inputStyle, flex: 1 }} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">No project</option>
        {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
      </select>
      <button
        onClick={() => setAdding(true)}
        title="New project"
        style={{
          padding: '0 8px', borderRadius: 6, border: '1px solid var(--glass-border)',
          background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
        }}
      >
        +
      </button>
    </div>
  )
}

// ── Manage projects modal ──────────────────────────────────────────────────

function ManageProjectsModal({ onClose, onChange }: {
  onClose: () => void
  onChange: () => void
}) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    fetch('/api/entities?all=true').then(r => r.json()).then(setEntities)
  }, [])

  const patch = async (id: string, body: object) => {
    await fetch(`/api/entities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const updated = await fetch('/api/entities?all=true').then(r => r.json())
    setEntities(updated)
    onChange()
  }

  const remove = async (id: string) => {
    const entity = entities.find(e => e.id === id)
    if (!window.confirm(`Delete project "${entity?.name ?? id}"? Tasks keep existing but lose this project.`)) return
    await fetch(`/api/entities/${id}`, { method: 'DELETE' })
    setEntities(prev => prev.filter(e => e.id !== id))
    onChange()
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return
    await patch(id, { name: editName.trim() })
    setEditingId(null)
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
    borderRadius: 6, color: 'var(--ink-6)', fontSize: 12, padding: '5px 8px',
    outline: 'none', flex: 1,
  }

  const active = entities.filter(e => !e.metadata?.archived)
  const archived = entities.filter(e => e.metadata?.archived)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 400, maxHeight: '70vh', background: 'var(--glass)', backdropFilter: 'blur(24px)',
        border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)',
        zIndex: 61, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Manage Projects</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}><X size={14} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {active.length === 0 && <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '8px 0' }}>No projects yet.</div>}
          {active.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0' }}>
              {editingId === e.id ? (
                <>
                  <input
                    autoFocus style={inputStyle} value={editName}
                    onChange={ev => setEditName(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.id); if (ev.key === 'Escape') setEditingId(null) }}
                  />
                  <button onClick={() => saveEdit(e.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontWeight: 600 }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 5, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer' }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-5)' }}>{e.name}</span>
                  {e.kind && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', border: '1px solid var(--glass-border)', borderRadius: 3, padding: '1px 5px' }}>{e.kind}</span>}
                  <button onClick={() => { setEditingId(e.id); setEditName(e.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12 }} title="Rename">✎</button>
                  <button onClick={() => patch(e.id, { metadata: { archived: true } })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ok)', fontSize: 11 }} title="Mark complete">✓</button>
                  <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} title="Delete"><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
          {archived.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--glass-border)' }}>Completed</div>
              {archived.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', opacity: 0.5 }}>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-4)', textDecoration: 'line-through' }}>{e.name}</span>
                  <button onClick={() => patch(e.id, { metadata: { archived: false } })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 10 }} title="Restore">↩</button>
                  <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} title="Delete"><Trash2 size={12} /></button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Add task modal ─────────────────────────────────────────────────────────

function AddModal({ entities: initialEntities, onClose, onAdd }: {
  entities: Entity[]
  onClose: () => void
  onAdd: (task: Partial<Task>) => Promise<void>
}) {
  const isMobile = useMobile()
  const [title, setTitle] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('someday')
  const [points, setPoints] = useState('')
  const [entityId, setEntityId] = useState('')
  const [dueDate, setDueDate] = useState(() => localToday())
  const [keyTask, setKeyTask] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entities, setEntities] = useState<Entity[]>(initialEntities)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Delay focus on mobile so the bottom sheet finishes animating before the keyboard opens
    const t = setTimeout(() => inputRef.current?.focus(), isMobile ? 300 : 0)
    return () => clearTimeout(t)
  }, [isMobile])

  const handleAdd = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onAdd({
      title: title.trim(),
      urgency: dueDate ? urgencyFromDate(dueDate) : urgency,
      key: keyTask,
      points: points ? Number(points) : null,
      entity_id: entityId || null,
      due_date: dueDate || null,
    })
    setSaving(false)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
    borderRadius: 6, color: 'var(--ink-6)', fontSize: 12, padding: '7px 10px',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
  }

  const sheetStyle: React.CSSProperties = isMobile ? {
    position: 'fixed', bottom: 0, left: 0, right: 0, top: 'auto',
    width: '100%', borderRadius: '16px 16px 0 0',
    maxHeight: '92dvh', overflowY: 'auto',
  } : {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 440, borderRadius: 'var(--radius)',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
      <div style={{
        ...sheetStyle,
        background: 'var(--glass)', backdropFilter: 'blur(24px)',
        border: '1px solid var(--glass-border)',
        zIndex: 61, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {isMobile && (
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--ink-3)', alignSelf: 'center', marginBottom: 4 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
            New Task
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}>
            <X size={14} />
          </button>
        </div>

        <input
          ref={inputRef}
          style={{ ...inputStyle, fontSize: 14 }}
          placeholder="Task title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input style={{ ...inputStyle, flex: 1 }} type="date" value={dueDate} onChange={e => {
              setDueDate(e.target.value)
              if (!e.target.value) setUrgency('someday')
            }} />
            {dueDate && (
              <button
                onClick={() => { setDueDate(''); setUrgency('someday') }}
                title="Clear date"
                style={{
                  flexShrink: 0, padding: '0 8px', borderRadius: 6,
                  border: '1px solid var(--glass-border)', background: 'transparent',
                  color: 'var(--ink-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={keyTask} onChange={e => setKeyTask(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>Key ★</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
          {dueDate ? (
            <div style={{ ...inputStyle, color: URGENCY_COLORS[urgencyFromDate(dueDate)], fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              {URGENCY_LABELS[urgencyFromDate(dueDate)]}
              <span style={{ fontSize: 9, color: 'var(--ink-3)' }}>from due date</span>
            </div>
          ) : (
            <select style={inputStyle} value={urgency} onChange={e => setUrgency(e.target.value as Urgency)}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="someday">Someday</option>
            </select>
          )}
          <input style={inputStyle} type="number" min={0} placeholder="pts" value={points} onChange={e => setPoints(e.target.value)} />
        </div>
        <ProjectSelect
          entities={entities}
          value={entityId}
          onChange={setEntityId}
          onCreated={e => setEntities(prev => [...prev, e].sort((a, b) => a.name.localeCompare(b.name)))}
          inputStyle={inputStyle}
        />

        <button
          onClick={handleAdd}
          disabled={saving || !title.trim()}
          style={{
            padding: '9px 0', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#000', fontWeight: 600,
            fontSize: 12, cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !title.trim() ? 0.6 : 1,
          }}
        >
          {saving ? 'Adding…' : 'Add Task'}
        </button>
      </div>
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TasksPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 12 }}>Loading…</div>}>
      <TasksInner />
    </Suspense>
  )
}

function sortTasks(tasks: Task[], sort: Sort): Task[] {
  return [...tasks].sort((a, b) => {
    switch (sort) {
      case 'due': {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }
      case 'title':
        return a.title.localeCompare(b.title)
      case 'points': {
        const ap = a.points ?? -1, bp = b.points ?? -1
        return bp - ap
      }
      case 'created':
        return b.created_at.localeCompare(a.created_at)
      case 'priority':
      default:
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score
        return b.created_at.localeCompare(a.created_at)
    }
  })
}

function TasksInner() {
  const isMobile = useMobile()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = useState<View>('kanban')
  const [sort, setSort] = useState<Sort>('priority')
  const [tasks, setTasks] = useState<Task[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showManageProjects, setShowManageProjects] = useState(false)

  const fetchTasks = useCallback(async () => {
    const [tasksRes, entitiesRes] = await Promise.all([
      fetch('/api/tasks?status=all'),
      fetch('/api/entities'),
    ])
    if (tasksRes.ok) setTasks(await tasksRes.json())
    if (entitiesRes.ok) setEntities(await entitiesRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Pre-open drawer from ?task=id (linked from Today's Tasks card)
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (taskId && tasks.length) {
      const t = tasks.find(t => t.id === taskId)
      if (t) setSelectedTask(t)
    }
  }, [searchParams, tasks])

  const handleComplete = async (id: string) => {
    const now = new Date().toISOString()
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed_at: now } : t))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_at: now }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const bc = new BroadcastChannel('pos-tasks')
      bc.postMessage({ type: 'task_completed' })
      bc.close()
    } catch (err) {
      console.error('Failed to complete task:', err)
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed_at: null } : t))
    }
  }

  const handleSave = async (id: string, patch: Partial<Task>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === id ? updated : t))
    }
  }

  const handleUncomplete = async (id: string) => {
    const prevCompletedAt = tasks.find(t => t.id === id)?.completed_at ?? null
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed_at: null } : t))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_at: null }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.error('Failed to reopen task:', err)
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed_at: prevCompletedAt } : t))
    }
  }

  const handleDelete = async (id: string) => {
    const removed = tasks.find(t => t.id === id)
    setSelectedTask(null)
    setTasks(prev => prev.filter(t => t.id !== id))
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.error('Failed to delete task:', err)
      if (removed) setTasks(prev => [removed, ...prev])
    }
  }

  const handleAdd = async (data: Partial<Task>) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const created = await res.json()
      setTasks(prev => [created, ...prev])
    }
  }

  const views: { id: View; label: string }[] = [
    { id: 'kanban', label: 'Kanban' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'category', label: 'Category' },
  ]

  return (
    <div style={{ padding: '16px 20px', position: 'relative' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{
          display: 'flex', gap: 2, background: 'var(--ink-1)', borderRadius: 8, padding: 3,
        }}>
          {views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500, letterSpacing: '0.03em',
                color: view === v.id ? 'var(--ink-6)' : 'var(--ink-4)',
                background: view === v.id ? 'var(--ink-2)' : 'transparent',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as Sort)}
          style={{
            background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
            borderRadius: 6, color: 'var(--ink-4)', fontSize: 11,
            padding: '6px 10px', cursor: 'pointer', outline: 'none',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          }}
        >
          <option value="priority">Priority</option>
          <option value="due">Due date</option>
          <option value="points">Points</option>
          <option value="title">Title A–Z</option>
          <option value="created">Newest</option>
        </select>
        <button
          onClick={() => setShowManageProjects(true)}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid var(--glass-border)',
            background: 'transparent', color: 'var(--ink-4)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          }}
        >
          Projects
        </button>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
            borderRadius: 6, border: '1px solid var(--accent-border)',
            background: 'var(--accent-dim)', color: 'var(--accent)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          }}
        >
          <Plus size={13} /> New
        </button>
        {loading && <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>Loading…</span>}
      </div>

      {/* Content */}
      {!loading && (
        <>
          {view === 'kanban' && (
            <KanbanView tasks={sortTasks(tasks, sort)} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
          {view === 'forecast' && (
            <ForecastView tasks={sortTasks(tasks, sort)} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
          {view === 'category' && (
            <CategoryView tasks={sortTasks(tasks, sort)} entities={entities} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
        </>
      )}

      {/* Drawer */}
      <TaskDrawer
        task={selectedTask}
        entities={entities}
        onClose={() => setSelectedTask(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onUncomplete={handleUncomplete}
        isMobile={isMobile}
      />

      {/* Add modal */}
      {showAdd && (
        <AddModal
          entities={entities}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}

      {/* Manage projects modal */}
      {showManageProjects && (
        <ManageProjectsModal
          onClose={() => setShowManageProjects(false)}
          onChange={() => fetch('/api/entities').then(r => r.json()).then(setEntities)}
        />
      )}

      {/* FAB — mobile only */}
      {isMobile && !showAdd && !selectedTask && (
        <button
          onClick={() => setShowAdd(true)}
          style={{
            position: 'fixed', bottom: 24, right: 20,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent)', color: '#000',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 40,
          }}
          title="New task"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
