'use client'

import type { CSSProperties, ReactNode } from 'react'

// The shared chrome. There are no cards any more: a panel is a run of rows
// under a title, separated from what follows it by a hairline.
export const cardStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  borderRadius: 0,
  minWidth: 0,
}

export const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.2em',
  color: 'var(--slate)',
  textTransform: 'uppercase',
}

/** A region title: Italianno, with its count hanging right. */
export function RegionHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
      marginBottom: 'var(--s4)', minHeight: 22,
    }}>
      <h2 className="display" style={{ fontSize: 28, margin: 0, color: 'var(--ivory)' }}>{title}</h2>
      <span className="mono" style={{
        marginLeft: 'auto', fontSize: 10, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: 'var(--slate)',
      }}>
        {right}
      </span>
    </div>
  )
}

export function Panel({
  title, right, children, style,
}: { title: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...cardStyle, ...style }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 'var(--s3)', paddingBottom: 'var(--s2)', marginBottom: 'var(--s3)',
        borderBottom: '1px solid var(--rule)',
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
 * error and offers a retry instead. Coral is otherwise reserved for "late",
 * and this is the other thing that is genuinely wrong.
 */
export function ErrorRow({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 'var(--s3)', padding: 'var(--s2) 0',
        borderTop: '1px solid var(--coral)', borderBottom: '1px solid var(--coral)',
        fontSize: 13, color: 'var(--ivory)',
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mono"
          style={{
            flexShrink: 0, cursor: 'pointer', fontSize: 10, textTransform: 'uppercase',
            letterSpacing: '0.16em', color: 'var(--coral)',
            background: 'transparent', border: 0, padding: 0,
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
    <div style={{ fontSize: 13, color: 'var(--slate)', padding: 'var(--s2) 0' }}>
      {children}
    </div>
  )
}

/** A pill is now just tinted text — the border was chrome doing nothing. */
export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="mono" style={{
      fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
      color, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {children}
    </span>
  )
}

export const buttonStyle: CSSProperties = {
  cursor: 'pointer',
  fontSize: 12.5,
  letterSpacing: '0.06em',
  color: 'var(--slate)',
  background: 'transparent',
  border: 0,
  borderRadius: 0,
  padding: '2px 0',
}
