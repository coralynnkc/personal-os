import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'
import { habitDateKey, USER_TZ } from '@/lib/dateKey'
import { focusTotals, parseSession, type PomodoroSession } from '@/lib/pomodoro'

function sessionsFor(notes: unknown): PomodoroSession[] {
  const n = (typeof notes === 'object' && notes !== null ? notes : {}) as Record<string, unknown>
  return Array.isArray(n.pomodoros) ? (n.pomodoros as PomodoroSession[]) : []
}

// Today's sessions, plus the totals behind the "3h 20m focused today" line.
// `date` follows the habit day (before 4am belongs to the night before), so a
// 1am focus block counts toward the day of the work.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? habitDateKey(USER_TZ)

  const { data, error } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  if (error) {
    console.error('pomodoro GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sessions = sessionsFor(data?.notes)
  return NextResponse.json({ date, sessions, ...focusTotals(sessions) })
}

// Append one completed phase to daily_logs.notes.pomodoros.
export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const session = parseSession(body)
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 400 })

  // File it under the day the session *started*, so a block that runs across
  // the 4am boundary doesn't land on the following day.
  const date = habitDateKey(USER_TZ, new Date(session.startedAt))

  const { data: existing } = await supabaseAdmin
    .from('daily_logs')
    .select('notes')
    .eq('user_id', USER_ID)
    .eq('log_date', date)
    .maybeSingle()

  const notes = existing?.notes ?? {}
  const sessions = sessionsFor(notes)

  // The client retries on failure and a second tab may log the same phase, so
  // drop an exact repeat rather than double-counting focus time.
  const duplicate = sessions.some(
    s => s.startedAt === session.startedAt && s.endedAt === session.endedAt && s.phase === session.phase,
  )
  if (duplicate) {
    return NextResponse.json({ ok: true, date, duplicate: true, ...focusTotals(sessions) })
  }

  notes.pomodoros = [...sessions, session]

  const { error } = await supabaseAdmin
    .from('daily_logs')
    .upsert(
      { user_id: USER_ID, log_date: date, notes, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )

  if (error) {
    console.error('pomodoro POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, date, ...focusTotals(notes.pomodoros) })
}
