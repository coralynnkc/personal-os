'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel, ErrorRow, labelStyle } from './ui'

/**
 * The part nothing can derive: what you are thinking. What to learn next, what
 * a recruiter said, which posting to watch for. It saves itself, because a
 * note you have to remember to save is a note you lose.
 *
 * It shares the top strip with the stale queue rather than sitting behind a
 * tab, because writing the note and clearing the queue are the same sitting.
 */

const AUTOSAVE_MS = 900

export default function NotePad({ today }: { today: string }) {
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
          width: '100%', minHeight: 140, resize: 'vertical', padding: 'var(--s2) 0',
          background: 'transparent', border: 0, borderRadius: 0, outline: 'none',
          color: 'var(--ivory)', fontFamily: 'var(--font-sans)', fontSize: 14,
          lineHeight: 1.7,
        }}
      />
    </Panel>
  )
}
