// The daily job-search rhythm, lifted out of the old JobSearchWidget.
//
// Two changes from the widget version:
//   1. The NeetCode pattern schedule no longer dead-ends. The widget pinned
//      itself to the last dated entry forever once that date passed; after the
//      dated ramp we now rotate a weekly review cycle instead.
//   2. The hardcoded MILESTONES map is gone. Those were "apply to X today"
//      nudges that the /jobs pipeline now derives from real application rows.

export type RhythmTask = {
  /** Stable per-day slot id — becomes the dedupe marker tag on the task row. */
  slot: string
  title: string
  tag: string
  points: number
}

/** Dated ramp through the NeetCode patterns. */
const NEETCODE: { from: string; pattern: string }[] = [
  { from: '2026-06-01', pattern: 'Trees — BFS/DFS' },
  { from: '2026-06-08', pattern: 'Graphs — BFS/DFS' },
  { from: '2026-06-15', pattern: 'Dynamic Programming (1D)' },
  { from: '2026-06-22', pattern: 'DP (2D) + Heaps' },
  { from: '2026-06-29', pattern: 'Tries + Union-Find' },
  { from: '2026-07-06', pattern: 'Backtracking + Greedy' },
  { from: '2026-07-13', pattern: 'Bit Manipulation + Math' },
  { from: '2026-07-20', pattern: 'LC medium review (mixed)' },
  { from: '2026-07-27', pattern: 'LC medium blitz' },
  { from: '2026-08-03', pattern: 'LC hard exposure' },
  { from: '2026-08-10', pattern: 'LC hard (cont.)' },
  { from: '2026-08-17', pattern: 'LC hard (1/day)' },
]

/**
 * Once the dated ramp runs out the schedule rotates through these weekly,
 * so it stays meaningful indefinitely instead of freezing on the last entry.
 */
const REVIEW_CYCLE = [
  'Mixed medium set (timed)',
  'Graphs + trees — re-solve cold',
  'DP review — 1D and 2D',
  'Heaps, intervals, greedy',
  'LC hard (1/day)',
  'Company-tagged set from your target list',
]

const MS_PER_WEEK = 7 * 86_400_000

export function getPhase(dateStr: string): number {
  if (dateStr < '2026-05-29') return 1
  if (dateStr < '2026-08-15') return 2
  if (dateStr < '2026-10-01') return 3
  return 4
}

export function getLCPattern(dateStr: string): string {
  const last = NEETCODE[NEETCODE.length - 1]
  if (dateStr < NEETCODE[0].from) return 'LC problem'
  if (dateStr < last.from) {
    let pattern = 'LC problem'
    for (const n of NEETCODE) {
      if (dateStr >= n.from) pattern = n.pattern
      else break
    }
    return pattern
  }

  // Past the dated ramp — the last entry holds for its own week, then the
  // review cycle rotates a week at a time.
  const weeks = Math.floor((Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${last.from}T00:00:00Z`)) / MS_PER_WEEK)
  if (weeks === 0) return last.pattern
  return REVIEW_CYCLE[(weeks - 1) % REVIEW_CYCLE.length]
}

/** Day of week for a YYYY-MM-DD string, read in UTC so it can't drift a day. */
function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
}

/**
 * The rhythm for one day. Sunday is deliberately empty — it was a rest day in
 * the widget and stays one here.
 */
export function generateRhythmTasks(dateStr: string): RhythmTask[] {
  const dow = dayOfWeek(dateStr)
  if (dow === 0) return []

  const phase = getPhase(dateStr)
  const tasks: RhythmTask[] = [
    { slot: 'lc-new',    title: `LeetCode: 1 new problem — ${getLCPattern(dateStr)}`, tag: 'lc', points: 3 },
    { slot: 'lc-review', title: 'LeetCode: re-solve 1 old problem cold',              tag: 'lc', points: 2 },
  ]

  const rhythms: Record<number, RhythmTask> = {
    1: { slot: 'rhythm', title: 'Log any Wave portals opening this week',   tag: 'apps',     points: 2 },
    2: { slot: 'rhythm', title: 'STAR stories: write or refine one story',  tag: 'stories',  points: 2 },
    3: { slot: 'rhythm', title: phase >= 3 ? 'System design: study one concept (20 min)' : 'System design: preview — start Aug 15', tag: 'design', points: 3 },
    4: { slot: 'rhythm', title: 'Company research: read 1 engineering blog', tag: 'research', points: 1 },
    5: { slot: 'rhythm', title: 'Pipeline admin: clear the stale-portal queue', tag: 'admin', points: 1 },
    6: { slot: 'rhythm', title: phase >= 3 ? 'System design: full design session (60–90 min)' : 'Rest or extra LC session', tag: phase >= 3 ? 'design' : 'rest', points: phase >= 3 ? 3 : 1 },
  }
  if (rhythms[dow]) tasks.push(rhythms[dow])

  return tasks
}

/** Marker tag that makes materialising a day's rhythm idempotent. */
export function rhythmMarker(dateStr: string, slot: string): string {
  return `rhythm:${dateStr}:${slot}`
}

export const RHYTHM_TAG = 'job-search'
