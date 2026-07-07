import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()
  const month = String(searchParams.get('month') ?? new Date().getMonth() + 1).padStart(2, '0')

  const startDate = `${year}-${month}-01`
  // end: first day of next month (UTC so toISOString can't shift the day)
  const nextMonth = new Date(Date.UTC(Number(year), Number(month), 1))
  const endDate = nextMonth.toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .select('log_date, notes')
    .eq('user_id', USER_ID)
    .gte('log_date', startDate)
    .lt('log_date', endDate)

  if (error) {
    console.error('daily_logs GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { date, habitId, level } = body
  if (typeof date !== 'string' || typeof habitId !== 'string') {
    return NextResponse.json({ error: 'date and habitId required' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  const notes = existing?.notes ?? {}
  notes.habits = { ...(notes.habits ?? {}), [habitId]: level }

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { user_id: USER_ID, log_date: date, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )

  if (error) {
    console.error('daily_logs POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
