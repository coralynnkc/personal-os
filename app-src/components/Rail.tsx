'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { USER_TZ } from '@/lib/dateKey'

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

  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.05em' }}>{display}</span>
}

export default function Rail() {
  const path = usePathname()

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: 52,
      borderBottom: '1px solid var(--glass-border)',
      background: 'oklch(0.14 0.012 250 / 0.9)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 600 }}>
        PERSONAL OS // v1.0
      </span>

      <div style={{ display: 'flex', gap: 2, background: 'var(--ink-1)', borderRadius: 8, padding: 3 }}>
        {([['/', 'Home'], ['/tasks', 'Tasks']] as const).map(([href, label]) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: '5px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                color: active ? 'var(--ink-6)' : 'var(--ink-4)',
                background: active ? 'var(--ink-2)' : 'transparent',
                textDecoration: 'none',
                letterSpacing: '0.03em',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Clock />
      </div>
    </nav>
  )
}
