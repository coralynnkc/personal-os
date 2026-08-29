'use client'

import { Play } from 'lucide-react'
import { usePomodoro } from './PomodoroProvider'

/**
 * The ▶ on a task row — starts a focus session bound to that task, which is
 * what turns the timer from a kitchen timer into a record of what the time
 * went into. Sessions land in `daily_logs.notes.pomodoros` with the taskId.
 */
export default function StartFocusButton({ taskId, taskTitle, size = 16 }: {
  taskId: string
  taskTitle: string
  size?: number
}) {
  const { startFocus, state, running } = usePomodoro()
  const active = state.taskId === taskId && state.phase !== 'idle'

  return (
    <button
      onClick={e => {
        e.stopPropagation()
        startFocus({ id: taskId, title: taskTitle })
      }}
      aria-label={`Start a focus session on ${taskTitle}`}
      title={active && running ? 'Focusing on this — click to restart' : 'Start a focus session'}
      style={{
        flexShrink: 0,
        width: size + 6, height: size + 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 5, cursor: 'pointer', padding: 0,
        background: active ? 'var(--accent-dim)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
        color: active ? 'var(--accent)' : 'var(--ink-3)',
        transition: 'color 0.12s, background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--accent)'
        e.currentTarget.style.background = 'var(--accent-dim)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = active ? 'var(--accent)' : 'var(--ink-3)'
        e.currentTarget.style.background = active ? 'var(--accent-dim)' : 'transparent'
      }}
    >
      <Play size={size - 6} fill="currentColor" />
    </button>
  )
}
