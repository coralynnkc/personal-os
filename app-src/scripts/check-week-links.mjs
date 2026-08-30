#!/usr/bin/env node
/**
 * Which rows of the synced week doc found a task, and which didn't.
 *
 * The week tab's checkbox writes through to the `tasks` row behind a schedule
 * line, so a row that *should* be tracked and isn't is a silent hole: it ticks
 * locally and the task stays open. The join is fuzzy and one-directional
 * (every meaningful word of the row's title has to appear in the task's), so
 * the failure is almost always a wording drift — `HW` against `Homework` — and
 * you cannot see which word from the tab itself.
 *
 * This asks the *same* matcher the app asks (`lib/taskMatch.mjs`), then, for
 * anything unmatched, reports the closest task and the exact tokens that were
 * missing. It also flags the opposite hazard — a *weak* link, one that only
 * cleared the bar because the task happened to be due that day, which ticks
 * through to work you didn't mean. Read-only: it never writes to Supabase.
 *
 * Usage:
 *   node scripts/check-week-links.mjs [--slug <slug>] [--all] [--json]
 *
 *   --slug   check one document by slug (default: the newest week doc)
 *   --all    list matched rows too, not only the misses
 *   --json   machine-readable, for a hook or a watch
 *
 * Run scripts/sync-planning-docs.mjs first — this reads what was synced, not
 * the .md file on disk, which is the point: it checks what the app will see.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchTask, rowSkipped, rowTitle, scoreTask, tokens, ROW_MATCH } from '../lib/taskMatch.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// A standalone node script doesn't get Next.js's .env.local loading.
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // Fall through to whatever is already in the environment.
  }
}

const args = process.argv.slice(2)
const ALL = args.includes('--all')
const JSON_OUT = args.includes('--json')
const slugIdx = args.indexOf('--slug')
const SLUG = slugIdx >= 0 ? args[slugIdx + 1] : null

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.USER_ID ?? 'cora'

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (checked .env.local and the environment).')
  process.exit(1)
}

const db = createClient(url, key)

let docQuery = db
  .from('documents')
  .select('slug, title, parsed, synced_at')
  .eq('user_id', USER_ID)
  .eq('kind', 'week')
  .order('week_start', { ascending: false })
  .limit(1)
if (SLUG) docQuery = db
  .from('documents')
  .select('slug, title, parsed, synced_at')
  .eq('user_id', USER_ID)
  .eq('slug', SLUG)
  .limit(1)

// The app fetches `status=all`, so this has to as well — a row whose task is
// already done is *linked*, and reporting it as a miss would send you renaming
// a title that works.
const [{ data: docs, error: docErr }, { data: tasks, error: taskErr }] = await Promise.all([
  docQuery,
  db.from('tasks').select('id, title, due_date, completed_at').eq('user_id', USER_ID),
])

if (docErr) { console.error('documents read error:', docErr.message); process.exit(1) }
if (taskErr) { console.error('tasks read error:', taskErr.message); process.exit(1) }

const doc = docs?.[0]
if (!doc) {
  console.error(SLUG ? `No document with slug "${SLUG}".` : 'No week document synced yet — run scripts/sync-planning-docs.mjs.')
  process.exit(1)
}
if (!doc.parsed?.days?.length) {
  console.error(`"${doc.slug}" has no parsed days. Re-run scripts/sync-planning-docs.mjs.`)
  process.exit(1)
}

/**
 * What the app remembers about the week — only the resolved forks matter here.
 * An unanswered fork's title is the whole two-futures sentence, which no task
 * will ever match, and saying so is more useful than scoring it.
 */
const dates = doc.parsed.days.map((d) => d.dates[0]).filter(Boolean)
const { data: logs } = await db
  .from('daily_logs')
  .select('log_date, notes')
  .eq('user_id', USER_ID)
  .in('log_date', dates.length ? dates : ['1970-01-01'])

const branches = {}
for (const log of logs ?? []) branches[log.log_date] = log.notes?.week?.branches ?? {}

/** The closest thing to a match, whether or not it cleared the bar. */
function nearest(title, date) {
  let best = null
  for (const task of tasks ?? []) {
    const s = scoreTask({ title, date }, task)
    if (!best || s.score > best.score) best = { task, ...s }
  }
  return best
}

const findings = []

for (const day of doc.parsed.days) {
  const date = day.dates[0] ?? null
  for (const row of day.rows) {
    const choice = branches[date]?.[row.id]
    // A row resolved to "it doesn't happen" is not work, so it wants nothing.
    if (rowSkipped(row, choice)) continue

    const title = rowTitle(row, choice)
    const base = { day: day.heading, date, rowId: row.id, title, raw: row.rawWhat }

    if (!date) {
      findings.push({ ...base, status: 'no-date', note: "day heading has no date — this row can't hold state or join a task" })
      continue
    }
    if (row.branch && !choice) {
      findings.push({ ...base, status: 'open-fork', note: 'fork unanswered — the row is still both futures, so nothing can match it' })
      continue
    }
    if (tokens(title).length < ROW_MATCH.minTokens) {
      findings.push({ ...base, status: 'too-short', note: `"${title}" is under ${ROW_MATCH.minTokens} meaningful words` })
      continue
    }

    const task = matchTask({ title, date }, tasks ?? [], ROW_MATCH)
    if (task) {
      // A link that only cleared the bar because the task happens to be due on
      // the day the row sits is the dangerous one: the +0.15 can carry a match
      // that shares two thirds of its words, and ticking that row completes
      // the wrong task. Worth showing even in the quiet report.
      const s = scoreTask({ title, date }, task)
      const weak = s.score - (s.dated ? 0.15 : 0) < ROW_MATCH.threshold
      findings.push({
        ...base,
        status: weak ? 'weak' : 'linked',
        score: Number(s.score.toFixed(2)),
        missing: s.missing,
        task: { id: task.id, title: task.title, done: Boolean(task.completed_at) },
      })
    } else {
      const near = nearest(title, date)
      findings.push({
        ...base,
        status: 'unlinked',
        near: near && near.score > 0 ? {
          title: near.task.title,
          score: Number(near.score.toFixed(2)),
          missing: near.missing,
        } : null,
      })
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ slug: doc.slug, synced_at: doc.synced_at, threshold: ROW_MATCH.threshold, findings }, null, 2))
  process.exit(0)
}

const by = (s) => findings.filter((f) => f.status === s)
const linked = [...by('linked'), ...by('weak')]
const shown = ALL ? findings : findings.filter((f) => f.status !== 'linked')

console.log(`\n${doc.title ?? doc.slug}  ·  ${findings.length} rows  ·  ${linked.length} linked`)
console.log(`threshold ${ROW_MATCH.threshold} — every meaningful word of a row's title must appear in the task's\n`)

let day = null
for (const f of shown) {
  if (f.day !== day) { day = f.day; console.log(`  ${day}`) }
  const mark =
    f.status === 'linked' ? (f.task.done ? '✓' : '·')
    : f.status === 'weak' ? '!'
    : f.status === 'unlinked' ? '✗'
    : '?'
  console.log(`    ${mark} ${f.title}`)
  if (f.status === 'linked') {
    console.log(`        → ${f.task.title}${f.task.done ? '  (done)' : ''}`)
  } else if (f.status === 'weak') {
    console.log(`        → ${f.task.title}${f.task.done ? '  (done)' : ''}`)
    console.log(`        weak: scored ${f.score}, and only cleared ${ROW_MATCH.threshold} because the task is due this day`)
    console.log(`        the row says ${f.missing.join(', ')}, the task doesn't — check this is the work you mean`)
  } else if (f.status === 'unlinked') {
    if (f.near) {
      console.log(`        closest: "${f.near.title}"  scored ${f.near.score}`)
      console.log(`        missing: ${f.near.missing.join(', ') || '(nothing — the date disagreed)'}`)
    } else {
      console.log('        no task shares a single word with this row')
    }
  } else {
    console.log(`        ${f.note}`)
  }
}

const unlinked = by('unlinked').length
const weak = by('weak').length
console.log(`\n${linked.length} linked (${weak} weak) · ${unlinked} unlinked · ${by('open-fork').length} open forks · ${by('no-date').length} dateless · ${by('too-short').length} too short`)
if (weak) {
  console.log('\nA weak link ticks through to a task you may not have meant. Tighten the')
  console.log('row title (or the task\'s) until the words agree without the date carrying it.')
}
if (unlinked) {
  console.log('\nA miss is usually one word. Either rename the task to contain the row\'s')
  console.log('words, or push commentary in the row behind an em dash — only the text')
  console.log('before the dash is matched.')
}
if (!ALL) console.log('\n(--all also lists the rows that matched.)')
