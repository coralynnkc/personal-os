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
      className="ghost-action"
      style={{
        flexShrink: 0,
        width: size + 4, height: size + 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 0, cursor: 'pointer', padding: 0,
        background: 'transparent', border: 0,
        color: active ? 'var(--champagne)' : 'var(--slate)',
        transition: 'color 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--ivory)' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? 'var(--champagne)' : 'var(--slate)' }}
    >
      <Play size={size - 6} fill="currentColor" />
    </button>
  )
}
