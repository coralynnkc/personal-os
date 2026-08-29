'use client'

import { ExternalLink, Check } from 'lucide-react'
import { Panel, Empty, labelStyle } from './ui'
import { daysSince, isStale, STALE_AFTER_DAYS, toHref, type Application } from '@/lib/jobs'

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
  onStamp: (app: Application) => void
  threshold?: number
}) {
  const stale = apps
    .filter(a => isStale(a, today, threshold))
    .sort((a, b) => (daysSince(b.portal_last_checked, today) ?? Infinity) - (daysSince(a.portal_last_checked, today) ?? Infinity))

  const oldest = stale.length > 0 ? daysSince(stale[0].portal_last_checked, today) : null

  return (
    <Panel
      title="Stale portals"
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
                  fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0,
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
                    // so the click that opens it is the click that stamps it.
                    onClick={() => onStamp(app)}
                    aria-label={`Open ${app.company_name} portal and mark checked today`}
                    style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontFamily: 'var(--font-mono)', textDecoration: 'none',
                      color: 'var(--accent)', border: '1px solid var(--accent-border)',
                      background: 'var(--accent-dim)', borderRadius: 6, padding: '3px 8px',
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
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-5)', background: 'var(--ink-1)',
                    border: '1px solid var(--glass-border)', borderRadius: 6, padding: '3px 8px',
                  }}
                >
                  <Check size={11} /> Checked
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
