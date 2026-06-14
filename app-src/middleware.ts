import { NextRequest, NextResponse } from 'next/server'
import { verifySessionCookie, COOKIE } from '@/lib/auth'

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  // Programmatic access via header
  const apiSecret = req.headers.get('x-api-secret')
  if (apiSecret && apiSecret === process.env.API_SECRET) return NextResponse.next()

  const cookie = req.cookies.get(COOKIE)?.value ?? ''
  if (await verifySessionCookie(cookie)) return NextResponse.next()

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
