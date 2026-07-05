import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { habitDateKey, toDateKey, USER_TZ } from '@/lib/dateKey'

const TZ = USER_TZ

async function upsertSleepField(date: string, patch: Record<string, unknown>) {
  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  const notes = existing?.notes ?? {}
  notes.sleep = { ...(notes.sleep ?? {}), ...patch }

  await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { user_id: USER_ID, log_date: date, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
}

export async function POST(req: Request) {
  const { event } = await req.json()
  const now = new Date()
  const nowIso = now.toISOString()

  if (event === 'bedtime') {
    const targetDate = habitDateKey(TZ, now)
    await upsertSleepField(targetDate, { bedtime: nowIso })
    return NextResponse.json({ ok: true, date: targetDate })
  }

  if (event === 'waketime') {
    const todayKey = toDateKey(now, TZ)
    const yesterdayKey = toDateKey(new Date(now.getTime() - 86_400_000), TZ)

    // Find the most recent bedtime from today or yesterday's log
    const { data: rows } = await supabaseAdmin
      .from('daily_logs')
      .select('log_date, notes')
      .eq('user_id', USER_ID)
      .in('log_date', [todayKey, yesterdayKey])

    let bedtimeIso: string | undefined
    for (const d of [todayKey, yesterdayKey]) {
      const row = (rows ?? []).find(r => r.log_date === d)
      if (row?.notes?.sleep?.bedtime) { bedtimeIso = row.notes.sleep.bedtime; break }
    }

    const hours = bedtimeIso
      ? (now.getTime() - new Date(bedtimeIso).getTime()) / 3_600_000
      : undefined

    await upsertSleepField(todayKey, { waketime: nowIso, ...(hours !== undefined ? { hours } : {}) })
    return NextResponse.json({ ok: true, hours, date: todayKey })
  }

  return NextResponse.json({ error: 'invalid event' }, { status: 400 })
}
