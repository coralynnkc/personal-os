'use client'
import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const password = new FormData(e.currentTarget).get('password') as string
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      const from = params.get('from') ?? '/'
      // Only follow same-origin paths: reject external URLs ("https://…"),
      // protocol-relative ("//evil.com"), and backslash variants ("/\evil.com").
      const isSafePath = from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\')
      router.push(isSafePath ? from : '/')
    } else {
      setError('Wrong password')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>
        PERSONAL OS
      </div>
      <input
        autoFocus
        type="password"
        name="password"
        placeholder="Password"
        style={{
          background: 'var(--ink-1)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink-6)',
          fontSize: 14,
          padding: '10px 12px',
          outline: 'none',
        }}
      />
      {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}
      <button
        type="submit"
        disabled={loading}
        style={{
          background: 'var(--accent)',
          color: 'var(--ink-0)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 0',
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
