'use client'

import { Panel, Empty, labelStyle } from './ui'
import { WAVES, STATUS_COLOR, type Application, type Status } from '@/lib/jobs'

const IN_FLIGHT: Status[] = ['applied', 'oa', 'phone', 'onsite', 'offer']
const CLOSED: Status[] = ['rejected', 'ghosted', 'no_roles']

/**
 * Wave milestones, derived.
 *
 * The old home-screen widget hardcoded a dated map of "Wave 1 — apply to Amex,
 * Capital One" strings that knew nothing about the tracker and went stale the
 * day they passed. The useful version of that nudge is computed: for each wave,
 * how many portals are live and still unapplied.
 */
export default function WaveStrip({ apps }: { apps: Application[] }) {
  const waves = WAVES.map(wave => {
    const rows = apps.filter(a => a.wave === wave)
    return {
      wave,
      total: rows.length,
      open: rows.filter(a => a.status === 'open').length,
      inFlight: rows.filter(a => IN_FLIGHT.includes(a.status)).length,
      waiting: rows.filter(a => a.status === 'not_open' || a.status === 'researching').length,
      closed: rows.filter(a => CLOSED.includes(a.status)).length,
    }
  }).filter(w => w.total > 0)

  const actionable = waves.reduce((s, w) => s + w.open, 0)

  return (
    <Panel
      title="Waves" aria-label="Waves"
      right={
        <span style={{ ...labelStyle, color: actionable > 0 ? 'var(--warn)' : 'var(--ink-4)' }}>
          {actionable > 0 ? `${actionable} open, not applied` : 'nothing waiting on you'}
        </span>
      }
    >
      {waves.length === 0 ? (
        <Empty>No applications yet. Track a company from Targets to start a wave.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {waves.map(w => (
            <div
              key={w.wave}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 16px', borderTop: '1px solid var(--glass-border)',
              }}
            >
              <span style={{ width: 72, flexShrink: 0, fontSize: 13, color: 'var(--ink-6)' }}>{w.wave}</span>

              {/* Proportional bar: in-flight / open / still waiting */}
              <div style={{ flex: 1, display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', background: 'var(--ink-1)', minWidth: 60 }}>
                {([
                  [w.inFlight, STATUS_COLOR.applied],
                  [w.open,     STATUS_COLOR.open],
                  [w.waiting,  'var(--ink-2)'],
                  [w.closed,   'var(--ink-1)'],
                ] as const).map(([n, color], i) =>
                  n > 0 ? <div key={i} style={{ width: `${(n / w.total) * 100}%`, background: color }} /> : null,
                )}
              </div>

              <span style={{
                flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums',
              }}>
                {w.inFlight}/{w.total} in flight
                {w.open > 0 && <span style={{ color: 'var(--warn)' }}> · {w.open} open</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
