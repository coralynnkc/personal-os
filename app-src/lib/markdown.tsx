// A small markdown renderer for the planning docs' prose.
//
// The week tab reads structure from documents.parsed and only needs markdown
// for the paragraphs around it — the *reasoning*, which is the half of these
// documents worth keeping verbatim. That is a narrow enough job that a
// dependency isn't worth it: this covers exactly what the docs use (headings,
// blockquotes, lists, tables, emphasis, code, links) and renders anything it
// doesn't recognise as a plain paragraph rather than dropping it.

import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * `../fall26_workload_plan.md` points at a file that only exists on the
 * laptop. The semester docs are synced too, so the link resolves in-app
 * instead of dead-ending.
 */
function resolveHref(href: string): string {
  const m = href.match(/([^/]+)\.md(#.*)?$/)
  return m ? `/week/${m[1]}${m[2] ?? ''}` : href
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_]+_|\*[^*]+\*)/g

export function inline(text: string, keyPrefix = ''): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}i${i}`

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key} style={{ color: 'var(--ink-6)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.92em',
          background: 'var(--ink-1)', borderRadius: 6, padding: '1px 3px',
        }}>{part.slice(1, -1)}</code>
      )
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = resolveHref(link[2])
      const style = { color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent-border)' }
      return href.startsWith('/')
        ? <Link key={key} href={href} style={style}>{link[1]}</Link>
        : <a key={key} href={href} target="_blank" rel="noreferrer" style={style}>{link[1]}</a>
    }
    if ((part.startsWith('_') && part.endsWith('_')) || (part.startsWith('*') && part.endsWith('*'))) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <span key={key}>{part}</span>
  })
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'para'; text: string }
  | { type: 'rule' }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const isSeparator = (line: string) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line.trim()) && line.includes('-')

function blocks(md: string): Block[] {
  const lines = md.split('\n')
  const out: Block[] = []
  let para: string[] = []

  const flush = () => {
    if (para.length) out.push({ type: 'para', text: para.join(' ') })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { flush(); continue }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) { flush(); out.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue }

    if (/^([-*_])\1{2,}$/.test(trimmed)) { flush(); out.push({ type: 'rule' }); continue }

    if (trimmed.startsWith('>')) {
      flush()
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      i--
      out.push({ type: 'quote', lines: quote })
      continue
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flush()
      const header = cells(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++ }
      i--
      out.push({ type: 'table', header, rows })
      continue
    }

    const bullet = trimmed.match(/^([-*+]|\d+\.)\s+(.*)$/)
    if (bullet) {
      flush()
      const ordered = /\d/.test(bullet[1])
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*+]|\d+\.)\s+(.*)$/)
        if (m) { items.push(m[2]); i++; continue }
        // An indented continuation line belongs to the item above it.
        if (items.length && /^\s{2,}\S/.test(lines[i])) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue }
        break
      }
      i--
      out.push({ type: 'list', ordered, items })
      continue
    }

    para.push(trimmed)
  }

  flush()
  return out
}

const HEADING_SIZE: Record<number, number> = { 1: 20, 2: 17, 3: 15, 4: 14, 5: 13, 6: 13 }

export default function Markdown({ md, compact = false }: { md: string; compact?: boolean }) {
  if (!md?.trim()) return null

  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-5)' }}>
      {blocks(md).map((block, b) => {
        const key = `b${b}`
        switch (block.type) {
          case 'heading':
            return (
              <h3 key={key} style={{
                fontSize: HEADING_SIZE[block.level] ?? 14, fontWeight: 600,
                color: 'var(--ink-6)', margin: b === 0 ? '0 0 8px' : '18px 0 8px',
              }}>{inline(block.text, key)}</h3>
            )

          case 'quote':
            return (
              <blockquote key={key} style={{
                margin: '12px 0', padding: '10px 14px',
                borderLeft: '2px solid var(--warn)',
                background: 'var(--warn-dim)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                color: 'var(--ink-6)',
              }}>{inline(block.lines.join(' '), key)}</blockquote>
            )

          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag key={key} style={{ margin: '10px 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                {block.items.map((item, j) => (
                  <li key={`${key}l${j}`} style={{ listStyle: block.ordered ? 'decimal' : 'disc' }}>
                    {inline(item, `${key}l${j}`)}
                  </li>
                ))}
              </Tag>
            )
          }

          case 'table':
            return (
              <div key={key} style={{ overflowX: 'auto', margin: '12px 0' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--text-base)' }}>
                  <thead>
                    <tr>
                      {block.header.map((h, j) => (
                        <th key={`${key}h${j}`} style={{
                          textAlign: 'left', padding: '6px 10px',
                          borderBottom: '1px solid var(--glass-border)',
                          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--ink-4)', fontWeight: 500, whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={`${key}r${j}`}>
                        {row.map((cell, k) => (
                          <td key={`${key}r${j}c${k}`} style={{
                            padding: '6px 10px', verticalAlign: 'top',
                            borderBottom: '1px solid var(--glass-border)',
                            whiteSpace: k === 0 ? 'nowrap' : undefined,
                            fontFamily: k === 0 ? 'var(--font-mono)' : undefined,
                            color: k === 0 ? 'var(--ink-4)' : undefined,
                          }}>{inline(cell, `${key}r${j}c${k}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )

          case 'rule':
            return <hr key={key} style={{ border: 0, borderTop: '1px solid var(--glass-border)', margin: '18px 0' }} />

          default:
            return (
              <p key={key} style={{ margin: compact ? '6px 0' : '10px 0' }}>{inline(block.text, key)}</p>
            )
        }
      })}
    </div>
  )
}
