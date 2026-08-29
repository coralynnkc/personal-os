'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { USER_TZ } from '@/lib/dateKey'
import { ErrorRow } from './jobs/ui'

type CalEvent = {
  id: string
  title: string
  start: string   // ISO timestamp, or YYYY-MM-DD when allDay
  end: string     // ISO timestamp, or YYYY-MM-DD when allDay
  location?: string
  allDay: boolean
}

const TZ = USER_TZ

function localDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TZ })
}

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return 'All day'
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function getDayStrip(): { key: string; dayName: string; dayNum: number }[] {
  const days = []
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const key = localDateKey(d)
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
    const dayNum = parseInt(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: TZ }))
    days.push({ key, dayName, dayNum })
  }
  return days
}

export default function Calendar() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string>(() => localDateKey(new Date()))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/calendar')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setEvents(data ?? []); setLoading(false) })
      .catch(err => {
        console.error('Calendar fetch error:', err)
        setError("Couldn't load the calendar.")
        setLoading(false)
      })
  }, [])

  useEffect(() => { load() }, [load])

  const days = getDayStrip()
  const todayKey = localDateKey(new Date())

  // Group events by local date key
  const byDay: Record<string, CalEvent[]> = {}
  for (const ev of events) {
    const key = ev.allDay ? ev.start.slice(0, 10) : localDateKey(new Date(ev.start))
    byDay[key] = [...(byDay[key] ?? []), ev]
  }

  const selectedEvents = byDay[selectedDay] ?? []
  const now = new Date()

  return (
    <div className="card" style={{ minHeight: 280, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 10px',
      }}>
        <span className="panel-title">Calendar</span>
        {loading && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>Loading…</span>
        )}
      </div>

      {/* 7-day strip. The grid used to be ruled on every column and underlined
          as a whole — seven vertical hairlines for seven buttons. Selection
          alone carries it now. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2, padding: '0 10px 10px',
      }}>
        {days.map(({ key, dayName, dayNum }) => {
          const isToday = key === todayKey
          const isSelected = key === selectedDay
          const hasEvents = (byDay[key] ?? []).length > 0
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              className={isSelected ? undefined : 'tap'}
              aria-pressed={isSelected}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '7px 2px 6px',
                background: isSelected ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                gap: 2,
              }}
            >
              <span style={{
                fontSize: 'var(--text-xs)', fontWeight: 500,
                color: isToday ? 'var(--accent)' : 'var(--ink-3)',
              }}>
                {dayName}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 500,
                color: isSelected ? 'var(--accent)' : isToday ? 'var(--ink-6)' : 'var(--ink-5)',
              }}>
                {dayNum}
              </span>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: hasEvents ? (isSelected ? 'var(--accent)' : 'var(--ink-3)') : 'transparent',
              }} />
            </button>
          )
        })}
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {error && <ErrorRow message={error} onRetry={load} />}

        {!loading && !error && selectedEvents.length === 0 && (
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', padding: '8px 6px' }}>
            Nothing on the calendar.
          </div>
        )}

        {selectedEvents.map(ev => {
          const isPast = !ev.allDay && new Date(ev.end) < now
          return (
            <div
              key={ev.id}
              className="tile"
              style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '9px 12px',
                opacity: isPast ? 0.45 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span className="meta" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                  {formatTime(ev.start, ev.allDay)}
                </span>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--ink-6)', lineHeight: 1.4, fontWeight: 500 }}>
                  {ev.title}
                </span>
              </div>
              {ev.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 1 }}>
                  <MapPin size={11} color="var(--ink-3)" />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-3)' }}>{ev.location}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
