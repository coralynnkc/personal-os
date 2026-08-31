'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Trash2, Sun, Moon, Lock } from 'lucide-react'
import { habitDateKey, USER_TZ } from '@/lib/dateKey'
import {
  CADENCE_COLOR, MAX_EVERY_DAYS, MIN_EVERY_DAYS,
  byMostOverdue, cadenceState, normalizeEveryDays, type HabitKind,
} from '@/lib/cadence'
import { useDialog } from '@/lib/useDialog'
import { ErrorRow, useConfirm } from './jobs/ui'

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
// `kind` is absent on every habit configured before PLAN §2, and absent means
// daily — so nothing in habit_config has to be migrated to add cadence.
type HabitDef = { id: string; name: string; levels: Level[]; kind?: HabitKind; everyDays?: number }
type HabitDraft = { name: string; levels: Level[]; kind: HabitKind; everyDays: number }
/** habitId → the last day it was done, YYYY-MM-DD. */
type CadenceLog = Record<string, string>
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

// The month strip and the averages under it are the same list read twice, so
// they hang off one label column.
const LABEL_W = 92

// The edit/delete pair keeps its width even while it is invisible, so a row
// with no actions has to reserve the same gutter — otherwise its levels run
// to the edge and every user habit's stop short of it.
const ACTIONS_W = 46

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
  const [confirm, confirmDialog] = useConfirm()
  const [habits, setHabits] = useState<HabitDef[]>([])
  const [logs, setLogs] = useState<MonthLogs>({})
  const [cadence, setCadence] = useState<CadenceLog>({})
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

  // ── Fetch cadence events ────────────────────────────────────────────────────

  // Not part of fetchLogs: cadence rows are answered by the last event ever,
  // which is not bounded by the month the grid happens to be showing.
  const fetchCadence = useCallback(async () => {
    try {
      setCadence(await getJson('/api/habits/cadence'))
    } catch (e) {
      console.error('Failed to load cadence events:', e)
      setError("Couldn't load your cadence habits.")
    }
  }, [])

  useEffect(() => { fetchCadence() }, [fetchCadence])

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
    fetchCadence()
  }, [fetchConfig, fetchLogs, fetchStoryPoints, fetchCadence, year, month])

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

  // ── Log a cadence event ─────────────────────────────────────────────────────

  async function logCadence(habitId: string, undo: boolean) {
    const previous = cadence[habitId]

    setCadence(prev => {
      const next = { ...prev }
      // An undo only knows how to remove *today*; what was underneath it was a
      // date we no longer hold, so refetch rather than guess at it.
      if (undo) delete next[habitId]
      else next[habitId] = today
      return next
    })

    try {
      await post('/api/habits/cadence', { habitId, date: today, undo })
      setError(null)
      if (undo) fetchCadence()
    } catch (e) {
      console.error('Failed to save cadence event:', e)
      setCadence(prev => {
        const next = { ...prev }
        if (previous === undefined) delete next[habitId]
        else next[habitId] = previous
        return next
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

  /** One shape for both kinds: a cadence habit has a rhythm and no levels. */
  function fromDraft(d: HabitDraft): Omit<HabitDef, 'id'> {
    return d.kind === 'cadence'
      ? { name: d.name, kind: 'cadence', everyDays: normalizeEveryDays(d.everyDays), levels: [] }
      : { name: d.name, kind: 'daily', levels: d.levels }
  }

  async function addHabit(draft: HabitDraft) {
    await saveHabits([...habits, { id: uid(), ...fromDraft(draft) }], 'add')
  }

  async function editHabit(id: string, draft: HabitDraft) {
    // Spread the new definition over the old one rather than merging into it,
    // so switching a habit to cadence drops the levels it no longer has.
    await saveHabits(habits.map(h => h.id === id ? { id: h.id, ...fromDraft(draft) } : h), 'save')
  }

  async function deleteHabit(id: string) {
    const habit = habits.find(h => h.id === id)
    if (!(await confirm(`Delete habit "${habit?.name ?? id}"?`))) return
    await saveHabits(habits.filter(h => h.id !== id), 'delete')
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    setMonth(d.getMonth())
    setYear(d.getFullYear())
  }

  const todayLog = logs[today]
  const sleepLog = todayLog?.sleep

  // Cadence habits are not daily obligations, so they stay out of the day
  // score, the month grid and its averages — an empty cell under "laundry" on
  // a Tuesday would be exactly the false negative PLAN §2 exists to remove.
  const dailyHabits = habits.filter(h => h.kind !== 'cadence')
  const cadenceHabits = habits.filter(h => h.kind === 'cadence')

  // All habits for display (specials first, user habits alphabetized)
  const allHabits = [
    { id: SLEEP_ID, name: 'Sleep', levels: SLEEP_LEVELS },
    { id: STORY_ID, name: 'Story Points', levels: STORY_LEVELS },
    ...[...dailyHabits].sort((a, b) => a.name.localeCompare(b.name)),
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

      {/* No panel: habits are rows on the page ground, like the log beside
          them. The only chrome is the hairline under each row. */}
      <div style={{ overflowY: 'auto', minWidth: 0 }}>
        {view === 'today'
          ? <>
            <TodayView
              habits={dailyHabits}
              hasCadence={cadenceHabits.length > 0}
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
            <CadenceSection
              habits={cadenceHabits}
              lastDone={cadence}
              today={today}
              onLog={logCadence}
              onEdit={setEditingHabit}
              onDelete={deleteHabit}
            />
          </>
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
          onSave={draft => { addHabit(draft); setShowAddModal(false) }}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingHabit && (
        <HabitModal
          initial={editingHabit}
          onSave={draft => { editHabit(editingHabit.id, draft); setEditingHabit(null) }}
          onClose={() => setEditingHabit(null)}
        />
      )}
      {confirmDialog}
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
  hasCadence,
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
  hasCadence: boolean
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
  // Nothing daily configured — but the cadence section below may still have
  // rows, and "No habits yet" over a list of them would be a lie.
  if (habits.length === 0 && allHabits.length === 2 && !hasCadence) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', marginBottom: 12 }}>No habits yet.</div>
      </div>
    )
  }

  // A level is a word in a box the width of the word — an empty box until it
  // is the one chosen, and then it fills with the same lavender the grid
  // does. These are words, so they stay in Jost rather than the number face.
  const habitBtnBase: React.CSSProperties = {
    fontSize: 'var(--text-sm)', padding: '3px var(--s2)', borderRadius: 0,
    border: '1px solid var(--rule)', background: 'transparent',
    color: 'var(--slate)', cursor: 'pointer', whiteSpace: 'nowrap',
    lineHeight: 1.3,
  }

  const levelStyle = (active: boolean): React.CSSProperties => ({
    ...habitBtnBase,
    background: active ? 'var(--lavender)' : 'transparent',
    color: active ? 'var(--ground)' : 'var(--slate)',
    borderColor: active ? 'var(--lavender)' : 'var(--rule)',
  })

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
              <div style={{ display: 'flex', gap: 5 }}>
                <button
                  onClick={() => onSleep('waketime')}
                  className="tap"
                  style={{ ...levelStyle(hasWaketime), display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Sun size={10} strokeWidth={1.5} />
                  {hasWaketime ? formatTime(sleepLog!.waketime!) : 'wake'}
                </button>
                <button
                  onClick={() => onSleep('bedtime')}
                  className="tap"
                  style={{ ...levelStyle(hasBedtime), display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Moon size={10} strokeWidth={1.5} />
                  {hasBedtime ? formatTime(sleepLog!.bedtime!) : 'bed'}
                </button>
              </div>
              <span aria-hidden style={{ width: ACTIONS_W, flexShrink: 0 }} />
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
              <div style={{ display: 'flex', gap: 5 }}>
                {STORY_LEVELS.map((lv, i) => {
                  const active = level === i + 1
                  return (
                    <span key={lv.id} style={{
                      ...levelStyle(active),
                      display: 'inline-block',
                      cursor: 'default',
                      opacity: active ? 1 : 0.55,
                    }}>
                      {lv.label}
                    </span>
                  )
                })}
              </div>
              <span aria-hidden style={{ width: ACTIONS_W, flexShrink: 0 }} />
            </div>
          )
        }

        // ── User-defined habit row ──────────────────────────────────────────
        const currentLevel = todayLog?.habits?.[habit.id] ?? 0
        const done = currentLevel > 0

        return (
          <div key={habit.id} className="hrow row-hover">
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: done ? 'var(--ivory)' : 'var(--ash)', display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
              {done && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--lavender)' }}>✓</span>}
              {habit.name}
            </span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {habit.levels.map((lv, i) => {
                const lvl = i + 1
                const active = currentLevel === lvl
                return (
                  <button
                    key={lv.id}
                    onClick={() => onLog(habit.id, today, active ? 0 : lvl)}
                    className="tap"
                    style={levelStyle(active)}
                  >
                    {lv.label}
                  </button>
                )
              })}
            </div>
            {/* `.ghost-action` over hand-rolled hover state: the JS version
                never fired on touch, where these were permanently invisible. */}
            <div className="ghost-action" style={{ display: 'flex', gap: 2, width: ACTIONS_W, justifyContent: 'flex-end', flexShrink: 0 }}>
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

// ─── Cadence section ──────────────────────────────────────────────────────────

/**
 * The rows under the daily grid: name, how long it has been, a bar that decays
 * toward the rhythm, and one tap that resets it. No streak — a streak counts
 * consecutive days, and the whole point of these is that most days are
 * correctly empty.
 */
function CadenceSection({
  habits,
  lastDone,
  today,
  onLog,
  onEdit,
  onDelete,
}: {
  habits: HabitDef[]
  lastDone: CadenceLog
  today: string
  onLog: (id: string, undo: boolean) => void
  onEdit: (habit: HabitDef) => void
  onDelete: (id: string) => void
}) {
  if (habits.length === 0) return null

  const rows = habits
    .map(h => ({
      habit: h,
      name: h.name,
      every: normalizeEveryDays(h.everyDays),
      state: cadenceState(normalizeEveryDays(h.everyDays), lastDone[h.id] ?? null, today),
    }))
    .sort(byMostOverdue)

  // The divider carries the one thing worth reading without reading the list.
  const worst = rows[0]
  const summary = worst.state.tone === 'fresh'
    ? 'all fresh'
    : `${worst.name.toLowerCase()}, ${worst.state.status}`

  return (
    <div style={{ marginTop: 'var(--s5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s1)' }}>
        <span className="eyebrow">Cadence</span>
        <span style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        <span className="mono" style={{
          fontSize: 'var(--text-xs)',
          color: CADENCE_COLOR[worst.state.tone],
        }}>
          {summary}
        </span>
      </div>

      {rows.map(({ habit, every, state }) => {
        const doneToday = lastDone[habit.id] === today
        const color = CADENCE_COLOR[state.tone]

        return (
          <div
            key={habit.id}
            className="row-hover"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(56px, 1fr) auto minmax(28px, 72px) auto auto',
              alignItems: 'center', gap: 'var(--s2)',
              padding: 'var(--s2) 0', borderBottom: '1px solid var(--rule-2)',
            }}
          >
            <span
              title={`${habit.name} — every ${every} day${every === 1 ? '' : 's'}`}
              style={{
                minWidth: 0, fontSize: 'var(--text-base)',
                color: doneToday ? 'var(--ivory)' : 'var(--ash)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {habit.name}
            </span>

            <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--slate)' }}>
              {state.elapsed}
            </span>

            {/* Elapsed time as decay. The bar is the only thing on the row that
                reads at a glance, so it carries the colour. */}
            <span style={{ height: 2, background: 'var(--tint-2)' }}>
              <span style={{ display: 'block', height: '100%', width: `${state.ratio * 100}%`, background: color }} />
            </span>

            <span className="mono" style={{ fontSize: 'var(--text-xs)', color, textAlign: 'right', whiteSpace: 'nowrap' }}>
              {state.status}
            </span>

            {/* Persistent, not a ghost action: one tap is the entire interface
                of a cadence habit, and a hover-only target does not exist on a
                phone. Edit and delete stay in the margin. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
              <button
                onClick={() => onLog(habit.id, doneToday)}
                className="tap mono"
                aria-label={doneToday ? `Undo ${habit.name} for today` : `Mark ${habit.name} done today`}
                style={{
                  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  background: 'none', border: 0, borderRadius: 0, padding: '2px 0 2px var(--s1)',
                  color: doneToday ? 'var(--champagne)' : 'var(--slate)', cursor: 'pointer',
                }}
              >
                {doneToday ? 'undo' : 'done'}
              </button>
              <span className="ghost-action" style={{ display: 'flex', gap: 2 }}>
                <button
                  onClick={() => onEdit(habit)}
                  className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: 0,
                    background: 'transparent', border: 'none',
                    color: 'var(--ink-3)', cursor: 'pointer', fontSize: 'var(--text-sm)',
                  }}
                  title="Edit habit" aria-label={`Edit ${habit.name}`}
                >
                  ✎
                </button>
                <button
                  onClick={() => onDelete(habit.id)}
                  className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: 0,
                    background: 'transparent', border: 'none',
                    color: 'var(--ink-3)', cursor: 'pointer',
                  }}
                  title="Delete habit" aria-label={`Delete ${habit.name}`}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            </span>
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
  const todayDay =
    new Date().getFullYear() === year && new Date().getMonth() === month
      ? new Date().getDate()
      : null

  // Every fifth day carries a number, and today always does — with any
  // neighbour of today's dropped so two labels never collide.
  const labelDays = new Set<number>()
  for (let d = 1; d <= daysInMonth; d += 5) labelDays.add(d)
  if (todayDay) {
    for (const d of [...labelDays]) if (Math.abs(d - todayDay) <= 1) labelDays.delete(d)
    labelDays.add(todayDay)
  }

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
      {/* Month nav — one line, the way a journal writes a date. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s2)', marginBottom: 'var(--s3)' }}>
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--ivory)' }}>{MONTH_NAMES[month]}</span>
        <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--slate)' }}>{year}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--s1)' }}>
          <button onClick={() => onShift(-1)} className="tap" aria-label="Previous month"
            style={{ background: 'none', border: 0, color: 'var(--slate)', cursor: 'pointer', padding: '2px 4px', lineHeight: 0 }}>
            <ChevronLeft size={13} />
          </button>
          <button onClick={() => onShift(1)} className="tap" aria-label="Next month"
            style={{ background: 'none', border: 0, color: 'var(--slate)', cursor: 'pointer', padding: '2px 4px', lineHeight: 0 }}>
            <ChevronRight size={13} />
          </button>
        </span>
      </div>

      {/* A grid of cells, one per day. What was wrong with it was never the
          boxes — it was thirty-one two-digit numbers fighting over a 330px
          column, which shrank the cells to nothing to make room. The ruler is
          marked every fifth day now, so the cells get the width back. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 240, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: LABEL_W }} />
            {days.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ padding: '0 var(--s2) 5px 0', borderBottom: '1px solid var(--rule)' }} />
              {days.map(d => (
                // The champagne number is the whole of today's marker —
                // a column of outlined cells under it only added boxes.
                <th key={d} className="mono" style={{
                  padding: '0 0 5px', textAlign: 'center', fontWeight: 400,
                  fontSize: 9.5, letterSpacing: 0,
                  borderBottom: '1px solid var(--rule)',
                  color: d === todayDay ? 'var(--champagne)' : 'var(--slate)',
                }}>
                  <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                    {labelDays.has(d) ? d : '\u00A0'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allHabits.map(habit => {
              const isSpecial = habit.id === SLEEP_ID || habit.id === STORY_ID

              return (
                <tr key={habit.id}>
                  <td title={habit.name} style={{ padding: '0 var(--s2) 0 0' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 'var(--text-sm)', lineHeight: 1.1, color: 'var(--ash)',
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {habit.name}
                      </span>
                      {habit.id === STORY_ID && (
                        <Lock size={8} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--slate)' }} />
                      )}
                    </span>
                  </td>
                  {days.map(d => {
                    const level = getCellLevel(habit, d)
                    const bg = levelFill(level, habit.levels.length)
                    return (
                      <td key={d} style={{ padding: '2px 1px' }}>
                        <button
                          onClick={() => handleCellClick(habit, d)}
                          title={`${habit.name} — ${MONTH_NAMES[month]} ${d}`}
                          aria-label={`${habit.name}, ${MONTH_NAMES[month]} ${d}`}
                          style={{
                            // Height rather than aspect-ratio: a square would
                            // be as small as the narrowest column allows, and
                            // an empty row of them is the thing that looked
                            // squished. This keeps a legible cell either way.
                            display: 'block', width: '100%', height: 12, padding: 0,
                            borderRadius: 0, border: 0,
                            background: bg || 'var(--tint-2)',
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
      <div style={{ marginTop: 'var(--s5)', borderTop: '1px solid var(--rule)', paddingTop: 'var(--s3)' }}>
        {allHabits.map(habit => {
          const score = habitMonthScore(logs, habit.id, habit.levels, year, month, monthStoryPoints)
          return (
            <div key={habit.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: '3px 0' }}>
              <span title={habit.name} style={{ width: LABEL_W, fontSize: 'var(--text-sm)', color: 'var(--ash)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{habit.name}</span>
              <div style={{ flex: 1, height: 2, background: 'var(--tint-2)' }}>
                <div style={{ height: '100%', background: 'var(--lavender)', width: `${score * 10}%`, opacity: 0.45 + score * 0.055 }} />
              </div>
              <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--slate)', width: 26, textAlign: 'right' }}>{score.toFixed(1)}</span>
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
  onSave: (draft: HabitDraft) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [levels, setLevels] = useState<Level[]>(
    initial?.levels?.length ? initial.levels : [{ id: uid(), label: '' }]
  )
  const [kind, setKind] = useState<HabitKind>(initial?.kind === 'cadence' ? 'cadence' : 'daily')
  // Held as a string so the field can be empty mid-edit rather than snapping
  // back to a number the moment you clear it.
  const [everyDays, setEveryDays] = useState(String(initial?.everyDays ?? 7))
  // The name field carries autoFocus, so the hook leaves focus where it is.
  const dialogRef = useDialog<HTMLDivElement>(onClose)

  const every = Number(everyDays)
  const everyValid = Number.isInteger(every) && every >= MIN_EVERY_DAYS && every <= MAX_EVERY_DAYS

  const canSubmit = name.trim().length > 0 && (
    kind === 'cadence' ? everyValid : levels.every(l => l.label.trim().length > 0)
  )

  function submit() {
    if (!canSubmit) return
    onSave({
      name: name.trim(),
      kind,
      everyDays: every,
      levels: levels.map(l => ({ ...l, label: l.label.trim() })),
    })
  }

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
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'var(--scrim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="habit-modal-title"
        tabIndex={-1}
        style={{
          background: 'var(--tint)', border: '1px solid var(--rule)',
          borderRadius: 0, width: '100%', maxWidth: 360,
        }}
      >
        {/* Color strip */}
        <div style={{ height: 1, background: 'var(--lavender)' }} />

        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="panel-title" id="habit-modal-title">{initial ? 'Edit habit' : 'New habit'}</span>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          {/* Which question the habit answers. A daily habit asks "did you,
              today?"; a cadence habit asks "how long has it been?" — rhythm,
              not deadline (PLAN §2). */}
          <div style={{ display: 'flex', gap: 'var(--s3)', marginBottom: 14 }}>
            {(['daily', 'cadence'] as const).map(k => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className="mono"
                style={{
                  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  background: 'none', padding: '0 0 2px', borderRadius: 0, border: 0,
                  borderBottom: `1px solid ${kind === k ? 'var(--champagne)' : 'transparent'}`,
                  color: kind === k ? 'var(--ivory)' : 'var(--slate)', cursor: 'pointer',
                }}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Name */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="habit-name" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-4)', marginBottom: 6 }}>Name</label>
            <input
              id="habit-name"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder={kind === 'cadence' ? 'e.g. Laundry, Sheets, Vacuum' : 'e.g. Exercise, Reading, Water'}
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                color: 'var(--ink-6)', fontSize: 'var(--text-base)', outline: 'none',
              }}
            />
          </div>

          {/* Rhythm — the whole configuration of a cadence habit. */}
          {kind === 'cadence' ? (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="habit-every" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-4)', marginBottom: 6 }}>
                Every how many days?
              </label>
              <input
                id="habit-every"
                type="number"
                min={MIN_EVERY_DAYS}
                max={MAX_EVERY_DAYS}
                value={everyDays}
                onChange={e => setEveryDays(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                className="mono"
                style={{
                  width: 88, padding: '9px 11px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--glass-border)', background: 'var(--ink-0)',
                  color: 'var(--ink-6)', fontSize: 'var(--text-base)', outline: 'none',
                }}
              />
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--slate)', marginTop: 6 }}>
                No levels and no streak — the row shows how long it has been, and
                one tap resets it.
              </p>
            </div>
          ) : (
          /* Levels */
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
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)', background: 'transparent',
              color: 'var(--ink-4)', fontSize: 'var(--text-base)', cursor: 'pointer',
            }}>Cancel</button>
            <button
              onClick={submit}
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
