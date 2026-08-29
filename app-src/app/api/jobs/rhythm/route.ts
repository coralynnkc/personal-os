import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { toDateKey, USER_TZ } from '@/lib/dateKey'
import { generateRhythmTasks, rhythmMarker, RHYTHM_TAG } from '@/lib/lcRhythm'

// The old JobSearchWidget kept the daily rhythm in localStorage and only wrote
// a `tasks` row at the moment you ticked something off — a parallel task system
// that Today's Tasks could not see. This endpoint materialises the same rhythm
// as real, open task rows instead, so it flows through the normal task views,
// the story-points count, and the tasks page like everything else.
//
// Idempotent: each generated row carries a `rhythm:<date>:<slot>` marker tag, so
// calling POST repeatedly for the same day is a no-op after the first time.

function resolveDate(req: Request): string {
  const q = new URL(req.url).searchParams.get('date')
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  return toDateKey(new Date(), USER_TZ)
}

async function findExisting(markers: string[]) {
  if (markers.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('id, title, points, tags, completed_at')
    .eq('user_id', USER_ID)
    .overlaps('tags', markers)

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Pair each generated slot with the task row that already materialises it. */
function shape(date: string, rows: { id: string; title: string; points: number | null; tags: string[] | null; completed_at: string | null }[]) {
  const planned = generateRhythmTasks(date)
  return planned.map(t => {
    const marker = rhythmMarker(date, t.slot)
    const row = rows.find(r => r.tags?.includes(marker))
    return {
      slot: t.slot,
      title: t.title,
      tag: t.tag,
      points: t.points,
      task_id: row?.id ?? null,
      completed_at: row?.completed_at ?? null,
    }
  })
}

export async function GET(req: Request) {
  const date = resolveDate(req)
  const planned = generateRhythmTasks(date)

  try {
    const rows = await findExisting(planned.map(t => rhythmMarker(date, t.slot)))
    return NextResponse.json({ date, materialised: rows.length > 0, tasks: shape(date, rows) })
  } catch (e) {
    console.error('rhythm GET error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const date = resolveDate(req)
  const planned = generateRhythmTasks(date)

  // Sunday generates nothing, and that is the intended rest day.
  if (planned.length === 0) {
    return NextResponse.json({ date, materialised: false, created: 0, tasks: [] })
  }

  try {
    const markers = planned.map(t => rhythmMarker(date, t.slot))
    const existing = await findExisting(markers)
    const have = new Set(existing.flatMap(r => r.tags ?? []))

    const missing = planned.filter(t => !have.has(rhythmMarker(date, t.slot)))

    if (missing.length > 0) {
      const { error } = await supabaseAdmin.from('tasks').insert(
        missing.map(t => ({
          user_id: USER_ID,
          title: t.title,
          urgency: 'today',
          points: t.points,
          due_date: date,
          tags: [RHYTHM_TAG, t.tag, rhythmMarker(date, t.slot)],
        })),
      )
      if (error) throw new Error(error.message)
    }

    const rows = await findExisting(markers)
    return NextResponse.json({
      date,
      materialised: true,
      created: missing.length,
      tasks: shape(date, rows),
    })
  } catch (e) {
    console.error('rhythm POST error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
