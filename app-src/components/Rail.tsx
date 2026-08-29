'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { USER_TZ } from '@/lib/dateKey'
import PomodoroRail from './pomodoro/PomodoroRail'

function Clock() {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    const tz = USER_TZ
    const tick = () => {
      const now = new Date()
      const time = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      })
      const date = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      })
      setDisplay(`${time} · ${date}`)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [])

  // Reserve the width before the first tick so the rail doesn't jump when the
  // clock arrives; `display` is empty until the effect runs on the client.
  // Hidden on narrow screens: the phone already shows a clock, and at 480px
  // it was pushing the wordmark onto a second line.
  return (
    <span
      className="meta hidden sm:inline"
      style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-4)', minWidth: 128, textAlign: 'right' }}
    >
      {display}
    </span>
  )
}

export default function Rail() {
  const path = usePathname()

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      gap: 12,
      height: 54,
      borderBottom: '1px solid var(--glass-border)',
      background: 'oklch(0.19 0.008 280 / 0.88)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Was `PERSONAL OS // v1.0` in accent-coloured uppercase mono — the
          loudest element on every screen, announcing a version number nobody
          needs. A wordmark is enough. */}
      <span style={{
        fontSize: 'var(--text-md)', fontWeight: 600, letterSpacing: '-0.01em',
        color: 'var(--ink-5)', whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Personal OS
      </span>

      <div style={{ display: 'flex', gap: 2, background: 'var(--ink-1)', borderRadius: 999, padding: 3 }}>
        {([['/', 'Home'], ['/tasks', 'Tasks'], ['/jobs', 'Jobs'], ['/week', 'Week']] as const).map(([href, label]) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="tap"
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '6px 18px',
                borderRadius: 999,
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: active ? 'var(--ink-6)' : 'var(--ink-4)',
                background: active ? 'var(--ink-2)' : 'transparent',
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PomodoroRail />
        <Clock />
      </div>
    </nav>
  )
}
