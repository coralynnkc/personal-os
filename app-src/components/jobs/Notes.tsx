'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Panel, Empty, ErrorRow, labelStyle } from './ui'
import { buildBriefing, type BriefingItem } from '@/lib/briefing'
import { toHref, type Application } from '@/lib/jobs'

/**
 * The day's job search on one page, in two halves.
 *
 * The top half is derived from the pipeline: what is open and waiting on you,
 * what has gone quiet long enough to chase, what is actually in the diary.
 * None of it is typed, so none of it can go stale — a line leaves this view
 * the moment the row it describes moves.
 *
 * The bottom half is the part nothing can derive: what you are thinking. What
 * to learn next, what a recruiter said, which posting to watch for. It saves
 * itself, because a note you have to remember to save is a note you lose.
 */

const AUTOSAVE_MS = 900

function Row({ item, onOpen }: { item: BriefingItem; onOpen: (a: Application) => void }) {
  const { app, detail } = item
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
      padding: 'var(--s2) 0', borderTop: '1px solid var(--rule-2)',
    }}>
      <button
        onClick={() => onOpen(app)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0,
          padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--ivory)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {app.company_name}
        {app.role_title && (
          <span style={{ color: 'var(--slate)' }}> · {app.role_title}</span>
        )}
      </button>

      <span className="mono" style={{
        flexShrink: 0, fontSize: 11, color: 'var(--slate)',
        letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums',
      }}>
        {detail}
      </span>

      {app.portal_url && (
        <a
          href={toHref(app.portal_url)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${app.company_name} portal`}
          style={{ flexShrink: 0, display: 'flex', color: 'var(--champagne)' }}
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

function Section({
  title, items, empty, onOpen, tone = 'var(--slate)',
}: {
  title: string
  items: BriefingItem[]
  empty: string
  onOpen: (a: Application) => void
  tone?: string
}) {
  return (
    <Panel
      title={title}
      right={
        <span style={{ ...labelStyle, color: items.length > 0 ? tone : 'var(--ok)' }}>
          {items.length === 0 ? 'clear' : items.length}
        </span>
      }
    >
      {items.length === 0
        ? <Empty>{empty}</Empty>
        : items.map(i => <Row key={i.app.id} item={i} onOpen={onOpen} />)}
    </Panel>
  )
}

export default function Notes({
  apps, today, onOpen,
}: { apps: Application[]; today: string; onOpen: (a: Application) => void }) {
  const brief = buildBriefing(apps, today)

  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/jobs/notes?date=${today}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setBody(data.body ?? '')
      setLoaded(true)
    } catch (e) {
      console.error('job notes load error:', e)
      setError('Could not load today’s note.')
    }
  }, [today])

  useEffect(() => { if (today) load() }, [today, load])

  const save = useCallback(async (text: string) => {
    setSaving('saving')
    try {
      const res = await fetch('/api/jobs/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, body: text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaving('saved')
    } catch (e) {
      console.error('job notes save error:', e)
      setSaving('error')
    }
  }, [today])

  // Debounced autosave. The flush on unmount is the one that matters: leaving
  // the tab mid-sentence is the normal way to stop writing, and it must not be
  // the way you lose the sentence.
  const edit = (text: string) => {
    setBody(text)
    setSaving('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), AUTOSAVE_MS)
  }

  const bodyRef = useRef(body)
  bodyRef.current = body
  const loadedRef = useRef(loaded)
  loadedRef.current = loaded

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      if (loadedRef.current) save(bodyRef.current)
    }
  }, [save])

  const status = {
    idle: '', saving: 'saving…', saved: 'saved', error: 'not saved',
  }[saving]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s6)' }}>
      <div className="grid gap-6 items-start grid-cols-1 lg:grid-cols-3">
        <Section
          title="Open — not applied"
          items={brief.open}
          empty="Nothing confirmed open is waiting on you."
          onOpen={onOpen}
          tone="var(--amber)"
        />
        <Section
          title="Worth chasing"
          items={brief.followUp}
          empty="Nothing has gone quiet long enough to chase."
          onOpen={onOpen}
          tone="var(--coral)"
        />
        <Section
          title="Coming up"
          items={brief.upcoming}
          empty="No interviews in the next fortnight."
          onOpen={onOpen}
          tone="var(--royal)"
        />
      </div>

      <Panel
        title={`Note — ${today}`}
        right={<span style={{ ...labelStyle, color: saving === 'error' ? 'var(--coral)' : 'var(--slate)' }}>{status}</span>}
      >
        {error && <ErrorRow message={error} onRetry={load} />}
        <textarea
          value={body}
          onChange={e => edit(e.target.value)}
          disabled={!loaded}
          placeholder="What opened, what to learn next, what anyone said."
          aria-label={`Job search note for ${today}`}
          style={{
            width: '100%', minHeight: 200, resize: 'vertical', padding: 'var(--s3) 0',
            background: 'transparent', border: 0, borderRadius: 0, outline: 'none',
            color: 'var(--ivory)', fontFamily: 'var(--font-sans)', fontSize: 14,
            lineHeight: 1.7,
          }}
        />
      </Panel>
    </div>
  )
}
