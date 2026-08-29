#!/usr/bin/env node
/**
 * Stage 2 of the one-time job_search_2027.xlsx import.
 *
 * Reads the JSON produced by parse-job-search-xlsx.py and writes it straight to
 * Supabase with the service role key — no API round trip, same pattern as the
 * earlier bulk task writes.
 *
 * Idempotent. Companies are matched on (user_id, lower(name), kind='company')
 * and applications on (user_id, lower(company_name), wave), so re-running after
 * fixing a row in the JSON updates rather than duplicates.
 *
 * Usage:
 *   node scripts/import-job-search.mjs [--dry-run] [--in scripts/job-search-import.json]
 *
 * Run the migration first: supabase/migrations/0002_job_search.sql
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// A standalone node script doesn't get Next.js's .env.local loading.
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const value = m[2].replace(/^["']|["']$/g, '')
      process.env[m[1]] ??= value
    }
  } catch {
    // Fall through to whatever is already in the environment.
  }
}

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const inIdx = args.indexOf('--in')
const IN_FILE = inIdx >= 0 ? args[inIdx + 1] : resolve(HERE, 'job-search-import.json')

loadEnv()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID = process.env.USER_ID ?? 'cora'

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (checked .env.local and the environment).')
  process.exit(1)
}

const db = createClient(url, key)

let payload
try {
  payload = JSON.parse(readFileSync(IN_FILE, 'utf8'))
} catch (e) {
  console.error(`Could not read ${IN_FILE}: ${e.message}`)
  console.error('Run `python3 scripts/parse-job-search-xlsx.py` first.')
  process.exit(1)
}

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function die(label, error) {
  console.error(`\n${label} failed: ${error.message}`)
  if (error.message?.includes('applications')) {
    console.error('Has supabase/migrations/0002_job_search.sql been run?')
  }
  process.exit(1)
}

console.log(`${DRY ? '[dry run] ' : ''}Importing ${IN_FILE}`)
console.log(`  target: ${url}  user_id: ${USER_ID}\n`)

// ── Companies → entities(kind = 'company') ────────────────────────────────
const { data: existingEntities, error: entReadErr } = await db
  .from('entities')
  .select('id, name, kind, metadata')
  .eq('user_id', USER_ID)
  .eq('kind', 'company')

if (entReadErr) die('Reading entities', entReadErr)

const entityByName = new Map((existingEntities ?? []).map(e => [norm(e.name), e]))
const entityIds = new Map()
let entInserted = 0
let entUpdated = 0

for (const c of payload.companies) {
  const existing = entityByName.get(norm(c.name))

  if (existing) {
    entityIds.set(norm(c.name), existing.id)
    // Merge so anything edited in the app survives a re-import.
    const metadata = { ...(existing.metadata ?? {}), ...c.metadata }
    if (!DRY) {
      const { error } = await db.from('entities').update({ metadata }).eq('id', existing.id).eq('user_id', USER_ID)
      if (error) die(`Updating entity ${c.name}`, error)
    }
    entUpdated++
    continue
  }

  if (DRY) {
    entInserted++
    continue
  }

  const { data, error } = await db
    .from('entities')
    .insert({ user_id: USER_ID, name: c.name, kind: 'company', metadata: c.metadata })
    .select('id')
    .single()
  if (error) die(`Inserting entity ${c.name}`, error)
  entityIds.set(norm(c.name), data.id)
  entInserted++
}

console.log(`Companies → entities: ${entInserted} inserted, ${entUpdated} updated`)

// ── Applications ──────────────────────────────────────────────────────────
const { data: existingApps, error: appReadErr } = await db
  .from('applications')
  .select('id, company_name, wave')
  .eq('user_id', USER_ID)

if (appReadErr) die('Reading applications', appReadErr)

const appKey = (company, wave) => `${norm(company)}::${wave ?? ''}`
const appByKey = new Map((existingApps ?? []).map(a => [appKey(a.company_name, a.wave), a]))

let appInserted = 0
let appUpdated = 0
const unlinked = []

for (const a of payload.applications) {
  const entityId = a.entity_name ? entityIds.get(norm(a.entity_name)) ?? null : null
  if (!entityId) unlinked.push(a.company_name)

  const row = {
    user_id: USER_ID,
    entity_id: entityId,
    company_name: a.company_name,
    role_title: a.role_title ?? null,
    wave: a.wave ?? null,
    status: a.status,
    portal_url: a.portal_url ?? null,
    portal_last_checked: a.portal_last_checked ?? null,
    applied_on: a.applied_on ?? null,
    interview_on: a.interview_on ?? null,
    outcome: a.outcome ?? null,
    // Keep the original Status prose. The enum is the machine-readable half;
    // the sentence it came from often carries the actual detail
    // ("portal nav broken", "reach out to Liz Hustedt anyway").
    notes: [a.notes, a.status_source && `From spreadsheet: ${a.status_source}`]
      .filter(Boolean).join('\n') || null,
  }

  const existing = appByKey.get(appKey(a.company_name, a.wave))

  if (DRY) {
    existing ? appUpdated++ : appInserted++
    continue
  }

  if (existing) {
    const { error } = await db.from('applications').update(row).eq('id', existing.id).eq('user_id', USER_ID)
    if (error) die(`Updating application ${a.company_name}`, error)
    appUpdated++
  } else {
    const { error } = await db.from('applications').insert(row)
    if (error) die(`Inserting application ${a.company_name}`, error)
    appInserted++
  }
}

console.log(`Applications:         ${appInserted} inserted, ${appUpdated} updated`)

if (unlinked.length) {
  console.log(`\n${unlinked.length} application(s) have no linked company entity:`)
  for (const name of unlinked) console.log(`  - ${name}`)
  console.log('These import fine — open the drawer on /jobs to link or fill them in by hand.')
}

console.log(DRY
  ? '\n[dry run] Nothing was written. Re-run without --dry-run to apply.'
  : '\nDone. Open /jobs.\n\nKeep job_search_2027.xlsx as a backup until the tab has had a couple of weeks of real use.')
