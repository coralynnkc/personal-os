'use client'

import { useCallback, useEffect, useState } from 'react'
import { toDateKey, USER_TZ } from '@/lib/dateKey'
import { Panel, ErrorRow, Empty, buttonStyle, labelStyle } from './ui'
import StaleStrip from './StaleStrip'
import WaveStrip from './WaveStrip'
import RhythmCard from './RhythmCard'
import Pipeline from './Pipeline'
import Targets from './Targets'
import AppDrawer from './AppDrawer'
import type { Application, CompanyEntity } from '@/lib/jobs'

type View = 'pipeline' | 'targets'

function Toggle<T extends string>({
  value, options, onChange, label,
}: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 2, background: 'var(--ink-1)', borderRadius: 8, padding: 3 }}>
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          style={{
            cursor: 'pointer', padding: '4px 12px', borderRadius: 6, border: 'none',
            fontSize: 12, letterSpacing: '0.03em',
            color: value === v ? 'var(--ink-6)' : 'var(--ink-4)',
            background: value === v ? 'var(--ink-2)' : 'transparent',
          }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export default function JobsClient() {
  const [today, setToday] = useState('')
  const [view, setView] = useState<View>('pipeline')
  const [pipelineView, setPipelineView] = useState<'board' | 'table'>('board')

  const [apps, setApps] = useState<Application[]>([])
  const [companies, setCompanies] = useState<CompanyEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trackBusy, setTrackBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // Resolved after mount so the server's configured timezone and the browser's
  // detected one can't disagree across hydration.
  useEffect(() => { setToday(toDateKey(new Date(), USER_TZ)) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [appRes, entRes] = await Promise.all([
        fetch('/api/applications'),
        fetch('/api/entities?all=true'),
      ])
      if (!appRes.ok) throw new Error(`applications HTTP ${appRes.status}`)
      if (!entRes.ok) throw new Error(`entities HTTP ${entRes.status}`)

      const [appData, entData] = await Promise.all([appRes.json(), entRes.json()])
      setApps(appData ?? [])
      setCompanies((entData ?? []).filter((e: CompanyEntity) => e.kind === 'company'))
    } catch (e) {
      console.error('jobs load error:', e)
      setError('Could not load the job search. Check your connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** Optimistic patch with rollback — a failed write must not leave the UI lying. */
  const patch = useCallback(async (id: string, body: Partial<Application>) => {
    const before = apps.find(a => a.id === id)
    if (!before) return
    setApps(prev => prev.map(a => (a.id === id ? { ...a, ...body } : a)))
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const saved = await res.json()
      setApps(prev => prev.map(a => (a.id === id ? saved : a)))
    } catch (e) {
      console.error('application patch error:', e)
      setApps(prev => prev.map(a => (a.id === id ? before : a)))
      setError('Could not save that change.')
    }
  }, [apps])

  const track = useCallback(async (c: CompanyEntity) => {
    setTrackBusy(c.id)
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: c.id,
          company_name: c.name,
          role_title: meta.position_title ?? null,
          portal_url: meta.apply_url ?? null,
          portal_last_checked: meta.portal_last_checked_date ?? null,
          status: 'researching',
        }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: null }))
        throw new Error(msg ?? `HTTP ${res.status}`)
      }
      const created = await res.json()
      setApps(prev => [created, ...prev])
      setView('pipeline')
    } catch (e) {
      console.error('track error:', e)
      setError(`Could not track ${c.name}: ${(e as Error).message}`)
    } finally {
      setTrackBusy(null)
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    const app = apps.find(a => a.id === id)
    if (!app) return
    if (!window.confirm(`Remove ${app.company_name} from the pipeline?`)) return
    setApps(prev => prev.filter(a => a.id !== id))
    setOpenId(null)
    try {
      const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      console.error('application delete error:', e)
      setApps(prev => [app, ...prev])
      setError('Could not remove that application.')
    }
  }, [apps])

  const open = apps.find(a => a.id === openId) ?? null

  return (
    <div style={{ padding: '16px 20px', width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Toggle
          label="Job search view"
          value={view}
          onChange={setView}
          options={[['pipeline', 'Pipeline'], ['targets', 'Targets']] as const}
        />
        {view === 'pipeline' && (
          <Toggle
            label="Pipeline layout"
            value={pipelineView}
            onChange={setPipelineView}
            options={[['board', 'Board'], ['table', 'Table']] as const}
          />
        )}
        <span style={{ ...labelStyle, marginLeft: 'auto' }}>
          {apps.length} tracked · {companies.length} researched
        </span>
      </div>

      {error && <ErrorRow message={error} onRetry={load} />}

      {today && !loading && (
        <>
          <StaleStrip apps={apps} today={today} onStamp={a => patch(a.id, { portal_last_checked: today })} />
          <div className="grid gap-3 items-start grid-cols-1 lg:grid-cols-2">
            <WaveStrip apps={apps} />
            <RhythmCard />
          </div>
        </>
      )}

      {loading ? (
        <Panel title={view === 'pipeline' ? 'Pipeline' : 'Targets'}>
          <Empty>Loading…</Empty>
        </Panel>
      ) : view === 'pipeline' ? (
        <Pipeline
          apps={apps}
          today={today}
          view={pipelineView}
          onOpen={a => setOpenId(a.id)}
          onPatch={patch}
        />
      ) : (
        <Targets companies={companies} apps={apps} onTrack={track} busyId={trackBusy} />
      )}

      {!loading && !error && apps.length === 0 && companies.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
          Nothing imported yet. Run{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-5)' }}>
            python3 scripts/parse-job-search-xlsx.py
          </code>{' '}
          then{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-5)' }}>
            node scripts/import-job-search.mjs
          </code>.
          <button onClick={load} style={{ ...buttonStyle, marginLeft: 8 }}>Reload</button>
        </div>
      )}

      {open && (
        <AppDrawer
          app={open}
          today={today}
          onPatch={p => patch(open.id, p)}
          onDelete={() => remove(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
