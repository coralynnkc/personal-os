// Argument validation for MCP tools. Claude will occasionally send a wrong
// shape (a string where an int belongs, a bare word for a uuid), and an
// unchecked value reaches Postgres as a 500 whose message — 'invalid input
// syntax for type uuid' — it can't act on. Everything below fails with a
// sentence a model can correct itself from.

export class ToolError extends Error {}

export function fail(message: string): never {
  throw new ToolError(message)
}

export type Args = Record<string, unknown>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function asArgs(value: unknown): Args {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('arguments must be a JSON object')
  }
  return value as Args
}

// Absent and explicit-undefined both mean "not supplied"; explicit null means
// "clear this field", which the PATCH allow-list treats as a real value.
function absent(args: Args, key: string): boolean {
  return !(key in args) || args[key] === undefined
}

export function requireString(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.trim() === '') fail(`${key} is required and must be a non-empty string`)
  return v
}

export function optString(args: Args, key: string): string | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (typeof v !== 'string') fail(`${key} must be a string or null`)
  return v
}

export function optBoolean(args: Args, key: string): boolean | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (typeof v !== 'boolean') fail(`${key} must be true or false`)
  return v
}

export function optInt(args: Args, key: string): number | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${key} must be a whole number or null`)
  return v
}

export function requireInt(args: Args, key: string): number {
  const v = args[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${key} is required and must be a whole number`)
  return v
}

export function optEnum(args: Args, key: string, allowed: readonly string[]): string | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (typeof v !== 'string' || !allowed.includes(v)) {
    fail(`${key} must be one of: ${allowed.join(', ')}`)
  }
  return v
}

export function optTags(args: Args, key: string): string[] | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (!Array.isArray(v) || v.some(t => typeof t !== 'string' || t.trim() === '')) {
    fail(`${key} must be an array of non-empty strings, or null`)
  }
  return v as string[]
}

export function isDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function optDate(args: Args, key: string): string | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (typeof v !== 'string' || !isDateKey(v)) fail(`${key} must be a calendar date formatted YYYY-MM-DD, or null`)
  return v
}

export function optTimestamp(args: Args, key: string): string | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
    fail(`${key} must be an ISO 8601 timestamp, or null`)
  }
  return v
}

export function requireUuid(args: Args, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(`${key} is required and must be a uuid`)
  return v
}

export function optUuid(args: Args, key: string): string | null | undefined {
  if (absent(args, key)) return undefined
  const v = args[key]
  if (v === null) return null
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(`${key} must be a uuid or null`)
  return v
}

// Assign only supplied values, so a PATCH built from these never writes
// undefined over a column the caller didn't mention.
export function set(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
}
