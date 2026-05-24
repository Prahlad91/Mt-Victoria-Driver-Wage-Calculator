/* eslint-disable jsx-a11y/no-autofocus */
import { useEffect, useState } from 'react'

interface Props {
  onClose: () => void
  onSubmit: (password: string) => void
}

/**
 * v3.26/v3.28 — Admin sign-in modal.
 *
 * Captures the `ADMIN_PASSWORD` value so admin-write endpoints (master roster,
 * schedule, chart uploads) can attach it as the `X-Admin-Password` header.
 * Stored in sessionStorage by the context's `setAdminPassword`, so the password
 * is cleared when the browser tab closes (not persisted to disk).
 *
 * This is NOT real authentication — it's a stopgap before the proper JWT
 * auth PR.  Anyone who learns the password can impersonate the admin until
 * it is rotated.
 *
 * Verifies the password by POSTing to `/api/admin/upload-roster` with a
 * zero-byte file — the server returns 401 for a bad password, 422 for a good
 * password + bad file.  422 is treated as a successful gate check.
 *
 * v3.28: renamed from "admin token" to "admin password" because the secret
 * is now a human-chosen value rather than a 64-char random hex string.
 */
export default function AdminSignInModal({ onClose, onSubmit }: Props) {
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function verifyAndSubmit() {
    const pw = password.trim()
    if (!pw) { setError('Enter the admin password.'); return }
    setVerifying(true)
    setError(null)
    try {
      const form = new FormData()
      // Use a zero-byte file — gate will pass before the parser runs and fail
      // at parse time with 422.  A 401 means the password is wrong.
      form.append('file', new Blob([''], { type: 'application/pdf' }), 'probe.pdf')
      const r = await fetch('/api/admin/upload-roster', {
        method: 'POST',
        body: form,
        headers: { 'X-Admin-Password': pw },
      })
      if (r.status === 401) {
        setError('Invalid admin password. Check the ADMIN_PASSWORD value on the backend.')
        return
      }
      if (r.status === 503) {
        setError('Backend has no ADMIN_PASSWORD configured. Set it as a Render env var.')
        return
      }
      // 422 = gate passed but the probe file is garbage; that's expected.
      // 200 (unlikely with a 0-byte file) also fine.
      onSubmit(pw)
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
          Enter the <strong>admin password</strong> (the <code>ADMIN_PASSWORD</code>
          value from the backend's env vars). Required for uploading the master
          roster, weekday / weekend schedule, and assoc/un-assoc chart.
        </p>
        <p style={{ margin: 0, marginBottom: 14, fontSize: 11, color: 'var(--text3)' }}>
          Stored in this tab's sessionStorage and cleared when you close the tab.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
            disabled={verifying || !password.trim()}
          >
            {verifying ? '⏳ Verifying…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
