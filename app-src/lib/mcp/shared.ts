// The tool shape and the two helpers every tool module needs. Kept separate
// from tools.ts so the job-search tools can import it without the two modules
// importing each other.

import { USER_TZ } from '@/lib/dateKey'
import { fail, type Args } from './validate'

export type JsonSchema = { type: 'object'; properties: Record<string, unknown>; required?: string[] }

export type Tool = {
  name: string
  description: string
  inputSchema: JsonSchema
  handler: (args: Args) => Promise<unknown>
}

// Surface the Postgres message to the caller (it is often actionable — a
// foreign-key miss, a check-constraint name) while still logging server-side
// in the same shape as the REST routes.
export function dbFail(label: string, error: { message: string }): never {
  console.error(`mcp ${label} error:`, error)
  fail(error.message)
}

/** Today as a calendar date in Cora's timezone — no 4am habit rollover here. */
export function todayInUserTz(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: USER_TZ }).format(new Date())
}
