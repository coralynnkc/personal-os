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
    <button
      onClick={onOpen}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--ink-1)',
        border: `1px solid ${stale ? 'var(--warn)' : 'var(--glass-border)'}`,
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--ink-6)', lineHeight: 1.3 }}>{app.company_name}</span>
      {app.role_title && (
        <span style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {app.role_title}
        </span>
      )}
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {app.wave && <Pill color="var(--ink-4)">{app.wave}</Pill>}
        {sinceApplied != null && <Pill color="var(--ink-4)">{sinceApplied}d</Pill>}
        {stale && <Pill color="var(--warn)">stale</Pill>}
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
    <div style={{ overflowX: 'auto', padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, minWidth: 'min-content', alignItems: 'flex-start' }}>
        {columns.map(col => (
          <div key={col.key} style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 2px' }}>
              <span style={{ ...labelStyle, color: col.color }}>{col.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                {col.rows.length}
              </span>
            </div>
            {col.rows.map(a => <Card key={a.id} app={a} today={today} onOpen={() => onOpen(a)} />)}
            {col.rows.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--ink-2)', padding: '6px 2px', fontStyle: 'italic' }}>—</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const cellStyle = { padding: '6px 10px', fontSize: 13, color: 'var(--ink-5)', borderTop: '1px solid var(--glass-border)', verticalAlign: 'middle' } as const
const inputStyle = { fontSize: 12, color: 'var(--ink-6)', background: 'var(--ink-1)', border: '1px solid var(--glass-border)', borderRadius: 5, padding: '3px 6px' } as const

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
              <th key={h} style={{ ...labelStyle, textAlign: 'left', padding: '10px 10px 8px', fontWeight: 400 }}>{h}</th>
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
