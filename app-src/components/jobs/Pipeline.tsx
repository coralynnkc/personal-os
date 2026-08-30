'use client'

import {
  PIPELINE_ORDER, CLOSED_STATUSES, STATUS_LABEL, STATUS_COLOR, STATUSES,
  daysSince, isStale, type Application, type Status,
} from '@/lib/jobs'
import { cardStyle, labelStyle, Empty, Pill } from './ui'

function Card({ app, today, onOpen }: { app: Application; today: string; onOpen: () => void }) {
  const sinceApplied = daysSince(app.applied_on, today)
  const stale = isStale(app, today)

  return (
    // An entry, not a card: two lines and a hairline. Staleness is the one
    // thing here that is about time, so it is the one thing with a colour.
    <button
      onClick={onOpen}
      className="hoverable"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 'var(--s2) 0', borderRadius: 0,
        background: 'transparent', border: 0,
        borderBottom: '1px solid var(--rule-2)',
      }}
    >
      <span style={{ fontSize: 14, letterSpacing: '0.02em', color: 'var(--ivory)', lineHeight: 1.3 }}>{app.company_name}</span>
      {app.role_title && (
        <span style={{ fontSize: 12, color: 'var(--slate)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {app.role_title}
        </span>
      )}
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
        {app.wave && <Pill color="var(--slate)">{app.wave}</Pill>}
        {sinceApplied != null && <Pill color="var(--slate)">{sinceApplied}d</Pill>}
        {stale && <Pill color="var(--amber)">stale</Pill>}
      </span>
    </button>
  )
}

function Board({ apps, today, onOpen }: { apps: Application[]; today: string; onOpen: (a: Application) => void }) {
  const columns: { key: string; label: string; color: string; rows: Application[] }[] = [
    ...PIPELINE_ORDER.map(s => ({
      key: s,
      label: STATUS_LABEL[s],
      color: STATUS_COLOR[s],
      rows: apps.filter(a => a.status === s),
    })),
    {
      key: 'closed',
      label: 'Closed',
      color: 'var(--ink-3)',
      rows: apps.filter(a => CLOSED_STATUSES.includes(a.status)),
    },
  ]

  return (
    // Horizontal scroll lives on this container so the page body never scrolls
    // sideways with nine columns of pipeline.
    <div style={{ overflowX: 'auto', padding: 'var(--s4) 0' }}>
      <div style={{ display: 'flex', gap: 'var(--s5)', minWidth: 'min-content', alignItems: 'flex-start' }}>
        {columns.map((col, i) => (
          <div key={col.key} style={{
            width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: i > 0 ? '1px solid var(--rule)' : undefined,
            paddingLeft: i > 0 ? 'var(--s5)' : undefined,
          }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 'var(--s2)', paddingBottom: 'var(--s2)', marginBottom: 'var(--s3)',
            }}>
              <span style={{ fontSize: 13, letterSpacing: '0.1em', color: col.color }}>{col.label.toLowerCase()}</span>
              <span className="mono" style={{ fontSize: 20, lineHeight: 1, color: 'var(--slate)' }}>
                {col.rows.length}
              </span>
            </div>
            {col.rows.map(a => <Card key={a.id} app={a} today={today} onOpen={() => onOpen(a)} />)}
            {col.rows.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>—</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const cellStyle = { padding: 'var(--s2) var(--s3) var(--s2) 0', fontSize: 13, color: 'var(--ash)', borderTop: '1px solid var(--rule-2)', verticalAlign: 'middle' } as const
const inputStyle = { fontSize: 12, color: 'var(--ivory)', background: 'transparent', border: 0, borderRadius: 0, padding: '2px 0' } as const

/** Table view — the shape you want for bulk edits, which a board is bad at. */
function Table({
  apps, today, onOpen, onPatch,
}: {
  apps: Application[]
  today: string
  onOpen: (a: Application) => void
  onPatch: (id: string, patch: Partial<Application>) => void
}) {
  return (
    <div style={{ overflowX: 'auto', padding: '0 0 8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
        <thead>
          <tr>
            {['Company', 'Role', 'Wave', 'Status', 'Checked', 'Applied', 'Interview'].map(h => (
              <th key={h} style={{ ...labelStyle, textAlign: 'left', padding: '0 var(--s3) var(--s2) 0', fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apps.map(a => (
            <tr key={a.id}>
              <td style={cellStyle}>
                <button
                  onClick={() => onOpen(a)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-6)', fontSize: 13, textAlign: 'left' }}
                >
                  {a.company_name}
                </button>
              </td>
              <td style={{ ...cellStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.role_title ?? '—'}</td>
              <td style={cellStyle}>{a.wave ?? '—'}</td>
              <td style={cellStyle}>
                <select
                  value={a.status}
                  onChange={e => onPatch(a.id, { status: e.target.value as Status })}
                  aria-label={`Status for ${a.company_name}`}
                  style={{ ...inputStyle, color: STATUS_COLOR[a.status] }}
                >
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </td>
              <td style={cellStyle}>
                <input
                  type="date"
                  value={a.portal_last_checked ?? ''}
                  onChange={e => onPatch(a.id, { portal_last_checked: e.target.value || null })}
                  aria-label={`Portal last checked for ${a.company_name}`}
                  style={{ ...inputStyle, color: isStale(a, today) ? 'var(--warn)' : 'var(--ink-5)' }}
                />
              </td>
              <td style={cellStyle}>
                <input
                  type="date"
                  value={a.applied_on ?? ''}
                  onChange={e => onPatch(a.id, { applied_on: e.target.value || null })}
                  aria-label={`Applied date for ${a.company_name}`}
                  style={inputStyle}
                />
              </td>
              <td style={cellStyle}>
                <input
                  type="date"
                  value={a.interview_on ?? ''}
                  onChange={e => onPatch(a.id, { interview_on: e.target.value || null })}
                  aria-label={`Interview date for ${a.company_name}`}
                  style={inputStyle}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Pipeline({
  apps, today, view, onOpen, onPatch,
}: {
  apps: Application[]
  today: string
  view: 'board' | 'table'
  onOpen: (a: Application) => void
  onPatch: (id: string, patch: Partial<Application>) => void
}) {
  if (apps.length === 0) {
    return (
      <div style={{ ...cardStyle }}>
        <Empty>Nothing in the pipeline yet. Open Targets and track a company.</Empty>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      {view === 'board'
        ? <Board apps={apps} today={today} onOpen={onOpen} />
        : <Table apps={apps} today={today} onOpen={onOpen} onPatch={onPatch} />}
    </div>
  )
}
