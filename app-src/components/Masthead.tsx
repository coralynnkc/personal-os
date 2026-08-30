'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { USER_TZ } from '@/lib/dateKey'

/**
 * The same date on every screen, and nothing else. It is the page's date
 * heading in a journal sense — the thing you write at the top before you
 * write anything — so it lives above the router outlet rather than being
 * repeated by each route.
 *
 * The date is browser-local (USER_TZ), so it is filled in after mount: the
 * server has no business guessing which day the reader is on. The line holds
 * its height while empty so nothing below it jumps.
 */
export default function Masthead() {
  const path = usePathname()
  const [date, setDate] = useState<{ num: string; weekday: string; sub: string } | null>(null)

  useEffect(() => {
    const now = new Date()
    const part = (opts: Intl.DateTimeFormatOptions) =>
      now.toLocaleDateString('en-US', { timeZone: USER_TZ, ...opts })
    setDate({
      num: part({ day: 'numeric' }),
      weekday: part({ weekday: 'long' }).toLowerCase(),
      sub: `${part({ month: 'long' })} ${part({ year: 'numeric' })}`.toUpperCase(),
    })
  }, [])

  if (path === '/login') return null

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-end', gap: 'var(--s3)',
        minHeight: 44,
        margin: '0 var(--s5)',
        padding: 'var(--s5) 0 var(--s3)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 40, fontWeight: 300, lineHeight: 0.85,
          color: 'var(--champagne)', letterSpacing: '-0.04em',
        }}
      >
        {date?.num ?? ''}
      </span>
      <span style={{ paddingBottom: 1 }}>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>{date?.weekday ?? ''}</h1>
        <div
          className="mono"
          style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--slate)', marginTop: 'var(--s1)' }}
        >
          {date?.sub ?? ''}
        </div>
      </span>
    </div>
  )
}
