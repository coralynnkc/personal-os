import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'
import { STATUSES } from '@/lib/jobs'

const ALLOWED = [
  'entity_id', 'company_name', 'role_title', 'wave', 'status',
  'portal_url', 'portal_last_checked', 'applied_on', 'interview_on',
  'outcome', 'notes',
]

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  if (body.status !== undefined && !STATUSES.includes(body.status as never)) {
    return NextResponse.json({ error: `invalid status: ${String(body.status)}` }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no writable fields in body' }, { status: 400 })
  }

  // Moving a card to `applied` without a date is the common case — stamp today
  // so days-since-applied works instead of rendering an empty cell.
  if (patch.status === 'applied' && !('applied_on' in patch)) {
    const { data: existing } = await supabaseAdmin
      .from('applications')
      .select('applied_on')
      .eq('id', id)
      .eq('user_id', USER_ID)
      .single()
    if (!existing?.applied_on) patch.applied_on = new Date().toISOString().slice(0, 10)
  }

  const { data, error } = await supabaseAdmin
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', USER_ID)
    .select('*, entity:entities(id, name, kind, metadata)')
    .single()

  if (error) {
    console.error('application PATCH error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', USER_ID)

  if (error) {
    console.error('application DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
