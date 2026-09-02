'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  STATUSES, STATUS_LABEL, WAVES, type Application, type CompanyEntity,
} from '@/lib/jobs'
import { labelStyle } from './ui'
import { useDialog } from '@/lib/useDialog'

const fieldStyle = {
  width: '100%', fontSize: 13, color: 'var(--ink-6)',
  background: 'var(--ink-1)', border: '1px solid var(--glass-border)',
  borderRadius: 0, padding: '6px 8px', fontFamily: 'inherit',
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
 * Adding an application you found in the wild.
 *
 * Track-from-Targets only reaches companies that are already in the research
 * library, which is the wrong shape for a listing off a GitHub board: you
 * applied first and there is no research behind it. The defaults here are that
 * case — GitHub wave, applied, dated today — so the common add is a company
 * name and Enter, and everything else is optional.
 *
 * It writes once on submit rather than field-by-field like AppDrawer: there is
 * no row to PATCH until this succeeds, and a half-typed company shouldn't
 * become one.
 */
export default function AddDrawer({
  companies, today, onCreate, onClose,
}: {
  companies: CompanyEntity[]
  today: string
  onCreate: (body: Partial<Application>) => Promise<string | null>
  onClose: () => void
}) {
  const [companyName, setCompanyName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [status, setStatus] = useState<Application['status']>('applied')
  const [wave, setWave] = useState<string>('GitHub')
  const [appliedOn, setAppliedOn] = useState(today)
  const [portalUrl, setPortalUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [entityId, setEntityId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  // The name field takes focus itself, so the dialog doesn't also grab it and
  // land on the close button.
  const dialogRef = useDialog<HTMLElement>(onClose, { autoFocus: false })
  useEffect(() => { nameRef.current?.focus() }, [])

  // Applied-on only means anything once you've applied; a researching row with
  // a date in it is the sort of thing the stale strip was built to stop.
  const showApplied = status !== 'researching' && status !== 'not_open' && status !== 'open'

  const submit = async () => {
    const name = companyName.trim()
    if (!name || saving) return
    setSaving(true)
    setError(null)
    const message = await onCreate({
      company_name: name,
      role_title: roleTitle.trim() || null,
      status,
      wave: wave || null,
      applied_on: showApplied ? (appliedOn || null) : null,
      portal_url: portalUrl.trim() || null,
      notes: notes.trim() || null,
      entity_id: entityId || null,
    })
    setSaving(false)
    // A duplicate (company, wave) comes back as a message rather than a row —
    // keep the drawer up with what was typed so the wave can be changed.
    if (message) setError(message)
    else onClose()
  }

  /** Enter submits from any single-line field; the textarea keeps its newlines. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 200 }}
      />
      <aside
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-app-title"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
          width: 'min(460px, 100vw)', overflowY: 'auto',
          background: 'var(--tint)',
          borderLeft: '1px solid var(--glass-border)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          position: 'sticky', top: 0, zIndex: 1,
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 16px', borderBottom: '1px solid var(--glass-border)',
          background: 'var(--tint)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="add-app-title" style={{ fontSize: 15, color: 'var(--ink-6)', fontWeight: 500 }}>
              New application
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 2 }}>
              A role you found and applied to yourself
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ flexShrink: 0, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--ink-4)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div role="alert" style={{
              fontSize: 13, color: 'var(--ivory)', padding: 'var(--s2) 0',
              borderTop: '1px solid var(--coral)', borderBottom: '1px solid var(--coral)',
            }}>
              {error}
            </div>
          )}

          <Row label="Company">
            <input
              ref={nameRef}
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Company name…"
              style={fieldStyle}
            />
          </Row>

          <Row label="Role title">
            <input
              value={roleTitle}
              onChange={e => setRoleTitle(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Software Engineer Intern, Summer 2027"
              style={fieldStyle}
            />
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Row label="Status">
              <select
                value={status}
                onChange={e => setStatus(e.target.value as Application['status'])}
                style={fieldStyle}
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Row>
            <Row label="Wave">
              <select value={wave} onChange={e => setWave(e.target.value)} style={fieldStyle}>
                <option value="">—</option>
                {WAVES.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </Row>
          </div>

          {showApplied && (
            <Row label="Applied on">
              <input
                type="date"
                value={appliedOn}
                onChange={e => setAppliedOn(e.target.value)}
                style={fieldStyle}
              />
            </Row>
          )}

          <Row label="Portal URL">
            <input
              value={portalUrl}
              onChange={e => setPortalUrl(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="https://…"
              style={fieldStyle}
            />
          </Row>

          <Row label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Where it came from, what to follow up on…"
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </Row>

          {/* Optional, and usually empty for a board find — but if the company
              is already researched, linking now is what makes the drawer show
              that research next to the card. */}
          <Row label="Link to research">
            <select
              value={entityId}
              onChange={e => {
                const id = e.target.value
                setEntityId(id)
                const picked = companies.find(c => c.id === id)
                if (picked && !companyName.trim()) setCompanyName(picked.name)
              }}
              style={fieldStyle}
            >
              <option value="">Not linked</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Row>
        </div>

        <div style={{ borderTop: '1px solid var(--glass-border)', padding: 16, marginTop: 'auto' }}>
          <button
            onClick={submit}
            disabled={saving || !companyName.trim()}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 0, border: 'none',
              background: 'var(--champagne)', color: 'var(--ground)', fontSize: 13,
              cursor: saving || !companyName.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || !companyName.trim() ? 0.6 : 1,
            }}
          >
            {saving ? 'Adding…' : 'Add application'}
          </button>
        </div>
      </aside>
    </>
  )
}
