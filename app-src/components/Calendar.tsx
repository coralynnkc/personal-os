'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { USER_TZ } from '@/lib/dateKey'
import { ErrorRow, RegionHead } from './jobs/ui'

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

  // Total scheduled time on the selected day — the number the region head carries.
  const scheduled = selectedEvents.reduce((mins, ev) => {
    if (ev.allDay) return mins
    return mins + Math.max(0, (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000)
  }, 0)
  const scheduledLabel = scheduled > 0
    ? `${Math.floor(scheduled / 60)}h ${Math.round(scheduled % 60)}m`
    : undefined

  const nowMark = selectedDay === todayKey
    ? now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
    : null

  return (
    <section className="region region-cal" style={{ display: 'flex', flexDirection: 'column' }}>
      <RegionHead title="schedule" right={loading ? 'loading' : scheduledLabel} />

      {/* Seven days, hung off one hairline — a strip, not seven buttons. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 'var(--s4)' }}>
        {days.map(({ key, dayName, dayNum }) => {
          const isToday = key === todayKey
          const isSelected = key === selectedDay
          const hasEvents = (byDay[key] ?? []).length > 0
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              aria-pressed={isSelected}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s1)',
                padding: 'var(--s2) 0',
                background: 'transparent', border: 0, borderRadius: 0,
                borderBottom: `1px solid ${isSelected ? 'var(--champagne)' : 'var(--rule)'}`,
                cursor: 'pointer',
              }}
            >
              <span className="mono" style={{
                fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: isSelected ? 'var(--champagne)' : 'var(--slate)',
              }}>
                {dayName}
              </span>
              <span className="mono" style={{
                fontSize: 15,
                color: isSelected ? 'var(--champagne)' : isToday ? 'var(--ivory)' : 'var(--ash)',
              }}>
                {dayNum}
              </span>
              <span style={{
                width: 3, height: 3,
                background: hasEvents ? (isSelected ? 'var(--champagne)' : 'var(--slate)') : 'transparent',
              }} />
            </button>
          )
        })}
      </div>

      {error && <ErrorRow message={error} onRetry={load} />}

      {!loading && !error && selectedEvents.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>No events.</div>
      )}

      {/* The day hangs off a vertical time rail: each slot ticks onto it, and
          the now-mark is a single dot on the same line. */}
      {selectedEvents.length > 0 && (
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid var(--rule)',
          paddingLeft: 'var(--s4)', marginLeft: 'var(--s4)',
        }}>
          {selectedEvents.map((ev, i) => {
            const isPast = !ev.allDay && new Date(ev.end) < now
            const nextStartsAfterNow = nowMark
              && !isPast
              && (i === 0 || (selectedEvents[i - 1].end && new Date(selectedEvents[i - 1].end) < now))
            return (
              <div key={ev.id}>
                {nextStartsAfterNow && (
                  <div style={{ position: 'relative', padding: 'var(--s1) 0' }}>
                    <span style={{
                      position: 'absolute', left: 'calc(var(--s4) * -1 - 3px)', top: '50%',
                      width: 5, height: 5, background: 'var(--champagne)',
                    }} />
                    <span className="mono" style={{
                      fontSize: 10, letterSpacing: '0.14em', color: 'var(--champagne)',
                    }}>
                      NOW {nowMark}
                    </span>
                  </div>
                )}
                <div style={{ position: 'relative', padding: 'var(--s2) 0 var(--s3)' }}>
                  {/* the tick onto the rail */}
                  <span style={{
                    position: 'absolute', left: 'calc(var(--s4) * -1 - 1px)', top: 15,
                    width: 'var(--s3)', height: 1, background: 'var(--rule)',
                  }} />
                  <div className="mono" style={{
                    fontSize: 10.5, letterSpacing: '0.06em',
                    color: isPast ? 'var(--slate)' : 'var(--royal)',
                  }}>
                    {formatTime(ev.start, ev.allDay)}
                  </div>
                  <div style={{
                    fontSize: 13.5, marginTop: 2,
                    color: isPast ? 'var(--slate)' : 'var(--ivory)',
                    overflowWrap: 'anywhere',
                  }}>
                    {ev.title}
                  </div>
                  {ev.location && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--s1)',
                      fontSize: 11.5, color: 'var(--slate)',
                    }}>
                      <MapPin size={9} /> {ev.location}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
