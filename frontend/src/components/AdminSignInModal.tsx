/* eslint-disable jsx-a11y/no-autofocus */
import { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
  onSubmit: (token: string) => void
}

/**
 * v3.26 — Admin sign-in modal.
 *
 * Captures the `ADMIN_TOKEN` value so admin-write endpoints (master roster,
 * schedule, chart uploads) can attach it as `X-Admin-Token`.  Stored in
 * sessionStorage by the context's `setAdminToken`, so the token is cleared
 * when the browser tab closes (not persisted to disk).
 *
 * This is NOT real authentication — it's a stopgap before the proper JWT
 * auth PR.  Anyone who learns the token can impersonate the admin until it
 * is rotated.
 *
 * Verifies the token by POSTing to `/api/admin/upload-roster` with no file —
 * the server returns 401 for a bad token, 422 for a good token + bad file.
 * 422 is treated as a successful gate check.
 */
export default function AdminSignInModal({ onClose, onSubmit }: Props) {
  const [token, setToken] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function verifyAndSubmit() {
    const t = token.trim()
    if (!t) { setError('Enter the admin token.'); return }
    setVerifying(true)
    setError(null)
    try {
      const form = new FormData()
      // Use a zero-byte file — gate will pass before the parser runs and fail
      // at parse time with 422.  A 401 means the token is wrong.
      form.append('file', new Blob([''], { type: 'application/pdf' }), 'probe.pdf')
      const r = await fetch('/api/admin/upload-roster', {
        method: 'POST',
        body: form,
        headers: { 'X-Admin-Token': t },
      })
      if (r.status === 401) {
        setError('Invalid admin token. Check the ADMIN_TOKEN value on the backend.')
        return
      }
      if (r.status === 503) {
        setError('Backend has no ADMIN_TOKEN configured. Set it as a Render env var.')
        return
      }
      // 422 = gate passed but the probe file is garbage; that's expected.
      // 200 (unlikely with a 0-byte file) also fine.
      onSubmit(t)
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 12,
          maxWidth: 420, width: '100%',
          padding: 24,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2 id="admin-modal-title" style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>
          🔐 Admin sign-in
        </h2>
        <p style={{ margin: 0, marginBottom: 14, fontSize: 12, color: 'var(--text2)' }}>
          Paste the <strong>ADMIN_TOKEN</strong> value from the backend's env
          vars. Required for uploading the master roster, weekday / weekend
          schedule, and assoc/un-assoc chart.
        </p>
        <p style={{ margin: 0, marginBottom: 14, fontSize: 11, color: 'var(--text3)' }}>
          Stored in this tab's sessionStorage and cleared when you close the tab.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="paste admin token here"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') verifyAndSubmit() }}
          style={{
            width: '100%', padding: '8px 10px',
            fontFamily: 'var(--font-mono)', fontSize: 12,
            border: '1px solid var(--border, #ccc)', borderRadius: 6,
            marginBottom: 12,
          }}
        />
        {error && (
          <div className="alert alert-err" style={{ marginBottom: 12, fontSize: 12 }}>
            ⚠ {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-sm"
            disabled={verifying}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={verifyAndSubmit}
            className="btn-sm btn-primary"
            disabled={verifying || !token.trim()}
          >
            {verifying ? '⏳ Verifying…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
