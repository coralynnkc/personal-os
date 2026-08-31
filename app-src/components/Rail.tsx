'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
      }).toUpperCase()
      setDisplay(`${time} · ${date}`)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [])

  return <span className="mono rail-clock" style={{ fontSize: 11, color: 'var(--slate)', letterSpacing: '0.04em' }}>{display}</span>
}

/**
 * The way out of a password-gated app.
 *
 * The cookie is 30 days and httpOnly, so nothing in the browser can drop it —
 * only the route can. `router.refresh()` after it, so the server components
 * re-run against a request that no longer carries the session and the proxy
 * sends the redirect.
 */
function Logout() {
  const router = useRouter()
  const path = usePathname()
  const [busy, setBusy] = useState(false)

  const logout = async () => {
    setBusy(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
    } catch {
      // Nothing to recover: the cookie is either gone or it isn't, and the
      // next guarded request will say which.
      setBusy(false)
    }
  }

  // The rail is in the root layout, so it draws over the login page too —
  // where an offer to sign out is an offer to do nothing.
  if (path === '/login') return null

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="quiet-link"
      title="Sign out"
      style={{
        background: 'transparent', border: 0, borderRadius: 0, padding: 0,
        cursor: busy ? 'default' : 'pointer', fontSize: 11,
        letterSpacing: '0.12em', color: 'var(--slate)',
      }}
    >
      {busy ? 'signing out…' : 'sign out'}
    </button>
  )
}

export default function Rail() {
  const path = usePathname()

  return (
    <nav className="rail" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--s4)',
      padding: '0 var(--s4)',
      height: 52,
      borderBottom: '1px solid var(--rule)',
      background: 'var(--ground)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Hard left, hard right — the rail is asymmetric, not a centred band. */}
      <span className="display rail-wordmark" style={{ fontSize: 32, color: 'var(--ivory)' }}>
        personal os
      </span>

      <div className="rail-nav" style={{ display: 'flex', gap: 'var(--s5)', marginLeft: 'auto' }}>
        {([['/', 'today'], ['/tasks', 'tasks'], ['/jobs', 'jobs'], ['/week', 'week']] as const).map(([href, label]) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="quiet-link"
              style={{
                fontSize: 13,
                letterSpacing: '0.12em',
                color: active ? 'var(--ivory)' : 'var(--slate)',
                textDecoration: 'none',
                paddingBottom: 'var(--s1)',
                borderBottom: `1px solid ${active ? 'var(--champagne)' : 'transparent'}`,
                transition: 'color 0.15s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s4)' }}>
        <PomodoroRail />
        <Clock />
        <Logout />
      </div>
    </nav>
  )
}
