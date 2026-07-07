import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get('all') === 'true'

  const { data, error } = await supabaseAdmin
    .from('entities')
    .select('id, name, kind, metadata')
    .eq('user_id', USER_ID)
    .order('name')

  if (error) {
    console.error('entities GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []
  return NextResponse.json(all ? rows : rows.filter(e => !e.metadata?.archived))
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { name, kind } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('entities')
    .insert({ user_id: USER_ID, name, kind: kind ?? null })
    .select()
    .single()

  if (error) {
    console.error('entities POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
