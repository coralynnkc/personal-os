/**
 * Parser for the handwritten planning docs in ~/Documents/1-school/planning/.
 *
 * These are documents a person types, not a serialisation format, so the
 * failure mode here must always be "renders as prose" — never "drops content"
 * and never "throws". Every row and section keeps its raw source text next to
 * whatever structure we managed to pull out of it, so an unclassified row
 * still renders exactly as written.
 *
 * Parsing happens once at sync time and the result is stored in
 * documents.parsed; the client reads structured JSON and only renders markdown
 * for prose.
 */

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
}

// Longest-first, so `September` isn't cut short to `Sep`.
const MONTH_WORDS = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

const DAY_NAMES = 'Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday'

// `## Sat Aug 29 — getting ahead`, `## Mon Sept 7 — Labor Day`, and the
// two-day form `## Sat Sept 5 – Sun Sept 6`. Anything else at `##` is a
// thematic section.
const DAY_HEADING = new RegExp(
  `^(${DAY_NAMES})\\s+([A-Za-z]+)\\s+(\\d{1,2})` +
  `(?:\\s*[–—-]\\s*(?:${DAY_NAMES})\\s+([A-Za-z]+)\\s+(\\d{1,2}))?` +
  `(?:\\s*[—–]\\s*(.+))?$`,
  'i',
)

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

function pad(n) { return String(n).padStart(2, '0') }

function toKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/**
 * The docs write "Sept 8" with no year. Pick the year that puts the date
 * closest to the week the document is about, so a week spanning New Year's
 * doesn't jump twelve months.
 */
function resolveYear(month, day, anchor) {
  const [ay, am, ad] = anchor.split('-').map(Number)
  const anchorMs = Date.UTC(ay, am - 1, ad)
  let best = null
  for (const y of [ay - 1, ay, ay + 1]) {
    const diff = Math.abs(Date.UTC(y, month, day) - anchorMs)
    if (!best || diff < best.diff) best = { y, diff }
  }
  return best.y
}

function dateFromMonthDay(monthWord, day, anchor) {
  const month = MONTHS[String(monthWord).toLowerCase()]
  if (month === undefined) return null
  const d = Number(day)
  if (!d || d > 31) return null
  return toKey(resolveYear(month, d, anchor), month, d)
}

/** `9/8`, `Sept 8`, `8:00 AM Tuesday Sept 8` → a date key, or null. */
export function parseDateish(text, anchor) {
  if (!text) return null
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (slash) {
    const month = Number(slash[1]) - 1
    const day = Number(slash[2])
    if (month < 0 || month > 11 || day < 1 || day > 31) return null
    if (slash[3]) {
      const y = Number(slash[3])
      return toKey(y < 100 ? 2000 + y : y, month, day)
    }
    return toKey(resolveYear(month, day, anchor), month, day)
  }
  const worded = text.match(new RegExp(`\\b(${MONTH_WORDS})\\.?\\s+(\\d{1,2})\\b`, 'i'))
  if (worded) return dateFromMonthDay(worded[1], worded[2], anchor)
  return null
}

/** `8:00 AM`, `11:59 PM` inside a sentence → 'HH:MM', or null. */
function parseClockPhrase(text) {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (/^p/i.test(m[3])) h += 12
  return `${pad(h)}:${m[2] ?? '00'}`
}

/**
 * Times in a `| Time |` cell: `2:30–3:45`, `**8:00–11:30**`, `8–11 PM ET`.
 *
 * Meridiem is almost never written, so it's inferred: 8–11 is morning, 12–7 is
 * afternoon/evening. That guess is then corrected against the rest of the
 * table — rows are in chronological order, so a row that lands before the one
 * above it gets pushed twelve hours forward (which is how "9:15–10:45" at the
 * bottom of a day reads as the evening it obviously is).
 */
function inferHour(h, explicit) {
  if (explicit) return (h % 12) + (explicit === 'pm' ? 12 : 0)
  if (h === 12) return 12
  return h <= 7 ? h + 12 : h
}

function parseTimeCell(raw) {
  const text = raw.replace(/\*\*/g, '').trim()

  const range = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i,
  )
  if (range) {
    const tail = /(a\.?m\.?|p\.?m\.?)/i.exec(text)
    const mer = (s) => (s ? (/^p/i.test(s) ? 'pm' : 'am') : null)
    // "8–11 PM": the meridiem written once at the end covers both ends.
    const endMer = mer(range[6]) ?? (range[3] ? null : mer(tail?.[1]))
    const startMer = mer(range[3]) ?? (range[6] ? null : endMer)
    const sh = inferHour(Number(range[1]), startMer)
    const eh = inferHour(Number(range[4]), endMer)
    const start = `${pad(sh)}:${range[2] ?? '00'}`
    const end = `${pad(eh)}:${range[5] ?? '00'}`
    return { kind: 'timed', start, end, explicitMeridiem: Boolean(startMer) }
  }

  // `~90 min`, `5 min`, `2h`, `1.75h` — a budget with no place on the clock.
  const dur = text.match(/^~?\s*(\d+(?:\.\d+)?)\s*(min(?:ute)?s?|h(?:rs?|ours?)?)\b/i)
  if (dur) {
    const n = Number(dur[1])
    return { kind: 'duration', durationMin: Math.round(/^h/i.test(dur[2]) ? n * 60 : n) }
  }

  return { kind: 'untimed' }
}

function minutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function addHalfDay(hhmm) {
  const total = (minutes(hhmm) + 720) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** Push rows forward twelve hours until the table reads chronologically. */
function enforceMonotonic(rows) {
  let floor = -1
  for (const row of rows) {
    if (row.kind !== 'timed') continue
    if (!row.explicitMeridiem && minutes(row.start) < floor) {
      row.start = addHalfDay(row.start)
      row.end = addHalfDay(row.end)
    }
    // An end before its own start is the same twelve-hour ambiguity.
    if (minutes(row.end) < minutes(row.start)) row.end = addHalfDay(row.end)
    row.durationMin = minutes(row.end) - minutes(row.start)
    floor = minutes(row.start)
  }
  for (const row of rows) delete row.explicitMeridiem
  return rows
}

function splitTableRow(line) {
  return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

const isSeparatorRow = (line) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

/**
 * Pull the `| Time | What |` table out of a day's body, returning the rows and
 * the prose with the table removed. A day with no table is fine; a day whose
 * table has different columns is left in the prose untouched.
 */
function extractTable(body, dayId) {
  const lines = body.split('\n')
  const rows = []
  const kept = []
  let i = 0
  let found = false

  while (i < lines.length) {
    const line = lines[i]
    const header = line.trim().startsWith('|') ? splitTableRow(line.trim()) : null
    const isTimeTable =
      !found && header && header.length >= 2 && /^time$/i.test(header[0]) &&
      i + 1 < lines.length && isSeparatorRow(lines[i + 1].trim())

    if (!isTimeTable) { kept.push(line); i += 1; continue }

    found = true
    i += 2
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      const cells = splitTableRow(lines[i].trim())
      const rawTime = cells[0] ?? ''
      const rawWhat = cells.slice(1).join(' | ').trim()
      if (rawTime || rawWhat) {
        rows.push({
          id: `${dayId}-r${rows.length + 1}`,
          rawTime,
          rawWhat,
          // 🔵 marks something someone else scheduled — a meeting you attend,
          // not work you direct.
          meeting: rawWhat.includes('🔵'),
          // A bold What cell is the day's anchor item.
          anchor: /\*\*[^*]+\*\*/.test(rawWhat),
          ...parseTimeCell(rawTime),
        })
      }
      i += 1
    }
  }

  return { rows: enforceMonotonic(rows), prose: kept.join('\n').trim() }
}

/**
 * Deadlines stated in the intro: the blockquote (the week's hard wall) and the
 * `**bold** … (due 9/8)` sentences beside it. The doc proposes these; `tasks`
 * stays the system of record, so all we store is enough to look for a match.
 */
function extractDeadlines(intro, anchor) {
  const out = []
  const push = (title, dateText, source) => {
    const date = parseDateish(dateText, anchor)
    if (!date || !title) return
    const clean = title.replace(/\*\*/g, '').trim()
    if (out.some((d) => d.title === clean && d.date === date)) return
    out.push({
      id: `dl-${slugify(clean)}-${date}`,
      title: clean,
      date,
      time: parseClockPhrase(dateText),
      source,
    })
  }

  for (const line of intro.split('\n')) {
    if (!line.trim().startsWith('>')) continue
    const text = line.replace(/^\s*>\s?/, '')
    const bold = text.match(/\*\*(.+?)\*\*/)
    if (!bold) continue
    // The blockquote states the deadline inside the bold run itself:
    // "**ACT 420 HW 2 is due 8:00 AM Tuesday Sept 8.**"
    const title = bold[1].split(/\s+is due\b|\s+due\b/i)[0]
    push(title, bold[1], 'blockquote')
  }

  const paras = intro.replace(/\n/g, ' ')
  // `**CS 370 team registration** (due 9/8)` — the bold run can't itself
  // contain a `**`, or one match swallows half the intro.
  const re = /\*\*([^*]+)\*\*([^*]{0,60}?)\(due ([^)]+)\)/g
  let m
  while ((m = re.exec(paras)) !== null) push(m[1], m[3], 'intro')

  return out
}

/**
 * Parse a planning document into { title, frontmatter, parsed }.
 *
 * `weekStart` anchors every bare "Sept 8" to a year, and for semester docs is
 * just today — those have no day sections to place.
 */
export function parseDoc(raw, { weekStart, kind }) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  const frontmatter = {}
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
      if (m) frontmatter[m[1]] = m[2].trim()
    }
  }
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw
  const anchor = weekStart ?? new Date().toISOString().slice(0, 10)

  const lines = body.split('\n')
  let title = null
  const blocks = []   // { heading, lines[] }
  const preamble = []
  let current = null

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1 && !title) { title = h1[1].trim(); continue }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      current = { heading: h2[1].trim(), lines: [] }
      blocks.push(current)
      continue
    }
    if (current) current.lines.push(line)
    // Anything above the first `##` — the companion-doc note.
    else if (line.trim() && !h1) preamble.push(line)
  }

  const days = []
  const sections = []
  let intro = null

  for (const block of blocks) {
    const text = block.lines.join('\n').trim()
    const m = kind === 'week' ? block.heading.match(DAY_HEADING) : null

    if (m) {
      const id = `day-${slugify(block.heading)}`
      const first = dateFromMonthDay(m[2], m[3], anchor)
      const second = m[4] ? dateFromMonthDay(m[4], m[5], anchor) : null
      const dates = [first, second].filter(Boolean)
      const { rows, prose } = extractTable(text, id)
      days.push({
        id,
        heading: block.heading,
        weekday: m[1],
        label: (m[6] ?? '').trim() || null,
        dates,
        rows,
        prose,
        raw: text,
      })
      continue
    }

    const section = {
      id: `sec-${slugify(block.heading)}`,
      heading: block.heading,
      markdown: text,
    }
    // The first non-day `##` before any day is the week's thesis.
    if (!intro && days.length === 0 && kind === 'week') intro = section
    else sections.push(section)
  }

  const introMarkdown = [
    preamble.join('\n'),
    intro?.markdown ?? '',
  ].join('\n\n').trim()

  return {
    title,
    frontmatter,
    parsed: {
      intro: intro ? { ...intro, markdown: introMarkdown } : null,
      days,
      sections,
      deadlines: kind === 'week' ? extractDeadlines(introMarkdown, anchor) : [],
    },
  }
}
