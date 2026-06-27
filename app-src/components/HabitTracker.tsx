'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react'
import { habitDateKey } from '@/lib/dateKey'

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

const MONTH_COLORS = [
  '#7EC8E3', '#D4607A', '#4A9B6F', '#9B7FD4',
  '#E8C832', '#6A35B0', '#C02040', '#E08820',
  '#8B2040', '#D06020', '#A05530', '#2855A8',
]
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── Color helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
}

function getLevelColor(monthHex: string, level: number, totalLevels: number): string {
  if (level === 0) return ''
  const [r,g,b] = hexToRgb(monthHex)
  const alpha = level / totalLevels
  const mix = (ch: number) => Math.round(255 * (1 - alpha) + ch * alpha)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const TZ = process.env.NEXT_PUBLIC_USER_TIMEZONE ?? 'America/Los_Angeles'

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

function ScoreRing({ score, monthColor }: { score: number; monthColor: string }) {
  const size = 68
  const cx = size / 2
  const cy = size / 2
  const r = 27
  const circumference = 2 * Math.PI * r
  const filled = (score / 10) * circumference
  const opacity = 0.2 + (score / 10) * 0.8

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={monthColor} strokeWidth={5.5} opacity={0.1} />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={monthColor}
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            opacity={opacity}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 15,
            fontWeight: 700,
            color: monthColor,
            opacity,
            lineHeight: 1,
          }}>
            {score.toFixed(1)}
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            letterSpacing: '0.08em',
            color: monthColor,
            opacity: opacity * 0.7,
            textTransform: 'uppercase',
          }}>
            today
          </span>
        </div>
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

  const monthColor = MONTH_COLORS[month]
  const today = localDateKey()

  // ── Fetch config ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/habits/config')
      .then(r => r.json())
      .then(({ habits: h }) => setHabits(h ?? []))
      .catch(e => console.error('Failed to load habit config:', e))
  }, [])

  // ── Fetch logs for visible month ────────────────────────────────────────────

  const fetchLogs = useCallback(async (y: number, m: number) => {
    try {
      const [rows, spByDay]: [
        { log_date: string; notes: DayNotes }[],
        Record<string, number>
      ] = await Promise.all([
        fetch(`/api/habits/logs?year=${y}&month=${m + 1}`).then(r => r.json()),
        fetch(`/api/habits/story-points?year=${y}&month=${m + 1}`).then(r => r.json()),
      ])

      if (!dirtyRef.current) {
        const map: MonthLogs = {}
        for (const row of rows) map[row.log_date] = row.notes
        setLogs(prev => ({ ...prev, ...map }))
        setMonthStoryPoints(spByDay ?? {})
      }
    } catch (e) {
      console.error('Failed to load habit logs:', e)
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
      const { points } = await fetch(`/api/habits/story-points?date=${today}`).then(r => r.json())
      setStoryPoints(points ?? 0)
    } catch (e) {
      console.error('Failed to load story points:', e)
    }
  }, [today])

  useEffect(() => { fetchStoryPoints() }, [fetchStoryPoints])

  // Re-fetch story points when a task is completed anywhere in the app
  useEffect(() => {
    const ch = new BroadcastChannel('pos-tasks')
    ch.onmessage = (e) => { if (e.data?.type === 'task_completed') fetchStoryPoints() }
    return () => ch.close()
  }, [fetchStoryPoints])

  // ── Log a habit ─────────────────────────────────────────────────────────────

  function logHabit(habitId: string, date: string, level: number) {
    dirtyRef.current = true

    // Optimistic update
    setLogs(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        habits: { ...(prev[date]?.habits ?? {}), [habitId]: level },
      },
    }))

    fetch('/api/habits/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, habitId, level }),
    }).catch(e => console.error('Failed to save habit log:', e))
  }

  // ── Sleep buttons ───────────────────────────────────────────────────────────

  async function handleSleep(event: 'bedtime' | 'waketime') {
    dirtyRef.current = true
    try {
      const res = await fetch('/api/habits/sleep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      }).then(r => r.json())

      // Refresh logs after sleep event
      dirtyRef.current = false
      await fetchLogs(year, month)
    } catch (e) {
      console.error('Failed to save sleep event:', e)
    }
  }

  // ── Add / delete habits ─────────────────────────────────────────────────────

  async function addHabit(name: string, levels: Level[]) {
    const next = [...habits, { id: uid(), name, levels }]
    setHabits(next)
    await fetch('/api/habits/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habits: next }),
    }).catch(e => console.error('Failed to save habit config:', e))
  }

  async function editHabit(id: string, name: string, levels: Level[]) {
    const next = habits.map(h => h.id === id ? { ...h, name, levels } : h)
    setHabits(next)
    await fetch('/api/habits/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habits: next }),
    }).catch(e => console.error('Failed to save habit edit:', e))
  }

  async function deleteHabit(id: string) {
    const next = habits.filter(h => h.id !== id)
    setHabits(next)
    await fetch('/api/habits/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habits: next }),
    }).catch(e => console.error('Failed to delete habit:', e))
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

  if (loading) {
    return (
      <CardShell>
        <div style={{ padding: '14px 16px', color: 'var(--ink-3)', fontSize: 11 }}>Loading…</div>
      </CardShell>
    )
  }

  return (
    <CardShell>
      {/* Card header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--ink-4)', textTransform: 'uppercase' }}>
          Habit Tracker
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Month color dot */}
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: monthColor, display: 'inline-block' }} />
          {/* View tabs */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--ink-1)', borderRadius: 6, padding: 3 }}>
            {(['today', 'month'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 10,
                color: view === v ? 'var(--ink-6)' : 'var(--ink-4)',
                background: view === v ? 'var(--ink-2)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'capitalize',
              }}>{v}</button>
            ))}
          </div>
          {/* Add habit button */}
          <button onClick={() => setShowAddModal(true)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5,
            background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
            color: 'var(--ink-4)', cursor: 'pointer',
          }} title="Add habit">
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 16px 14px', overflowY: 'auto' }}>
        {view === 'today'
          ? <TodayView
              habits={habits}
              allHabits={allHabits}
              todayLog={todayLog}
              sleepLog={sleepLog}
              storyPoints={storyPoints}
              today={today}
              monthColor={monthColor}
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
              monthColor={monthColor}
              onShift={shiftMonth}
              onLog={logHabit}
            />
        }
      </div>

      {showAddModal && (
        <HabitModal
          monthColor={monthColor}
          onSave={(name, levels) => { addHabit(name, levels); setShowAddModal(false) }}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingHabit && (
        <HabitModal
          monthColor={monthColor}
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
    <div style={{
      background: 'var(--glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {children}
    </div>
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
  monthColor,
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
  monthColor: string
  onLog: (id: string, date: string, level: number) => void
  onSleep: (event: 'bedtime' | 'waketime') => void
  onEdit: (habit: HabitDef) => void
  onDelete: (id: string) => void
}) {
  const [hoveredHabit, setHoveredHabit] = useState<string | null>(null)
  const dayScore = computeDayScore(allHabits, todayLog, sleepLog, storyPoints)

  if (habits.length === 0 && allHabits.length === 2) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <ScoreRing score={dayScore} monthColor={monthColor} />
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>No habits yet.</div>
      </div>
    )
  }

  const habitBtnBase: React.CSSProperties = {
    fontSize: 9, padding: '4px 8px', borderRadius: 5,
    border: '1px solid var(--glass-border)',
    cursor: 'pointer', letterSpacing: '0.03em', whiteSpace: 'nowrap',
  }

  return (
    <div>
      <ScoreRing score={dayScore} monthColor={monthColor} />
      {allHabits.map(habit => {
        // ── Sleep row ───────────────────────────────────────────────────────
        if (habit.id === SLEEP_ID) {
          const hasBedtime = !!sleepLog?.bedtime
          const hasWaketime = !!sleepLog?.waketime
          const hours = sleepLog?.hours
          const level = sleepHoursToLevel(hours ?? 0)
          const color = level > 0 ? getLevelColor(monthColor, level, SLEEP_LEVELS.length) : undefined
          const done = hasBedtime && hasWaketime

          return (
            <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ flex: 1, fontSize: 12, color: done ? color : 'var(--ink-5)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {done && <span style={{ fontSize: 10, color }}>✓</span>}
                Sleep
              </span>
              {hours !== undefined && hours > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px',
                  borderRadius: 4, background: color ? `${color}30` : 'var(--ink-1)',
                  color: color ?? 'var(--ink-4)', border: `1px solid ${color ? `${color}60` : 'var(--glass-border)'}`,
                }}>
                  {hours.toFixed(1)}h
                </span>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onSleep('waketime')} style={{
                  ...habitBtnBase,
                  background: hasWaketime ? `${monthColor}25` : 'var(--ink-1)',
                  color: hasWaketime ? monthColor : 'var(--ink-5)',
                  border: hasWaketime ? `1px solid ${monthColor}60` : '1px solid var(--glass-border)',
                  fontWeight: hasWaketime ? 600 : 400,
                }}>
                  ☀️ {hasWaketime ? formatTime(sleepLog!.waketime!) : 'Wake'}
                </button>
                <button onClick={() => onSleep('bedtime')} style={{
                  ...habitBtnBase,
                  background: hasBedtime ? `${monthColor}25` : 'var(--ink-1)',
                  color: hasBedtime ? monthColor : 'var(--ink-5)',
                  border: hasBedtime ? `1px solid ${monthColor}60` : '1px solid var(--glass-border)',
                  fontWeight: hasBedtime ? 600 : 400,
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
          const color = level > 0 ? getLevelColor(monthColor, level, STORY_LEVELS.length) : undefined
          const done = level > 0

          return (
            <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ flex: 1, fontSize: 12, color: done ? color : 'var(--ink-5)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {done && <span style={{ fontSize: 10 }}>✓</span>}
                Story Points
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {STORY_LEVELS.map((lv, i) => {
                  const lvl = i + 1
                  const bg = getLevelColor(monthColor, lvl, STORY_LEVELS.length)
                  const active = level === lvl
                  return (
                    <span key={lv.id} style={{
                      ...habitBtnBase,
                      display: 'inline-block',
                      background: active ? `${bg}` : 'var(--ink-1)',
                      color: active ? '#000' : 'var(--ink-4)',
                      border: active ? `1px solid ${monthColor}` : '1px solid var(--glass-border)',
                      fontWeight: active ? 600 : 400,
                      opacity: active ? 1 : 0.5,
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
        const activeColor = done ? getLevelColor(monthColor, currentLevel, habit.levels.length) : undefined

        return (
          <div
            key={habit.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--glass-border)' }}
            onMouseEnter={() => setHoveredHabit(habit.id)}
            onMouseLeave={() => setHoveredHabit(null)}
          >
            <span style={{ flex: 1, fontSize: 12, color: done ? activeColor : 'var(--ink-5)', display: 'flex', alignItems: 'center', gap: 5 }}>
              {done && <span style={{ fontSize: 10 }}>✓</span>}
              {habit.name}
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {habit.levels.map((lv, i) => {
                const lvl = i + 1
                const bg = getLevelColor(monthColor, lvl, habit.levels.length)
                const active = currentLevel === lvl
                return (
                  <button
                    key={lv.id}
                    onClick={() => onLog(habit.id, today, active ? 0 : lvl)}
                    style={{
                      ...habitBtnBase,
                      background: active ? bg : 'var(--ink-1)',
                      color: active ? '#000' : 'var(--ink-5)',
                      border: active ? `1px solid ${monthColor}` : '1px solid var(--glass-border)',
                      fontWeight: active ? 600 : 400,
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
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 4,
                  background: 'transparent', border: 'none',
                  color: 'var(--ink-3)', cursor: 'pointer', fontSize: 10,
                }}
                title="Edit habit"
              >
                ✎
              </button>
              <button
                onClick={() => onDelete(habit.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 4,
                  background: 'transparent', border: 'none',
                  color: 'var(--ink-3)', cursor: 'pointer',
                }}
                title="Delete habit"
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
  monthColor,
  onShift,
  onLog,
}: {
  allHabits: HabitDef[]
  logs: MonthLogs
  monthStoryPoints: Record<string, number>
  month: number
  year: number
  monthColor: string
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-6)' }}>{MONTH_NAMES[month]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-4)' }}>{year}</div>
        </div>
        <button onClick={() => onShift(1)} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: '4px 6px' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            {days.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--ink-3)', fontWeight: 400, borderBottom: '1px solid var(--glass-border)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>habit</th>
              {days.map(d => (
                <th key={d} style={{
                  paddingBottom: 4, paddingTop: 4, textAlign: 'center',
                  borderBottom: '1px solid var(--glass-border)',
                  color: d === todayDay ? monthColor : 'var(--ink-3)',
                  fontWeight: d === todayDay ? 700 : 400,
                  fontFamily: 'var(--font-mono)', fontSize: 8,
                }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allHabits.map(habit => {
              const isSpecial = habit.id === SLEEP_ID || habit.id === STORY_ID

              return (
                <tr key={habit.id}>
                  <td style={{ padding: '3px 6px', color: 'var(--ink-5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {habit.name}
                    {habit.id === STORY_ID && <span style={{ marginLeft: 4, fontSize: 8, opacity: 0.4 }}>🔒</span>}
                  </td>
                  {days.map(d => {
                    const level = getCellLevel(habit, d)
                    const bg = getLevelColor(monthColor, level, habit.levels.length)
                    return (
                      <td key={d} style={{ padding: '2px 1px' }}>
                        <button
                          onClick={() => handleCellClick(habit, d)}
                          style={{
                            display: 'block', width: '100%', aspectRatio: '1',
                            borderRadius: 3,
                            border: `1px solid ${bg ? 'transparent' : 'oklch(1 0 0 / 0.06)'}`,
                            background: bg || 'oklch(1 0 0 / 0.03)',
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
              <span style={{ width: 100, fontSize: 10, color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{habit.name}</span>
              <div style={{ flex: 1, height: 4, background: 'var(--ink-1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: monthColor, width: `${score * 10}%`, opacity: 0.6 + score * 0.04 }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', width: 28, textAlign: 'right' }}>{score.toFixed(1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Habit Modal (add + edit) ─────────────────────────────────────────────────

function HabitModal({
  monthColor,
  initial,
  onSave,
  onClose,
}: {
  monthColor: string
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
      position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
    }}>
      <div style={{
        background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius)', width: '100%', maxWidth: 360,
        backdropFilter: 'blur(20px)',
      }}>
        {/* Color strip */}
        <div style={{ height: 3, borderRadius: '12px 12px 0 0', background: monthColor }} />

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-4)', textTransform: 'uppercase' }}>{initial ? 'Edit Habit' : 'New Habit'}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSubmit && onSave(name.trim(), levels.map(l => ({ ...l, label: l.label.trim() })))}
              placeholder="e.g. Exercise, Reading, Water"
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                color: 'var(--ink-6)', fontSize: 12, outline: 'none',
              }}
            />
          </div>

          {/* Levels */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Levels ({levels.length}/5)
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {levels.map((lv, i) => (
                <div key={lv.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 3, flexShrink: 0,
                    background: getLevelColor(monthColor, i + 1, levels.length) || 'var(--ink-2)',
                    border: '1px solid var(--glass-border)',
                  }} />
                  <input
                    value={lv.label}
                    onChange={e => updateLevel(lv.id, e.target.value)}
                    placeholder={PLACEHOLDERS[i]}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 6,
                      border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                      color: 'var(--ink-6)', fontSize: 11, outline: 'none',
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
                marginTop: 6, fontSize: 10, color: monthColor,
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
              color: 'var(--ink-4)', fontSize: 12, cursor: 'pointer',
            }}>Cancel</button>
            <button
              onClick={() => canSubmit && onSave(name.trim(), levels.map(l => ({ ...l, label: l.label.trim() })))}
              disabled={!canSubmit}
              style={{
                flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
                border: 'none', background: canSubmit ? monthColor : 'var(--ink-2)',
                color: canSubmit ? '#fff' : 'var(--ink-3)', fontSize: 12,
                cursor: canSubmit ? 'pointer' : 'not-allowed', fontWeight: 500,
              }}
            >{initial ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
