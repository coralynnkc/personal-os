'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { habitDateKey, USER_TZ } from '@/lib/dateKey'
import {
  DEFAULT_SETTINGS,
  IDLE_STATE,
  normalizeSettings,
  nextPhase,
  phaseDurationMs,
  remainingMs,
  type ActivePhase,
  type PomodoroSettings,
  type PomodoroState,
} from '@/lib/pomodoro'

const STORAGE_KEY = 'personal-os:pomodoro:v1'
const TICK_MS = 500

export type TaskRef = { id: string; title: string }

type Ctx = {
  state: PomodoroState
  settings: PomodoroSettings
  /** ms left on the current phase, recomputed every tick from `endsAt`. */
  remaining: number
  running: boolean
  /** false until localStorage has been read — the rail renders nothing until then. */
  hydrated: boolean
  todayFocusMs: number
  todayFocusSessions: number
  /** Begin a focus phase now, optionally bound to a task. */
  startFocus: (task?: TaskRef | null) => void
  /** Start an armed phase, resume a paused one, or fall back to a fresh focus. */
  play: () => void
  pause: () => void
  /** Re-arm the current phase at its full duration; the partial run is discarded. */
  reset: () => void
  /** Jump to the phase that would follow this one, without completing it. */
  skip: () => void
  /** Abandon the cycle and go back to idle. */
  stop: () => void
  saveSettings: (patch: Partial<PomodoroSettings>) => Promise<void>
}

const PomodoroContext = createContext<Ctx | null>(null)

export function usePomodoro(): Ctx {
  const ctx = useContext(PomodoroContext)
  if (!ctx) throw new Error('usePomodoro must be used inside <PomodoroProvider>')
  return ctx
}

type Persisted = { day: string; state: PomodoroState }

function readPersisted(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (!parsed?.state || typeof parsed.state.phase !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export default function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PomodoroState>(IDLE_STATE)
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS)
  const [hydrated, setHydrated] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [todayFocusMs, setTodayFocusMs] = useState(0)
  const [todayFocusSessions, setTodayFocusSessions] = useState(0)

  // Latest values for callbacks that must not be re-created on every tick.
  const stateRef = useRef(state)
  stateRef.current = state
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // The `endsAt` of the phase we have already finished, so a throttled
  // interval firing twice can't log the same session twice.
  const finishedRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  // ── Effects: audio, notifications, logging ────────────────────────────────

  const playChime = useCallback(() => {
    if (!settingsRef.current.chime) return
    try {
      const ctx = audioRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') void ctx.resume()
      const t0 = ctx.currentTime
      // Two short sine blips — pleasant, and no audio asset to ship.
      ;[880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const t = t0 + i * 0.18
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.5)
      })
    } catch {
      // Audio is a nicety; never let it break the timer.
    }
  }, [])

  const notify = useCallback((title: string, body: string) => {
    try {
      // Deliberately NOT alert() — a modal dialog blocks the whole tab.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      new Notification(title, { body, tag: 'personal-os-pomodoro', icon: '/icon.svg' })
    } catch {
      // Notifications are best-effort.
    }
  }, [])

  const logSession = useCallback(async (finished: PomodoroState, endedAtMs: number) => {
    if (finished.startedAt == null || finished.phase === 'idle') return
    try {
      const res = await fetch('/api/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: finished.taskId,
          taskTitle: finished.taskTitle,
          phase: finished.phase,
          startedAt: new Date(finished.startedAt).toISOString(),
          endedAt: new Date(endedAtMs).toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (typeof data.focusMs === 'number') setTodayFocusMs(data.focusMs)
      if (typeof data.focusSessions === 'number') setTodayFocusSessions(data.focusSessions)
    } catch (err) {
      console.error('Failed to log pomodoro session:', err)
    }
  }, [])

  /**
   * A phase reached its target timestamp. Log it, announce it, and *arm* the
   * next phase rather than auto-starting it — a break that starts counting
   * while you have walked away from the desk is a lie about your day.
   */
  const completePhase = useCallback((finished: PomodoroState, endedAtMs: number) => {
    if (finished.phase === 'idle') return
    const phase = finished.phase as ActivePhase
    const s = settingsRef.current

    void logSession(finished, endedAtMs)

    const completedFocusSessions = finished.completedFocusSessions + (phase === 'focus' ? 1 : 0)
    const upcoming = nextPhase(phase, completedFocusSessions, s)

    setState({
      phase: upcoming,
      endsAt: null,
      pausedRemainingMs: phaseDurationMs(upcoming, s),
      completedFocusSessions,
      // The task rides through the break so the next focus block resumes on it.
      taskId: finished.taskId,
      taskTitle: finished.taskTitle,
      startedAt: null,
    })

    playChime()
    notify(
      phase === 'focus' ? 'Focus session done' : 'Break over',
      phase === 'focus'
        ? `${upcoming === 'long_break' ? 'Long' : 'Short'} break is ready${finished.taskTitle ? ` — ${finished.taskTitle}` : ''}`
        : 'Focus session is ready',
    )
  }, [logSession, notify, playChime])

  // ── Hydrate from localStorage ─────────────────────────────────────────────

  useEffect(() => {
    const persisted = readPersisted()
    const today = habitDateKey(USER_TZ)

    if (persisted) {
      // The session count is a per-day figure; a stale day starts over.
      const restored: PomodoroState = persisted.day === today
        ? persisted.state
        : { ...persisted.state, completedFocusSessions: 0 }

      // The tab was closed (or asleep) through the end of a phase. The target
      // timestamp survived, so the session is still recoverable exactly.
      if (restored.endsAt != null && Date.now() >= restored.endsAt && finishedRef.current !== restored.endsAt) {
        finishedRef.current = restored.endsAt
        completePhase(restored, restored.endsAt)
      } else {
        setState(restored)
      }
    }
    setHydrated(true)
    // completePhase is stable; this must run once, on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist every change, so a refresh mid-session resumes where it left off.
  useEffect(() => {
    if (!hydrated) return
    try {
      const payload: Persisted = { day: habitDateKey(USER_TZ), state }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Private mode / quota — the timer still works in-memory.
    }
  }, [state, hydrated])

  // ── Settings ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/habits/config')
      .then(r => r.json())
      .then(data => setSettings(normalizeSettings(data?.pomodoro)))
      .catch(err => console.error('Pomodoro settings fetch error:', err))
  }, [])

  const saveSettings = useCallback(async (patch: Partial<PomodoroSettings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch })
    setSettings(next)
    try {
      const res = await fetch('/api/habits/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pomodoro: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.error('Failed to save pomodoro settings:', err)
    }
  }, [])

  // ── Today's totals ────────────────────────────────────────────────────────

  const refreshTotals = useCallback(() => {
    fetch('/api/pomodoro')
      .then(r => r.json())
      .then(data => {
        if (typeof data?.focusMs === 'number') setTodayFocusMs(data.focusMs)
        if (typeof data?.focusSessions === 'number') setTodayFocusSessions(data.focusSessions)
      })
      .catch(err => console.error('Pomodoro totals fetch error:', err))
  }, [])

  useEffect(() => { refreshTotals() }, [refreshTotals])

  // ── The tick ──────────────────────────────────────────────────────────────
  //
  // The interval exists only to trigger repaints; it never touches the clock
  // itself. Background tabs throttle it to once a minute or worse, which is
  // why completion is also checked on `visibilitychange` below.

  useEffect(() => {
    if (state.endsAt == null) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [state.endsAt])

  const checkCompletion = useCallback(() => {
    const s = stateRef.current
    if (s.endsAt == null) return
    const t = Date.now()
    if (t < s.endsAt) return
    if (finishedRef.current === s.endsAt) return
    finishedRef.current = s.endsAt
    // Ends at the *target* time, not the moment we noticed — a throttled tab
    // that notices four minutes late still logs a 25-minute session.
    completePhase(s, s.endsAt)
  }, [completePhase])

  useEffect(() => { checkCompletion() }, [now, state.endsAt, checkCompletion])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      checkCompletion()
      refreshTotals()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkCompletion, refreshTotals])

  // ── Actions ───────────────────────────────────────────────────────────────

  /**
   * Permission is requested on the first *start*, never on page load — an
   * unprompted permission dialog is the fastest way to get denied forever.
   */
  const primeOutputs = useCallback(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
    } catch {
      // Unsupported / insecure context.
    }
    try {
      // Created inside a click so autoplay policy lets it make sound later.
      if (!audioRef.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctor) audioRef.current = new Ctor()
      }
      if (audioRef.current?.state === 'suspended') void audioRef.current.resume()
    } catch {
      // No audio available.
    }
  }, [])

  const startFocus = useCallback((task?: TaskRef | null) => {
    primeOutputs()
    const s = settingsRef.current
    const t = Date.now()
    finishedRef.current = null
    setState(prev => ({
      phase: 'focus',
      endsAt: t + phaseDurationMs('focus', s),
      pausedRemainingMs: null,
      completedFocusSessions: prev.completedFocusSessions,
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
      startedAt: t,
    }))
    setNow(t)
  }, [primeOutputs])

  const play = useCallback(() => {
    const prev = stateRef.current
    if (prev.endsAt != null) return
    if (prev.phase === 'idle') { startFocus(null); return }

    primeOutputs()
    const t = Date.now()
    const left = prev.pausedRemainingMs ?? phaseDurationMs(prev.phase, settingsRef.current)
    finishedRef.current = null
    setState({
      ...prev,
      endsAt: t + left,
      pausedRemainingMs: null,
      // An armed phase has no start time yet; a resumed one keeps its original.
      startedAt: prev.startedAt ?? t,
    })
    setNow(t)
  }, [primeOutputs, startFocus])

  const pause = useCallback(() => {
    setState(prev => {
      if (prev.endsAt == null) return prev
      return { ...prev, pausedRemainingMs: Math.max(0, prev.endsAt - Date.now()), endsAt: null }
    })
  }, [])

  const reset = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'idle') return prev
      return {
        ...prev,
        endsAt: null,
        pausedRemainingMs: phaseDurationMs(prev.phase, settingsRef.current),
        startedAt: null,
      }
    })
    finishedRef.current = null
  }, [])

  const skip = useCallback(() => {
    setState(prev => {
      if (prev.phase === 'idle') return prev
      // A skipped focus block was not completed, so it does not count toward
      // the long-break cadence and is never logged.
      const upcoming = nextPhase(prev.phase as ActivePhase, prev.completedFocusSessions, settingsRef.current)
      return {
        ...prev,
        phase: upcoming,
        endsAt: null,
        pausedRemainingMs: phaseDurationMs(upcoming, settingsRef.current),
        startedAt: null,
      }
    })
    finishedRef.current = null
  }, [])

  const stop = useCallback(() => {
    setState(prev => ({ ...IDLE_STATE, completedFocusSessions: prev.completedFocusSessions }))
    finishedRef.current = null
  }, [])

  const value: Ctx = {
    state,
    settings,
    remaining: remainingMs(state, now, settings),
    running: state.endsAt != null,
    hydrated,
    todayFocusMs,
    todayFocusSessions,
    startFocus,
    play,
    pause,
    reset,
    skip,
    stop,
    saveSettings,
  }

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
}
