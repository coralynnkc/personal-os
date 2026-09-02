// What the pipeline already knows about today.
//
// The Notes view is two halves. This is the half that writes itself: three
// questions the board can answer without being asked — what is open and
// waiting on you, what has gone quiet long enough to chase, and what is
// actually in the diary. Deriving them beats a checklist because a derived
// line disappears when the thing is done, and a checklist line does not.
//
// Pure and synchronous on purpose: it runs on rows the /jobs tab has already
// fetched, so the view costs no extra request and re-derives instantly when a
// status changes under it.

import { daysSince, type Application, type Status } from '@/lib/jobs'

/** A submitted application with no movement for this long wants a nudge. */
export const FOLLOW_UP_AFTER_DAYS = 21

/** In an interview loop, silence gets uncomfortable much sooner. */
export const LOOP_FOLLOW_UP_AFTER_DAYS = 7

/** How far ahead the diary section looks. */
export const INTERVIEW_HORIZON_DAYS = 14

const IN_LOOP: Status[] = ['oa', 'phone', 'onsite']

export type BriefingItem = {
  app: Application
  /** The reason this row is on the list, already phrased for display. */
  detail: string
  /** Sort key — bigger is more overdue / sooner. */
  rank: number
}

export type Briefing = {
  /** Portals confirmed open that you have not applied to yet. */
  open: BriefingItem[]
  /** Sent, then silence. */
  followUp: BriefingItem[]
  /** Dated interviews inside the horizon. */
  upcoming: BriefingItem[]
}

// Stale portals are deliberately absent: the stale strip already sits above
// every view on this tab, and a second copy of that queue would be one more
// place to clear the same thing.

/** Days since the row last changed in any way, from updated_at. */
function daysSinceTouched(app: Application, today: string): number | null {
  if (!app.updated_at) return null
  return daysSince(app.updated_at.slice(0, 10), today)
}

function byRank(a: BriefingItem, b: BriefingItem) {
  return b.rank - a.rank
}

export function buildBriefing(apps: Application[], today: string): Briefing {
  const open: BriefingItem[] = []
  const followUp: BriefingItem[] = []
  const upcoming: BriefingItem[] = []

  for (const app of apps) {
    // Open and unapplied. Ranked by how long it has been sitting there, so the
    // one you have been avoiding longest is the one at the top.
    if (app.status === 'open') {
      const waiting = daysSinceTouched(app, today)
      open.push({
        app,
        detail: waiting == null ? 'open' : waiting === 0 ? 'opened today' : `open ${waiting}d`,
        rank: waiting ?? 0,
      })
    }

    // Silence after a submission. An interview loop is held to the tighter
    // clock: three weeks of nothing after applying is normal, three weeks of
    // nothing after an onsite is not.
    const inLoop = IN_LOOP.includes(app.status)
    if (app.status === 'applied' || inLoop) {
      const threshold = inLoop ? LOOP_FOLLOW_UP_AFTER_DAYS : FOLLOW_UP_AFTER_DAYS
      const quiet = daysSinceTouched(app, today)
      if (quiet != null && quiet >= threshold) {
        followUp.push({ app, detail: `no movement in ${quiet}d`, rank: quiet })
      }
    }

    // The diary. Past dates are dropped rather than shown as overdue — an
    // interview that has happened is not a thing to prepare for.
    const until = app.interview_on ? -(daysSince(app.interview_on, today) ?? 0) : null
    if (until != null && until >= 0 && until <= INTERVIEW_HORIZON_DAYS) {
      upcoming.push({
        app,
        detail: until === 0 ? 'today' : until === 1 ? 'tomorrow' : `in ${until}d`,
        // Soonest first, so this list ranks inverted against the others.
        rank: INTERVIEW_HORIZON_DAYS - until,
      })
    }
  }

  return {
    open: open.sort(byRank),
    followUp: followUp.sort(byRank),
    upcoming: upcoming.sort(byRank),
  }
}
