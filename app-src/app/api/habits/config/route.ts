import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('habit_config')
    .select('habits')
    .eq('user_id', USER_ID)
    .single()

  return NextResponse.json({ habits: data?.habits ?? [] })
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { habits } = body

  const { error } = await supabaseAdmin
    .from('habit_config')
    .upsert(
      { user_id: USER_ID, habits, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    console.error('habit_config upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
