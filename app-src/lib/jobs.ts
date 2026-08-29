// Shared job-search domain constants. Imported by the API routes, the /jobs
// tab, and the one-time import script, so the status vocabulary lives in
// exactly one place and matches the CHECK constraint in 0002_job_search.sql.

export const STATUSES = [
  'researching', 'not_open', 'open', 'applied',
  'oa', 'phone', 'onsite', 'offer', 'rejected', 'ghosted', 'no_roles',
] as const

export type Status = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<Status, string> = {
  researching: 'Researching',
  not_open:    'Not open',
  open:        'Open',
  applied:     'Applied',
  oa:          'OA',
  phone:       'Phone',
  onsite:      'Onsite',
  offer:       'Offer',
  rejected:    'Rejected',
  ghosted:     'Ghosted',
  no_roles:    'No roles',
}

// Left-to-right order of the kanban columns: research → live → in flight → done.
export const PIPELINE_ORDER: Status[] = [
  'researching', 'not_open', 'open', 'applied', 'oa', 'phone', 'onsite', 'offer',
]

// Terminal states — collapsed into a single "Closed" column so eight live
// columns don't compete with three dead ones for horizontal space.
export const CLOSED_STATUSES: Status[] = ['rejected', 'ghosted', 'no_roles']

export const STATUS_COLOR: Record<Status, string> = {
  researching: 'var(--ink-4)',
  not_open:    'var(--ink-4)',
  open:        'var(--warn)',
  applied:     'var(--accent)',
  oa:          'oklch(0.72 0.16 180)',
  phone:       'oklch(0.72 0.18 300)',
  onsite:      'oklch(0.78 0.17 45)',
  offer:       'var(--ok)',
  rejected:    'var(--danger)',
  ghosted:     'var(--ink-3)',
  no_roles:    'var(--ink-3)',
}

export const WAVES = ['Wave 1', 'Wave 2', 'Wave 3', 'Rolling', 'GitHub'] as const

// A portal unchecked for longer than this lands in the stale strip.
export const STALE_AFTER_DAYS = 14

// Statuses where "have I re-checked the portal lately?" is a live question.
// Once you've applied or been rejected, staleness stops mattering.
const WATCHED: Status[] = ['researching', 'not_open', 'open']

export type Application = {
  id: string
  entity_id: string | null
  company_name: string
  role_title: string | null
  wave: string | null
  status: Status
  portal_url: string | null
  portal_last_checked: string | null
  applied_on: string | null
  interview_on: string | null
  outcome: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  entity?: CompanyEntity | null
}

export type CompanyEntity = {
  id: string
  name: string
  kind: string | null
  metadata: Record<string, unknown> | null
}

/** Whole days between a YYYY-MM-DD date and a YYYY-MM-DD "today". */
export function daysSince(dateStr: string | null, today: string): number | null {
  if (!dateStr) return null
  const then = Date.parse(`${dateStr}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(then) || Number.isNaN(now)) return null
  return Math.round((now - then) / 86_400_000)
}

/**
 * A portal is stale when it's in a watched status and either has never been
 * checked or was last checked more than STALE_AFTER_DAYS ago. Never-checked
 * counts as stale — that's the case the spreadsheet was silently hiding.
 */
export function isStale(app: Application, today: string, threshold = STALE_AFTER_DAYS): boolean {
  if (!WATCHED.includes(app.status)) return false
  const d = daysSince(app.portal_last_checked, today)
  return d === null || d >= threshold
}

// The 16 research columns from sheet 1, as stored in entities.metadata.
// Order here is the order they render in the drawer.
export const RESEARCH_FIELDS: { key: string; label: string }[] = [
  { key: 'position_title',      label: 'Position title' },
  { key: 'company_raw',         label: 'Company / type' },
  { key: 'application_opens',   label: 'Application opens' },
  { key: 'typical_deadline',    label: 'Typical deadline' },
  { key: 'competitiveness',     label: 'Competitiveness' },
  { key: 'industry',            label: 'Industry / sector' },
  { key: 'role_category',       label: 'Role category' },
  { key: 'what_youd_do',        label: "What you'd do" },
  { key: 'technical_skills',    label: 'Key technical skills' },
  { key: 'non_technical_skills',label: 'Key non-technical skills' },
  { key: 'salary',              label: 'Est. base salary (new grad)' },
  { key: 'interview_format',    label: 'Interview format' },
  { key: 'why_it_fits',         label: 'Why it fits your background' },
  { key: 'notes',               label: 'Notes / watch out for' },
  { key: 'apply_url',           label: 'Where to apply' },
  { key: 'portal_last_checked', label: 'Portal last checked' },
]
