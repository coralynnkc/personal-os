import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'open'
  const urgency = searchParams.get('urgency')
  const keyOnly = searchParams.get('key') === 'true'
  const effectiveToday = searchParams.get('effective_today') === 'true'

  let query = supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('user_id', USER_ID)
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })

  if (status === 'open') {
    query = query.is('completed_at', null)
  } else if (status === 'done') {
    query = query.not('completed_at', 'is', null)
  }

  if (effectiveToday) {
    const tz = process.env.USER_TIMEZONE ?? 'UTC'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    query = query.or(`key.eq.true,urgency.eq.today,due_date.lte.${today}`)
  } else {
    if (urgency) query = query.eq('urgency', urgency)
    if (keyOnly) query = query.eq('key', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('tasks GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const { title, description, urgency, key, priority_score, points, tags, due_date, entity_id, owner, completed_at } = body

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      user_id: USER_ID,
      title,
      description: description ?? null,
      urgency: urgency ?? 'someday',
      key: key ?? false,
      priority_score: priority_score ?? 0,
      points: points ?? null,
      tags: tags ?? null,
      due_date: due_date ?? null,
      entity_id: entity_id ?? null,
      owner: owner ?? null,
      completed_at: completed_at ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('tasks POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
