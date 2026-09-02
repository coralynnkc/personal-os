'use client'

import { STATUS_LABEL, STATUS_COLOR, daysSince, type Application } from '@/lib/jobs'
import { Panel, Empty, labelStyle, Pill } from './ui'

/**
 * Where applications go when they end.
 *
 * A Jira board can delete a closed card because the sprint report keeps the
 * history. There is no sprint here and no report, so these rows *are* the
 * record — the only thing that can answer "how many did I send this year, and
 * where did they die". Nothing here is ever cleared automatically.
 *
 * It is a list rather than a column because there is nothing to do with any of
 * it. Reopening happens from the drawer, the same as any other status change.
 */

/** Closed rows have no single date, so the ordering falls back through them. */
function closedOn(app: Application): string {
  return app.interview_on ?? app.applied_on ?? app.updated_at?.slice(0, 10) ?? ''
}

export default function Archive({
  apps, today, onOpen,
}: { apps: Application[]; today: string; onOpen: (a: Application) => void }) {
  const rows = [...apps].sort((a, b) => closedOn(b).localeCompare(closedOn(a)))

  const counts = rows.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <Panel
      title="Archive"
      right={
        <span style={labelStyle}>
          {rows.length === 0
            ? 'nothing closed yet'
            : Object.entries(counts).map(([s, n]) => `${n} ${STATUS_LABEL[s as keyof typeof STATUS_LABEL].toLowerCase()}`).join(' · ')}
        </span>
      }
    >
      {rows.length === 0 ? (
        <Empty>Nothing has closed yet. Applications you were rejected from, were ghosted by, or decided against land here and stay.</Empty>
      ) : (
        rows.map(app => {
          const applied = daysSince(app.applied_on, today)
          return (
            <div key={app.id} style={{
              display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
              padding: 'var(--s2) 0', borderTop: '1px solid var(--rule-2)',
            }}>
              <button
                onClick={() => onOpen(app)}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0,
                  padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--ash)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {app.company_name}
                {app.role_title && <span style={{ color: 'var(--slate)' }}> · {app.role_title}</span>}
              </button>

              {app.outcome && (
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12, color: 'var(--slate)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {app.outcome}
                </span>
              )}

              {applied != null && (
                <span className="mono" style={{
                  flexShrink: 0, fontSize: 11, color: 'var(--slate)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  applied {applied}d ago
                </span>
              )}

              <Pill color={STATUS_COLOR[app.status]}>{STATUS_LABEL[app.status]}</Pill>
            </div>
          )
        })
      )}
    </Panel>
  )
}
