'use client'

import { inline } from '@/lib/markdown'
import { dayChipParts, type Carried } from '@/lib/weekDoc'
import { cardStyle, labelStyle } from '../jobs/ui'

/**
 * The rows of a day that is over that never got checked off.
 *
 * The week doc has no idea a day ended; it states Tuesday as confidently on
 * Friday as it did on Monday. This is the one place the app says the thing the
 * file cannot: that was the plan, and this part of it is still waiting. It
 * only speaks about days you actually checked boxes on (see `carriedOver`), so
 * it stays quiet rather than accusing.
 */
export default function CarriesOver({ items }: { items: Carried[] }) {
  if (!items.length) return null

  return (
    <div style={cardStyle}>
      <div style={{
        ...labelStyle, display: 'flex', justifyContent: 'space-between', gap: 'var(--s3)',
        marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)',
      }}>
        <span>Carries over</span>
        <span style={{ color: 'var(--amber)' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(({ day, row }) => {
          const { weekday, num } = dayChipParts(day)
          return (
            <div
              key={`${day.id}-${row.id}`}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
                padding: 'var(--s2) 0', borderBottom: '1px solid var(--rule-2)', minWidth: 0,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
                color: 'var(--slate)', whiteSpace: 'nowrap',
              }}>
                {weekday}{num ? ` ${num}` : ''}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ash)', minWidth: 0, overflowWrap: 'anywhere' }}>
                {inline(row.rawWhat, row.id)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
