'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Check } from 'lucide-react'
import { Panel, Empty, labelStyle } from './ui'
import {
  daysSince, isStale, STALE_AFTER_DAYS, STATUS_COLOR, toHref,
  type Application, type Status,
} from '@/lib/jobs'

/**
 * Opening the portal answers exactly one question — is the role up yet? — and
 * the answer is worthless unless it lands back on the row. So the click that
 * opens the tab also opens this, two buttons wide, dismissable with Escape.
 * Dismissing still leaves the date stamped: you did check.
 */
function OpenPrompt({
  app, onAnswer, onClose,
}: { app: Application; onAnswer: (s: Status) => void; onClose: () => void }) {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choice = (status: Status, text: string, ref?: React.Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      onClick={() => onAnswer(status)}
      style={{
        flex: 1, cursor: 'pointer', padding: '8px 12px', borderRadius: 8,
        fontSize: 13, color: 'var(--ink-6)', background: 'var(--ink-1)',
        border: `1px solid ${STATUS_COLOR[status]}`,
      }}
    >
      {text}
    </button>
  )

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'oklch(0.12 0.01 250 / 0.6)', zIndex: 300 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Is the ${app.company_name} role open?`}
        style={{
          position: 'fixed', zIndex: 301, top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', width: 'min(340px, calc(100vw - 32px))',
          background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius)', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div>
          <div className="section-title">Checked today</div>
          <div style={{ fontSize: 14, color: 'var(--ink-6)', marginTop: 6 }}>
            Is the {app.company_name} role open?
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {choice('open', 'Open', firstRef)}
          {choice('not_open', 'Not open')}
        </div>

        <button
          onClick={onClose}
          style={{
            alignSelf: 'flex-end', cursor: 'pointer', background: 'transparent',
            border: 'none', fontSize: 'var(--text-sm)',
            color: 'var(--ink-4)',
          }}
        >
          Skip
        </button>
      </div>
    </>
  )
}

/**
 * The one thing the spreadsheet could not do.
 *
 * In the sheet, "last checked" lived inside the Status prose ("Not open
 * (checked Jul 10)"), so nothing could sort or alert on it and ten rows sat
 * seven weeks stale without anything saying so. Here it's a real date column,
 * which makes this queue possible: everything worth re-checking, oldest first,
 * one click to open the portal and stamp today.
 */
export default function StaleStrip({
  apps, today, onStamp, threshold = STALE_AFTER_DAYS,
}: {
  apps: Application[]
  today: string
  onStamp: (app: Application, status?: Status) => void
  threshold?: number
}) {
  // Held separately from the row so answering can't be interrupted by the app
  // leaving the list the moment the stamp lands.
  const [asking, setAsking] = useState<Application | null>(null)

  const stale = apps
    .filter(a => isStale(a, today, threshold))
    .sort((a, b) => (daysSince(b.portal_last_checked, today) ?? Infinity) - (daysSince(a.portal_last_checked, today) ?? Infinity))

  const oldest = stale.length > 0 ? daysSince(stale[0].portal_last_checked, today) : null

  return (
    <Panel
      title="Stale portals" aria-label="Stale portals"
      right={
        <span style={{ ...labelStyle, color: stale.length > 0 ? 'var(--warn)' : 'var(--ok)' }}>
          {stale.length === 0
            ? 'all current'
            : `${stale.length} unchecked${oldest != null ? ` · oldest ${oldest}d` : ''}`}
        </span>
      }
    >
      {stale.length === 0 ? (
        <Empty>Every open portal has been checked in the last {threshold} days.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {stale.map(app => {
            const d = daysSince(app.portal_last_checked, today)
            return (
              <div
                key={app.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px', borderTop: '1px solid var(--glass-border)',
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-6)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.company_name}
                </span>

                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', flexShrink: 0,
                  color: d == null ? 'var(--danger)' : d >= threshold * 2 ? 'var(--danger)' : 'var(--warn)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {d == null ? 'never checked' : `${d}d ago`}
                </span>

                {app.portal_url && (
                  <a
                    href={toHref(app.portal_url)}
                    target="_blank"
                    rel="noreferrer"
                    // Opening the portal is the moment you actually check it,
                    // so the click that opens it is the click that stamps it —
                    // then asks what you saw.
                    onClick={() => { onStamp(app); setAsking(app) }}
                    aria-label={`Open ${app.company_name} portal and mark checked today`}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', textDecoration: 'none',
                      color: 'var(--accent)', border: '1px solid var(--accent-border)',
                      background: 'var(--accent-dim)', borderRadius: 'var(--radius-xs)', padding: '3px 8px',
                    }}
                  >
                    Open <ExternalLink size={11} />
                  </a>
                )}

                <button
                  onClick={() => onStamp(app)}
                  aria-label={`Mark ${app.company_name} portal checked today`}
                  title="Mark checked today"
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                    cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-5)', background: 'var(--ink-1)',
                    border: 'none', borderRadius: 999, padding: '4px 11px',
                  }}
                >
                  <Check size={11} /> Checked
                </button>
              </div>
            )
          })}
        </div>
      )}

      {asking && (
        <OpenPrompt
          app={asking}
          onAnswer={status => { onStamp(asking, status); setAsking(null) }}
          onClose={() => setAsking(null)}
        />
      )}
    </Panel>
  )
}
