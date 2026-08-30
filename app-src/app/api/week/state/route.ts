import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { parseJsonBody } from '@/lib/http'

// What the app remembers about the week's schedule: which rows are done, which
// way each conditional row went, and which task a row was joined to by hand.
//
// This is per-day data with no lifecycle of its own — nothing sorts or filters
// on it — so it appends to `daily_logs.notes` as
// `week: { checked: [rowId], branches: { rowId: armId }, links: { rowId: taskId } }`
// rather than earning
// a table, the same way `notes.sleep` and `notes.habits` do. The document
// stays read-only: both are state *about* a row, held here, and re-syncing the
// file never touches them (row ids are content-derived, so they survive an
// edit above them).
//
//   GET   /api/week/state?dates=2026-08-31,2026-09-01
//         → { [date]: { checked: [], branches: { [rowId]: armId },
//                       links: { [rowId]: taskId | 'none' } } }
//   PATCH /api/week/state  { date, rowId, checked }        — tick a row
//   PATCH /api/week/state  { date, rowId, branch: armId }  — resolve a fork
//                                       (branch: null reopens it)
//   PATCH /api/week/state  { date, rowId, taskId }         — join a row to a task
//                                       (taskId: 'none' means nothing tracks it;
//                                        taskId: null goes back to the fuzzy match)
//
// The dates come from the client because the week a document covers is the
// document's business, not this route's.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const ARMS = new Set(['if', 'else'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The link that means "nothing tracks this row" — `NO_TASK` in taskMatch.mjs. */
const NO_TASK = 'none'

type DayState = {
  checked: string[]
  branches: Record<string, string>
  links: Record<string, string>
}

/** `notes.week` as it is on disk — anything shaped wrong reads as empty. */
function readWeek(notes: { week?: unknown } | null | undefined): DayState {
  const week = (notes?.week ?? {}) as { checked?: unknown; branches?: unknown; links?: unknown }
  const checked = Array.isArray(week.checked)
    ? week.checked.filter((id: unknown): id is string => typeof id === 'string')
    : []
  const branches: Record<string, string> = {}
  if (week.branches && typeof week.branches === 'object') {
    for (const [id, arm] of Object.entries(week.branches as Record<string, unknown>)) {
      if (typeof arm === 'string' && ARMS.has(arm)) branches[id] = arm
    }
  }
  const links: Record<string, string> = {}
  if (week.links && typeof week.links === 'object') {
    for (const [id, taskId] of Object.entries(week.links as Record<string, unknown>)) {
      if (typeof taskId === 'string' && (taskId === NO_TASK || UUID.test(taskId))) links[id] = taskId
    }
  }
  return { checked, branches, links }
}

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

  const out: Record<string, DayState> = {}
  for (const row of data ?? []) {
    const state = readWeek(row.notes)
    if (state.checked.length || Object.keys(state.branches).length || Object.keys(state.links).length) {
      out[row.log_date] = state
    }
  }
  return NextResponse.json(out)
}

export async function PATCH(req: Request) {
  const body = await parseJsonBody(req)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const { date, rowId, checked, branch, taskId } = body as {
    date?: unknown; rowId?: unknown; checked?: unknown; branch?: unknown; taskId?: unknown
  }
  if (typeof date !== 'string' || !DATE.test(date) || typeof rowId !== 'string' || !rowId) {
    return NextResponse.json({ error: 'date and rowId required' }, { status: 400 })
  }
  // One field of the three. `branch` and `taskId` present *at all* mean this is
  // that kind of write, so `undefined` and `null` have to be told apart: null
  // reopens the fork, and null hands the row back to the fuzzy matcher.
  const isBranch = 'branch' in body
  const isLink = 'taskId' in body
  if (isBranch && branch !== null && !(typeof branch === 'string' && ARMS.has(branch))) {
    return NextResponse.json({ error: 'branch must be "if", "else", or null' }, { status: 400 })
  }
  if (isLink && taskId !== null && !(typeof taskId === 'string' && (taskId === NO_TASK || UUID.test(taskId)))) {
    return NextResponse.json(
      { error: 'taskId must be a task id, "none", or null' }, { status: 400 },
    )
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
  // so the whole `notes` object goes back, with only `week` changed.
  const notes = existing?.notes ?? {}
  const state = readWeek(notes)

  if (isBranch) {
    if (branch === null) delete state.branches[rowId]
    else state.branches[rowId] = branch as string
  } else if (isLink) {
    if (taskId === null) delete state.links[rowId]
    else state.links[rowId] = taskId as string
  } else {
    state.checked = checked === false
      ? state.checked.filter((id) => id !== rowId)
      : state.checked.includes(rowId) ? state.checked : [...state.checked, rowId]
  }
  notes.week = { ...(notes.week ?? {}), ...state }

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

  return NextResponse.json({ ok: true, date, ...state })
}
