/**
 * How something a planning document says is joined to the `tasks` row that
 * tracks it.
 *
 * Plain `.mjs`, and deliberately so: the app imports this through
 * `lib/weekDoc.ts`, and `scripts/check-week-links.mjs` imports it directly
 * from node, which cannot load the app's TypeScript. Every reader of the join
 * — the row that renders `tracked`, the checkbox that writes through it,
 * "carries over", and the diagnostic — has to be asking the *same* fuzzy
 * matcher the same question, or the diagnostic would confidently report links
 * the app doesn't make. Types live in `taskMatch.d.mts`.
 */

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'of', 'to', 'in', 'is', 'due', 'my'])

/**
 * The words of a title that carry meaning. No stemming and no synonyms — `hw`
 * and `homework` are two different words, which is the single most common
 * reason a row and its task fail to find each other.
 */
export function tokens(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
}

/** The arm a day's stored answer picks, or null while the fork is open. */
export function chosenArm(row, choice) {
  if (!row.branch || !choice) return null
  return row.branch.arms.find((a) => a.id === choice) ?? null
}

/**
 * What the row actually says, once the week has answered it. An unresolved
 * fork still says the whole sentence — the chooser shows the arms separately,
 * and hiding the raw text before there is an answer would be the parser
 * deciding something the author didn't.
 */
export function rowWhat(row, choice) {
  const arm = chosenArm(row, choice)
  if (!arm) return row.rawWhat
  return arm.what ?? row.branch.arms[0].what ?? row.rawWhat
}

/** Resolved to the arm where the row doesn't happen. */
export function rowSkipped(row, choice) {
  return chosenArm(row, choice)?.what === null
}

/**
 * A row's title, as opposed to everything else the What cell is carrying.
 *
 * The docs write a row as **the thing** — why it matters, which is prose the
 * author is talking to herself in and no task row will ever contain. Matching
 * on the whole cell drags that commentary into the token set and drowns the
 * three words that identify the work, so the em dash is the cut.
 */
export function rowTitle(row, choice) {
  const plain = rowWhat(row, choice).replace(/[*`_]/g, '').trim()
  return plain.split(/\s+[—–]\s+/)[0].trim()
}

/**
 * The titles a row is allowed to be known by, best first.
 *
 * The em dash is the cut that always holds — everything after it is the author
 * talking to herself. A colon is the one that doesn't: `On the plane: The
 * Elements of Scrum` puts the work on the *right*, and `ACT 410: read chapter
 * 3` puts it on the left, and the file gives no way to tell which. So neither
 * side replaces the title; both are offered *after* it, and the high threshold
 * stays the thing that says no. A row still joins on its whole title whenever
 * it can, and only falls back to a half when the whole one misses.
 *
 * The tail goes before the head because the colon is usually read as a label —
 * `Reading:`, `Optional:`, `On the plane:` — and a label is the half that
 * isn't the work.
 */
export function titleCandidates(title) {
  const at = title.indexOf(':')
  if (at === -1) return [title]
  const head = title.slice(0, at).trim()
  const tail = title.slice(at + 1).trim()
  return [title, tail, head].filter((t, i, all) => t && all.indexOf(t) === i)
}

/**
 * The first of a row's titles that finds a task, and which one it was.
 *
 * Ordered, not scored across candidates: the halves exist to rescue a row the
 * whole title misses, never to outrank it. `via` is what the diagnostic prints
 * so a join made on half a row is visible as one.
 */
export function matchAny(titles, date, tasks, options) {
  for (const title of titles) {
    const task = matchTask({ title, date }, tasks, options)
    if (task) return { task, title }
  }
  return null
}

/**
 * How well one task answers to a title, and why. Split out of `matchTask` so
 * the diagnostic can report a near miss — "this scored 0.75, it wanted
 * `homework`" — instead of only ever saying no.
 */
export function scoreTask(target, task) {
  const want = tokens(target.title)
  const have = new Set(tokens(task.title))
  const missing = want.filter((t) => !have.has(t))
  const dated = task.due_date === target.date
  return {
    want,
    missing,
    dated,
    score: (want.length - missing.length) / (want.length || 1) + (dated ? 0.15 : 0),
  }
}

/**
 * Join something the document says to the `tasks` row that actually tracks it.
 * Titles are written twice by hand and drift ("ACT 420 HW 2" vs "ACT 420
 * Homework 2"), so this is deliberately fuzzy: most of the document's words
 * have to appear in the task, and the due date has to agree if the task has
 * one. The doc proposes; `tasks` stays the system of record, so a wrong match
 * is worse than no match and the threshold sits high.
 *
 * A deadline and a schedule row want the date read differently, which is what
 * the options are for. A deadline *is* a date — a task due a different day is
 * a different deadline, so a disagreement disqualifies. A schedule row is the
 * hour you work on something, and working on Saturday on a thing due Tuesday
 * is the normal case — so dates never disqualify a row, they only add
 * confidence, and the threshold rises to pay for it.
 *
 * Completed tasks are in scope — a row has to keep finding its task *after*
 * you tick it, or the join would evaporate at the moment it matters. They lose
 * ties, though: two rows named the same way mean last week's finished one and
 * this week's open one, and the open one is the one you are looking at.
 */
export function matchTask(target, tasks, { requireDate = true, threshold = 0.6, minTokens = 1 } = {}) {
  if (tokens(target.title).length < minTokens) return null

  let best = null
  for (const task of tasks) {
    if (requireDate && task.due_date && task.due_date !== target.date) continue
    const { score } = scoreTask(target, task)
    if (score < threshold) continue
    const better = !best
      || score > best.score
      || (score === best.score && !task.completed_at && Boolean(best.task.completed_at))
    if (better) best = { task, score }
  }
  return best?.task ?? null
}

/** The bar a schedule row has to clear. Exported so nothing hardcodes it twice. */
export const ROW_MATCH = { requireDate: false, threshold: 0.8, minTokens: 2 }

/**
 * The task behind one row of the schedule.
 *
 * The join lives here rather than in the component because four places need
 * the same answer to the same question — the row renders it, the checkbox
 * writes through it, "carries over" has to know the row is finished, and the
 * link check reports on it — and four fuzzy matchers tuned separately would
 * drift.
 *
 * `link` is the week's own answer, from `daily_logs.notes.week.links`: the
 * matcher is fuzzy and half the rows miss, so a row you joined by hand has to
 * stay joined and never be re-guessed.
 */
export function rowTask(row, date, tasks, choice, link) {
  // A link the week wrote by hand outranks the guess, in both directions:
  // `NO_TASK` is the answer "nothing tracks this", and a link to a task that
  // has since been deleted falls back to guessing rather than to nothing.
  if (link === NO_TASK) return null
  if (link) {
    const linked = tasks.find((t) => t.id === link)
    if (linked) return linked
  }
  if (!date) return null
  return matchAny(titleCandidates(rowTitle(row, choice)), date, tasks, ROW_MATCH)?.task ?? null
}

/**
 * The link that says "nothing tracks this row".
 *
 * A hand link has to be able to say no as well as yes: the fuzzy matcher
 * sometimes joins a row to a task that isn't it, and deleting the link would
 * only let the same wrong match come straight back. So the stored value is
 * either a task id or this — and clearing the link entirely (`null`) is the
 * third thing, meaning "go back to guessing".
 */
export const NO_TASK = 'none'

/**
 * The tasks worth offering for a row, best first.
 *
 * `matchTask` answers yes or no at a high threshold, because a wrong automatic
 * join is worse than none. A person choosing from a list is under no such
 * constraint — they can see the near misses and pick — so this ranks instead
 * of filtering: everything sharing a word with the row, ordered by how much of
 * the row's title the task accounts for, with the open one ahead of the
 * finished one on a tie.
 */
export function suggestTasks(target, tasks, { limit = 6 } = {}) {
  return tasks
    .map((task) => ({ task, ...scoreTask(target, task) }))
    .filter((c) => c.missing.length < c.want.length)
    .sort((a, b) => (
      b.score - a.score
      || Number(Boolean(a.task.completed_at)) - Number(Boolean(b.task.completed_at))
      || a.task.title.localeCompare(b.task.title)
    ))
    .slice(0, limit)
}
