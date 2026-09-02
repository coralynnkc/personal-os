'use client'

import { ExternalLink } from 'lucide-react'
import { Panel, Empty, labelStyle } from './ui'
import { buildBriefing, type BriefingItem } from '@/lib/briefing'
import { toHref, type Application } from '@/lib/jobs'

/**
 * The half of the old Notes view that writes itself: what is open and waiting
 * on you, what has gone quiet long enough to chase, what is actually in the
 * diary. None of it is typed, so none of it can go stale — a line leaves this
 * view the moment the row it describes moves.
 *
 * It sits above the board rather than behind a tab of its own, because every
 * line here is a pipeline row and the board is where you act on one.
 */

function Row({ item, onOpen }: { item: BriefingItem; onOpen: (a: Application) => void }) {
  const { app, detail } = item
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
      padding: 'var(--s2) 0', borderTop: '1px solid var(--rule-2)',
    }}>
      <button
        onClick={() => onOpen(app)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0,
          padding: 0, cursor: 'pointer', fontSize: 13, color: 'var(--ivory)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {app.company_name}
        {app.role_title && (
          <span style={{ color: 'var(--slate)' }}> · {app.role_title}</span>
        )}
      </button>

      <span className="mono" style={{
        flexShrink: 0, fontSize: 11, color: 'var(--slate)',
        letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums',
      }}>
        {detail}
      </span>

      {app.portal_url && (
        <a
          href={toHref(app.portal_url)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${app.company_name} portal`}
          style={{ flexShrink: 0, display: 'flex', color: 'var(--champagne)' }}
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

/**
 * How many rows a section shows before it stops. These lists sit above the
 * board, so an uncapped one buries it — thirty-one open portals is a column,
 * not a briefing. The rows are already ranked, so the cut keeps the top of
 * each list and says how much it left behind.
 */
const MAX_ROWS = 5

function Section({
  title, items, empty, onOpen, tone = 'var(--slate)',
}: {
  title: string
  items: BriefingItem[]
  empty: string
  onOpen: (a: Application) => void
  tone?: string
}) {
  return (
    <Panel
      title={title}
      right={
        <span style={{ ...labelStyle, color: items.length > 0 ? tone : 'var(--ok)' }}>
          {items.length === 0 ? 'clear' : items.length}
        </span>
      }
    >
      {items.length === 0
        ? <Empty>{empty}</Empty>
        : items.slice(0, MAX_ROWS).map(i => <Row key={i.app.id} item={i} onOpen={onOpen} />)}
      {items.length > MAX_ROWS && (
        <div className="mono" style={{
          fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--slate)', padding: 'var(--s2) 0',
          borderTop: '1px solid var(--rule-2)',
        }}>
          + {items.length - MAX_ROWS} more on the board
        </div>
      )}
    </Panel>
  )
}

export default function Briefing({
  apps, today, onOpen,
}: { apps: Application[]; today: string; onOpen: (a: Application) => void }) {
  const brief = buildBriefing(apps, today)

  return (
    <div className="grid gap-6 items-start grid-cols-1 lg:grid-cols-3">
      <Section
        title="Open — not applied"
        items={brief.open}
        empty="Nothing confirmed open is waiting on you."
        onOpen={onOpen}
        tone="var(--amber)"
      />
      <Section
        title="Worth chasing"
        items={brief.followUp}
        empty="Nothing has gone quiet long enough to chase."
        onOpen={onOpen}
        tone="var(--coral)"
      />
      <Section
        title="Coming up"
        items={brief.upcoming}
        empty="No interviews in the next fortnight."
        onOpen={onOpen}
        tone="var(--royal)"
      />
    </div>
  )
}
