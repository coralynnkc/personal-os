'use client'

import { useMemo, useState } from 'react'
import { Plus, Check, ExternalLink } from 'lucide-react'
import { cardStyle, labelStyle, Empty, Pill } from './ui'
import { toHref, type Application, type CompanyEntity } from '@/lib/jobs'

type Meta = Record<string, unknown>

function field(e: CompanyEntity, key: string): string {
  const v = (e.metadata as Meta | null)?.[key]
  return v == null ? '' : String(v)
}

const selectStyle = {
  fontSize: 12, color: 'var(--ink-6)', background: 'var(--ink-1)',
  border: '1px solid var(--glass-border)', borderRadius: 6, padding: '4px 8px',
} as const

/**
 * View B — the 75-company research library from sheet 1, kept as `entities`
 * with kind = 'company'. Read-mostly; the only write here is "Track", which
 * promotes a row into the pipeline with entity_id already linked so the
 * research travels with it.
 */
export default function Targets({
  companies, apps, onTrack, busyId,
}: {
  companies: CompanyEntity[]
  apps: Application[]
  onTrack: (e: CompanyEntity) => void
  busyId: string | null
}) {
  const [q, setQ] = useState('')
  const [industry, setIndustry] = useState('')
  const [role, setRole] = useState('')
  const [band, setBand] = useState('')

  const tracked = useMemo(
    () => new Set(apps.map(a => a.entity_id).filter(Boolean) as string[]),
    [apps],
  )

  const options = useMemo(() => {
    const uniq = (key: string) =>
      Array.from(new Set(companies.map(c => field(c, key)).filter(Boolean))).sort()
    return {
      industry: uniq('industry'),
      role: uniq('role_category'),
      band: uniq('competitiveness_band'),
    }
  }, [companies])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return companies.filter(c => {
      if (industry && field(c, 'industry') !== industry) return false
      if (role && field(c, 'role_category') !== role) return false
      if (band && field(c, 'competitiveness_band') !== band) return false
      if (!needle) return true
      return (
        c.name.toLowerCase().includes(needle) ||
        field(c, 'position_title').toLowerCase().includes(needle) ||
        field(c, 'industry').toLowerCase().includes(needle)
      )
    })
  }, [companies, q, industry, role, band])

  return (
    <div style={cardStyle}>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 12px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search companies…"
          aria-label="Search companies"
          style={{ ...selectStyle, flex: 1, minWidth: 160 }}
        />
        {([
          ['Industry', industry, setIndustry, options.industry],
          ['Role', role, setRole, options.role],
          ['Competitiveness', band, setBand, options.band],
        ] as const).map(([label, value, set, opts]) => (
          <select
            key={label}
            value={value}
            onChange={e => set(e.target.value)}
            aria-label={label}
            style={selectStyle}
          >
            <option value="">{label}: all</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <span style={{ ...labelStyle, marginLeft: 'auto' }}>
          {rows.length}/{companies.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {companies.length === 0
            ? 'No companies imported yet — run scripts/import-job-search.mjs.'
            : 'No companies match those filters.'}
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map(c => {
            const isTracked = tracked.has(c.id)
            const url = field(c, 'apply_url')
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-6)' }}>{c.name}</div>
                  {field(c, 'position_title') && (
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{field(c, 'position_title')}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {field(c, 'competitiveness_band') && <Pill color="var(--warn)">{field(c, 'competitiveness_band')}</Pill>}
                    {field(c, 'industry') && <Pill color="var(--ink-4)">{field(c, 'industry')}</Pill>}
                    {field(c, 'application_opens') && <Pill color="var(--ink-4)">opens {field(c, 'application_opens')}</Pill>}
                    {field(c, 'salary') && <Pill color="var(--ok)">{field(c, 'salary')}</Pill>}
                  </div>
                </div>

                {url && (
                  <a
                    href={toHref(url)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${c.name} careers page`}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '4px 8px', color: 'var(--ink-4)', border: '1px solid var(--glass-border)', borderRadius: 6 }}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}

                <button
                  onClick={() => onTrack(c)}
                  disabled={isTracked || busyId === c.id}
                  aria-label={isTracked ? `${c.name} is already tracked` : `Track ${c.name}`}
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    cursor: isTracked ? 'default' : 'pointer',
                    fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: isTracked ? 'var(--ok)' : 'var(--accent)',
                    background: isTracked ? 'transparent' : 'var(--accent-dim)',
                    border: `1px solid ${isTracked ? 'var(--ok)' : 'var(--accent-border)'}`,
                    borderRadius: 6, padding: '4px 8px',
                  }}
                >
                  {isTracked ? <><Check size={11} /> Tracked</> : <><Plus size={11} /> Track</>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
