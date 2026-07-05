'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { USER_TZ } from '@/lib/dateKey'

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

  useEffect(() => {
    fetch('/api/calendar')
      .then(r => r.json())
      .then(data => { setEvents(data ?? []); setLoading(false) })
      .catch(err => { console.error('Calendar fetch error:', err); setLoading(false) })
  }, [])

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
    <div style={{
      background: 'var(--glass)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius)',
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
      minHeight: 280,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.14em', color: 'var(--ink-4)', textTransform: 'uppercase',
        }}>
          Calendar
        </span>
        {loading && (
          <span style={{ fontSize: 10, color: 'var(--ink-3)', fontStyle: 'italic' }}>Loading…</span>
        )}
      </div>

      {/* 7-day strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        {days.map(({ key, dayName, dayNum }) => {
          const isToday = key === todayKey
          const isSelected = key === selectedDay
          const hasEvents = (byDay[key] ?? []).length > 0
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 4px 7px',
                background: isSelected ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderRight: '1px solid var(--glass-border)',
                borderBottom: isSelected ? `2px solid var(--accent)` : '2px solid transparent',
                cursor: 'pointer',
                gap: 3,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: isToday ? 'var(--accent)' : 'var(--ink-3)',
              }}>
                {dayName}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!loading && selectedEvents.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic', padding: '8px 4px' }}>
            No events.
          </div>
        )}

        {selectedEvents.map(ev => {
          const isPast = !ev.allDay && new Date(ev.end) < now
          return (
            <div
              key={ev.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 3,
                padding: '8px 10px', borderRadius: 7,
                background: 'var(--ink-1)',
                border: '1px solid var(--glass-border)',
                opacity: isPast ? 0.4 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)',
                  letterSpacing: '0.06em', flexShrink: 0,
                }}>
                  {formatTime(ev.start, ev.allDay)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-6)', lineHeight: 1.3, fontWeight: 500 }}>
                  {ev.title}
                </span>
              </div>
              {ev.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 2 }}>
                  <MapPin size={9} color="var(--ink-3)" />
                  <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{ev.location}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
