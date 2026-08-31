'use client'

/**
 * The star in the margin, now a switch rather than a label — marking a task
 * key was a trip through the edit drawer, which is a lot of ceremony for one
 * boolean.
 *
 * Two stars, because a task can be key two ways and only one of them is yours
 * to set: rose ★ is the `key` flag, slate ★ is "due today", and the hollow ☆
 * is the empty slot, which only shows itself when the row is under the cursor
 * (`.ghost-action`) so a list of ordinary tasks stays quiet. Clicking always
 * toggles the flag — on a slate row that promotes it from a star the date
 * lent it to one of its own.
 */
export default function KeyStar({ keyed, implicit, onToggle, size = 10 }: {
  keyed: boolean
  /** Key by virtue of the date, not the flag. */
  implicit?: boolean
  onToggle: () => void
  size?: number
}) {
  const label = keyed
    ? 'Key task — click to unmark'
    : implicit
      ? 'Key because it is due today — click to mark it key in its own right'
      : 'Mark as key task'

  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      // Keyboard reaches the row, not this: `j`/`k` walk the rows and a star
      // in every one of them would double the stops on the way.
      tabIndex={-1}
      className={keyed || implicit ? undefined : 'ghost-action'}
      title={label}
      aria-label={label}
      aria-pressed={keyed}
      style={{
        flexShrink: 0, alignSelf: 'center',
        background: 'none', border: 0, borderRadius: 0, padding: 0, margin: 0,
        lineHeight: 1, cursor: 'pointer',
        fontSize: size, width: size + 4,
        color: keyed ? 'var(--rose)' : 'var(--slate)',
      }}
    >
      {keyed || implicit ? '★' : '☆'}
    </button>
  )
}
