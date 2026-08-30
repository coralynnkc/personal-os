'use client'

import {
  committedMinutes, entityCode, entityLoads, formatHours, type Entity, type WeekDay,
} from '@/lib/weekDoc'
import { cardStyle, labelStyle } from '../jobs/ui'

/**
 * Where the week's committed hours actually went.
 *
 * The strip above says how much each *day* is holding, which is the question
 * you ask on Monday. This is the other one — the week is 26 hours and ActBlue
 * is meant to have 20 of them, so is it? The rows are the same entities that
 * tag the schedule, so a bar here and a tag over there are the same claim
 * counted twice.
 *
 * The denominator is `entities.metadata.weekly_hours` when the entity has one —
 * then the bar is a commitment and `14 / 20h` is a number you are behind on.
 * Without one it falls back to the committed week, and the bar answers the
 * softer question: is this the week's centre of gravity or a corner of it.
 */
export default function EntityLoad({
  days, vocabulary,
}: { days: WeekDay[]; vocabulary: Entity[] }) {
  const loads = entityLoads(days, vocabulary)
  if (!loads.length) return null

  return (
    <div style={cardStyle}>
      <div style={{
        ...labelStyle, display: 'flex', justifyContent: 'space-between', gap: 'var(--s3)',
        marginBottom: 'var(--s3)', paddingBottom: 'var(--s2)', borderBottom: '1px solid var(--rule)',
      }}>
        <span>Where the hours go</span>
        {/* The committed week, not the sum of the rows below — an untagged
            hour is still an hour, and the bars without a target are drawn as
            a share of this, so it is the number that has to be stated. */}
        <span>{formatHours(days.reduce((n, d) => n + committedMinutes(d), 0))}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        {loads.map(({ entity, minutes, target, fraction }) => {
          // Champagne means chosen, and an hour you promised someone is the
          // most chosen kind there is. A share of the week is not a promise,
          // so it stays in the quiet ink.
          const filled = target ? 'var(--champagne)' : 'var(--slate)'
          return (
            <div key={entity.id}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 'var(--s3)',
                marginBottom: 'var(--s2)', minWidth: 0,
              }}>
                <span
                  title={entity.name}
                  style={{ fontSize: 13, color: 'var(--ivory)', minWidth: 0, overflowWrap: 'anywhere' }}
                >
                  {entityCode(entity).toLowerCase()}
                </span>
                <span className="mono" style={{
                  marginLeft: 'auto', fontSize: 11, letterSpacing: '0.06em',
                  color: 'var(--slate)', whiteSpace: 'nowrap',
                }}>
                  {formatHours(minutes)}{target ? ` / ${target}h` : ''}
                </span>
              </div>
              <div className="wbar">
                <i style={{ width: `${Math.round(fraction * 100)}%`, background: filled }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
