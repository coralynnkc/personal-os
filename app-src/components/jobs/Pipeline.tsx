'use client'

import { useState } from 'react'
import {
  PIPELINE_ORDER, STATUS_LABEL, STATUS_COLOR, STATUSES,
  daysSince, isStale, isClosed, type Application, type Status,
} from '@/lib/jobs'
import { cardStyle, labelStyle, Empty, Pill } from './ui'

// The id travels in a custom type as well as text/plain: the custom one is
// what dragOver can see (text/plain is withheld until drop), which is what
// lets a column light up only for a drag that started on this board.
const DRAG_TYPE = 'application/x-personal-os-application'

function Card({
  app, today, onOpen, onDragStart, onDragEnd, dragging,
}: {
  app: Application
  today: string
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const sinceApplied = daysSince(app.applied_on, today)
  const stale = isStale(app, today)

  return (
    // An entry, not a card: two lines and a hairline. Staleness is the one
    // thing here that is about time, so it is the one thing with a colour.
    //
    // Still a button, so the whole board stays reachable by keyboard — drag is
    // the shortcut, and the drawer's status select is the way that always
    // works. Dropping the drag handler on the button itself rather than a
    // wrapper keeps the two gestures on one target.
    <button
      onClick={onOpen}
      draggable
      onDragStart={e => {
        e.dataTransfer.setData(DRAG_TYPE, app.id)
        e.dataTransfer.setData('text/plain', app.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className="hoverable"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 2,
        padding: 'var(--s2) 0', borderRadius: 0,
        background: 'transparent', border: 0,
        borderBottom: '1px solid var(--rule-2)',
        opacity: dragging ? 0.4 : 1,
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

function Board({
  apps, today, onOpen, onPatch,
}: {
  apps: Application[]
  today: string
  onOpen: (a: Application) => void
  onPatch: (id: string, patch: Partial<Application>) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)

  // Closed rows are not here. They live in the Archive, which is the whole
  // point of removing the column: eight live columns, every one of them a
  // status a card can be dropped into without asking which kind you meant.
  const columns = PIPELINE_ORDER.map(s => ({
    status: s,
    label: STATUS_LABEL[s],
    color: STATUS_COLOR[s],
    rows: apps.filter(a => a.status === s),
  }))

  const drop = (status: Status) => (e: React.DragEvent) => {
    e.preventDefault()
    setOver(null)
    setDragId(null)
    const id = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData('text/plain')
    if (!id) return
    const app = apps.find(a => a.id === id)
    // A card dropped back where it started is not a change worth a round trip.
    if (!app || app.status === status) return
    onPatch(id, { status })
  }

  return (
    // Horizontal scroll lives on this container so the page body never scrolls
    // sideways with eight columns of pipeline.
    <div style={{ overflowX: 'auto', padding: 'var(--s4) 0' }}>
      <div style={{ display: 'flex', gap: 'var(--s5)', minWidth: 'min-content', alignItems: 'flex-start' }}>
        {columns.map((col, i) => {
          const active = over === col.status
          return (
            <div
              key={col.status}
              onDragOver={e => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setOver(col.status)
              }}
              onDragLeave={e => {
                // Moving between children fires dragleave on the parent; only
                // a cursor that has actually left the column should unlight it.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOver(prev => (prev === col.status ? null : prev))
                }
              }}
              onDrop={drop(col.status)}
              style={{
                width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
                borderLeft: i > 0 ? '1px solid var(--rule)' : undefined,
                paddingLeft: i > 0 ? 'var(--s5)' : undefined,
                // The drop target is named by the one colour that means chosen.
                background: active ? 'var(--tint)' : undefined,
                outline: active ? '1px solid var(--champagne)' : undefined,
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 'var(--s2)', paddingBottom: 'var(--s2)', marginBottom: 'var(--s3)',
              }}>
                <span style={{ fontSize: 13, letterSpacing: '0.1em', color: active ? 'var(--champagne)' : col.color }}>
                  {col.label.toLowerCase()}
                </span>
                <span className="mono" style={{ fontSize: 20, lineHeight: 1, color: 'var(--slate)' }}>
                  {col.rows.length}
                </span>
              </div>
              {col.rows.map(a => (
                <Card
                  key={a.id}
                  app={a}
                  today={today}
                  onOpen={() => onOpen(a)}
                  onDragStart={() => setDragId(a.id)}
                  onDragEnd={() => { setDragId(null); setOver(null) }}
                  dragging={dragId === a.id}
                />
              ))}
              {col.rows.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>—</div>
              )}
            </div>
          )
        })}
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
  // Only live rows reach here — an all-closed board is an empty one, and
  // saying "nothing tracked yet" to someone with forty archived rejections
  // would be the wrong sentence entirely.
  if (apps.length === 0) {
    return (
      <div style={{ ...cardStyle }}>
        <Empty>Nothing live in the pipeline. Open Targets and track a company, or check the Archive.</Empty>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      {view === 'board'
        ? <Board apps={apps} today={today} onOpen={onOpen} onPatch={onPatch} />
        : <Table apps={apps} today={today} onOpen={onOpen} onPatch={onPatch} />}
    </div>
  )
}
