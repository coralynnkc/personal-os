// MCP tools for the /jobs tab: the application pipeline, the research library
// behind the Targets view, and the daily note.
//
// These mirror /api/applications rather than reimplementing them — same
// writable columns, same duplicate handling, same applied_on stamp, same story
// point for a submitted application — so a change made through Claude is
// indistinguishable from one made in the UI.

import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import {
  STATUSES, WAVES, STALE_AFTER_DAYS, RESEARCH_FIELDS,
  daysSince, isStale, type Application,
} from '@/lib/jobs'
import { creditApplication } from '@/lib/applicationCredit'
import { buildBriefing } from '@/lib/briefing'
import { dbFail, todayInUserTz, type Tool } from './shared'
import {
  fail, optBoolean, optDate, optEnum, optInt, optString, optUuid,
  requireString, requireUuid, set,
} from './validate'

// Mirrors the WRITABLE/ALLOWED lists in the applications routes.
const APP_FIELDS = [
  'entity_id', 'company_name', 'role_title', 'wave', 'status',
  'portal_url', 'portal_last_checked', 'applied_on', 'interview_on',
  'outcome', 'notes',
]

// Every read pulls the linked company entity, the same join the pipeline drawer
// uses, so the research Cora already did travels with the row.
const APP_SELECT = '*, entity:entities(id, name, kind, metadata)'

const WAVE_HINT = `Free-form, but the board groups by the usual set: ${WAVES.join(', ')}.`

/** Trim the joined entity down to its research metadata, or drop it entirely. */
function shapeApp(app: Application, today: string, verbose: boolean) {
  const { entity, ...rest } = app
  return {
    ...rest,
    days_since_portal_check: daysSince(app.portal_last_checked, today),
    days_since_applied: daysSince(app.applied_on, today),
    stale: isStale(app, today),
    ...(verbose && entity ? { research: entity.metadata ?? {} } : {}),
    company_entity: entity ? { id: entity.id, name: entity.name } : null,
  }
}

const listApplications: Tool = {
  name: 'list_applications',
  description:
    "List the job applications on Cora's pipeline board, newest-updated first. Every row carries days_since_portal_check, " +
    `days_since_applied, and stale — true when a researching/not_open/open row has gone ${STALE_AFTER_DAYS}+ days ` +
    'without a portal check, or has never been checked at all. Set include_research to also return the company research ' +
    'from the Targets library; it is verbose, so leave it off unless you need it.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: [...STATUSES], description: 'Only rows in this pipeline status.' },
      wave: { type: 'string', description: `Only rows in this wave. ${WAVE_HINT}` },
      search: { type: 'string', description: 'Case-insensitive substring match on company name or role title.' },
      stale_only: { type: 'boolean', description: 'Only rows in the stale-portal queue. Default false.' },
      include_research: { type: 'boolean', description: "Include the linked company's research fields. Default false." },
      limit: { type: 'integer', description: 'Max rows to return, 1-500. Default 200.' },
    },
  },
  async handler(args) {
    const status = optEnum(args, 'status', STATUSES)
    const wave = optString(args, 'wave')
    const search = optString(args, 'search')
    const staleOnly = optBoolean(args, 'stale_only') ?? false
    const verbose = optBoolean(args, 'include_research') ?? false
    const limit = optInt(args, 'limit') ?? 200
    if (limit === null || limit < 1 || limit > 500) fail('limit must be a whole number between 1 and 500')

    let query = supabaseAdmin
      .from('applications')
      .select(APP_SELECT)
      .eq('user_id', USER_ID)
      .order('updated_at', { ascending: false })

    // Staleness is computed here rather than in SQL, so the limit has to come
    // after the filter — limiting first would return three *rows* and then
    // report however few of them happened to be stale.
    if (!staleOnly) query = query.limit(limit)

    if (status) query = query.eq('status', status)
    if (wave) query = query.eq('wave', wave)
    if (search) {
      // Commas separate the branches of an .or(), so one in the needle would
      // be read as a second filter rather than as text.
      const needle = search.replace(/[,%]/g, ' ').trim()
      if (needle) query = query.or(`company_name.ilike.%${needle}%,role_title.ilike.%${needle}%`)
    }

    const { data, error } = await query
    if (error) dbFail('list_applications', error)

    const today = todayInUserTz()
    const rows = (data ?? []) as unknown as Application[]
    let shaped = rows.map(a => shapeApp(a, today, verbose))
    if (staleOnly) shaped = shaped.filter(a => a.stale).slice(0, limit)

    return { count: shaped.length, today, applications: shaped }
  },
}

const createApplication: Tool = {
  name: 'create_application',
  description:
    "Add a company to the pipeline board. Only company_name is required; status defaults to 'researching'. " +
    'Pass entity_id from list_job_targets when the company is already in the research library, so the research links through. ' +
    'One company can only be tracked once per wave — a second attempt with the same wave is rejected rather than duplicated. ' +
    'A row created in a submitted status earns its story point straight away.',
  inputSchema: {
    type: 'object',
    properties: {
      company_name: { type: 'string', description: 'Company name. Required.' },
      role_title: { type: 'string', description: 'The role being applied for.' },
      wave: { type: 'string', description: WAVE_HINT },
      status: { type: 'string', enum: [...STATUSES], description: "Pipeline status. Default 'researching'." },
      entity_id: { type: 'string', description: 'uuid of the company entity, from list_job_targets.' },
      portal_url: { type: 'string', description: 'Application portal or careers page.' },
      portal_last_checked: { type: 'string', description: 'YYYY-MM-DD the portal was last checked.' },
      applied_on: { type: 'string', description: 'YYYY-MM-DD the application went in.' },
      interview_on: { type: 'string', description: 'YYYY-MM-DD of the next interview.' },
      outcome: { type: 'string', description: 'How it ended, for closed rows.' },
      notes: { type: 'string', description: 'Free-form notes.' },
    },
    required: ['company_name'],
  },
  async handler(args) {
    const row: Record<string, unknown> = {
      user_id: USER_ID,
      company_name: requireString(args, 'company_name').trim(),
      status: optEnum(args, 'status', STATUSES) ?? 'researching',
    }
    set(row, 'role_title', optString(args, 'role_title'))
    set(row, 'wave', optString(args, 'wave'))
    set(row, 'entity_id', optUuid(args, 'entity_id'))
    set(row, 'portal_url', optString(args, 'portal_url'))
    set(row, 'portal_last_checked', optDate(args, 'portal_last_checked'))
    set(row, 'applied_on', optDate(args, 'applied_on'))
    set(row, 'interview_on', optDate(args, 'interview_on'))
    set(row, 'outcome', optString(args, 'outcome'))
    set(row, 'notes', optString(args, 'notes'))

    const { data, error } = await supabaseAdmin
      .from('applications')
      .insert(row)
      .select(APP_SELECT)
      .single()

    if (error) {
      if (error.code === '23505') fail('already tracking this company for that wave — update that row instead')
      dbFail('create_application', error)
    }
    const today = todayInUserTz()
    await creditApplication(data as unknown as Application, today)
    return shapeApp(data as unknown as Application, today, false)
  },
}

const updateApplication: Tool = {
  name: 'update_application',
  description:
    'Update fields on a pipeline row — most often status, as a company moves from applied to OA to onsite. Supply only ' +
    "the fields you want to change; an explicit null clears one. Moving a row to 'applied' with no applied_on stamps " +
    'today, matching what the board does, and books the one story point an application is worth. That point is paid at ' +
    'most once per application, so moving a row on through OA and onsite does not pay again — never create a task by ' +
    'hand to record that Cora applied to something.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'uuid of the application, from list_applications. Required.' },
      company_name: { type: 'string' },
      role_title: { type: 'string' },
      wave: { type: 'string', description: WAVE_HINT },
      status: { type: 'string', enum: [...STATUSES] },
      entity_id: { type: 'string', description: 'uuid, or null to detach the research entity.' },
      portal_url: { type: 'string' },
      portal_last_checked: { type: 'string', description: 'YYYY-MM-DD, or null to clear.' },
      applied_on: { type: 'string', description: 'YYYY-MM-DD, or null to clear.' },
      interview_on: { type: 'string', description: 'YYYY-MM-DD, or null to clear.' },
      outcome: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')

    const patch: Record<string, unknown> = {}
    const name = optString(args, 'company_name')
    if (name !== undefined) {
      if (name === null || name.trim() === '') fail('company_name must be a non-empty string')
      patch.company_name = name.trim()
    }
    set(patch, 'role_title', optString(args, 'role_title'))
    set(patch, 'wave', optString(args, 'wave'))
    set(patch, 'status', optEnum(args, 'status', STATUSES))
    set(patch, 'entity_id', optUuid(args, 'entity_id'))
    set(patch, 'portal_url', optString(args, 'portal_url'))
    set(patch, 'portal_last_checked', optDate(args, 'portal_last_checked'))
    set(patch, 'applied_on', optDate(args, 'applied_on'))
    set(patch, 'interview_on', optDate(args, 'interview_on'))
    set(patch, 'outcome', optString(args, 'outcome'))
    set(patch, 'notes', optString(args, 'notes'))

    if (Object.keys(patch).length === 0) {
      fail(`nothing to update — supply at least one of: ${APP_FIELDS.join(', ')}`)
    }

    // Same stamp as PATCH /api/applications/[id]: a card moved to applied
    // without a date would otherwise render days-since-applied as an empty cell.
    if (patch.status === 'applied' && !('applied_on' in patch)) {
      const { data: existing } = await supabaseAdmin
        .from('applications')
        .select('applied_on')
        .eq('id', id)
        .eq('user_id', USER_ID)
        .maybeSingle()
      if (!existing?.applied_on) patch.applied_on = todayInUserTz()
    }

    const { data, error } = await supabaseAdmin
      .from('applications')
      .update(patch)
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select(APP_SELECT)
      .maybeSingle()

    if (error) dbFail('update_application', error)
    if (!data) fail(`no application with id ${id}`)
    const now = todayInUserTz()
    await creditApplication(data as unknown as Application, now)
    return shapeApp(data as unknown as Application, now, false)
  },
}

const logPortalCheck: Tool = {
  name: 'log_portal_check',
  description:
    'Record that a portal was checked today, which is what clears a row out of the stale queue. Pass status too when the ' +
    'check found something — a portal that has opened, or a posting that is gone. Use list_applications with stale_only ' +
    'to find the rows waiting on this.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'uuid of the application, from list_applications. Required.' },
      date: { type: 'string', description: "YYYY-MM-DD the portal was checked. Defaults to today in Cora's timezone." },
      status: { type: 'string', enum: [...STATUSES], description: 'New status, if the check changed anything.' },
      notes: { type: 'string', description: 'Replaces the row\'s notes.' },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')
    const patch: Record<string, unknown> = { portal_last_checked: optDate(args, 'date') ?? todayInUserTz() }
    set(patch, 'status', optEnum(args, 'status', STATUSES))
    set(patch, 'notes', optString(args, 'notes'))

    if (patch.status === 'applied') patch.applied_on ??= todayInUserTz()

    const { data, error } = await supabaseAdmin
      .from('applications')
      .update(patch)
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select(APP_SELECT)
      .maybeSingle()

    if (error) dbFail('log_portal_check', error)
    if (!data) fail(`no application with id ${id}`)
    const now = todayInUserTz()
    await creditApplication(data as unknown as Application, now)
    return shapeApp(data as unknown as Application, now, false)
  },
}

const deleteApplication: Tool = {
  name: 'delete_application',
  description:
    'Permanently remove a row from the pipeline board. This cannot be undone, and it loses the whole history of that ' +
    "application — for something that ended, prefer update_application with status 'rejected', 'ghosted' or 'no_roles'. " +
    'Confirm with Cora before deleting.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'uuid of the application, from list_applications. Required.' } },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')

    const { data, error } = await supabaseAdmin
      .from('applications')
      .delete()
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select('id, company_name, role_title, wave, status')
      .maybeSingle()

    if (error) dbFail('delete_application', error)
    if (!data) fail(`no application with id ${id}`)
    return { deleted: data }
  },
}

const listJobTargets: Tool = {
  name: 'list_job_targets',
  description:
    'Search the company research library behind the Targets view — the companies Cora researched, with position title, ' +
    'industry, deadlines, interview format, salary band and the rest. Each row says whether it is already tracked on the ' +
    'pipeline board; pass an untracked one to create_application as entity_id to promote it, research and all.',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Case-insensitive substring match on company name, position title or industry.' },
      industry: { type: 'string', description: 'Exact match on the industry / sector field.' },
      role_category: { type: 'string', description: 'Exact match on the role category field.' },
      tracked: { type: 'boolean', description: 'True for only companies already on the board, false for only untracked ones.' },
      fields_only: { type: 'boolean', description: 'Return just names and ids, without the research fields. Default false.' },
      limit: { type: 'integer', description: 'Max rows to return, 1-200. Default 50.' },
    },
  },
  async handler(args) {
    const search = (optString(args, 'search') ?? '').trim().toLowerCase()
    const industry = optString(args, 'industry')
    const roleCategory = optString(args, 'role_category')
    const tracked = optBoolean(args, 'tracked')
    const namesOnly = optBoolean(args, 'fields_only') ?? false
    const limit = optInt(args, 'limit') ?? 50
    if (limit === null || limit < 1 || limit > 200) fail('limit must be a whole number between 1 and 200')

    const [{ data: entities, error }, { data: apps, error: appError }] = await Promise.all([
      supabaseAdmin
        .from('entities')
        .select('id, name, kind, metadata')
        .eq('user_id', USER_ID)
        .eq('kind', 'company')
        .order('name'),
      supabaseAdmin
        .from('applications')
        .select('entity_id, status, wave')
        .eq('user_id', USER_ID),
    ])
    if (error) dbFail('list_job_targets', error)
    if (appError) dbFail('list_job_targets applications', appError)

    const onBoard = new Map<string, { status: string; wave: string | null }>()
    for (const a of apps ?? []) if (a.entity_id) onBoard.set(a.entity_id, { status: a.status, wave: a.wave })

    const field = (meta: Record<string, unknown> | null, key: string) => {
      const v = meta?.[key]
      return v == null ? '' : String(v)
    }

    const rows = (entities ?? [])
      .filter(e => {
        const meta = e.metadata as Record<string, unknown> | null
        if (industry && field(meta, 'industry') !== industry) return false
        if (roleCategory && field(meta, 'role_category') !== roleCategory) return false
        if (tracked !== undefined && onBoard.has(e.id) !== tracked) return false
        if (!search) return true
        return [e.name, field(meta, 'position_title'), field(meta, 'industry')]
          .some(v => v.toLowerCase().includes(search))
      })
      .slice(0, limit)
      .map(e => {
        const meta = e.metadata as Record<string, unknown> | null
        const application = onBoard.get(e.id) ?? null
        if (namesOnly) return { id: e.id, name: e.name, tracked: application !== null, application }
        const research: Record<string, string> = {}
        for (const f of RESEARCH_FIELDS) {
          const v = field(meta, f.key)
          if (v) research[f.key] = v
        }
        return { id: e.id, name: e.name, tracked: application !== null, application, research }
      })

    return { count: rows.length, targets: rows }
  },
}


const getJobBriefing: Tool = {
  name: 'get_job_briefing',
  description:
    "The day's job search in one call — what is confirmed open and not applied to yet, what has gone quiet long enough to " +
    'be worth chasing, and which interviews fall in the next fortnight. All of it derived from the pipeline, so it is the ' +
    'same thing the Notes view shows. Start here when Cora asks what she should be doing about the job search today, ' +
    'rather than listing every application and working it out.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: "YYYY-MM-DD to reckon from. Defaults to today in Cora's timezone." },
    },
  },
  async handler(args) {
    const today = optDate(args, 'date') ?? todayInUserTz()

    const { data, error } = await supabaseAdmin
      .from('applications')
      .select(APP_SELECT)
      .eq('user_id', USER_ID)
    if (error) dbFail('get_job_briefing', error)

    const brief = buildBriefing((data ?? []) as unknown as Application[], today)
    const line = (i: { app: Application; detail: string }) => ({
      id: i.app.id,
      company_name: i.app.company_name,
      role_title: i.app.role_title,
      status: i.app.status,
      portal_url: i.app.portal_url,
      why: i.detail,
    })

    return {
      date: today,
      open_not_applied: brief.open.map(line),
      worth_chasing: brief.followUp.map(line),
      coming_up: brief.upcoming.map(line),
    }
  },
}

const getJobNote: Tool = {
  name: 'get_job_note',
  description:
    "Read Cora's free-text job-search note for a day — the half of the Notes view that is not derived from the pipeline: " +
    'what she wants to learn next, what a recruiter said, which posting to watch for. Pass days to read the recent ones ' +
    'instead, newest first; days with nothing written simply have no row.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: "YYYY-MM-DD. Defaults to today in Cora's timezone." },
      days: { type: 'integer', description: 'Instead of one day, the notes from the last N days, 1-90.' },
    },
  },
  async handler(args) {
    const days = optInt(args, 'days')

    if (days != null) {
      if (days < 1 || days > 90) fail('days must be a whole number between 1 and 90')
      const from = new Date()
      from.setUTCDate(from.getUTCDate() - days)

      const { data, error } = await supabaseAdmin
        .from('job_notes')
        .select('note_date, body, updated_at')
        .eq('user_id', USER_ID)
        .gte('note_date', from.toISOString().slice(0, 10))
        .order('note_date', { ascending: false })
      if (error) dbFail('get_job_note', error)
      return { count: (data ?? []).length, notes: data ?? [] }
    }

    const date = optDate(args, 'date') ?? todayInUserTz()
    const { data, error } = await supabaseAdmin
      .from('job_notes')
      .select('note_date, body, updated_at')
      .eq('user_id', USER_ID)
      .eq('note_date', date)
      .maybeSingle()
    if (error) dbFail('get_job_note', error)

    // A day with nothing written is a blank page, not a missing one.
    return data ?? { note_date: date, body: '', updated_at: null }
  },
}

const writeJobNote: Tool = {
  name: 'write_job_note',
  description:
    "Write Cora's job-search note for a day. This is her page, not a log to dump into: read it with get_job_note first and " +
    'send back the whole body you want the day to end up with, since the write replaces it rather than appending. Use ' +
    'append instead when you only want to add a line under what is already there. An empty body clears the day.',
  inputSchema: {
    type: 'object',
    properties: {
      body: { type: 'string', description: 'The note text. Required. Replaces the day unless append is true.' },
      date: { type: 'string', description: "YYYY-MM-DD. Defaults to today in Cora's timezone." },
      append: { type: 'boolean', description: "Add this to the end of the day's note instead of replacing it. Default false." },
    },
    required: ['body'],
  },
  async handler(args) {
    const date = optDate(args, 'date') ?? todayInUserTz()
    const incoming = requireString(args, 'body')
    const append = optBoolean(args, 'append') ?? false
    if (incoming.length > 20_000) fail('body must be at most 20000 characters')

    let body = incoming
    if (append) {
      const { data, error } = await supabaseAdmin
        .from('job_notes')
        .select('body')
        .eq('user_id', USER_ID)
        .eq('note_date', date)
        .maybeSingle()
      if (error) dbFail('write_job_note', error)
      const existing = data?.body ?? ''
      body = existing.trim() ? `${existing.replace(/\s+$/, '')}\n\n${incoming}` : incoming
    }

    if (!body.trim()) {
      const { error } = await supabaseAdmin
        .from('job_notes')
        .delete()
        .eq('user_id', USER_ID)
        .eq('note_date', date)
      if (error) dbFail('write_job_note', error)
      return { note_date: date, body: '', cleared: true }
    }

    const { data, error } = await supabaseAdmin
      .from('job_notes')
      .upsert({ user_id: USER_ID, note_date: date, body }, { onConflict: 'user_id,note_date' })
      .select('note_date, body, updated_at')
      .single()
    if (error) dbFail('write_job_note', error)
    return data
  },
}

export const JOB_TOOLS: Tool[] = [
  listApplications, createApplication, updateApplication, logPortalCheck, deleteApplication,
  listJobTargets, getJobBriefing, getJobNote, writeJobNote,
]
