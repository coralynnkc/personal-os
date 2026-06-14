import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const allowed = ['title', 'description', 'urgency', 'key', 'priority_score', 'points', 'tags', 'due_date', 'entity_id', 'owner', 'completed_at']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('user_id', USER_ID)
    .select()
    .single()

  if (error) {
    console.error('task PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', USER_ID)

  if (error) {
    console.error('task DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
