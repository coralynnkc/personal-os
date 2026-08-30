'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Markdown from '@/lib/markdown'
import type { PlanningDoc } from '@/lib/weekDoc'
import { cardStyle, ErrorRow } from '../jobs/ui'

const stripPreamble = (body: string) =>
  body.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\s*#\s+.+\n/, '')

/**
 * Long-form view of a synced planning document.
 *
 * The week doc links sideways to `../fall26_workload_plan.md` and
 * `../assignments_fall26.md` constantly; without this route half its
 * references dead-end at a file path that only exists on the laptop.
 * Structure isn't the point here — these are read end to end — so the body is
 * rendered verbatim rather than through `parsed`.
 */
export default function DocClient({ slug }: { slug: string }) {
  const [doc, setDoc] = useState<PlanningDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/documents?slug=${encodeURIComponent(slug)}`)
      if (res.status === 404) throw new Error(`No document synced with the slug “${slug}”`)
      if (!res.ok) throw new Error(`Document failed (${res.status})`)
      setDoc(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const back = (
    <Link href="/week" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 'var(--text-base)', color: 'var(--ink-4)', textDecoration: 'none',
    }}>
      <ArrowLeft size={12} aria-hidden /> This week
    </Link>
  )

  return (
    <div style={{ padding: '16px 20px', display: 'grid', gap: 12, maxWidth: 860, margin: '0 auto', width: '100%' }}>
      {back}

      {error ? (
        <div style={cardStyle}><ErrorRow message={error} onRetry={load} /></div>
      ) : !doc ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Loading…</div>
      ) : (
        <article style={{ ...cardStyle, padding: '16px 20px 24px' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-6)', marginBottom: 4 }}>
            {doc.title ?? doc.slug}
          </h1>
          {doc.source_path && (
            // Not uppercased like the other mono labels — a path is
            // case-sensitive and shouting it makes it wrong.
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', letterSpacing: '0.04em', color: 'var(--ink-4)', marginBottom: 14 }}>
              {doc.source_path}
            </div>
          )}
          {/* The body still carries its frontmatter fence and its own H1;
              strip both rather than repeating the title under itself. */}
          <Markdown md={stripPreamble(doc.body)} />
        </article>
      )}
    </div>
  )
}
