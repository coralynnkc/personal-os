// Reading and materialising the daily job-search rhythm as real task rows.
//
// Lifted out of app/api/jobs/rhythm/route.ts so the MCP tool and the REST route
// share one implementation: the marker-tag dedupe is the whole reason calling
// this twice is safe, and two copies of it would eventually disagree.

import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { generateRhythmTasks, rhythmMarker, RHYTHM_TAG } from '@/lib/lcRhythm'

type TaskRow = {
  id: string
  title: string
  points: number | null
  tags: string[] | null
  completed_at: string | null
}

export type RhythmSlot = {
  slot: string
  title: string
  tag: string
  points: number
  task_id: string | null
  completed_at: string | null
}

async function findExisting(markers: string[]): Promise<TaskRow[]> {
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
function shape(date: string, rows: TaskRow[]): RhythmSlot[] {
  return generateRhythmTasks(date).map(t => {
    const row = rows.find(r => r.tags?.includes(rhythmMarker(date, t.slot)))
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

export async function readRhythm(date: string) {
  const planned = generateRhythmTasks(date)
  const rows = await findExisting(planned.map(t => rhythmMarker(date, t.slot)))
  return { date, materialised: rows.length > 0, tasks: shape(date, rows) }
}

/**
 * Create the task rows for a day's rhythm, skipping any slot that already has
 * one. Sunday plans nothing, and that is the intended rest day.
 */
export async function materialiseRhythm(date: string) {
  const planned = generateRhythmTasks(date)
  if (planned.length === 0) return { date, materialised: false, created: 0, tasks: [] as RhythmSlot[] }

  const markers = planned.map(t => rhythmMarker(date, t.slot))
  const have = new Set((await findExisting(markers)).flatMap(r => r.tags ?? []))
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
  return { date, materialised: true, created: missing.length, tasks: shape(date, rows) }
}
