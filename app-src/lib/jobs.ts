// Shared job-search domain constants. Imported by the API routes, the /jobs
// tab, and the one-time import script, so the status vocabulary lives in
// exactly one place and matches the CHECK constraint in 0002_job_search.sql.

export const STATUSES = [
  'researching', 'not_open', 'open', 'applied',
  'oa', 'phone', 'onsite', 'offer', 'rejected', 'ghosted', 'no_roles', 'passed',
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
  passed:      "Don't want to apply",
}

// Left-to-right order of the kanban columns: research → live → in flight → done.
export const PIPELINE_ORDER: Status[] = [
  'researching', 'not_open', 'open', 'applied', 'oa', 'phone', 'onsite', 'offer',
]

// Terminal states — collapsed into a single "Closed" column so eight live
// columns don't compete with four dead ones for horizontal space. `passed` is
// the one you close yourself: you read the role and decided against it.
export const CLOSED_STATUSES: Status[] = ['rejected', 'ghosted', 'no_roles', 'passed']

/**
 * A closed application leaves the board entirely for the Archive, rather than
 * sitting in a graveyard column taking up a ninth of the width to show you
 * nothing you can act on. It is never deleted: there is no sprint here and no
 * sprint report, so these rows *are* the record of the search — the only thing
 * that can answer "how many did I send, and where did they die".
 */
export function isClosed(status: Status): boolean {
  return CLOSED_STATUSES.includes(status)
}

/**
 * A status is not a deadline, and colour in this app only ever means time —
 * so the ladder is read in weight, not hue. The one exception is an offer:
 * there is exactly one accent, and if anything on this board earns it, it is
 * the row you were doing all of this for — which gets rose, the mark this
 * app uses for the things that are yours rather than merely scheduled.
 */
export const STATUS_COLOR: Record<Status, string> = {
  researching: 'var(--slate)',
  not_open:    'var(--slate)',
  open:        'var(--ash)',
  applied:     'var(--ash)',
  oa:          'var(--ash)',
  phone:       'var(--ash)',
  onsite:      'var(--ivory)',
  offer:       'var(--rose)',
  rejected:    'var(--slate)',
  ghosted:     'var(--slate)',
  no_roles:    'var(--slate)',
  passed:      'var(--slate)',
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

/**
 * Portal and careers URLs are typed by hand, so plenty of them arrive without a
 * scheme ("careers.united.com"). A bare href like that is a *relative* path to
 * the browser, so the click lands on /careers.united.com on our own origin.
 * Everything that renders a stored URL as a link goes through this.
 */
export function toHref(url: string): string {
  const trimmed = url.trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('mailto:')
    ? trimmed
    : `https://${trimmed}`
}
