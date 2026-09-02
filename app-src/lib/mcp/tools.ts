import { supabaseAdmin, USER_ID } from '@/lib/supabase'
import { habitDateKey, USER_TZ } from '@/lib/dateKey'
import { cadenceState, normalizeEveryDays } from '@/lib/cadence'
import { JOB_TOOLS } from './jobs'
import { dbFail, todayInUserTz, type Tool } from './shared'
import {
  Args, fail, optBoolean, optDate, optEnum, optInt, optString, optTags,
  optTimestamp, optUuid, requireInt, requireString, requireUuid, set,
} from './validate'

const TZ = USER_TZ

const URGENCIES = ['today', 'week', 'month', 'someday'] as const

// Mirrors the PATCH allow-list in app/api/tasks/[id]/route.ts.
const TASK_FIELDS = ['title', 'description', 'urgency', 'key', 'priority_score', 'points', 'tags', 'due_date', 'entity_id', 'owner', 'completed_at']

// Sleep and story points are rendered from synthetic rows in HabitTracker
// (`__sleep__` is computed from notes.sleep, `__story__` from completed task
// points) — neither exists in habit_config, so neither is loggable here.
const DERIVED_HABIT_IDS: Record<string, string> = {
  __sleep__: 'Sleep is recorded by the bedtime/waketime buttons on the dashboard, not by log_habit.',
  __story__: 'Story points are derived from the points on completed tasks, not logged directly.',
}


type ConfigHabit = {
  id: string
  name: string
  levels: { id: string; label: string }[]
  kind?: 'daily' | 'cadence'
  everyDays?: number
}

async function loadHabitConfig(): Promise<ConfigHabit[]> {
  const { data, error } = await supabaseAdmin
    .from('habit_config')
    .select('habits')
    .eq('user_id', USER_ID)
    .maybeSingle()

  if (error) dbFail('habit_config select', error)
  return data?.habits ?? []
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

const listTasks: Tool = {
  name: 'list_tasks',
  description:
    "List Cora's tasks. Defaults to open (not yet completed) tasks, ordered by priority_score then newest first. " +
    "Set effective_today to see the dashboard's Today list: every task that is key, or urgency 'today', or due on/before today " +
    'in her local timezone. effective_today ignores the urgency and key_only filters, matching the dashboard exactly.',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'done', 'all'], description: "Which tasks to include. Default 'open'." },
      urgency: { type: 'string', enum: [...URGENCIES], description: 'Only tasks with this urgency bucket.' },
      key_only: { type: 'boolean', description: 'Only tasks flagged as key.' },
      effective_today: { type: 'boolean', description: "The dashboard's Today view. Overrides urgency and key_only." },
      limit: { type: 'integer', description: 'Max rows to return, 1-500. Default 100.' },
    },
  },
  async handler(args) {
    const status = optEnum(args, 'status', ['open', 'done', 'all']) ?? 'open'
    const urgency = optEnum(args, 'urgency', URGENCIES)
    const keyOnly = optBoolean(args, 'key_only') ?? false
    const effectiveToday = optBoolean(args, 'effective_today') ?? false
    const limit = optInt(args, 'limit') ?? 100
    if (limit === null || limit < 1 || limit > 500) fail('limit must be a whole number between 1 and 500')

    let query = supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('user_id', USER_ID)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status === 'open') query = query.is('completed_at', null)
    else if (status === 'done') query = query.not('completed_at', 'is', null)

    if (effectiveToday) {
      query = query.or(`key.eq.true,urgency.eq.today,due_date.lte.${todayInUserTz()}`)
    } else {
      if (urgency) query = query.eq('urgency', urgency)
      if (keyOnly) query = query.eq('key', true)
    }

    const { data, error } = await query
    if (error) dbFail('list_tasks', error)
    return { count: data?.length ?? 0, tasks: data ?? [] }
  },
}

const createTask: Tool = {
  name: 'create_task',
  description:
    'Create a task. Only title is required; everything else falls back to the same defaults the dashboard uses ' +
    "(urgency 'someday', key false, priority_score 0, the rest empty). Use list_entities first if you want to attach entity_id.",
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What the task is. Required.' },
      description: { type: 'string', description: 'Longer detail or context.' },
      urgency: { type: 'string', enum: [...URGENCIES], description: "Urgency bucket. Default 'someday'." },
      key: { type: 'boolean', description: 'Flag as a key task, which pins it to the Today view. Default false.' },
      priority_score: { type: 'integer', description: 'Sort weight; higher sorts first. Default 0.' },
      points: { type: 'integer', description: 'Story points, counted toward the daily total when the task is completed.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Free-form tags.' },
      due_date: { type: 'string', description: 'Due date as YYYY-MM-DD.' },
      entity_id: { type: 'string', description: 'uuid of a related entity, from list_entities.' },
      owner: { type: 'string', description: 'Who owns the task, if not Cora.' },
      completed_at: { type: 'string', description: 'ISO 8601 timestamp; set only when logging something already finished.' },
    },
    required: ['title'],
  },
  async handler(args) {
    const row = {
      user_id: USER_ID,
      title: requireString(args, 'title'),
      description: optString(args, 'description') ?? null,
      urgency: optEnum(args, 'urgency', URGENCIES) ?? 'someday',
      key: optBoolean(args, 'key') ?? false,
      priority_score: optInt(args, 'priority_score') ?? 0,
      points: optInt(args, 'points') ?? null,
      tags: optTags(args, 'tags') ?? null,
      due_date: optDate(args, 'due_date') ?? null,
      entity_id: optUuid(args, 'entity_id') ?? null,
      owner: optString(args, 'owner') ?? null,
      completed_at: optTimestamp(args, 'completed_at') ?? null,
    }

    const { data, error } = await supabaseAdmin.from('tasks').insert(row).select().single()
    if (error) dbFail('create_task', error)
    return data
  },
}

const updateTask: Tool = {
  name: 'update_task',
  description:
    'Update fields on an existing task. Supply only the fields you want to change; omitted fields are left alone and ' +
    'an explicit null clears a field. Pass completed_at to complete or reopen a task, or use complete_task for the common case.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'uuid of the task, from list_tasks. Required.' },
      title: { type: 'string' },
      description: { type: 'string' },
      urgency: { type: 'string', enum: [...URGENCIES] },
      key: { type: 'boolean' },
      priority_score: { type: 'integer' },
      points: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
      due_date: { type: 'string', description: 'YYYY-MM-DD, or null to clear.' },
      entity_id: { type: 'string', description: 'uuid, or null to detach.' },
      owner: { type: 'string' },
      completed_at: { type: 'string', description: 'ISO 8601 timestamp, or null to reopen the task.' },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')

    const patch: Record<string, unknown> = {}
    const title = optString(args, 'title')
    if (title !== undefined) {
      if (title === null || title.trim() === '') fail('title must be a non-empty string')
      patch.title = title
    }
    set(patch, 'description', optString(args, 'description'))
    set(patch, 'urgency', optEnum(args, 'urgency', URGENCIES))
    set(patch, 'key', optBoolean(args, 'key'))
    set(patch, 'priority_score', optInt(args, 'priority_score'))
    set(patch, 'points', optInt(args, 'points'))
    set(patch, 'tags', optTags(args, 'tags'))
    set(patch, 'due_date', optDate(args, 'due_date'))
    set(patch, 'entity_id', optUuid(args, 'entity_id'))
    set(patch, 'owner', optString(args, 'owner'))
    set(patch, 'completed_at', optTimestamp(args, 'completed_at'))

    if (Object.keys(patch).length === 0) {
      fail(`nothing to update — supply at least one of: ${TASK_FIELDS.join(', ')}`)
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select()
      .maybeSingle()

    if (error) dbFail('update_task', error)
    if (!data) fail(`no task with id ${id}`)
    return data
  },
}

const completeTask: Tool = {
  name: 'complete_task',
  description:
    'Mark a task complete by setting its completion timestamp to now. Safe to call on a task that is already complete — ' +
    'it reports the existing completion time and changes nothing. To reopen a task, call update_task with completed_at set to null.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'uuid of the task, from list_tasks. Required.' } },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')

    const { data: existing, error: readError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, completed_at')
      .eq('id', id)
      .eq('user_id', USER_ID)
      .maybeSingle()

    if (readError) dbFail('complete_task select', readError)
    if (!existing) fail(`no task with id ${id}`)
    if (existing.completed_at) {
      return { already_complete: true, task: existing }
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select()
      .single()

    if (error) dbFail('complete_task', error)
    return { already_complete: false, task: data }
  },
}

const deleteTask: Tool = {
  name: 'delete_task',
  description:
    'Permanently delete a task. This cannot be undone — prefer complete_task for finished work, and confirm with Cora before deleting.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'uuid of the task, from list_tasks. Required.' } },
    required: ['id'],
  },
  async handler(args) {
    const id = requireUuid(args, 'id')

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', USER_ID)
      .select('id, title')
      .maybeSingle()

    if (error) dbFail('delete_task', error)
    if (!data) fail(`no task with id ${id}`)
    return { deleted: data }
  },
}

// ─── Entities ────────────────────────────────────────────────────────────────

const listEntities: Tool = {
  name: 'list_entities',
  description:
    'List entities — the projects, people and companies tasks can be grouped under. Archived entities are hidden unless ' +
    'include_archived is true. Use this to resolve a name to the entity_id that create_task and update_task expect.',
  inputSchema: {
    type: 'object',
    properties: {
      include_archived: { type: 'boolean', description: 'Include entities marked archived. Default false.' },
    },
  },
  async handler(args) {
    const includeArchived = optBoolean(args, 'include_archived') ?? false

    const { data, error } = await supabaseAdmin
      .from('entities')
      .select('id, name, kind, metadata')
      .eq('user_id', USER_ID)
      .order('name')

    if (error) dbFail('list_entities', error)
    const rows = data ?? []
    const visible = includeArchived ? rows : rows.filter(e => !e.metadata?.archived)
    return { count: visible.length, entities: visible }
  },
}

const createEntity: Tool = {
  name: 'create_entity',
  description: 'Create an entity (a project, person or company) that tasks can be attached to. Only name is required.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name. Required.' },
      kind: { type: 'string', description: "Free-form category, e.g. 'project', 'company', 'person'." },
    },
    required: ['name'],
  },
  async handler(args) {
    const { data, error } = await supabaseAdmin
      .from('entities')
      .insert({ user_id: USER_ID, name: requireString(args, 'name'), kind: optString(args, 'kind') ?? null })
      .select()
      .single()

    if (error) dbFail('create_entity', error)
    return data
  },
}

// ─── Habits ──────────────────────────────────────────────────────────────────

const getHabits: Tool = {
  name: 'get_habits',
  description:
    'List the configured habits with their ids and level labels. Call this before log_habit so you use a real habitId and a ' +
    'valid level. Levels are 1-based: level 0 means not done, level 1 is the first label, and the highest level equals the number of labels. ' +
    'Cadence habits are returned separately: they have a rhythm rather than a level, are logged with log_cadence, and carry how many ' +
    'days it has been and whether that is over their rhythm.',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const habits = await loadHabitConfig()
    const today = habitDateKey(TZ)
    const cadence = habits.filter(h => h.kind === 'cadence')
    const lastDone = cadence.length ? await loadCadenceLastDone() : {}

    return {
      timezone: TZ,
      today,
      habits: habits.filter(h => h.kind !== 'cadence').map(h => ({
        id: h.id,
        name: h.name,
        levels: (h.levels ?? []).map((l, i) => ({ level: i + 1, label: l.label })),
        max_level: (h.levels ?? []).length,
      })),
      cadence_habits: cadence.map(h => {
        const every = normalizeEveryDays(h.everyDays)
        const state = cadenceState(every, lastDone[h.id] ?? null, today)
        return {
          id: h.id,
          name: h.name,
          every_days: every,
          last_done: lastDone[h.id] ?? null,
          days_since: state.daysSince,
          status: state.status,
        }
      }),
    }
  },
}

/** habitId → most recent event date. Mirrors GET /api/habits/cadence. */
async function loadCadenceLastDone(): Promise<Record<string, string>> {
  const { data, error } = await supabaseAdmin
    .from('habit_events')
    .select('habit_id, event_date')
    .eq('user_id', USER_ID)
    .order('event_date', { ascending: false })

  if (error) dbFail('habit_events select', error)

  const last: Record<string, string> = {}
  for (const row of data ?? []) if (!last[row.habit_id]) last[row.habit_id] = row.event_date
  return last
}

const logHabit: Tool = {
  name: 'log_habit',
  description:
    "Record a habit at a level for one day. Omit date to log against Cora's current habit day, which rolls over at 4am local " +
    'time — before 4am still counts as the previous day. Level 0 clears the entry. Other keys on that day (sleep, other habits) are preserved.',
  inputSchema: {
    type: 'object',
    properties: {
      habitId: { type: 'string', description: 'Habit id from get_habits. Required.' },
      level: { type: 'integer', description: '0 for not done, up to max_level from get_habits. Required.' },
      date: { type: 'string', description: "YYYY-MM-DD. Defaults to the current habit day (4am rollover)." },
    },
    required: ['habitId', 'level'],
  },
  async handler(args) {
    const habitId = requireString(args, 'habitId')
    const level = requireInt(args, 'level')
    const date = optDate(args, 'date') ?? habitDateKey(TZ)

    if (DERIVED_HABIT_IDS[habitId]) fail(DERIVED_HABIT_IDS[habitId])

    const habits = await loadHabitConfig()
    const habit = habits.find(h => h.id === habitId)
    if (!habit) {
      const known = habits.map(h => `${h.id} (${h.name})`).join(', ') || 'none configured'
      fail(`no habit with id ${habitId}. Configured habits: ${known}`)
    }

    if (habit.kind === 'cadence') {
      fail(`'${habit.name}' is a cadence habit — it has no levels. Record it with log_cadence instead.`)
    }

    const maxLevel = (habit.levels ?? []).length
    if (level < 0 || level > maxLevel) fail(`level must be between 0 and ${maxLevel} for habit '${habit.name}'`)

    const { data: existing, error: readError } = await supabaseAdmin
      .from('daily_logs')
      .select('notes')
      .eq('user_id', USER_ID)
      .eq('log_date', date)
      .maybeSingle()

    if (readError) dbFail('log_habit select', readError)

    // Read-modify-write the whole notes blob, the way /api/habits/logs does, so
    // sibling keys (notes.sleep, other habits) survive the upsert.
    const notes = existing?.notes ?? {}
    notes.habits = { ...(notes.habits ?? {}), [habitId]: level }

    const { error } = await supabaseAdmin
      .from('daily_logs')
      .upsert(
        { user_id: USER_ID, log_date: date, notes, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,log_date' }
      )

    if (error) dbFail('log_habit', error)
    return { ok: true, date, habitId, habit: habit.name, level }
  },
}

const logCadence: Tool = {
  name: 'log_cadence',
  description:
    'Record that a cadence habit was done on a day — laundry, sheets, vacuuming, anything with a rhythm rather than a ' +
    'deadline. Omit date to record it against the current habit day (4am rollover). Doing it twice on one day counts once. ' +
    'Set undo to remove that day\'s entry. Use get_habits for the ids; daily habits go through log_habit instead.',
  inputSchema: {
    type: 'object',
    properties: {
      habitId: { type: 'string', description: 'Cadence habit id from get_habits. Required.' },
      date: { type: 'string', description: 'YYYY-MM-DD. Defaults to the current habit day (4am rollover).' },
      undo: { type: 'boolean', description: 'True to delete that day\'s entry instead of recording one.' },
    },
    required: ['habitId'],
  },
  async handler(args) {
    const habitId = requireString(args, 'habitId')
    const date = optDate(args, 'date') ?? habitDateKey(TZ)
    const undo = optBoolean(args, 'undo') ?? false

    const habits = await loadHabitConfig()
    const habit = habits.find(h => h.id === habitId)
    if (!habit) {
      const known = habits.filter(h => h.kind === 'cadence').map(h => `${h.id} (${h.name})`).join(', ') || 'none configured'
      fail(`no habit with id ${habitId}. Cadence habits: ${known}`)
    }
    if (habit.kind !== 'cadence') {
      fail(`'${habit.name}' is a daily habit — record it with log_habit and a level.`)
    }

    if (undo) {
      const { error } = await supabaseAdmin
        .from('habit_events')
        .delete()
        .eq('user_id', USER_ID)
        .eq('habit_id', habitId)
        .eq('event_date', date)
      if (error) dbFail('log_cadence delete', error)
      return { ok: true, date, habitId, habit: habit.name, undone: true }
    }

    const { error } = await supabaseAdmin
      .from('habit_events')
      .upsert(
        { user_id: USER_ID, habit_id: habitId, event_date: date },
        { onConflict: 'user_id,habit_id,event_date', ignoreDuplicates: true }
      )
    if (error) dbFail('log_cadence', error)

    const every = normalizeEveryDays(habit.everyDays)
    return { ok: true, date, habitId, habit: habit.name, every_days: every }
  },
}

const getDailyLog: Tool = {
  name: 'get_daily_log',
  description:
    'Read daily logs — habit levels and sleep for a single day, or every logged day in a range. With no arguments it returns ' +
    "the current habit day. Days with nothing logged have no row and simply won't appear in a range result.",
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'A single day as YYYY-MM-DD.' },
      start_date: { type: 'string', description: 'First day of a range, YYYY-MM-DD. Use with end_date.' },
      end_date: { type: 'string', description: 'Last day of a range, inclusive, YYYY-MM-DD.' },
    },
  },
  async handler(args) {
    const date = optDate(args, 'date')
    const startDate = optDate(args, 'start_date')
    const endDate = optDate(args, 'end_date')

    if (date && (startDate || endDate)) fail('pass either date, or start_date and end_date — not both')
    if ((startDate && !endDate) || (endDate && !startDate)) fail('start_date and end_date must be supplied together')

    const from = startDate ?? date ?? habitDateKey(TZ)
    const to = endDate ?? date ?? from
    if (to < from) fail('end_date must not be before start_date')

    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
    if (days > 366) fail('range is limited to 366 days')

    const { data, error } = await supabaseAdmin
      .from('daily_logs')
      .select('log_date, notes, mood')
      .eq('user_id', USER_ID)
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_date')

    if (error) dbFail('get_daily_log', error)
    return { start_date: from, end_date: to, timezone: TZ, logs: data ?? [] }
  },
}

export type { Tool }

export const TOOLS: Tool[] = [
  listTasks, createTask, updateTask, completeTask, deleteTask,
  listEntities, createEntity,
  getHabits, logHabit, logCadence, getDailyLog,
  ...JOB_TOOLS,
]
