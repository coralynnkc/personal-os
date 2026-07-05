import { NextRequest, NextResponse } from 'next/server'
import { makeSessionCookie, COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  const expected = process.env.DASHBOARD_PASSWORD
  if (!expected) {
    console.error('DASHBOARD_PASSWORD is not set — refusing all logins')
    return NextResponse.json({ error: 'Server auth not configured' }, { status: 500 })
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, await makeSessionCookie(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  })
  return res
}
