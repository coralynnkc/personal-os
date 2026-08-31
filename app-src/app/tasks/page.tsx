'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, X, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { USER_TZ } from '@/lib/dateKey'
import { useDialog } from '@/lib/useDialog'
import { useKeyboard } from '@/lib/useKeyboard'
import StartFocusButton from '@/components/pomodoro/StartFocusButton'
import { ErrorRow } from '@/components/jobs/ui'
import {
  localToday, dueLabel, tagFrequency, displayTags, TONE_COLOR,
  EMPTY_TAG_FREQ, type TagFreq,
} from '@/lib/taskDisplay'

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


function urgencyFromDate(due: string): Urgency {
  const today = localToday()
  if (due <= today) return 'today'
  const dueDate = new Date(due + 'T12:00:00')
  const now = new Date()
  const in7 = new Date(now); in7.setDate(now.getDate() + 7)
  if (dueDate <= in7) return 'week'
  // Rolling 30 days, not the calendar month — on Aug 29 a Sep 8 deadline is
  // three weeks of runway, not "someday".
  const in30 = new Date(now); in30.setDate(now.getDate() + 30)
  if (dueDate <= in30) return 'month'
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

// A column heading names a horizon; the individual row is where lateness gets
// to speak, and it says it in one place — the date. So the heads stay quiet.
const URGENCY_COLORS: Record<Urgency, string> = {
  today: 'var(--ash)',
  week: 'var(--ash)',
  month: 'var(--ash)',
  someday: 'var(--slate)',
}

/** A board column is a run of rows under a heading — no fill, no border. */
function cardShell(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: 'transparent',
    border: 0,
    borderRadius: 0,
    minWidth: 0,
    ...extra,
  }
}

/**
 * The fill went with the pill. A row is text with a mark in the margin, and a
 * date that carries its own colour doesn't also need a shape — `.chip` is now
 * bare inline text, so only the colour varies here.
 */
function chip(color: string): React.CSSProperties {
  return { color }
}

/**
 * Tags read as words, not labels — no uppercase, no wide tracking, and since
 * the ten-hue palette was retired, no colour either. Rarest-first ordering is
 * what identifies a task; the hue was only ever decoration.
 */
function tagChip(): React.CSSProperties {
  return { color: 'var(--slate)', fontSize: 'var(--text-sm)' }
}

/** Kept as a distinct name because the date chip is the one that changes tone. */
function dateChip(color: string): React.CSSProperties {
  return { ...chip(color), fontFamily: 'var(--font-mono)' }
}

/**
 * Tag frequency across every loaded task, so a card can tell an identifying tag
 * from one that 96 of 100 tasks also carry. Context rather than props: three
 * views sit between the page and the card and none of them care.
 */
const TagFreqContext = createContext<TagFreq>(EMPTY_TAG_FREQ)

// ── Task card ──────────────────────────────────────────────────────────────

/** The chip row under a task title: one date chip, then at most two tags. */
function TaskMeta({ task, hideDue }: { task: Task; hideDue?: string }) {
  const freq = useContext(TagFreqContext)
  const raw = dueLabel(task)
  // A "today" chip inside the Today column is noise; "3d late" in that same
  // column is not, so only the exact repeated word drops out.
  const due = raw && raw.text === hideDue ? null : raw
  const { shown, hidden } = displayTags(task.tags, freq)
  if (!due && shown.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingLeft: 32 }}>
      {due && <span className="chip" style={dateChip(TONE_COLOR[due.tone])}>{due.text}</span>}
      {shown.map(t => (
        <span key={t} className="chip" style={tagChip()}>{t}</span>
      ))}
      {hidden.length > 0 && (
        <span className="chip" style={chip('var(--slate)')} title={hidden.join(', ')}>
          +{hidden.length}
        </span>
      )}
    </div>
  )
}

function TaskCard({ task, onClick, onComplete, hideDue }: {
  task: Task
  onClick: () => void
  onComplete: (id: string) => void
  /** Drop the date chip when it would only repeat the heading above it. */
  hideDue?: string
}) {
  return (
    // Focusable, and marked, because the row is what `j`/`k`/`x` move between:
    // the cursor is the focus ring, not a second highlight of its own. No
    // `role="button"` — the row holds buttons of its own, and a button inside
    // a button is a lie to a screen reader.
    <div
      className="row-hover row-line hoverable"
      onClick={onClick}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter') { e.preventDefault(); onClick() }
      }}
      tabIndex={0}
      data-task-row={task.id}
      style={{
        padding: 'var(--s2) 0',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)' }}>
        <button
          className="check-circle"
          onClick={e => { e.stopPropagation(); onComplete(task.id) }}
          style={{ alignSelf: 'center' }}
          title="Complete task" aria-label="Complete task"
        />
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--ivory)', lineHeight: 1.35, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {isEffectivelyKey(task) && <span style={{ color: 'var(--rose)', fontSize: 10, marginRight: 6 }}>★</span>}
          {task.title}
        </span>
        {/* Points sit in the gutter as a plain number — they rank the row,
            they don't need a box to do it. */}
        {task.points != null && (
          <span className="meta" style={{ flexShrink: 0 }}>
            {task.points}pt
          </span>
        )}
        <StartFocusButton taskId={task.id} taskTitle={task.title} size={16} />
      </div>
      <TaskMeta task={task} hideDue={hideDue} />
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
    // Columns of entries separated by hairlines — the board is the page, not
    // four floating boxes on it. Wide content scrolls inside this container.
    <div style={{ display: 'flex', gap: 'var(--s5)', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 'var(--s4)' }}>
      {tiers.map((tier, i) => {
        const tierTasks = open.filter(t => effectiveUrgency(t) === tier)
        return (
          <div key={tier} style={{
            ...cardShell(),
            flex: '1 1 220px', minWidth: 200,
            borderLeft: i > 0 ? '1px solid var(--rule)' : undefined,
            paddingLeft: i > 0 ? 'var(--s5)' : undefined,
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              paddingBottom: 'var(--s2)', marginBottom: 'var(--s3)',
            }}>
              <span className="section-title" style={{ color: URGENCY_COLORS[tier] }}>
                {URGENCY_LABELS[tier].toLowerCase()}
              </span>
              <span className="mono" style={{ fontSize: 20, lineHeight: 1, color: 'var(--slate)' }}>{tierTasks.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 80 }}>
              {tierTasks.map(t => (
                <TaskCard key={t.id} task={t} onClick={() => onSelect(t)} onComplete={onComplete} hideDue={tier === 'today' ? 'today' : undefined} />
              ))}
              {tierTasks.length === 0 && (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--slate)', padding: 'var(--s2) 0' }}>Nothing here</div>
              )}
            </div>
          </div>
        )
      })}

      {done.length > 0 && (
        <div style={{
          ...cardShell(), flex: '0 0 220px', minWidth: 200,
          borderLeft: '1px solid var(--rule)', paddingLeft: 'var(--s5)',
        }}>
          <button
            onClick={() => setDoneOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 'var(--s2)', width: '100%',
              paddingBottom: 'var(--s2)', marginBottom: 'var(--s3)',
              background: 'transparent', border: 0, borderRadius: 0, cursor: 'pointer',
            }}
          >
            {doneOpen ? <ChevronDown size={12} color="var(--slate)" /> : <ChevronRight size={12} color="var(--slate)" />}
            <span className="section-title" style={{ color: 'var(--slate)' }}>
              done
            </span>
            <span className="mono" style={{ fontSize: 20, lineHeight: 1, color: 'var(--slate)', marginLeft: 'auto' }}>{done.length}</span>
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
          <div style={{ padding: '13px 16px 9px' }}>
            <span className="section-title" style={{ color: 'var(--danger)' }}>
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
                padding: '8px 10px 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--ink-4)' }}>
                  {dayLabel(d)}
                </span>
                {dayTasks.length > 0 && (
                  <span style={{ width: 4, height: 4, background: 'var(--royal)', display: 'inline-block' }} />
                )}
              </div>
              <div style={{ padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 40 }}>
                {dayTasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => onSelect(t)}
                    style={{
                      fontSize: 'var(--text-xs)', color: 'var(--ink-5)', cursor: 'pointer', padding: '2px 4px',
                      borderRadius: 0, lineHeight: 1.3,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--ink-1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); onComplete(t.id) }}
                      style={{
                        width: 10, height: 10, borderRadius: 0, border: '1px solid var(--ink-3)',
                        background: 'transparent', cursor: 'pointer', flexShrink: 0,
                      }}
                    />
                    {isEffectivelyKey(t) && <span style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>★</span>}
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
          <div style={{ padding: '13px 16px 9px' }}>
            <span className="section-title" style={{ color: 'var(--ink-4)' }}>
              No due date
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
              padding: '13px 16px 9px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span className="section-title">
                {label}
              </span>
              {kind && <span className="chip" style={chip('var(--ink-3)')}>{kind}</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-3)', marginLeft: 'auto' }}>
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
        <div style={{ ...cardShell(), padding: '20px 16px', color: 'var(--ink-3)', fontSize: 'var(--text-sm)' }}>
          No open tasks.
        </div>
      )}
    </div>
  )
}

// ── Task drawer ────────────────────────────────────────────────────────────

function TaskDrawer({ task, entities: initialEntities, onClose, onSave, onDelete, onUncomplete, isMobile }: {
  task: Task
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
    setForm({ ...task })
    setTagInput((task.tags ?? []).join(', '))
  }, [task.id])

  const set = (k: keyof Task, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const handleClose = () => {
    const tags = tagInput.split(',').map(s => s.trim()).filter(Boolean)
    onSave(task.id, { ...form, tags: tags.length ? tags : null })
    onClose()
  }

  const dialogRef = useDialog<HTMLDivElement>(handleClose)

  const inputStyle: React.CSSProperties = {
    background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-xs)', color: 'var(--ink-6)',
    fontSize: 'var(--text-base)', padding: '9px 11px',
    width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)', fontWeight: 500,
    color: 'var(--ink-4)', marginBottom: 5, display: 'block',
  }
  const rowStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 }

  const isCompleted = !!task.completed_at

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 50 }}
      />
      {/* Drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-drawer-title"
        tabIndex={-1}
        style={isMobile ? {
        position: 'fixed', bottom: 0, left: 0, right: 0, top: 'auto',
        maxHeight: '92dvh', borderRadius: '16px 16px 0 0',
        background: 'var(--tint)',
        borderTop: '1px solid var(--glass-border)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      } : {
        position: 'fixed', top: 52, right: 0, bottom: 0, width: 380,
        background: 'var(--tint)',
        borderLeft: '1px solid var(--glass-border)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
      >
        {isMobile && (
          <div style={{ width: 36, height: 4, borderRadius: 0, background: 'var(--ink-3)', alignSelf: 'center', margin: '12px auto 4px' }} />
        )}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0,
        }}>
          <span className="panel-title" id="task-drawer-title">
            {isCompleted ? 'Completed task' : 'Edit task'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) onDelete(task.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}
              title="Delete task" aria-label="Delete task"
            >
              <Trash2 size={14} />
            </button>
            <button onClick={handleClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <div style={rowStyle}>
            <label htmlFor="td-title" style={labelStyle}>Title</label>
            <input id="td-title" style={inputStyle} value={form.title ?? ''} onChange={e => set('title', e.target.value)} />
          </div>

          <div style={rowStyle}>
            <label htmlFor="td-notes" style={labelStyle}>Notes</label>
            <textarea
              id="td-notes"
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value || null)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={rowStyle}>
              <label htmlFor="td-urgency" style={labelStyle}>Urgency</label>
              {form.due_date ? (
                <div style={{ ...inputStyle, color: URGENCY_COLORS[urgencyFromDate(form.due_date)], fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center' }}>
                  {URGENCY_LABELS[urgencyFromDate(form.due_date)]} <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>from due date</span>
                </div>
              ) : (
                <select id="td-urgency" style={inputStyle} value={form.urgency ?? 'someday'} onChange={e => set('urgency', e.target.value)}>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="someday">Someday</option>
                </select>
              )}
            </div>
            <div style={rowStyle}>
              <label htmlFor="td-points" style={labelStyle}>Points</label>
              <input
                id="td-points"
                style={inputStyle} type="number" min={0}
                value={form.points ?? ''}
                onChange={e => set('points', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={rowStyle}>
              <label htmlFor="td-due" style={labelStyle}>Due Date</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input id="td-due" style={{ ...inputStyle, flex: 1 }} type="date" value={form.due_date ?? ''} onChange={e => set('due_date', e.target.value || null)} />
                {form.due_date && (
                  <button
                    onClick={() => set('due_date', null)}
                    title="Clear date" aria-label="Clear date"
                    style={{
                      flexShrink: 0, padding: '0 8px', borderRadius: 'var(--radius-xs)',
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
              <label htmlFor="td-project" style={labelStyle}>Project</label>
              <ProjectSelect
                id="td-project"
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
              <label htmlFor="td-owner" style={labelStyle}>Owner</label>
              <input id="td-owner" style={inputStyle} value={form.owner ?? ''} onChange={e => set('owner', e.target.value || null)} />
            </div>
            <div style={rowStyle}>
              <label htmlFor="td-tags" style={labelStyle}>Tags (comma-sep)</label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input id="td-tags" style={{ ...inputStyle, width: '100%' }} value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="design, frontend" />
                {/* Live preview — the colours here are the colours the card will use. */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {tagInput.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} className="chip" style={tagChip()}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox" checked={!!form.key}
                onChange={e => set('key', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-5)' }}>Key task ★</span>
            </label>
          </div>

          {isCompleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>
                Completed {new Date(task.completed_at!).toLocaleDateString()}
              </span>
              <button
                onClick={() => { onUncomplete(task.id); onClose() }}
                style={{
                  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
                  padding: '3px 10px', borderRadius: 'var(--radius-xs)',
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

function ProjectSelect({ id, entities, value, onChange, onCreated, inputStyle }: {
  id?: string
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
          id={id}
          aria-label="New project name"
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
            padding: '0 10px', borderRadius: 'var(--radius-xs)', border: 'none',
            background: 'var(--champagne)', color: 'var(--ground)',
            fontSize: 'var(--text-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: saving || !name.trim() ? 0.6 : 1,
          }}
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          onClick={() => setAdding(false)}
          style={{ padding: '0 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {/* aria-label as well as the id: the add-task modal has no visible label. */}
      <select id={id} aria-label="Project" style={{ ...inputStyle, flex: 1 }} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">No project</option>
        {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
      </select>
      <button
        onClick={() => setAdding(true)}
        title="New project" aria-label="New project"
        style={{
          padding: '0 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--glass-border)',
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
  const dialogRef = useDialog<HTMLDivElement>(onClose)

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
    borderRadius: 'var(--radius-xs)', color: 'var(--ink-6)', fontSize: 'var(--text-base)', padding: '5px 8px',
    outline: 'none', flex: 1,
  }

  const active = entities.filter(e => !e.metadata?.archived)
  const archived = entities.filter(e => e.metadata?.archived)

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 60 }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-projects-title"
        tabIndex={-1}
        style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 400, maxHeight: '70vh', background: 'var(--tint)',
        border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)',
        zIndex: 61, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <span className="panel-title" id="manage-projects-title">Manage projects</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}><X size={14} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {active.length === 0 && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)', padding: '8px 0' }}>No projects yet.</div>}
          {active.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0' }}>
              {editingId === e.id ? (
                <>
                  <input
                    autoFocus style={inputStyle} value={editName}
                    onChange={ev => setEditName(ev.target.value)}
                    onKeyDown={ev => { if (ev.key === 'Enter') saveEdit(e.id); if (ev.key === 'Escape') setEditingId(null) }}
                  />
                  <button onClick={() => saveEdit(e.id)} style={{ fontSize: 'var(--text-sm)', padding: '4px 10px', borderRadius: 'var(--radius-xs)', border: 'none', background: 'var(--champagne)', color: 'var(--ground)', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ fontSize: 'var(--text-sm)', padding: '4px 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--ink-4)', cursor: 'pointer' }}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--ink-5)' }}>{e.name}</span>
                  {e.kind && <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', border: '1px solid var(--glass-border)', borderRadius: 0, padding: '1px 5px' }}>{e.kind}</span>}
                  <button onClick={() => { setEditingId(e.id); setEditName(e.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 'var(--text-base)' }} title="Rename" aria-label="Rename">✎</button>
                  <button onClick={() => patch(e.id, { metadata: { archived: true } })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ok)', fontSize: 'var(--text-sm)' }} title="Mark complete" aria-label="Mark complete">✓</button>
                  <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} title="Delete" aria-label="Delete"><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
          {archived.length > 0 && (
            <>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-3)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>Completed</div>
              {archived.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', opacity: 0.5 }}>
                  <span style={{ flex: 1, fontSize: 'var(--text-base)', color: 'var(--ink-4)', textDecoration: 'line-through' }}>{e.name}</span>
                  <button onClick={() => patch(e.id, { metadata: { archived: false } })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 'var(--text-xs)' }} title="Restore" aria-label="Restore">↩</button>
                  <button onClick={() => remove(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} title="Delete" aria-label="Delete"><Trash2 size={12} /></button>
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
  // The title field takes focus on its own timer below, so the dialog doesn't
  // also grab it — that would land on the close button and then jump.
  const dialogRef = useDialog<HTMLDivElement>(onClose, { autoFocus: false })

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
    borderRadius: 'var(--radius-xs)', color: 'var(--ink-6)', fontSize: 'var(--text-base)', padding: '7px 10px',
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
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 60 }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-title"
        tabIndex={-1}
        style={{
        ...sheetStyle,
        background: 'var(--tint)',
        border: '1px solid var(--glass-border)',
        zIndex: 61, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {isMobile && (
          <div style={{ width: 36, height: 4, borderRadius: 0, background: 'var(--ink-3)', alignSelf: 'center', marginBottom: 4 }} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="panel-title" id="add-task-title">
            New task
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)' }}>
            <X size={14} />
          </button>
        </div>

        <input
          ref={inputRef}
          aria-label="Task title"
          style={{ ...inputStyle, fontSize: 14 }}
          placeholder="Task title…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input aria-label="Due date" style={{ ...inputStyle, flex: 1 }} type="date" value={dueDate} onChange={e => {
              setDueDate(e.target.value)
              if (!e.target.value) setUrgency('someday')
            }} />
            {dueDate && (
              <button
                onClick={() => { setDueDate(''); setUrgency('someday') }}
                title="Clear date" aria-label="Clear date"
                style={{
                  flexShrink: 0, padding: '0 8px', borderRadius: 'var(--radius-xs)',
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
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-5)' }}>Key ★</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
          {dueDate ? (
            <div style={{ ...inputStyle, color: URGENCY_COLORS[urgencyFromDate(dueDate)], fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {URGENCY_LABELS[urgencyFromDate(dueDate)]}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-3)' }}>from due date</span>
            </div>
          ) : (
            <select aria-label="Urgency" style={inputStyle} value={urgency} onChange={e => setUrgency(e.target.value as Urgency)}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="someday">Someday</option>
            </select>
          )}
          <input aria-label="Points" style={inputStyle} type="number" min={0} placeholder="pts" value={points} onChange={e => setPoints(e.target.value)} />
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
            padding: '9px 0', borderRadius: 'var(--radius-xs)', border: 'none',
            background: 'var(--champagne)', color: 'var(--ground)',
            fontSize: 'var(--text-base)', cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
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
    <Suspense fallback={<div style={{ padding: 20, color: 'var(--ink-3)', fontSize: 'var(--text-base)' }}>Loading…</div>}>
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
  // The patch a failed drawer save was carrying, kept so Retry can re-send it.
  const [saveError, setSaveError] = useState<{ id: string; patch: Partial<Task>; title: string } | null>(null)
  const [showManageProjects, setShowManageProjects] = useState(false)
  const [filter, setFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)

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

  // Pre-open drawer from ?task=id (linked from Today's Tasks card).
  // Guarded by a ref so it fires once per id: this effect depends on `tasks`,
  // and closing the drawer saves, which rewrites `tasks` — without the guard
  // that re-runs the effect and snaps the drawer straight back open.
  const preOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId) { preOpenedRef.current = null; return }
    if (preOpenedRef.current === taskId || !tasks.length) return
    const t = tasks.find(t => t.id === taskId)
    if (t) {
      preOpenedRef.current = taskId
      setSelectedTask(t)
    }
  }, [searchParams, tasks])

  // Closing has to drop the ?task= param too, or the URL keeps asking for it.
  const closeDrawer = useCallback(() => {
    setSelectedTask(null)
    if (searchParams.get('task')) router.replace('/tasks', { scroll: false })
  }, [router, searchParams])

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

  /**
   * The drawer closes the moment you dismiss it and does not wait for this, so
   * a failed PATCH used to take the edits with it — nothing on screen changed,
   * and the task quietly kept its old values. The edits go in optimistically
   * and a failure rolls back and says so, with the patch held for a retry.
   */
  const handleSave = async (id: string, patch: Partial<Task>) => {
    const previous = tasks.find(t => t.id === id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } as Task : t))
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === id ? updated : t))
      setSaveError(null)
    } catch (err) {
      console.error('Failed to save task:', err)
      if (previous) setTasks(prev => prev.map(t => t.id === id ? previous : t))
      setSaveError({ id, patch, title: previous?.title ?? 'that task' })
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
    closeDrawer()
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

  // Recomputed from what's loaded, so a tag that stops being ubiquitous starts
  // showing again on its own.
  const tagFreq = useMemo(() => tagFrequency(tasks), [tasks])

  // Substring, over the words a row already shows — the filter narrows what is
  // on screen, it isn't a query language.
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.tags ?? []).some(tag => tag.toLowerCase().includes(q)) ||
      (t.owner ?? '').toLowerCase().includes(q),
    )
  }, [tasks, filter])

  /**
   * The row cursor is the DOM's own: `j`/`k` move focus between the rows the
   * three views all mark with `data-task-row`, so nothing has to thread a
   * selected index down through a board, a forecast and a category list, and
   * the cursor is visible for free as the focus ring.
   */
  const rows = useCallback(
    () => Array.from(boardRef.current?.querySelectorAll<HTMLElement>('[data-task-row]') ?? []),
    [],
  )
  const focusedRow = useCallback(() => {
    const active = document.activeElement
    return rows().find(row => row === active || row.contains(active)) ?? null
  }, [rows])

  const moveRow = useCallback((step: 1 | -1) => {
    const all = rows()
    if (all.length === 0) return
    const here = focusedRow()
    const next = here
      ? all[Math.min(all.length - 1, Math.max(0, all.indexOf(here) + step))]
      : all[step === 1 ? 0 : all.length - 1]
    next?.focus()
    next?.scrollIntoView({ block: 'nearest' })
  }, [rows, focusedRow])

  useKeyboard([
    { keys: 'n', label: 'New task', group: 'Tasks', run: () => setShowAdd(true) },
    { keys: '/', label: 'Filter tasks', group: 'Tasks', run: () => filterRef.current?.focus() },
    { keys: 'j', label: 'Next task', group: 'Tasks', run: () => moveRow(1) },
    { keys: 'k', label: 'Previous task', group: 'Tasks', run: () => moveRow(-1) },
    {
      keys: 'x', label: 'Complete the focused task', group: 'Tasks',
      run: () => {
        const row = focusedRow()
        const id = row?.dataset.taskRow
        if (!id) return
        // Move first: completing usually unmounts this row, and focus falling
        // back to <body> would end the run of ticks mid-list.
        const all = rows()
        const after = all[all.indexOf(row!) + 1] ?? all[all.indexOf(row!) - 1]
        after?.focus()
        handleComplete(id)
      },
    },
  ])

  const views: { id: View; label: string }[] = [
    { id: 'kanban', label: 'Kanban' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'category', label: 'Category' },
  ]

  return (
    <div style={{ padding: 'var(--s5)', position: 'relative' }}>
      {saveError && (
        <div style={{ marginBottom: 12 }}>
          <ErrorRow
            message={`Couldn't save "${saveError.title}".`}
            onRetry={() => {
              const { id, patch } = saveError
              setSaveError(null)
              handleSave(id, patch)
            }}
          />
        </div>
      )}

      {/* The toolbar is a line of text under a hairline: the view switcher is
          words with an underline, and every other control is a text button.
          Nothing here is a box. It still wraps — the four controls came to
          573px in one line, which is wider than a phone. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s5)', flexWrap: 'wrap',
        marginBottom: 'var(--s5)', paddingBottom: 'var(--s3)',
        borderBottom: '1px solid var(--rule)',
      }}>
        <div style={{ display: 'flex', gap: 'var(--s3)' }}>
          {views.map(v => (
            <button
              key={v.id}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
              className="mono"
              style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                cursor: 'pointer', background: 'none', padding: '0 0 2px', borderRadius: 0,
                border: 0, borderBottom: `1px solid ${view === v.id ? 'var(--champagne)' : 'transparent'}`,
                color: view === v.id ? 'var(--ivory)' : 'var(--slate)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        {/* Not a search box: no icon, no fill, no border but the hairline the
            rest of the toolbar sits on. `/` puts the caret here. */}
        <input
          ref={filterRef}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setFilter(''); e.currentTarget.blur() }
          }}
          aria-label="Filter tasks"
          placeholder="filter…"
          style={{
            background: 'transparent', border: 0, borderRadius: 0, padding: 0,
            color: 'var(--ivory)', fontFamily: 'inherit', fontSize: 'var(--text-sm)',
            letterSpacing: '0.06em', outline: 'none', width: 120, minWidth: 0,
          }}
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as Sort)}
          aria-label="Sort tasks"
          className="mono"
          style={{
            background: 'transparent', border: 0, borderRadius: 0,
            color: 'var(--slate)', fontSize: 'var(--text-xs)',
            padding: 0, cursor: 'pointer', outline: 'none', letterSpacing: '0.06em',
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
          className="quiet-link"
          style={{
            marginLeft: 'auto', padding: 0, borderRadius: 0, border: 0,
            background: 'transparent', color: 'var(--slate)',
            fontSize: 'var(--text-sm)', letterSpacing: '0.06em', cursor: 'pointer',
          }}
        >
          projects
        </button>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--s1)', padding: 0,
            borderRadius: 0, border: 0, background: 'transparent', color: 'var(--champagne)',
            fontSize: 'var(--text-sm)', letterSpacing: '0.06em', cursor: 'pointer',
          }}
        >
          <Plus size={12} /> new task
        </button>
        {loading && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--slate)' }}>Loading…</span>}
      </div>

      {/* Content */}
      {!loading && (
        <TagFreqContext.Provider value={tagFreq}>
          <div ref={boardRef}>
          {view === 'kanban' && (
            <KanbanView tasks={sortTasks(shown, sort)} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
          {view === 'forecast' && (
            <ForecastView tasks={sortTasks(shown, sort)} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
          {view === 'category' && (
            <CategoryView tasks={sortTasks(shown, sort)} entities={entities} onSelect={setSelectedTask} onComplete={handleComplete} />
          )}
          </div>
        </TagFreqContext.Provider>
      )}

      {/* Drawer */}
      {selectedTask && (
      <TaskDrawer
        task={selectedTask}
        entities={entities}
        onClose={closeDrawer}
        onSave={handleSave}
        onDelete={handleDelete}
        onUncomplete={handleUncomplete}
        isMobile={isMobile}
      />
      )}

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
            width: 48, height: 48, borderRadius: 0,
            background: 'var(--champagne)', color: 'var(--ground)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 40,
          }}
          title="New task" aria-label="New task"
        >
          <Plus size={22} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
