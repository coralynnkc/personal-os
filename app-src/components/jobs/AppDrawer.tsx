'use client'

import { useEffect, useRef } from 'react'
import { X, ExternalLink } from 'lucide-react'
import {
  STATUSES, STATUS_LABEL, STATUS_COLOR, WAVES, RESEARCH_FIELDS,
  daysSince, toHref, type Application,
} from '@/lib/jobs'
import { labelStyle, Pill } from './ui'

const fieldStyle = {
  width: '100%', fontSize: 13, color: 'var(--ink-6)',
  background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
  borderRadius: 6, padding: '6px 8px',
} as const

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ ...labelStyle, fontSize: 11 }}>{label}</span>
      {children}
    </div>
  )
}

/**
 * The drawer is the payoff for linking `applications` to `entities`: the
 * research you did months ago — interview format, salary band, why it fits —
 * renders next to the pipeline card instead of one spreadsheet tab over.
 */
export default function AppDrawer({
  app, today, onPatch, onDelete, onClose,
}: {
  app: Application
  today: string
  onPatch: (patch: Partial<Application>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const research = (app.entity?.metadata ?? {}) as Record<string, unknown>
  const hasResearch = RESEARCH_FIELDS.some(f => research[f.key])
  const sinceApplied = daysSince(app.applied_on, today)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'oklch(0.12 0.01 250 / 0.6)', zIndex: 200 }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${app.company_name} application`}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
          width: 'min(460px, 100vw)', overflowY: 'auto',
          background: 'oklch(0.14 0.012 250)',
          borderLeft: '1px solid var(--glass-border)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          position: 'sticky', top: 0, zIndex: 1,
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 16px', borderBottom: '1px solid var(--glass-border)',
          background: 'oklch(0.14 0.012 250)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: 'var(--ink-6)', fontWeight: 500 }}>{app.company_name}</div>
            {app.role_title && <div style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 2 }}>{app.role_title}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <Pill color={STATUS_COLOR[app.status]}>{STATUS_LABEL[app.status]}</Pill>
              {app.wave && <Pill color="var(--ink-4)">{app.wave}</Pill>}
              {sinceApplied != null && <Pill color="var(--ink-4)">{sinceApplied}d since applied</Pill>}
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            style={{ flexShrink: 0, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--ink-4)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Status">
            <select
              value={app.status}
              onChange={e => onPatch({ status: e.target.value as Application['status'] })}
              style={fieldStyle}
            >
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Row>

          <Row label="Wave">
            <select
              value={app.wave ?? ''}
              onChange={e => onPatch({ wave: e.target.value || null })}
              style={fieldStyle}
            >
              <option value="">—</option>
              {WAVES.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </Row>

          <Row label="Role title">
            <input
              defaultValue={app.role_title ?? ''}
              onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.role_title) onPatch({ role_title: v }) }}
              style={fieldStyle}
            />
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Row label="Portal last checked">
              <input
                type="date"
                value={app.portal_last_checked ?? ''}
                onChange={e => onPatch({ portal_last_checked: e.target.value || null })}
                style={fieldStyle}
              />
            </Row>
            <Row label="Applied on">
              <input
                type="date"
                value={app.applied_on ?? ''}
                onChange={e => onPatch({ applied_on: e.target.value || null })}
                style={fieldStyle}
              />
            </Row>
          </div>

          <Row label="Interview on">
            <input
              type="date"
              value={app.interview_on ?? ''}
              onChange={e => onPatch({ interview_on: e.target.value || null })}
              style={fieldStyle}
            />
          </Row>

          <Row label="Portal URL">
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                defaultValue={app.portal_url ?? ''}
                onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.portal_url) onPatch({ portal_url: v }) }}
                style={fieldStyle}
              />
              {app.portal_url && (
                <a
                  href={toHref(app.portal_url)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open portal"
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 6 }}
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </Row>

          <Row label="Notes">
            <textarea
              defaultValue={app.notes ?? ''}
              onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.notes) onPatch({ notes: v }) }}
              rows={4}
              style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Row>

          <Row label="Outcome">
            <input
              defaultValue={app.outcome ?? ''}
              onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.outcome) onPatch({ outcome: v }) }}
              style={fieldStyle}
            />
          </Row>
        </div>

        {/* Joined research from the linked company entity */}
        <div style={{ borderTop: '1px solid var(--glass-border)', padding: 16 }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>
            Research {app.entity ? `· ${app.entity.name}` : ''}
          </div>

          {!app.entity ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              Not linked to a company in the research library.
            </div>
          ) : !hasResearch ? (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              Linked, but no research fields imported.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {RESEARCH_FIELDS.map(f => {
                const v = research[f.key]
                if (!v) return null
                const text = String(v)
                const isLink = f.key === 'apply_url'
                return (
                  <div key={f.key}>
                    <div style={{ ...labelStyle, fontSize: 11, marginBottom: 2 }}>{f.label}</div>
                    {isLink ? (
                      <a
                        href={toHref(text)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, color: 'var(--accent)', wordBreak: 'break-all' }}
                      >
                        {text}
                      </a>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--ink-5)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{text}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--glass-border)', padding: 16, marginTop: 'auto' }}>
          <button
            onClick={onDelete}
            style={{
              cursor: 'pointer', fontSize: 12, color: 'var(--danger)',
              background: 'transparent', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '5px 10px',
            }}
          >
            Remove from pipeline
          </button>
        </div>
      </aside>
    </>
  )
}
