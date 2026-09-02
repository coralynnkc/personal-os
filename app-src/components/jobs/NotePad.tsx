'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from '@/lib/markdown'
import { Panel, ErrorRow, labelStyle } from './ui'

/**
 * The part nothing can derive: what you are thinking. What to learn next, what
 * a recruiter said, which posting to watch for. It saves itself, because a
 * note you have to remember to save is a note you lose.
 *
 * It shares the top strip with the stale queue rather than sitting behind a
 * tab, because writing the note and clearing the queue are the same sitting.
 *
 * The note is almost always written through the MCP tools, so reading is the
 * default state: markdown renders the way the week tab renders it, and the
 * textarea is one click away for the times you want to type here instead.
 */

const AUTOSAVE_MS = 900

export default function NotePad({ today }: { today: string }) {
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)

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

  // Writes arrive from the MCP tools while this tab sits open in another
  // window. Coming back to the tab is the moment to pick them up — but not
  // mid-edit, which would overwrite what is being typed.
  const editingRef = useRef(editing)
  editingRef.current = editing
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && !editingRef.current) load()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

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

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      if (loadedRef.current) save(bodyRef.current)
    }
  }, [save])

  useEffect(() => () => { flush() }, [flush])

  const openEditor = () => {
    if (!loaded) return
    setEditing(true)
    // The textarea mounts on the next paint; put the caret in it then.
    requestAnimationFrame(() => {
      const el = area.current
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) }
    })
  }

  const closeEditor = () => {
    flush()
    setEditing(false)
  }

  const status = {
    idle: '', saving: 'saving…', saved: 'saved', error: 'not saved',
  }[saving]

  return (
    <Panel
      title={`Note — ${today}`}
      right={
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)' }}>
          <span style={{ ...labelStyle, color: saving === 'error' ? 'var(--coral)' : 'var(--slate)' }}>{status}</span>
          <button
            className="tap"
            onClick={editing ? closeEditor : openEditor}
            disabled={!loaded}
            style={{
              ...labelStyle, background: 'transparent', border: 0, padding: 0,
              cursor: loaded ? 'pointer' : 'default', color: 'var(--slate)',
            }}
          >
            {editing ? 'done' : 'edit'}
          </button>
        </span>
      }
    >
      {error && <ErrorRow message={error} onRetry={load} />}

      {editing ? (
        <textarea
          ref={area}
          value={body}
          onChange={e => edit(e.target.value)}
          onBlur={flush}
          placeholder="What opened, what to learn next, what anyone said."
          aria-label={`Job search note for ${today}`}
          style={{
            width: '100%', minHeight: 140, resize: 'vertical', padding: 'var(--s2) 0',
            background: 'transparent', border: 0, borderRadius: 0, outline: 'none',
            color: 'var(--ivory)', fontFamily: 'var(--font-mono)', fontSize: 13,
            lineHeight: 1.7,
          }}
        />
      ) : (
        <div
          onClick={openEditor}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); openEditor() } }}
          aria-label={`Job search note for ${today} — click to edit`}
          style={{ minHeight: 140, cursor: loaded ? 'text' : 'default', padding: 'var(--s2) 0' }}
        >
          {body.trim()
            ? <Markdown md={body} />
            : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>
                {loaded ? 'What opened, what to learn next, what anyone said.' : ''}
              </p>
            )}
        </div>
      )}
    </Panel>
  )
}
