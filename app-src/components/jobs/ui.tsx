'use client'

import type { CSSProperties, ReactNode } from 'react'

// The shared chrome. This started as a place to stop the /jobs tab
// copy-pasting the dashboard's card styles; it is now the design vocabulary,
// and new code should reach for these before writing a style object.
//
// Anything that can be a real CSS class lives in globals.css instead —
// `.card`, `.tile`, `.chip`, `.tap`, `.panel-title` — because inline styles
// cannot express :hover or :active, which is why most of this app's buttons
// used to be visually inert.

export const cardStyle: CSSProperties = {
  background: 'var(--glass)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius)',
  backdropFilter: 'blur(16px)',
  overflow: 'hidden',
}

/**
 * The quiet label opposite a heading — a count, a status, a unit. Headings
 * themselves use `className="panel-title"` (or `section-title`), which is
 * bigger and brighter; this is deliberately the other half of that pair.
 */
export const labelStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: 'var(--ink-4)',
}

export function Panel({
  title, right, children, style,
}: { title: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="card" style={style}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '14px 18px 12px',
      }}>
        <span className="panel-title">{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

/**
 * The dashboard's existing widgets render a network failure as an empty state,
 * which makes an outage look like a quiet day. Everything new here shows the
 * error and offers a retry instead.
 */
export function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '11px 14px', margin: '8px 14px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--danger-dim)',
        fontSize: 'var(--text-base)', color: 'var(--ink-6)',
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          className="tap"
          onClick={onRetry}
          style={{
            flexShrink: 0, cursor: 'pointer', fontSize: 'var(--text-sm)',
            fontWeight: 500, color: 'var(--danger)',
            background: 'transparent', border: '1px solid var(--danger)',
            borderRadius: 999, padding: '3px 12px',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink-3)', padding: '12px 18px' }}>
      {children}
    </div>
  )
}

/**
 * A chip is a soft fill, never an outline. The rows these sit on already have
 * a card edge and a checkbox; a bordered chip made a five-rectangle row out of
 * what is really one task.
 */
export function Pill({ color, mono, children }: { color: string; mono?: boolean; children: ReactNode }) {
  return (
    <span
      className={mono ? 'chip chip-num' : 'chip'}
      style={{ color, background: `color-mix(in oklch, ${color} 16%, transparent)` }}
    >
      {children}
    </span>
  )
}

export const buttonStyle: CSSProperties = {
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: 'var(--ink-5)',
  background: 'var(--ink-1)',
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  padding: '6px 14px',
}
