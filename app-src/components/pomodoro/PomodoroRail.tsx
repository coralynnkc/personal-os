'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react'
import { usePomodoro } from './PomodoroProvider'
import {
  formatClock,
  formatDuration,
  PHASE_COLOR,
  PHASE_LABEL,
  type PomodoroSettings,
} from '@/lib/pomodoro'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function iconButton(active = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
    background: active ? 'var(--accent-dim)' : 'var(--ink-1)',
    border: `1px solid ${active ? 'var(--accent-border)' : 'var(--glass-border)'}`,
    color: active ? 'var(--accent)' : 'var(--ink-5)',
    fontSize: 10, ...MONO,
    transition: 'border-color 0.15s, color 0.15s',
  }
}

function DurationField({ label, value, min, max, onCommit }: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])

  const commit = () => {
    const n = Number(draft)
    if (!Number.isFinite(n)) { setDraft(String(value)); return }
    onCommit(Math.min(max, Math.max(min, Math.round(n))))
  }

  const id = `pomodoro-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--ink-4)' }}>
      {label}
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        style={{
          width: 52, padding: '3px 6px', borderRadius: 5, fontSize: 11, ...MONO,
          background: 'var(--ink-0)', color: 'var(--ink-6)',
          border: '1px solid var(--glass-border)',
        }}
      />
    </label>
  )
}

function Popover() {
  const {
    state, settings, remaining, running,
    todayFocusMs, todayFocusSessions,
    play, pause, reset, skip, stop, saveSettings,
  } = usePomodoro()
  const [showSettings, setShowSettings] = useState(false)

  const idle = state.phase === 'idle'
  const cycleDone = state.completedFocusSessions % settings.longBreakEvery

  const set = (patch: Partial<PomodoroSettings>) => { void saveSettings(patch) }

  return (
    <div
      role="dialog"
      aria-label="Pomodoro timer"
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 250, zIndex: 200,
        background: 'var(--glass)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)', borderRadius: 'var(--radius)',
        boxShadow: '0 10px 30px oklch(0 0 0 / 0.45)',
        padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      {/* Phase + clock */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: PHASE_COLOR[state.phase], ...MONO }}>
          {PHASE_LABEL[state.phase]}
        </span>
        <span style={{ fontSize: 26, color: 'var(--ink-6)', letterSpacing: '0.02em', ...MONO }}>
          {formatClock(remaining)}
        </span>
      </div>

      {state.taskTitle && (
        <div style={{ fontSize: 11, color: 'var(--ink-5)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          <span style={{ color: 'var(--accent)', marginRight: 4 }}>▶</span>{state.taskTitle}
        </div>
      )}

      {/* Cycle dots — progress toward the next long break */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {Array.from({ length: settings.longBreakEvery }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i < cycleDone ? 'var(--accent)' : 'var(--ink-2)',
              border: `1px solid ${i < cycleDone ? 'var(--accent-border)' : 'var(--glass-border)'}`,
            }}
          />
        ))}
        <span style={{ fontSize: 10, color: 'var(--ink-4)', marginLeft: 2, ...MONO }}>
          {cycleDone}/{settings.longBreakEvery} to long break
        </span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={running ? pause : play}
          style={{ ...iconButton(true), flex: 1 }}
          aria-label={running ? 'Pause timer' : idle ? 'Start focus session' : 'Start timer'}
        >
          {running ? <Pause size={11} /> : <Play size={11} />}
          {running ? 'Pause' : idle ? 'Start' : 'Resume'}
        </button>
        <button onClick={reset} disabled={idle} style={{ ...iconButton(), opacity: idle ? 0.4 : 1 }} aria-label="Reset current phase" title="Reset current phase">
          <RotateCcw size={11} />
        </button>
        <button onClick={skip} disabled={idle} style={{ ...iconButton(), opacity: idle ? 0.4 : 1 }} aria-label="Skip to next phase" title="Skip to next phase">
          <SkipForward size={11} />
        </button>
        <button onClick={stop} disabled={idle} style={{ ...iconButton(), opacity: idle ? 0.4 : 1 }} aria-label="Stop and clear" title="Stop and clear">
          <X size={11} />
        </button>
      </div>

      {/* Today */}
      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 10, fontSize: 11, color: 'var(--ink-4)' }}>
        <span style={{ color: 'var(--ink-5)' }}>{formatDuration(todayFocusMs)}</span> focused today
        {todayFocusSessions > 0 && `, ${todayFocusSessions} session${todayFocusSessions === 1 ? '' : 's'}`}
      </div>

      {/* Settings */}
      <button
        onClick={() => setShowSettings(v => !v)}
        aria-expanded={showSettings}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', ...MONO,
        }}
      >
        {showSettings ? '− Settings' : '+ Settings'}
      </button>

      {showSettings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <DurationField label="Focus min" value={settings.focusMin} min={1} max={180} onCommit={n => set({ focusMin: n })} />
          <DurationField label="Short break" value={settings.shortBreakMin} min={1} max={180} onCommit={n => set({ shortBreakMin: n })} />
          <DurationField label="Long break" value={settings.longBreakMin} min={1} max={180} onCommit={n => set({ longBreakMin: n })} />
          <DurationField label="Long break every" value={settings.longBreakEvery} min={1} max={12} onCommit={n => set({ longBreakEvery: n })} />
          <label htmlFor="pomodoro-chime" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-4)' }}>
            Chime
            <input
              id="pomodoro-chime"
              type="checkbox"
              checked={settings.chime}
              onChange={e => set({ chime: e.target.checked })}
              style={{ accentColor: 'var(--accent)' }}
            />
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * Lives in the Rail, not on a page, so a session survives navigating between
 * `/`, `/tasks` and `/jobs` — a widget mounted on one route would reset the
 * timer on every nav.
 */
export default function PomodoroRail() {
  const { state, remaining, running, hydrated } = usePomodoro()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Nothing until localStorage has been read — rendering 25:00 first and then
  // snapping to a running clock is a worse flash than a beat of nothing.
  if (!hydrated) return <span style={{ width: 64 }} />

  const idle = state.phase === 'idle'
  const color = PHASE_COLOR[state.phase]

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`Pomodoro — ${PHASE_LABEL[state.phase]}, ${formatClock(remaining)} remaining`}
        title={state.taskTitle ?? PHASE_LABEL[state.phase]}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
          background: idle ? 'transparent' : 'var(--ink-1)',
          border: `1px solid ${idle ? 'transparent' : 'var(--glass-border)'}`,
          color: idle ? 'var(--ink-4)' : 'var(--ink-6)',
          fontSize: 11, letterSpacing: '0.05em', ...MONO,
          transition: 'border-color 0.15s, color 0.15s',
        }}
      >
        {!idle && (
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
              // A steady dot means paused; only a running clock pulses.
              animation: running ? 'pomodoro-pulse 2s ease-in-out infinite' : undefined,
            }}
          />
        )}
        <span>{formatClock(remaining)}</span>
        {!running && <Play size={10} style={{ color: idle ? 'var(--ink-3)' : color }} />}
      </button>

      {open && <Popover />}
    </div>
  )
}
