import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'
import { toDateKey, USER_TZ } from '@/lib/dateKey'
import { creditApplication } from '@/lib/applicationCredit'
import { STATUSES, type Application } from '@/lib/jobs'

const WRITABLE = [
  'entity_id', 'company_name', 'role_title', 'wave', 'status',
  'portal_url', 'portal_last_checked', 'applied_on', 'interview_on',
  'outcome', 'notes',
] as const

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status')

  // Pull the linked company entity in the same round trip so the pipeline
  // drawer can show the research you already did without a second fetch.
  let query = supabaseAdmin
    .from('applications')
    .select('*, entity:entities(id, name, kind, metadata)')
    .eq('user_id', USER_ID)
    .order('updated_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    console.error('applications GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const companyName = body.company_name
  if (typeof companyName !== 'string' || !companyName.trim()) {
    return NextResponse.json({ error: 'company_name required' }, { status: 400 })
  }
  if (body.status !== undefined && !STATUSES.includes(body.status as never)) {
    return NextResponse.json({ error: `invalid status: ${String(body.status)}` }, { status: 400 })
  }

  const row: Record<string, unknown> = { user_id: USER_ID, company_name: companyName.trim() }
  for (const key of WRITABLE) {
    if (key !== 'company_name' && key in body) row[key] = body[key]
  }
  row.status ??= 'researching'

  const { data, error } = await supabaseAdmin
    .from('applications')
    .insert(row)
    .select('*, entity:entities(id, name, kind, metadata)')
    .single()

  if (error) {
    // The (user, company, wave) unique index turns a double-click into a 409
    // rather than a duplicate pipeline card.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already tracking this company for that wave' }, { status: 409 })
    }
    console.error('applications POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A row can be added already applied — pasting in one you sent last week —
  // so the point is owed on create as well as on the move to applied.
  await creditApplication(data as unknown as Application, toDateKey(new Date(), USER_TZ))

  return NextResponse.json(data)
}
