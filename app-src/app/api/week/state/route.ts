import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

// Which rows of the week's schedule are done.
//
// This is per-day data with no lifecycle of its own — nothing sorts or filters
// on it — so it appends to `daily_logs.notes` as `week: { checked: [rowId] }`
// rather than earning a table, the same way `notes.sleep` and `notes.habits`
// do. The document stays read-only: a check is state *about* a row, held here,
// and re-syncing the file never touches it (row ids are content-derived, so
// they survive an edit above them).
//
//   GET   /api/week/state?dates=2026-08-31,2026-09-01 → { [date]: string[] }
//   PATCH /api/week/state  { date, rowId, checked }
//
// The dates come from the client because the week a document covers is the
// document's business, not this route's.

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get('dates') ?? ''
  const dates = param.split(',').map((d) => d.trim()).filter((d) => DATE.test(d))
  if (!dates.length) return NextResponse.json({})

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .select('log_date, notes')
    .eq('user_id', USER_ID)
    .in('log_date', dates)

  if (error) {
    console.error('week state GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const out: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const checked = row.notes?.week?.checked
    if (Array.isArray(checked)) out[row.log_date] = checked.filter((id: unknown) => typeof id === 'string')
  }
  return NextResponse.json(out)
}

export async function PATCH(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { date, rowId, checked } = body as { date?: unknown; rowId?: unknown; checked?: unknown }
  if (typeof date !== 'string' || !DATE.test(date) || typeof rowId !== 'string' || !rowId) {
    return NextResponse.json({ error: 'date and rowId required' }, { status: 400 })
  }

  const { data: existing, error: readError } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  if (readError) {
    console.error('week state PATCH error:', readError)
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }

  // Read–modify–write on the jsonb column: the row holds sleep and habits too,
  // so the whole `notes` object goes back, with only `week.checked` changed.
  const notes = existing?.notes ?? {}
  const before: string[] = Array.isArray(notes.week?.checked) ? notes.week.checked : []
  const after = checked === false
    ? before.filter((id: string) => id !== rowId)
    : before.includes(rowId) ? before : [...before, rowId]
  notes.week = { ...(notes.week ?? {}), checked: after }

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { user_id: USER_ID, log_date: date, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' },
    )

  if (error) {
    console.error('week state PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, date, checked: after })
}
