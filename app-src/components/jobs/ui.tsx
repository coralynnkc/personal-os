'use client'

import type { CSSProperties, ReactNode } from 'react'

// The card chrome that the four dashboard widgets each copy-paste. Collected
// here so the /jobs tab states it once; the wider refactor of the existing
// widgets is tracked separately.
export const cardStyle: CSSProperties = {
  background: 'var(--glass)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius)',
  backdropFilter: 'blur(16px)',
  overflow: 'hidden',
}

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  color: 'var(--ink-4)',
  textTransform: 'uppercase',
}

export function Panel({
  title, right, children, style,
}: { title: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px 10px', borderBottom: '1px solid var(--glass-border)',
      }}>
        <span style={labelStyle}>{title}</span>
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
        gap: 12, padding: '10px 12px', margin: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--danger)',
        background: 'oklch(0.65 0.20 25 / 0.12)',
        fontSize: 13, color: 'var(--ink-6)',
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            flexShrink: 0, cursor: 'pointer', fontSize: 11,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--ink-6)',
            background: 'transparent', border: '1px solid var(--danger)',
            borderRadius: 6, padding: '3px 10px',
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
    <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', padding: '10px 16px' }}>
      {children}
    </div>
  )
}

export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
      textTransform: 'uppercase', color, border: `1px solid ${color}`,
      borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

export const buttonStyle: CSSProperties = {
  cursor: 'pointer',
  fontSize: 12,
  color: 'var(--ink-5)',
  background: 'var(--ink-1)',
  border: '1px solid var(--glass-border)',
  borderRadius: 6,
  padding: '5px 10px',
}
