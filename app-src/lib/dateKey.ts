// Single source of truth for the user's timezone. NEXT_PUBLIC_ so client
// bundles get it inlined; USER_TIMEZONE covers server-only configs.
export const USER_TZ =
  process.env.NEXT_PUBLIC_USER_TIMEZONE ?? process.env.USER_TIMEZONE ?? 'America/Los_Angeles'

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
