'use client'

import { useCallback, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useDialog } from '@/lib/useDialog'

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

// ── Confirm ────────────────────────────────────────────────────────────────

type ConfirmRequest = {
  message: string
  confirmLabel: string
  resolve: (ok: boolean) => void
}

/**
 * `window.confirm` for a page that has a design.
 *
 * The native dialog is the one piece of chrome the surface never got to style,
 * and it blocks the whole tab while it is up. This keeps the shape of the call
 * that made it worth using — a question, awaited, answered yes or no, right
 * where the handler already stood — so a call site only grows an `await`:
 *
 *     const [confirm, confirmDialog] = useConfirm()
 *     if (!(await confirm(`Delete "${task.title}"?`))) return
 *     …
 *     return <>{…}{confirmDialog}</>
 *
 * The returned node is null until something asks, so rendering it costs
 * nothing. Destructive by default: the verb is `Delete` and focus starts on
 * Cancel, because the dangerous answer should never be the one Enter gives.
 */
export function useConfirm(): [
  (message: string, confirmLabel?: string) => Promise<boolean>,
  ReactNode,
] {
  const [pending, setPending] = useState<ConfirmRequest | null>(null)

  const confirm = useCallback(
    (message: string, confirmLabel = 'Delete') =>
      new Promise<boolean>(resolve => setPending({ message, confirmLabel, resolve })),
    [],
  )

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const node = pending
    ? <ConfirmDialog request={pending} onSettle={settle} />
    : null

  return [confirm, node]
}

function ConfirmDialog({ request, onSettle }: {
  request: ConfirmRequest
  onSettle: (ok: boolean) => void
}) {
  // A question with no answer yet is still a "no" — Escape, the scrim, and an
  // unmount all mean the same thing as Cancel.
  const dialogRef = useDialog<HTMLDivElement>(() => onSettle(false))

  return (
    <>
      <div
        onClick={() => onSettle(false)}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 200 }}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-message"
        tabIndex={-1}
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(360px, calc(100vw - var(--s5)))', background: 'var(--tint)',
          border: '1px solid var(--rule)', borderRadius: 0, zIndex: 201,
          padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 'var(--s5)',
        }}
      >
        <p id="confirm-message" style={{
          margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ivory)',
        }}>
          {request.message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s4)' }}>
          <button onClick={() => onSettle(false)} style={buttonStyle}>Cancel</button>
          <button
            onClick={() => onSettle(true)}
            style={{ ...buttonStyle, color: 'var(--danger)' }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
