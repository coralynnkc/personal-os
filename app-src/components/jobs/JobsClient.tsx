'use client'

import { useCallback, useEffect, useState } from 'react'
import { toDateKey, USER_TZ } from '@/lib/dateKey'
import { Panel, ErrorRow, Empty, buttonStyle, labelStyle, useConfirm } from './ui'
import StaleStrip from './StaleStrip'
import WaveStrip from './WaveStrip'
import Pipeline from './Pipeline'
import Targets from './Targets'
import Briefing from './Briefing'
import NotePad from './NotePad'
import Archive from './Archive'
import AppDrawer from './AppDrawer'
import AddDrawer from './AddDrawer'
import { useKeyboard } from '@/lib/useKeyboard'
import { isClosed, type Application, type CompanyEntity } from '@/lib/jobs'

type View = 'pipeline' | 'targets' | 'archive'

function Toggle<T extends string>({
  value, options, onChange, label,
}: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    // Segmented controls are words with a rule under the chosen one.
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 'var(--s3)' }}>
      {options.map(([v, text]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="mono"
          style={{
            cursor: 'pointer', padding: '0 0 2px', borderRadius: 0, background: 'none',
            border: 0, borderBottom: `1px solid ${value === v ? 'var(--champagne)' : 'transparent'}`,
            fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: value === v ? 'var(--ivory)' : 'var(--slate)',
          }}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export default function JobsClient() {
  const [confirm, confirmDialog] = useConfirm()
  const [today, setToday] = useState('')
  const [view, setView] = useState<View>('pipeline')
  const [pipelineView, setPipelineView] = useState<'board' | 'table'>('board')

  const [apps, setApps] = useState<Application[]>([])
  const [companies, setCompanies] = useState<CompanyEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trackBusy, setTrackBusy] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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

  /**
   * The one write that creates a pipeline row, shared by Track-from-Targets
   * and the add drawer. Returns the failure as a message rather than throwing
   * or owning the banner, because the drawer wants to show it inline and stay
   * open — a duplicate is usually fixed by changing the wave, not by starting
   * over.
   */
  const create = useCallback(async (body: Partial<Application>): Promise<string | null> => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: null }))
        return msg ?? `HTTP ${res.status}`
      }
      const created = await res.json()
      setApps(prev => [created, ...prev])
      return null
    } catch (e) {
      console.error('application create error:', e)
      return (e as Error).message
    }
  }, [])

  const track = useCallback(async (c: CompanyEntity) => {
    setTrackBusy(c.id)
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    // Stay where you are: the row flips to "Tracked" in place, so you can
    // work down a filtered list without being thrown to the pipeline.
    const msg = await create({
      entity_id: c.id,
      company_name: c.name,
      role_title: (meta.position_title ?? null) as string | null,
      portal_url: (meta.apply_url ?? null) as string | null,
      portal_last_checked: (meta.portal_last_checked_date ?? null) as string | null,
      status: 'researching',
    })
    if (msg) setError(`Could not track ${c.name}: ${msg}`)
    setTrackBusy(null)
  }, [create])

  const remove = useCallback(async (id: string) => {
    const app = apps.find(a => a.id === id)
    if (!app) return
    if (!(await confirm(`Remove ${app.company_name} from the pipeline?`, 'Remove'))) return
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
  }, [apps, confirm])

  useKeyboard([
    { keys: 'n', label: 'New application', group: 'Jobs', run: () => setAddOpen(true) },
  ])

  const open = apps.find(a => a.id === openId) ?? null

  // The board, the strips and the derived lists are all about live work, so
  // closed rows are held out of every one of them. They are not gone — the
  // Archive is the whole of them, kept forever.
  const live = apps.filter(a => !isClosed(a.status))
  const closed = apps.filter(a => isClosed(a.status))

  return (
    <div style={{ padding: 'var(--s5)', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s5)', flexWrap: 'wrap',
        paddingBottom: 'var(--s3)', borderBottom: '1px solid var(--rule)',
      }}>
        <Toggle
          label="Job search view"
          value={view}
          onChange={setView}
          options={[['pipeline', 'Pipeline'], ['targets', 'Targets'], ['archive', 'Archive']] as const}
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
          {live.length} live · {closed.length} closed · {companies.length} researched
        </span>
        <button onClick={() => setAddOpen(true)} style={buttonStyle}>+ New</button>
      </div>

      {error && <ErrorRow message={error} onRetry={load} />}

      {/* The two halves of a sitting: clear the queue, write down what you saw. */}
      {today && !loading && (
        <div className="grid gap-6 items-start grid-cols-1 lg:grid-cols-2">
          <StaleStrip
            apps={live}
            today={today}
            onStamp={(a, status) => patch(a.id, { portal_last_checked: today, ...(status ? { status } : {}) })}
          />
          <NotePad today={today} />
        </div>
      )}

      {loading ? (
        <Panel title={{ pipeline: 'Pipeline', targets: 'Targets', archive: 'Archive' }[view]}>
          <Empty>Loading…</Empty>
        </Panel>
      ) : view === 'archive' ? (
        <Archive apps={closed} today={today} onOpen={a => setOpenId(a.id)} />
      ) : view === 'pipeline' ? (
        <>
          {/* Every line here is a pipeline row, so it belongs beside the board. */}
          {today && <Briefing apps={live} today={today} onOpen={a => setOpenId(a.id)} />}
          <Pipeline
            apps={live}
            today={today}
            view={pipelineView}
            onOpen={a => setOpenId(a.id)}
            onPatch={patch}
          />
        </>
      ) : (
        <>
          {/* Waves are about which companies to go after next, which is the
              question this screen is for — nowhere else. */}
          <WaveStrip apps={live} />
          <Targets companies={companies} apps={apps} onTrack={track} busyId={trackBusy} />
        </>
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

      {addOpen && (
        <AddDrawer
          companies={companies}
          today={today}
          onCreate={create}
          onClose={() => setAddOpen(false)}
        />
      )}

      {confirmDialog}
    </div>
  )
}
