import { NextResponse } from 'next/server'
import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { USER_TZ } from '@/lib/dateKey'
import type { PlanningDoc } from '@/lib/weekDoc'

// Written only by scripts/sync-planning-docs.mjs; this route is read-only.
//
//   GET /api/documents                 → the current week doc + the semester index
//   GET /api/documents?slug=<slug>     → one document
//
// The week list is small (one file a week), so "which week is current" is
// decided here over all of them rather than in SQL: the right week is the one
// whose own day sections contain today, which is not the same as the one whose
// week_start is nearest — week_2026-08-31 opens on Sat Aug 29.

type Index = { slug: string; title: string | null; kind: string }

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(new Date())
}

function pickCurrent(weeks: PlanningDoc[], day: string): PlanningDoc | null {
  if (!weeks.length) return null

  const covering = weeks.find((w) =>
    (w.parsed?.days ?? []).some((d) => d.dates.length && d.dates[0] <= day && day <= d.dates[d.dates.length - 1]),
  )
  if (covering) return covering

  // Otherwise the most recent week that has already started, falling back to
  // the next one up — an empty tab in the gap between docs helps nobody.
  const started = weeks.filter((w) => w.week_start && w.week_start <= day)
  if (started.length) return started[started.length - 1]
  return weeks[0]
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug')

  if (slug) {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      console.error('documents GET error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('user_id', USER_ID)
    .order('week_start', { ascending: true })

  if (error) {
    console.error('documents GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const docs = (data ?? []) as PlanningDoc[]
  const weeks = docs.filter((d) => d.kind === 'week')
  const semester: Index[] = docs
    .filter((d) => d.kind === 'semester')
    .map(({ slug, title, kind }) => ({ slug, title, kind }))

  return NextResponse.json({
    week: pickCurrent(weeks, today()),
    weeks: weeks.map(({ slug, title, kind, week_start }) => ({ slug, title, kind, week_start })),
    semester,
  })
}
