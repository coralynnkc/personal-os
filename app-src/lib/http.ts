// Parse a JSON request body, returning null (instead of throwing) when the
// body is malformed or not a JSON object — callers turn null into a 400.
export async function parseJsonBody<T extends object = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const body = await req.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    return body as T
  } catch {
    return null
  }
}
