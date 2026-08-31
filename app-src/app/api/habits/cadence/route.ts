import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The last day each cadence habit was done, as `{ habitId: 'YYYY-MM-DD' }`.
 *
 * Every event is read rather than the latest per habit: Postgres has no cheap
 * "distinct on" through PostgREST, and a single user doing five chores weekly
 * writes a few hundred rows a year. If that ever stops being true, this is a
 * view.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('habit_events')
    .select('habit_id, event_date')
    .eq('user_id', USER_ID)
    .order('event_date', { ascending: false })

  if (error) {
    console.error('habit_events GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const last: Record<string, string> = {}
  for (const row of data ?? []) {
    // Ordered newest first, so the first sighting of a habit is its last event.
    if (!last[row.habit_id]) last[row.habit_id] = row.event_date
  }

  return NextResponse.json(last)
}

/**
 * Record one act. `undo: true` deletes that day's row instead — a mis-tap on a
 * cadence row resets a bar that took a week to fill, so it has to be
 * recoverable without an admin panel.
 */
export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { habitId, date, undo } = body

  if (typeof habitId !== 'string' || !habitId) {
    return NextResponse.json({ error: 'habitId required' }, { status: 400 })
  }
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date required as YYYY-MM-DD' }, { status: 400 })
  }

  if (undo) {
    const { error } = await supabaseAdmin
      .from('habit_events')
      .delete()
      .eq('user_id', USER_ID)
      .eq('habit_id', habitId)
      .eq('event_date', date)

    if (error) {
      console.error('habit_events DELETE error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // Doing it twice in a day is doing it once, and the unique index says so —
  // upsert rather than insert so a double tap is not a 409.
  const { error } = await supabaseAdmin
    .from('habit_events')
    .upsert(
      { user_id: USER_ID, habit_id: habitId, event_date: date },
      { onConflict: 'user_id,habit_id,event_date', ignoreDuplicates: true }
    )

  if (error) {
    console.error('habit_events POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
