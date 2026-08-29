#!/usr/bin/env node
/**
 * Sync ~/Documents/1-school/planning/ into the `documents` table.
 *
 * Production is Vercel; that directory does not exist there and won't. Reading
 * from disk at request time works locally and 404s in prod, and committing the
 * docs into the repo couples a school-notes edit to a deploy — so a local
 * script parses them and writes straight to Supabase with the service role
 * key, the same pattern as the job-search import.
 *
 * The .md files stay the source of truth. This is one-way: nothing in the app
 * ever writes back to them.
 *
 * Usage:
 *   node scripts/sync-planning-docs.mjs [--dry-run] [--dir <path>] [--verbose]
 *
 * Run the migration first: supabase/migrations/0004_documents.sql
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDoc } from './parse-planning-doc.mjs'

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
const DRY = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')
const dirIdx = args.indexOf('--dir')
const PLANNING_DIR = dirIdx >= 0
  ? resolve(args[dirIdx + 1])
  : join(homedir(), 'Documents', '1-school', 'planning')

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.USER_ID ?? 'cora'

if (!existsSync(PLANNING_DIR)) {
  console.error(`No planning directory at ${PLANNING_DIR} — pass --dir to point elsewhere.`)
  process.exit(1)
}
if (!DRY && (!url || !key)) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (checked .env.local and the environment).')
  process.exit(1)
}

/** `week_2026-08-31.md` → 2026-08-31. The filename is the only reliable anchor. */
function weekStartFromName(file) {
  const m = basename(file).match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function collect() {
  const docs = []

  const weeksDir = join(PLANNING_DIR, 'weeks')
  if (existsSync(weeksDir)) {
    for (const name of readdirSync(weeksDir).sort()) {
      if (!name.endsWith('.md')) continue
      docs.push({ path: join(weeksDir, name), kind: 'week' })
    }
  }

  for (const name of readdirSync(PLANNING_DIR).sort()) {
    if (!name.endsWith('.md')) continue
    docs.push({ path: join(PLANNING_DIR, name), kind: 'semester' })
  }

  return docs
}

const rows = []
for (const { path, kind } of collect()) {
  const raw = readFileSync(path, 'utf8')
  const weekStart = kind === 'week' ? weekStartFromName(path) : null

  if (kind === 'week' && !weekStart) {
    console.warn(`skip ${basename(path)} — no YYYY-MM-DD in the filename to anchor the week`)
    continue
  }

  let parsed
  try {
    parsed = parseDoc(raw, { weekStart, kind })
  } catch (err) {
    // A parse failure must never cost the document: store it with no structure
    // and the tab falls back to rendering it as prose.
    console.warn(`parse failed for ${basename(path)} (${err.message}) — syncing raw only`)
    parsed = { title: null, frontmatter: {}, parsed: { intro: null, days: [], sections: [], deadlines: [] } }
  }

  rows.push({
    user_id: USER_ID,
    slug: parsed.frontmatter?.id || basename(path, '.md'),
    kind,
    title: parsed.title,
    week_start: weekStart,
    body: raw,
    frontmatter: parsed.frontmatter,
    parsed: parsed.parsed,
    // Under the home directory rather than absolute, so the value is portable
    // and doesn't leak a username into the database.
    source_path: path.replace(homedir(), '~'),
    synced_at: new Date().toISOString(),
  })

  const p = parsed.parsed
  console.log(
    `${basename(path)} → ${kind}` +
    (kind === 'week' ? ` · ${p.days.length} days · ${p.days.reduce((n, d) => n + d.rows.length, 0)} rows · ${p.deadlines.length} deadlines` : '') +
    ` · ${p.sections.length} sections`,
  )
  if (VERBOSE && kind === 'week') {
    for (const d of p.days) {
      console.log(`   ${d.heading}  [${d.dates.join(' → ')}]`)
      for (const r of d.rows) {
        const when = r.kind === 'timed' ? `${r.start}–${r.end}` : r.kind === 'duration' ? `${r.durationMin}m` : '—'
        console.log(`     ${when.padEnd(12)} ${r.rawWhat.slice(0, 64)}`)
      }
    }
    for (const d of p.deadlines) console.log(`   ⚑ ${d.date}${d.time ? ' ' + d.time : ''}  ${d.title}`)
  }
}

if (!rows.length) {
  console.error('Nothing to sync.')
  process.exit(1)
}

if (DRY) {
  console.log(`\n--dry-run: would upsert ${rows.length} document(s) as user_id=${USER_ID}.`)
  process.exit(0)
}

const db = createClient(url, key)
const { error } = await db.from('documents').upsert(rows, { onConflict: 'user_id,slug' })

if (error) {
  console.error('documents upsert error:', error.message)
  process.exit(1)
}

console.log(`\nSynced ${rows.length} document(s) as user_id=${USER_ID}.`)
