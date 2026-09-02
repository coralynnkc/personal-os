import { NextResponse } from 'next/server'
import { toDateKey, USER_TZ } from '@/lib/dateKey'
import { readRhythm, materialiseRhythm } from '@/lib/rhythmStore'

// The old JobSearchWidget kept the daily rhythm in localStorage and only wrote
// a `tasks` row at the moment you ticked something off — a parallel task system
// that Today's Tasks could not see. This endpoint materialises the same rhythm
// as real, open task rows instead, so it flows through the normal task views,
// the story-points count, and the tasks page like everything else.
//
// Idempotent: each generated row carries a `rhythm:<date>:<slot>` marker tag, so
// calling POST repeatedly for the same day is a no-op after the first time.
// The read/write pair itself lives in lib/rhythmStore, shared with the MCP tool.

function resolveDate(req: Request): string {
  const q = new URL(req.url).searchParams.get('date')
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  return toDateKey(new Date(), USER_TZ)
}

export async function GET(req: Request) {
  try {
    return NextResponse.json(await readRhythm(resolveDate(req)))
  } catch (e) {
    console.error('rhythm GET error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    return NextResponse.json(await materialiseRhythm(resolveDate(req)))
  } catch (e) {
    console.error('rhythm POST error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
