'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react'
import { habitDateKey, USER_TZ } from '@/lib/dateKey'
import { ErrorRow } from './jobs/ui'

// `fetch` only rejects on a network failure, so a 500 came back through the
// happy path and got rendered as an empty grid. These throw on both.
async function getJson(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function post(url: string, body: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Level = { id: string; label: string }
type HabitDef = { id: string; name: string; levels: Level[] }
type SleepLog = { bedtime?: string; waketime?: string; hours?: number }
type DayNotes = { habits: Record<string, number>; sleep?: SleepLog }
type MonthLogs = Record<string, DayNotes> // YYYY-MM-DD → DayNotes

// ─── Constants ────────────────────────────────────────────────────────────────

const SLEEP_ID = '__sleep__'
const STORY_ID = '__story__'

const SLEEP_LEVELS: Level[] = [
  { id: 's1', label: '< 6h' },
  { id: 's2', label: '6–7h' },
  { id: 's3', label: '7–8h' },
  { id: 's4', label: '≥ 8h' },
]
const STORY_LEVELS: Level[] = [
  { id: 'sp1', label: '1–3 pts' },
  { id: 'sp2', label: '4–6 pts' },
  { id: 'sp3', label: '7–10 pts' },
  { id: 'sp4', label: '≥ 11 pts' },
]

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── Level fills ──────────────────────────────────────────────────────────────

// The twelve month colours are retired. A month is not a category and a habit
// is not a hue: a filled cell can only ever say "more of the same thing", so
// the whole vocabulary is four opacities of one hue — lavender, because a
// tracker is calm by definition and colour that means time is spent elsewhere.
const LEVEL_FILL = ['var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

function levelFill(level: number, totalLevels: number): string {
  if (level <= 0) return ''
  const step = Math.ceil((level / totalLevels) * LEVEL_FILL.length)
  return LEVEL_FILL[Math.min(Math.max(step, 1), LEVEL_FILL.length) - 1]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TZ = USER_TZ

function localDateKey(): string {
  return habitDateKey(TZ)
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function habitMonthScore(logs: MonthLogs, habitId: string, levels: Level[], year: number, month: number, monthStoryPoints?: Record<string, number>): number {
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const daysElapsed = isCurrentMonth ? today.getDate() : getDaysInMonth(year, month)
  let total = 0
  for (let d = 1; d <= daysElapsed; d++) {
    const key = dateKey(year, month, d)
    const level = habitId === SLEEP_ID
      ? (logs[key]?.sleep ? sleepHoursToLevel(logs[key].sleep!.hours ?? 0) : 0)
      : habitId === STORY_ID
      ? storyPointsToLevel(monthStoryPoints?.[key] ?? 0)
      : (logs[key]?.habits?.[habitId] ?? 0)
    total += (level / levels.length) * 10
  }
  return total / daysElapsed
}

// ─── Level mappers ────────────────────────────────────────────────────────────

function sleepHoursToLevel(hours: number): number {
  if (hours <= 0) return 0
  if (hours < 6) return 1
  if (hours < 7) return 2
  if (hours < 8) return 3
  return 4
}

function storyPointsToLevel(pts: number): number {
  if (pts < 1) return 0
  if (pts <= 3) return 1
  if (pts <= 6) return 2
  if (pts <= 10) return 3
  return 4
}

// ─── Unique id ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9)

// ─── Day score helpers ────────────────────────────────────────────────────────

function computeDayScore(
  allHabits: HabitDef[],
  todayLog: DayNotes | undefined,
  sleepLog: SleepLog | undefined,
  storyPoints: number
): number {
  if (allHabits.length === 0) return 0
  let total = 0
  for (const habit of allHabits) {
    if (habit.id === SLEEP_ID) {
      total += (sleepHoursToLevel(sleepLog?.hours ?? 0) / SLEEP_LEVELS.length) * 10
    } else if (habit.id === STORY_ID) {
      total += (storyPointsToLevel(storyPoints) / STORY_LEVELS.length) * 10
    } else {
      total += ((todayLog?.habits?.[habit.id] ?? 0) / habit.levels.length) * 10
    }
  }
  return total / allHabits.length
}

function ScoreRing({ score, size = 36 }: { score: number; size?: number }) {
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 3
  const r = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * r
  const filled = (score / 10) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--lavender)" strokeWidth={strokeWidth} opacity={0.18} />
        {score > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="var(--lavender)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color: 'var(--lavender)',
          lineHeight: 1,
        }}>
          {score.toFixed(1)}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HabitTracker() {
  const [habits, setHabits] = useState<HabitDef[]>([])
  const [logs, setLogs] = useState<MonthLogs>({})
  const [storyPoints, setStoryPoints] = useState(0)
  const [monthStoryPoints, setMonthStoryPoints] = useState<Record<string, number>>({})
  const [view, setView] = useState<'today' | 'month'>('today')
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<HabitDef | null>(null)
  const [loading, setLoading] = useState(true)

  const dirtyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const today = localDateKey()

  // ── Fetch config ────────────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const { habits: h } = await getJson('/api/habits/config')
      setHabits(h ?? [])
    } catch (e) {
      console.error('Failed to load habit config:', e)
      setError("Couldn't load your habits.")
    }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  // ── Fetch logs for visible month ────────────────────────────────────────────

  const fetchLogs = useCallback(async (y: number, m: number) => {
    try {
      const [rows, spByDay]: [
        { log_date: string; notes: DayNotes }[],
        Record<string, number>
      ] = await Promise.all([
        getJson(`/api/habits/logs?year=${y}&month=${m + 1}`),
        getJson(`/api/habits/story-points?year=${y}&month=${m + 1}`),
      ])

      if (!dirtyRef.current) {
        const map: MonthLogs = {}
        for (const row of rows) map[row.log_date] = row.notes
        setLogs(prev => ({ ...prev, ...map }))
        setMonthStoryPoints(spByDay ?? {})
      }
      setError(null)
    } catch (e) {
      // An empty grid is indistinguishable from a month you logged nothing in,
      // which is exactly the wrong thing for an outage to look like.
      console.error('Failed to load habit logs:', e)
      setError("Couldn't load this month's logs.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    dirtyRef.current = false
    fetchLogs(year, month)
  }, [year, month, fetchLogs])

  // ── Fetch today's story points ──────────────────────────────────────────────

  const fetchStoryPoints = useCallback(async () => {
    try {
      const { points } = await getJson(`/api/habits/story-points?date=${today}`)
      setStoryPoints(points ?? 0)
    } catch (e) {
      console.error('Failed to load story points:', e)
      setError("Couldn't load today's story points.")
    }
  }, [today])

  useEffect(() => { fetchStoryPoints() }, [fetchStoryPoints])

  // Re-fetch story points when a task is completed anywhere in the app
  useEffect(() => {
    const ch = new BroadcastChannel('pos-tasks')
    ch.onmessage = (e) => { if (e.data?.type === 'task_completed') fetchStoryPoints() }
    return () => ch.close()
  }, [fetchStoryPoints])

  const retry = useCallback(() => {
    setError(null)
    setLoading(true)
    dirtyRef.current = false
    fetchConfig()
    fetchLogs(year, month)
    fetchStoryPoints()
  }, [fetchConfig, fetchLogs, fetchStoryPoints, year, month])

  // ── Log a habit ─────────────────────────────────────────────────────────────

  async function logHabit(habitId: string, date: string, level: number) {
    dirtyRef.current = true
    const previous = logs[date]?.habits?.[habitId]

    // Optimistic update
    setLogs(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        habits: { ...(prev[date]?.habits ?? {}), [habitId]: level },
      },
    }))

    try {
      await post('/api/habits/logs', { date, habitId, level })
      setError(null)
    } catch (e) {
      // Roll the cell back. Leaving it lit is worse than not registering the
      // tap: it claims something is written that isn't.
      console.error('Failed to save habit log:', e)
      setLogs(prev => {
        const habits = { ...(prev[date]?.habits ?? {}) }
        if (previous === undefined) delete habits[habitId]
        else habits[habitId] = previous
        return { ...prev, [date]: { ...prev[date], habits } }
      })
      setError("Couldn't save that — tap it again.")
    }
  }

  // ── Sleep buttons ───────────────────────────────────────────────────────────

  async function handleSleep(event: 'bedtime' | 'waketime') {
    dirtyRef.current = true
    try {
      await post('/api/habits/sleep', { event })

      // Refresh logs after sleep event
      dirtyRef.current = false
      await fetchLogs(year, month)
      setError(null)
    } catch (e) {
      console.error('Failed to save sleep event:', e)
      setError(`Couldn't record ${event === 'bedtime' ? 'bedtime' : 'wake time'}.`)
    }
  }

  // ── Add / delete habits ─────────────────────────────────────────────────────

  /** Every config write is the whole array, so a rollback is just the old one. */
  async function saveHabits(next: HabitDef[], what: string) {
    const previous = habits
    setHabits(next)
    try {
      await post('/api/habits/config', { habits: next })
      setError(null)
    } catch (e) {
      console.error(`Failed to ${what} habit:`, e)
      setHabits(previous)
      setError(`Couldn't ${what} that habit.`)
    }
  }

  async function addHabit(name: string, levels: Level[]) {
    await saveHabits([...habits, { id: uid(), name, levels }], 'add')
  }

  async function editHabit(id: string, name: string, levels: Level[]) {
    await saveHabits(habits.map(h => h.id === id ? { ...h, name, levels } : h), 'save')
  }

  async function deleteHabit(id: string) {
    const habit = habits.find(h => h.id === id)
    if (!window.confirm(`Delete habit "${habit?.name ?? id}"?`)) return
    await saveHabits(habits.filter(h => h.id !== id), 'delete')
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    setMonth(d.getMonth())
    setYear(d.getFullYear())
  }

  const todayLog = logs[today]
  const sleepLog = todayLog?.sleep

  // All habits for display (specials first, user habits alphabetized)
  const allHabits = [
    { id: SLEEP_ID, name: 'Sleep', levels: SLEEP_LEVELS },
    { id: STORY_ID, name: 'Story Points', levels: STORY_LEVELS },
    ...[...habits].sort((a, b) => a.name.localeCompare(b.name)),
  ]

  const dayScore = computeDayScore(allHabits, todayLog, sleepLog, storyPoints)

  if (loading) {
    return (
      <CardShell>
        <div style={{ padding: 'var(--s4)', color: 'var(--slate)', fontSize: 'var(--text-base)' }}>Loading…</div>
      </CardShell>
    )
  }

  return (
    <CardShell>
      {/* The region head sits on the page ground; only the body below it is
          filled, which is what makes habits the one surface in the dashboard. */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
        marginBottom: 'var(--s4)', minHeight: 22,
      }}>
        <h2 className="display" style={{ fontSize: 28, margin: 0, color: 'var(--ivory)' }}>habits</h2>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--s4)' }}>
          {view === 'today'
            ? <ScoreRing score={dayScore} />
            : <span style={{ width: 5, height: 5, background: 'var(--lavender)', display: 'inline-block' }} />
          }

          <div style={{ display: 'flex', gap: 'var(--s3)' }}>
            {(['today', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className="mono"
                style={{
                  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: view === v ? 'var(--ivory)' : 'var(--slate)',
                  background: 'none', padding: '0 0 2px', borderRadius: 0,
                  border: 0, borderBottom: `1px solid ${view === v ? 'var(--champagne)' : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 0, borderRadius: 0, padding: 0,
              color: 'var(--slate)', cursor: 'pointer',
            }}
            title="Add habit" aria-label="Add habit"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {error && <ErrorRow message={error} onRetry={retry} />}

      {/* The one filled surface in the app. */}
      <div style={{ background: 'var(--tint)', padding: 'var(--s4)', overflowY: 'auto', minWidth: 0 }}>
        {view === 'today'
          ? <TodayView
              habits={habits}
              allHabits={allHabits}
              todayLog={todayLog}
              sleepLog={sleepLog}
              storyPoints={storyPoints}
              today={today}
              onLog={logHabit}
              onSleep={handleSleep}
              onEdit={setEditingHabit}
              onDelete={deleteHabit}
            />
          : <MonthView
              allHabits={allHabits}
              logs={logs}
              monthStoryPoints={monthStoryPoints}
              month={month}
              year={year}
              onShift={shiftMonth}
              onLog={logHabit}
            />
        }
      </div>

      {showAddModal && (
        <HabitModal
          onSave={(name, levels) => { addHabit(name, levels); setShowAddModal(false) }}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingHabit && (
        <HabitModal
          initial={editingHabit}
          onSave={(name, levels) => { editHabit(editingHabit.id, name, levels); setEditingHabit(null) }}
          onClose={() => setEditingHabit(null)}
        />
      )}
    </CardShell>
  )
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="region region-hab" style={{ display: 'flex', flexDirection: 'column' }}>
      {children}
    </section>
  )
}

// ─── Today view ───────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  })
}

function TodayView({
  habits,
  allHabits,
  todayLog,
  sleepLog,
  storyPoints,
  today,
  onLog,
  onSleep,
  onEdit,
  onDelete,
}: {
  habits: HabitDef[]
  allHabits: HabitDef[]
  todayLog: DayNotes | undefined
  sleepLog: SleepLog | undefined
  storyPoints: number
  today: string
  onLog: (id: string, date: string, level: number) => void
  onSleep: (event: 'bedtime' | 'waketime') => void
  onEdit: (habit: HabitDef) => void
  onDelete: (id: string) => void
}) {
  const [hoveredHabit, setHoveredHabit] = useState<string | null>(null)

  if (habits.length === 0 && allHabits.length === 2) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', marginBottom: 12 }}>No habits yet.</div>
      </div>
    )
  }

  // A level is a word in a box the width of the word — no fill until it is
  // the one chosen, and then it carries the same lavender the grid does.
  // These are words, so they stay in Jost rather than the number face.
  const habitBtnBase: React.CSSProperties = {
    fontSize: 'var(--text-sm)', padding: '2px var(--s2)', borderRadius: 0,
    border: '1px solid var(--rule)', background: 'transparent',
    color: 'var(--slate)', cursor: 'pointer', whiteSpace: 'nowrap',
  }

  return (
    <div>
      {allHabits.map(habit => {
        // ── Sleep row ───────────────────────────────────────────────────────
        if (habit.id === SLEEP_ID) {
          const hasBedtime = !!sleepLog?.bedtime
          const hasWaketime = !!sleepLog?.waketime
          const hours = sleepLog?.hours
          const level = sleepHoursToLevel(hours ?? 0)
          const done = hasBedtime && hasWaketime

          return (
            <div key={habit.id} className="hrow">
              <span style={{ flex: 1, fontSize: 'var(--text-base)', color: done ? 'var(--ivory)' : 'var(--ash)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                {done && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--lavender)' }}>✓</span>}
                Sleep
              </span>
              {hours !== undefined && hours > 0 && (
                <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--lavender)' }}>
                  {hours.toFixed(1)}h
                </span>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onSleep('waketime')} className="tap" style={{
                  ...habitBtnBase,
                  background: hasWaketime ? 'var(--lavender)' : 'transparent',
                  color: hasWaketime ? 'var(--ground)' : 'var(--slate)',
                  borderColor: hasWaketime ? 'var(--lavender)' : 'var(--rule)',
                }}>
                  ☀️ {hasWaketime ? formatTime(sleepLog!.waketime!) : 'Wake'}
                </button>
                <button onClick={() => onSleep('bedtime')} className="tap" style={{
                  ...habitBtnBase,
                  background: hasBedtime ? 'var(--lavender)' : 'transparent',
                  color: hasBedtime ? 'var(--ground)' : 'var(--slate)',
                  borderColor: hasBedtime ? 'var(--lavender)' : 'var(--rule)',
                }}>
                  🌙 {hasBedtime ? formatTime(sleepLog!.bedtime!) : 'Bedtime'}
                </button>
              </div>
            </div>
          )
        }

        // ── Story Points row ────────────────────────────────────────────────
        if (habit.id === STORY_ID) {
          const level = storyPointsToLevel(storyPoints)
          const done = level > 0

          return (
            <div key={habit.id} className="hrow">
              <span style={{ flex: 1, fontSize: 'var(--text-base)', color: done ? 'var(--ivory)' : 'var(--ash)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
                {done && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--lavender)' }}>✓</span>}
                Story Points
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {STORY_LEVELS.map((lv, i) => {
                  const lvl = i + 1
                  const active = level === lvl
                  return (
                    <span key={lv.id} style={{
                      ...habitBtnBase,
                      display: 'inline-block',
                      background: active ? 'var(--lavender)' : 'transparent',
                      color: active ? 'var(--ground)' : 'var(--slate)',
                      borderColor: active ? 'var(--lavender)' : 'var(--rule)',
                      opacity: active ? 1 : 0.6,
                    }}>
                      {lv.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        }

        // ── User-defined habit row ──────────────────────────────────────────
        const currentLevel = todayLog?.habits?.[habit.id] ?? 0
        const done = currentLevel > 0

        return (
          <div
            key={habit.id}
            className="hrow"
            onMouseEnter={() => setHoveredHabit(habit.id)}
            onMouseLeave={() => setHoveredHabit(null)}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: done ? 'var(--ivory)' : 'var(--ash)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
              {done && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--lavender)' }}>✓</span>}
              {habit.name}
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {habit.levels.map((lv, i) => {
                const lvl = i + 1
                const active = currentLevel === lvl
                return (
                  <button
                    key={lv.id}
                    onClick={() => onLog(habit.id, today, active ? 0 : lvl)}
                    className="tap"
                    style={{
                      ...habitBtnBase,
                      background: active ? 'var(--lavender)' : 'transparent',
                      color: active ? 'var(--ground)' : 'var(--slate)',
                      borderColor: active ? 'var(--lavender)' : 'var(--rule)',
                    }}
                  >
                    {lv.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 2, opacity: hoveredHabit === habit.id ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }}>
              <button
                onClick={() => onEdit(habit)}
                className="tap"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 0,
                  background: 'transparent', border: 'none',
                  color: 'var(--ink-3)', cursor: 'pointer', fontSize: 'var(--text-sm)',
                }}
                title="Edit habit" aria-label="Edit habit"
              >
                ✎
              </button>
              <button
                onClick={() => onDelete(habit.id)}
                className="tap"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 0,
                  background: 'transparent', border: 'none',
                  color: 'var(--ink-3)', cursor: 'pointer',
                }}
                title="Delete habit" aria-label="Delete habit"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  allHabits,
  logs,
  monthStoryPoints,
  month,
  year,
  onShift,
  onLog,
}: {
  allHabits: HabitDef[]
  logs: MonthLogs
  monthStoryPoints: Record<string, number>
  month: number
  year: number
  onShift: (delta: number) => void
  onLog: (id: string, date: string, level: number) => void
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const today = localDateKey()
  const todayDay =
    new Date().getFullYear() === year && new Date().getMonth() === month
      ? new Date().getDate()
      : null

  function handleCellClick(habit: HabitDef, day: number) {
    if (habit.id === STORY_ID) return // read-only
    if (habit.id === SLEEP_ID) return // auto-computed

    const key = dateKey(year, month, day)
    const current = logs[key]?.habits?.[habit.id] ?? 0
    const next = current >= habit.levels.length ? 0 : current + 1
    onLog(habit.id, key, next)
  }

  function getCellLevel(habit: HabitDef, day: number): number {
    const key = dateKey(year, month, day)
    if (habit.id === SLEEP_ID) {
      return sleepHoursToLevel(logs[key]?.sleep?.hours ?? 0)
    }
    if (habit.id === STORY_ID) {
      return storyPointsToLevel(monthStoryPoints[key] ?? 0)
    }
    return logs[key]?.habits?.[habit.id] ?? 0
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => onShift(-1)} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: '4px 6px' }}>
          <ChevronLeft size={14} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--ivory)' }}>{MONTH_NAMES[month]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-4)' }}>{year}</div>
        </div>
        <button onClick={() => onShift(1)} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: '4px 6px' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            {days.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--ink-3)', fontWeight: 400, borderBottom: '1px solid var(--glass-border)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>habit</th>
              {days.map(d => (
                <th key={d} style={{
                  paddingBottom: 4, paddingTop: 4, textAlign: 'center',
                  borderBottom: '1px solid var(--glass-border)',
                  color: d === todayDay ? 'var(--lavender)' : 'var(--slate)',
                  fontWeight: 400,
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allHabits.map(habit => {
              const isSpecial = habit.id === SLEEP_ID || habit.id === STORY_ID

              return (
                <tr key={habit.id}>
                  <td title={habit.name} style={{ padding: '3px 6px', color: 'var(--ink-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {habit.name}
                    {habit.id === STORY_ID && <span style={{ marginLeft: 4, fontSize: 'var(--text-xs)', opacity: 0.4 }}>🔒</span>}
                  </td>
                  {days.map(d => {
                    const level = getCellLevel(habit, d)
                    const bg = levelFill(level, habit.levels.length)
                    return (
                      <td key={d} style={{ padding: '2px 1px' }}>
                        <button
                          onClick={() => handleCellClick(habit, d)}
                          style={{
                            display: 'block', width: '100%', aspectRatio: '1',
                            borderRadius: 0, border: 0,
                            background: bg || 'var(--tint-2)',
                            outline: d === todayDay ? '1px solid var(--slate)' : undefined,
                            outlineOffset: 1,
                            cursor: isSpecial ? 'default' : 'pointer',
                          }}
                        />
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Monthly averages bars */}
      <div style={{ marginTop: 14, borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
        {allHabits.map(habit => {
          const score = habitMonthScore(logs, habit.id, habit.levels, year, month, monthStoryPoints)
          return (
            <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span title={habit.name} style={{ width: 100, fontSize: 'var(--text-xs)', color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{habit.name}</span>
              <div style={{ flex: 1, height: 2, background: 'var(--tint-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--lavender)', width: `${score * 10}%`, opacity: 0.5 + score * 0.05 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-4)', width: 28, textAlign: 'right' }}>{score.toFixed(1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Habit Modal (add + edit) ─────────────────────────────────────────────────

function HabitModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: HabitDef
  onSave: (name: string, levels: Level[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [levels, setLevels] = useState<Level[]>(initial?.levels ?? [{ id: uid(), label: '' }])

  const canSubmit = name.trim().length > 0 && levels.every(l => l.label.trim().length > 0)

  function addLevel() {
    if (levels.length < 5) setLevels(ls => [...ls, { id: uid(), label: '' }])
  }
  function removeLevel(id: string) {
    if (levels.length > 1) setLevels(ls => ls.filter(l => l.id !== id))
  }
  function updateLevel(id: string, label: string) {
    setLevels(ls => ls.map(l => l.id === id ? { ...l, label } : l))
  }

  const PLACEHOLDERS = ['e.g. 30 min', '1 hour', '2 hours', '3 hours', '4 hours']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--scrim)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: 'var(--tint)', border: '1px solid var(--rule)',
        borderRadius: 0, width: '100%', maxWidth: 360,
      }}>
        {/* Color strip */}
        <div style={{ height: 1, background: 'var(--lavender)' }} />

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="panel-title">{initial ? 'Edit habit' : 'New habit'}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="habit-name" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-4)', marginBottom: 6 }}>Name</label>
            <input
              id="habit-name"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && onSave(name.trim(), levels.map(l => ({ ...l, label: l.label.trim() })))}
              placeholder="e.g. Exercise, Reading, Water"
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                color: 'var(--ink-6)', fontSize: 'var(--text-base)', outline: 'none',
              }}
            />
          </div>

          {/* Levels */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-4)', marginBottom: 6 }}>
              Levels ({levels.length}/5)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {levels.map((lv, i) => (
                <div key={lv.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 0, flexShrink: 0,
                    background: levelFill(i + 1, levels.length) || 'var(--tint-2)',
                    border: 0,
                  }} />
                  <input
                    value={lv.label}
                    onChange={e => updateLevel(lv.id, e.target.value)}
                    placeholder={PLACEHOLDERS[i]}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                      color: 'var(--ink-6)', fontSize: 'var(--text-sm)', outline: 'none',
                    }}
                  />
                  {levels.length > 1 && (
                    <button onClick={() => removeLevel(lv.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 2 }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {levels.length < 5 && (
              <button onClick={addLevel} style={{
                marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--lavender)',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Plus size={11} /> Add level
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)', background: 'transparent',
              color: 'var(--ink-4)', fontSize: 'var(--text-base)', cursor: 'pointer',
            }}>Cancel</button>
            <button
              onClick={() => canSubmit && onSave(name.trim(), levels.map(l => ({ ...l, label: l.label.trim() })))}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
                border: 0, background: canSubmit ? 'var(--champagne)' : 'var(--tint-2)',
                color: canSubmit ? 'var(--ground)' : 'var(--slate)', fontSize: 'var(--text-base)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >{initial ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
