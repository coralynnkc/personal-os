import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'

const TZ = process.env.USER_TIMEZONE ?? 'America/Los_Angeles'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const year = searchParams.get('year')
  const month = searchParams.get('month')

  // Monthly batch: return { "YYYY-MM-DD": points, ... }
  if (year && month) {
    const monthPadded = month.padStart(2, '0')
    const startDate = `${year}-${monthPadded}-01`
    const nextMonthDate = new Date(Number(year), Number(month), 1)
    const endDate = nextMonthDate.toISOString().slice(0, 10)

    const windowStart = new Date(`${startDate}T00:00:00Z`)
    windowStart.setDate(windowStart.getDate() - 1)
    const windowEnd = new Date(`${endDate}T23:59:59Z`)

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('points, completed_at')
      .eq('user_id', USER_ID)
      .not('completed_at', 'is', null)
      .gte('completed_at', windowStart.toISOString())
      .lte('completed_at', windowEnd.toISOString())

    if (error) {
      console.error('story-points monthly GET error:', error)
      return NextResponse.json({})
    }

    const byDay: Record<string, number> = {}
    for (const t of data ?? []) {
      if (!t.completed_at) continue
      const dayKey = new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: TZ })
      if (dayKey >= startDate && dayKey < endDate) {
        byDay[dayKey] = (byDay[dayKey] ?? 0) + (t.points ?? 0)
      }
    }
    return NextResponse.json(byDay)
  }

  if (!date) return NextResponse.json({ points: 0 })

  // Fetch a 3-day window around the target date to handle timezone offsets,
  // then filter locally to the exact local date.
  const windowStart = new Date(`${date}T00:00:00Z`)
  windowStart.setDate(windowStart.getDate() - 1)
  const windowEnd = new Date(`${date}T23:59:59Z`)
  windowEnd.setDate(windowEnd.getDate() + 1)

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('points, completed_at')
    .eq('user_id', USER_ID)
    .not('completed_at', 'is', null)
    .gte('completed_at', windowStart.toISOString())
    .lte('completed_at', windowEnd.toISOString())

  if (error) {
    console.error('story-points GET error:', error)
    return NextResponse.json({ points: 0 })
  }

  const total = (data ?? [])
    .filter(t => {
      if (!t.completed_at) return false
      return new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: TZ }) === date
    })
    .reduce((sum, t) => sum + (t.points ?? 0), 0)

  return NextResponse.json({ points: total })
}
