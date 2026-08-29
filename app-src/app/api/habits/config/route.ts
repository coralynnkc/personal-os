import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'
import { normalizeSettings } from '@/lib/pomodoro'

export async function GET() {
  // select('*') rather than naming the columns: if 0003 has not been applied
  // yet, asking for a missing `pomodoro` column would fail the whole query and
  // take the habit list down with it. This way pomodoro just falls to defaults.
  const { data } = await supabaseAdmin
    .from('habit_config')
    .select('*')
    .eq('user_id', USER_ID)
    .single()

  return NextResponse.json({
    habits: data?.habits ?? [],
    pomodoro: normalizeSettings(data?.pomodoro),
  })
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { habits, pomodoro } = body

  // habits and pomodoro live in the same row but are written by different
  // parts of the UI, so patch only the key the caller actually sent — a
  // pomodoro settings save must not blank out the habit list.
  const patch: Record<string, unknown> = { user_id: USER_ID, updated_at: new Date().toISOString() }
  if (habits !== undefined) patch.habits = habits
  if (pomodoro !== undefined) patch.pomodoro = normalizeSettings(pomodoro)

  if (habits === undefined && pomodoro === undefined) {
    return NextResponse.json({ error: 'habits or pomodoro required' }, { status: 400 })
  }

  // On conflict the upsert UPDATEs every column it was handed, so `habits`
  // can only be defaulted when there is no row yet — otherwise saving
  // pomodoro settings alone would overwrite the habit list with [].
  if (patch.habits === undefined) {
    const { data: existing } = await supabaseAdmin
      .from('habit_config')
      .select('habits')
      .eq('user_id', USER_ID)
      .maybeSingle()
    if (!existing) patch.habits = []
  }

  const { error } = await supabaseAdmin
    .from('habit_config')
    .upsert(patch, { onConflict: 'user_id', ignoreDuplicates: false })

  if (error) {
    console.error('habit_config upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
