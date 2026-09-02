import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'
import { toDateKey, USER_TZ } from '@/lib/dateKey'

// The free-text note beside the stale queue — one row per day in `job_notes`.
//
//   GET  /api/jobs/notes?date=YYYY-MM-DD   → that day's note (blank if none)
//   GET  /api/jobs/notes?days=N            → the last N days that have a note
//   PUT  /api/jobs/notes                   → upsert { date?, body }
//
// PUT rather than POST because the write is idempotent: the note is a page you
// re-save all day, not an event you append. An empty body deletes the row so a
// note you cleared doesn't linger in the recent list as a blank entry.

const MAX_BODY = 20_000
const MAX_DAYS = 90

function resolveDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const days = Number(searchParams.get('days'))

  if (Number.isFinite(days) && days > 0) {
    const from = new Date()
    from.setUTCDate(from.getUTCDate() - Math.min(days, MAX_DAYS))

    const { data, error } = await supabaseAdmin
      .from('job_notes')
      .select('note_date, body, updated_at')
      .eq('user_id', USER_ID)
      .gte('note_date', toDateKey(from, USER_TZ))
      .order('note_date', { ascending: false })

    if (error) {
      console.error('job notes GET error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ notes: data ?? [] })
  }

  const date = resolveDate(searchParams.get('date')) ?? toDateKey(new Date(), USER_TZ)

  const { data, error } = await supabaseAdmin
    .from('job_notes')
    .select('note_date, body, updated_at')
    .eq('user_id', USER_ID)
    .eq('note_date', date)
    .maybeSingle()

  if (error) {
    console.error('job notes GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A day with nothing written is a blank page, not a 404.
  return NextResponse.json(data ?? { note_date: date, body: '', updated_at: null })
}

export async function PUT(req: Request) {
  const payload = await parseJsonBody(req)
  if (!payload) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const date = resolveDate(payload.date) ?? toDateKey(new Date(), USER_TZ)
  if (typeof payload.body !== 'string') {
    return NextResponse.json({ error: 'body must be a string' }, { status: 400 })
  }
  if (payload.body.length > MAX_BODY) {
    return NextResponse.json({ error: `body must be at most ${MAX_BODY} characters` }, { status: 400 })
  }

  const body = payload.body

  if (!body.trim()) {
    const { error } = await supabaseAdmin
      .from('job_notes')
      .delete()
      .eq('user_id', USER_ID)
      .eq('note_date', date)

    if (error) {
      console.error('job notes PUT error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ note_date: date, body: '', updated_at: null })
  }

  const { data, error } = await supabaseAdmin
    .from('job_notes')
    .upsert({ user_id: USER_ID, note_date: date, body }, { onConflict: 'user_id,note_date' })
    .select('note_date, body, updated_at')
    .single()

  if (error) {
    console.error('job notes PUT error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
