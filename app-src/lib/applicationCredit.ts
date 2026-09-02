// One story point per application submitted.
//
// This replaces the old daily rhythm, which manufactured points for practice
// you might or might not have wanted to do that day. The only job-search act
// that reliably deserves credit is the one that is hard to start and easy to
// put off: sending an application. So the pipeline pays for it directly.
//
// The credit is a real `tasks` row, already completed, rather than a number
// kept somewhere new — that is what makes it show up in the story-point count,
// the tasks page and Today alongside everything else, with no second scoring
// system to keep in sync.
//
// Idempotency is a marker tag, the same trick the deleted rhythm store used:
// the row carries `application:<id>:applied`, so every path that can move a
// card into applied — the board, the drawer, the MCP tools — can call this and
// only the first one writes.

import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import type { Application, Status } from '@/lib/jobs'

export const APPLIED_POINTS = 1

/** Tag that makes crediting an application at most once, forever. */
export function appliedMarker(id: string): string {
  return `application:${id}:applied`
}

/**
 * Statuses that mean the application actually went in. A row can jump straight
 * to `oa` — an OA landing is how you find out you applied a week ago — so the
 * test is "at or past applied", not "equals applied".
 *
 * `rejected` and `ghosted` are left out on purpose. They usually follow an
 * application, in which case the point was already paid when the row passed
 * through applied; crediting them too would pay twice for hearing back badly.
 */
const CREDITED: Status[] = ['applied', 'oa', 'phone', 'onsite', 'offer']

export function isCredited(status: Status): boolean {
  return CREDITED.includes(status)
}

/**
 * Award the point for an application, unless it has already been awarded.
 *
 * Deliberately never throws: a failed credit must not fail the write that
 * moved the card, or a network blip would leave you unable to record that you
 * applied. The point is recoverable; the pipeline state is the real data.
 */
export async function creditApplication(app: Application, today: string): Promise<void> {
  try {
    if (!isCredited(app.status)) return

    const marker = appliedMarker(app.id)
    const { data: existing, error: readError } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('user_id', USER_ID)
      .overlaps('tags', [marker])
      .limit(1)

    if (readError) throw new Error(readError.message)
    if (existing && existing.length > 0) return

    const day = app.applied_on ?? today
    const role = app.role_title ? ` — ${app.role_title}` : ''

    const { error } = await supabaseAdmin.from('tasks').insert({
      user_id: USER_ID,
      title: `Applied: ${app.company_name}${role}`,
      urgency: 'today',
      points: APPLIED_POINTS,
      due_date: day,
      // Completed on arrival: the task is the receipt for work already done,
      // not something to tick off later. Noon UTC rather than midnight so the
      // story-point count, which buckets completed_at into Cora's timezone,
      // can't drop the point onto the day before.
      completed_at: `${day}T12:00:00Z`,
      entity_id: app.entity_id,
      tags: ['job-search', 'apps', marker],
    })
    if (error) throw new Error(error.message)
  } catch (e) {
    console.error('application credit error:', e)
  }
}
