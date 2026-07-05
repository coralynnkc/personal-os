export const COOKIE = 'pos_session'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set — refusing to sign/verify sessions')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) return new Uint8Array(0)
  return new Uint8Array(pairs.map(h => parseInt(h, 16)))
}

export async function makeSessionCookie(): Promise<string> {
  const payload = `${Date.now() + TTL_MS}`
  const key = await getKey()
  const sig = bufToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  return `${payload}.${sig}`
}

export async function verifySessionCookie(value: string): Promise<boolean> {
  const dot = value.lastIndexOf('.')
  if (dot < 0) return false
  const payload = value.slice(0, dot)
  const sigBytes = hexToBuf(value.slice(dot + 1))
  if (sigBytes.length === 0) return false
  const key = await getKey()
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes as Uint8Array<ArrayBuffer>, new TextEncoder().encode(payload))
  if (!valid) return false
  return Date.now() < parseInt(payload, 10)
}
