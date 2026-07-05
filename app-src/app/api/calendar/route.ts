import { NextResponse } from 'next/server'
import ICAL from 'ical.js'

export type CalEvent = {
  id: string
  title: string
  start: string   // ISO timestamp, or YYYY-MM-DD when allDay
  end: string     // ISO timestamp, or YYYY-MM-DD when allDay
  location?: string
  allDay: boolean
}

const WINDOW_DAYS = 30

export async function GET() {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL
  if (!url) return NextResponse.json([])

  try {
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) {
      console.error('calendar fetch failed:', res.status)
      return NextResponse.json([])
    }
    const text = await res.text()
    const comp = ICAL.Component.fromString(text)

    const now = new Date()
    const windowStart = new Date(now)
    windowStart.setDate(now.getDate() - 1)
    const windowEnd = new Date(now)
    windowEnd.setDate(now.getDate() + WINDOW_DAYS)

    const events: CalEvent[] = []
    const seen = new Set<string>()

    const vevents = comp.getAllSubcomponents('vevent')
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent)
      if (!event.summary) continue

      if (event.isRecurring()) {
        const expand = new ICAL.RecurExpansion({
          component: vevent,
          dtstart: event.startDate,
        })

        let safety = 0
        let next: ICAL.Time | null
        while ((next = expand.next()) && safety++ < 500) {
          const jsStart = next.toJSDate()
          if (jsStart > windowEnd) break
          if (jsStart < windowStart) continue

          const details = event.getOccurrenceDetails(next)
          const jsEnd = details.endDate.toJSDate()
          const id = `${event.uid}_${jsStart.toISOString()}`

          if (!seen.has(id)) {
            seen.add(id)
            // Date-only values keep their raw YYYY-MM-DD string — converting
            // through a JS Date would pin them to server-time midnight and
            // shift them a day for users west of the server.
            const isDate = details.startDate.isDate
            events.push({
              id,
              title: event.summary,
              start: isDate ? details.startDate.toString() : jsStart.toISOString(),
              end: isDate ? details.endDate.toString() : jsEnd.toISOString(),
              location: event.location || undefined,
              allDay: isDate,
            })
          }
        }
      } else {
        const jsStart = event.startDate.toJSDate()
        const jsEnd = event.endDate.toJSDate()
        if (jsStart > windowEnd || jsEnd < windowStart) continue

        const id = event.uid || `${event.summary}_${jsStart.toISOString()}`
        if (!seen.has(id)) {
          seen.add(id)
          const isDate = event.startDate.isDate
          events.push({
            id,
            title: event.summary,
            start: isDate ? event.startDate.toString() : jsStart.toISOString(),
            end: isDate ? event.endDate.toString() : jsEnd.toISOString(),
            location: event.location || undefined,
            allDay: isDate,
          })
        }
      }
    }

    events.sort((a, b) => a.start.localeCompare(b.start))
    return NextResponse.json(events)
  } catch (err) {
    console.error('calendar parse error:', err)
    return NextResponse.json([])
  }
}
