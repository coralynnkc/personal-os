'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { dialogOpen, useDialog } from './useDialog'

/**
 * One owner for every keyboard shortcut in the app.
 *
 * The alternative — a `keydown` listener per component — has three problems a
 * registry doesn't: two components can claim the same key and both fire, the
 * shortcut sheet has to be written by hand and drifts from what's wired up,
 * and each listener has to re-derive "am I typing in a field right now?".
 * Here the provider owns the single listener and the rules; a component just
 * says what its keys mean, and `?` renders itself from that.
 *
 * Usage: `useKeyboard([{ keys: 'n', label: 'New task', group: 'Tasks', run: … }])`.
 */

export type Binding = {
  /** A key (`n`, `/`, `?`, `1`) or a chord — two keys in sequence: `g t`. */
  keys: string
  /** Sentence for the shortcut sheet. Without one the binding stays off it. */
  label?: string
  /** Heading it sits under on the sheet. */
  group?: string
  run: (event: KeyboardEvent) => void
  /** Fire even while a modal has the screen. Off by default. */
  inDialog?: boolean
}

type Entry = { get: () => Binding[]; base: boolean }

const entries: Entry[] = []
const listeners = new Set<() => void>()
let snapshot: Binding[] = []

/**
 * Match order is last-registered-first, so a page's `n` beats a global one —
 * except the provider's own bindings, which register *after* the page's (React
 * runs child effects before parent ones) and would otherwise always win. They
 * come in as `base` and are searched last.
 */
function rebuild() {
  const own = entries.filter(e => !e.base).flatMap(e => e.get())
  const base = entries.filter(e => e.base).flatMap(e => e.get())
  snapshot = [...own, ...base]
  listeners.forEach(l => l())
}

function candidates(): Binding[] {
  const own: Binding[] = []
  const base: Binding[] = []
  for (const entry of entries) (entry.base ? base : own).push(...entry.get())
  return [...own.reverse(), ...base]
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Every binding currently registered — what the shortcut sheet lists. */
export function useBindings(): Binding[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/**
 * Register bindings for as long as the component is mounted. The array is read
 * through a ref, so it may be rebuilt inline on every render without
 * re-registering — but `keys`/`label` are read once for the sheet, so keep
 * those static.
 */
export function useKeyboard(bindings: Binding[], options: { base?: boolean } = {}) {
  const ref = useRef(bindings)
  ref.current = bindings
  const base = options.base === true

  useEffect(() => {
    const entry: Entry = { get: () => ref.current, base }
    entries.push(entry)
    rebuild()
    return () => {
      const i = entries.indexOf(entry)
      if (i !== -1) entries.splice(i, 1)
      rebuild()
    }
  }, [base])
}

/** A field, a textarea, a select, or anything contenteditable. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

const CHORD_MS = 1200

function KeyboardListener() {
  const pending = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A shortcut is a bare keypress. Anything with a modifier belongs to the
      // browser or the OS, and a field takes every key it's given.
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (typing(event.target)) return
      if (event.key === 'Escape') { pending.current = null; return }
      if (event.key.length !== 1) return

      const prefix = pending.current && Date.now() - pending.current.at < CHORD_MS
        ? pending.current.key
        : null
      pending.current = null

      const open = dialogOpen()
      const list = candidates().filter(b => b.inDialog || !open)
      const wanted = prefix ? `${prefix} ${event.key}` : event.key

      const hit = list.find(b => b.keys === wanted)
      if (hit) {
        event.preventDefault()
        hit.run(event)
        return
      }
      // Not a shortcut on its own, but the first half of one: hold it.
      if (!prefix && list.some(b => b.keys.startsWith(`${event.key} `))) {
        event.preventDefault()
        pending.current = { key: event.key, at: Date.now() }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return null
}

// ── the sheet ──────────────────────────────────────────────────────────────

function Key({ keys }: { keys: string }) {
  return (
    <span style={{ display: 'flex', gap: 3, flex: 'none' }}>
      {keys.split(' ').map((k, i) => (
        <kbd
          key={i}
          className="mono"
          style={{
            fontSize: 'var(--text-xs)', color: 'var(--champagne)',
            border: '1px solid var(--rule)', borderRadius: 0,
            padding: '1px 5px', minWidth: 18, textAlign: 'center',
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}

function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const bindings = useBindings().filter(b => b.label)
  const dialogRef = useDialog<HTMLDivElement>(onClose)

  // First registration of a key wins the line, so a page's own `n` is the one
  // described while that page is up.
  const seen = new Set<string>()
  const groups: { name: string; items: Binding[] }[] = []
  for (const b of bindings) {
    if (seen.has(b.keys)) continue
    seen.add(b.keys)
    const name = b.group ?? 'Other'
    const group = groups.find(g => g.name === name) ?? (groups.push({ name, items: [] }), groups[groups.length - 1])
    group.items.push(b)
  }

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 200 }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="keys-title" tabIndex={-1} className="pick">
        <div className="pick-head" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="panel-title" id="keys-title">Keyboard</span>
          <span className="pick-note">esc to close</span>
        </div>
        <div className="pick-body-scroll" style={{ paddingTop: 'var(--s3)' }}>
          {groups.map(group => (
            <div key={group.name} style={{ marginBottom: 'var(--s4)' }}>
              <div className="eyebrow" style={{ marginBottom: 'var(--s1)' }}>{group.name}</div>
              {group.items.map(b => (
                <div
                  key={b.keys}
                  className="row-line"
                  style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', padding: 'var(--s2) 0' }}
                >
                  <Key keys={b.keys} />
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--ash)' }}>{b.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── the provider ───────────────────────────────────────────────────────────

const TABS = [
  ['/', '1', 't', 'Today'],
  ['/tasks', '2', 'k', 'Tasks'],
  ['/jobs', '3', 'j', 'Jobs'],
  ['/week', '4', 'w', 'Week'],
] as const

/**
 * Sits above the router outlet: the listener, the app-wide bindings, and the
 * sheet `?` opens. Everything here is `base`, so a page may take a key back.
 */
export default function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [sheet, setSheet] = useState(false)
  const go = useCallback((href: string) => router.push(href), [router])

  useKeyboard([
    // `?` is the one binding that answers while a dialog is up — including its
    // own, where it closes the sheet again.
    { keys: '?', label: 'Show this sheet', group: 'App', inDialog: true, run: () => setSheet(s => !s) },
    ...TABS.flatMap(([href, digit, letter, name]) => [
      { keys: digit, label: `Go to ${name.toLowerCase()}`, group: 'Go', run: () => go(href) },
      // The `g`-chord spelling, for hands that learnt it elsewhere. Off the
      // sheet: the same four destinations, listed twice, is noise.
      { keys: `g ${letter}`, run: () => go(href) },
    ]),
  ], { base: true })

  return (
    <>
      <KeyboardListener />
      {children}
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
    </>
  )
}
