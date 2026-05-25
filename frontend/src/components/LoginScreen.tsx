/* eslint-disable jsx-a11y/no-autofocus */
import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import AdminSignInModal from './AdminSignInModal'

/**
 * v3.32 — Sign-in screen shown when no driver JWT and no admin password.
 *
 * Apple-flavoured single-card layout:
 *   - Wordmark + tagline
 *   - One 8-digit employee-ID input
 *   - Primary "Sign in" button
 *   - Inline error (400 / 401 / 423 / 429) with helpful guidance
 *   - "Admin sign-in →" secondary action that opens the existing
 *     AdminSignInModal (password-based)
 *
 * On successful login, ctx.signIn(token) stores the JWT and App.tsx
 * re-renders the calculator.
 */
export default function LoginScreen() {
  const ctx = useFortnightContext()
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)

  async function submit() {
    const trimmed = id.trim()
    if (!/^\d{8}$/.test(trimmed)) {
      setError('Employee ID must be exactly 8 digits.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: trimmed }),
      })
      let data: { token?: string; role?: string; detail?: string } = {}
      try { data = await r.json() } catch { /* ignore */ }
      if (!r.ok) {
        if (r.status === 429) {
          setError(data.detail || 'Too many failed attempts. Try again in 1 hour.')
        } else if (r.status === 423) {
          setError(data.detail || 'This account is temporarily locked. Contact your admin.')
        } else if (r.status === 401) {
          setError("This employee ID isn't on the allowed list. Contact your admin.")
        } else if (r.status === 503) {
          setError(data.detail || 'Sign-in is temporarily unavailable. Try again later.')
        } else {
          setError(data.detail || 'Sign-in failed.')
        }
        return
      }
      if (!data.token) {
        setError('Sign-in succeeded but no token was returned. Contact your admin.')
        return
      }
      ctx.signIn(data.token)
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #fbfbfd 0%, #f5f5f7 100%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#fff',
          borderRadius: 16,
          padding: 36,
          boxShadow: '0 12px 50px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 6, lineHeight: 1 }} aria-hidden="true">🚂</div>
          <h1 style={{
            margin: 0, fontSize: 20, fontWeight: 600,
            letterSpacing: '-0.02em', color: '#1d1d1f',
          }}>
            Driver Wage Calculator
          </h1>
          <p style={{
            margin: '6px 0 0', fontSize: 12, color: '#6e6e73',
          }}>
            Sydney Trains EA 2025 · Mt Victoria
          </p>
        </div>

        {/* Form */}
        <label
          htmlFor="employee-id"
          style={{
            display: 'block', fontSize: 12, color: '#1d1d1f',
            marginBottom: 6, fontWeight: 500,
          }}
        >
          Employee ID
        </label>
        <input
          id="employee-id"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          placeholder="8-digit ID"
          value={id}
          onChange={(e) => setId(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 14px',
            fontSize: 16,
            fontFamily: 'var(--font-mono, "SF Mono", Menlo, Consolas, monospace)',
            letterSpacing: '0.08em',
            border: '1px solid #d2d2d7',
            borderRadius: 10,
            background: '#fff',
            color: '#1d1d1f',
            outline: 'none',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0071e3' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#d2d2d7' }}
        />
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: '8px 10px',
              fontSize: 12,
              color: '#b30000',
              background: '#fff4f4',
              border: '1px solid #f8c0c0',
              borderRadius: 8,
            }}
          >
            ⚠ {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || id.length !== 8}
          style={{
            width: '100%',
            marginTop: 18,
            padding: '11px 16px',
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            background: (busy || id.length !== 8) ? '#a8c7f0' : '#0071e3',
            border: 'none',
            borderRadius: 10,
            cursor: (busy || id.length !== 8) ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {busy ? '⏳ Signing in…' : 'Sign in'}
        </button>

        {/* Help footer */}
        <div
          style={{
            marginTop: 22,
            paddingTop: 18,
            borderTop: '1px solid #f0f0f3',
            textAlign: 'center',
            fontSize: 11,
            color: '#6e6e73',
            lineHeight: 1.6,
          }}
        >
          Don't have access yet?<br />
          Ask your depot admin to add your employee ID.
        </div>

        {/* Admin sign-in secondary action */}
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setAdminOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 12,
              color: '#0071e3',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
          >
            🔐 Admin sign-in
          </button>
        </div>
      </div>

      {adminOpen && (
        <AdminSignInModal
          onClose={() => setAdminOpen(false)}
          onSubmit={(pw) => { ctx.setAdminPassword(pw); setAdminOpen(false) }}
        />
      )}
    </div>
  )
}
