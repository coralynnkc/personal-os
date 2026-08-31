'use client'

import { useEffect, useRef } from 'react'

/**
 * The four things every modal owes a keyboard: Escape closes it, Tab stays
 * inside it, focus starts in it, and focus goes back where it came from.
 *
 * One hook rather than a listener per component so nesting behaves — a stack
 * of open dialogs means only the topmost answers Escape. (Two document-level
 * listeners can't sort that out between themselves: stopPropagation does
 * nothing between handlers on the same node, and registration order puts the
 * *outer* dialog first.)
 *
 * Usage: spread the returned ref onto the dialog element, and give that element
 * `role="dialog" aria-modal="true" tabIndex={-1}` plus a label.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Topmost-last. Only the last entry answers Escape and traps Tab. */
const stack: object[] = []

function focusableIn(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    // offsetParent is null for display:none — good enough here, and cheap.
    .filter(el => el.offsetParent !== null || el === document.activeElement)
}

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  options: { autoFocus?: boolean } = {},
) {
  const ref = useRef<T>(null)
  // Read through a ref so a fresh inline onClose doesn't re-run the effect and
  // steal focus back to the top of the dialog on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const autoFocus = options.autoFocus !== false

  useEffect(() => {
    const token = {}
    stack.push(token)
    const isTop = () => stack[stack.length - 1] === token

    const restore = document.activeElement as HTMLElement | null
    const node = ref.current

    // A field with `autoFocus`, or a call site's own focus() in a layout
    // effect, has already run by now; don't fight it.
    if (node && autoFocus && !node.contains(document.activeElement)) {
      (focusableIn(node)[0] ?? node).focus()
    }

    const onKey = (event: KeyboardEvent) => {
      const el = ref.current
      if (!el || !isTop()) return

      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusableIn(el)
      const active = document.activeElement
      if (items.length === 0) {
        event.preventDefault()
        el.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !el.contains(active)
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(token)
      if (i !== -1) stack.splice(i, 1)
      // Only take focus back if the dialog still had it — a close that moved
      // focus somewhere deliberate shouldn't be undone.
      const active = document.activeElement
      const held = !active || active === document.body || ref.current?.contains(active)
      if (held && restore && restore.isConnected) restore.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}

/**
 * Whether any dialog is currently open. The keyboard registry asks this: a
 * page-level shortcut must not fire behind a modal that has the screen.
 */
export function dialogOpen(): boolean {
  return stack.length > 0
}
