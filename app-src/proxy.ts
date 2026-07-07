import { NextRequest, NextResponse } from 'next/server'
import { verifySessionCookie, secretsEqual, COOKIE } from '@/lib/auth'

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Programmatic access via header (constant-time comparison)
  const apiSecret = req.headers.get('x-api-secret')
  const expectedSecret = process.env.API_SECRET
  if (apiSecret && expectedSecret && await secretsEqual(apiSecret, expectedSecret)) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(COOKIE)?.value ?? ''
  if (await verifySessionCookie(cookie)) return NextResponse.next()

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // icon.svg is the app icon (app/icon.svg): without the exclusion, favicon
  // requests from the login page get redirected to /login?from=%2Ficon.svg
  // and the tab shows a broken icon while logged out.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
