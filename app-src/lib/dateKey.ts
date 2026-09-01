// Single source of truth for the user's timezone.
//
// In the browser we auto-detect from the device so the dashboard follows you
// when you travel. On the server there is nothing to detect, so we fall back to
// NEXT_PUBLIC_USER_TIMEZONE / USER_TIMEZONE (NEXT_PUBLIC_ so client bundles get
// it inlined too, USER_TIMEZONE for server-only configs).
const CONFIGURED_TZ =
  process.env.NEXT_PUBLIC_USER_TIMEZONE ?? process.env.USER_TIMEZONE ?? 'America/New_York'

function detectTz(): string {
  if (typeof window === 'undefined') return CONFIGURED_TZ
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || CONFIGURED_TZ
  } catch {
    return CONFIGURED_TZ
  }
}

export const USER_TZ = detectTz()

const GRACE_HOUR = 4 // before 4am local time → still "yesterday" for habit purposes

export function toDateKey(date: Date, tz: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: tz })
}

export function habitDateKey(tz: string, now = new Date()): string {
  const hourStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', hour12: false })
  const hour = parseInt(hourStr.split(':')[0], 10)
  const effective = hour < GRACE_HOUR ? new Date(now.getTime() - 86_400_000) : now
  return toDateKey(effective, tz)
}

// The habit day is not always the calendar day: before 4am it is still
// yesterday, and on the 1st of a month that means the tracker's "today" lives
// in the *previous* month. Anything that picks a month, or marks today on the
// grid, has to read it from here rather than from `new Date()`.
export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month: month - 1, day }
}
