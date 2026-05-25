/* eslint-disable jsx-a11y/no-autofocus */
import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import AdminSignInModal from './AdminSignInModal'

/**
 * v3.34 — Premium split-panel sign-in screen.
 *
 * Left (52%, desktop-only): dark navy hero — logo, headline, feature list,
 *   trust badges, radial-glow background.
 * Right (fluid): clean white form — staggered fade-up entry, large monospace
 *   input, 8-dot progress indicator, primary button with hover glow, error
 *   alert, first-time help card, admin sign-in ghost link.
 *
 * Responsive: hero panel hides at ≤780px; form fills the viewport on mobile.
 * prefers-reduced-motion: all keyframe animations disabled.
 */

const FEATURES = [
  'All EA 2025 pay codes — verified to the cent',
  'Lift-up, layback & buildup  (Cl. 131)',
  'KM allowance — 26-band table (Cl. 146.4)',
  'Payslip-format breakdown per fortnight',
]

const TRUST_BADGES = ['EA 2025 Compliant', '🔒 Secure Login', '🏔 Mt Victoria']

export default function LoginScreen() {
  const ctx = useFortnightContext()
  const [id, setId]         = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
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
        if (r.status === 429)      setError(data.detail || 'Too many failed attempts. Try again in 1 hour.')
        else if (r.status === 423) setError(data.detail || 'This account is temporarily locked. Contact your admin.')
        else if (r.status === 401) setError("This employee ID isn't on the allowed list. Contact your admin.")
        else if (r.status === 503) setError(data.detail || 'Sign-in is temporarily unavailable. Try again later.')
        else                       setError(data.detail || 'Sign-in failed.')
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
    <>
      {/* ── Injected styles (keyframes + hover / focus states) ── */}
      <style>{`
        @keyframes lsFadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lsSpin {
          to { transform: rotate(360deg); }
        }
        .ls-d0 { animation: lsFadeUp .65s .00s ease both; }
        .ls-d1 { animation: lsFadeUp .65s .07s ease both; }
        .ls-d2 { animation: lsFadeUp .65s .14s ease both; }
        .ls-d3 { animation: lsFadeUp .65s .21s ease both; }
        .ls-d4 { animation: lsFadeUp .65s .28s ease both; }
        .ls-d5 { animation: lsFadeUp .65s .35s ease both; }
        .ls-d6 { animation: lsFadeUp .65s .42s ease both; }
        .ls-d7 { animation: lsFadeUp .65s .49s ease both; }
        .ls-input:focus {
          border-color: #0071e3 !important;
          box-shadow: 0 0 0 3.5px rgba(0,113,227,.18) !important;
          outline: none;
        }
        .ls-submit {
          transition: background .15s ease, transform .1s ease, box-shadow .15s ease;
        }
        .ls-submit:hover:not(:disabled) {
          background: #0077ed !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(0,113,227,.42) !important;
        }
        .ls-submit:active:not(:disabled) {
          transform: translateY(0) !important;
          box-shadow: 0 2px 8px rgba(0,113,227,.3) !important;
        }
        .ls-feat-row {
          transition: transform .15s ease;
        }
        .ls-feat-row:hover { transform: translateX(4px); }
        .ls-admin-link {
          transition: color .15s, background .15s;
        }
        .ls-admin-link:hover {
          color: #0071e3 !important;
          background: rgba(0,113,227,.06) !important;
        }
        /* Responsive: hide hero on narrow screens */
        @media (max-width: 780px) {
          .ls-hero         { display: none !important; }
          .ls-form-panel   { min-height: 100vh !important; }
          .ls-mobile-logo  { display: flex !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ls-d0,.ls-d1,.ls-d2,.ls-d3,.ls-d4,.ls-d5,.ls-d6,.ls-d7 { animation: none; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Outer wrapper                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* ── LEFT: HERO PANEL ──────────────────────────────────── */}
        <div
          className="ls-hero"
          style={{
            flex: '0 0 52%',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 56px',
            background: 'linear-gradient(148deg, #060f1e 0%, #091526 45%, #0d1f40 100%)',
          }}
        >
          {/* Background glow orbs */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: [
              'radial-gradient(ellipse 72% 52% at 8% 12%,  rgba(0,113,227,.24) 0%, transparent 65%)',
              'radial-gradient(ellipse 55% 38% at 92% 88%, rgba(0,113,227,.13) 0%, transparent 65%)',
              'radial-gradient(ellipse 40% 30% at 50% 50%, rgba(0, 80,180,.07) 0%, transparent 60%)',
            ].join(','),
          }} />
          {/* Dot grid texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: .035,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.9) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }} />

          {/* ─── Hero content ─── */}
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 400 }}>

            {/* Logo mark */}
            <div
              className="ls-d0"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 58, height: 58,
                background: 'rgba(0,113,227,.18)',
                borderRadius: 18,
                border: '1px solid rgba(0,113,227,.35)',
                fontSize: 30,
                marginBottom: 30,
                backdropFilter: 'blur(10px)',
              }}
              aria-hidden="true"
            >
              🚂
            </div>

            {/* Headline */}
            <h1
              className="ls-d1"
              style={{
                margin: 0,
                fontSize: 38,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1.12,
                letterSpacing: '-.03em',
                fontFamily: '-apple-system,"SF Pro Display",BlinkMacSystemFont,"Segoe UI",sans-serif',
              }}
            >
              Driver Wage<br />Calculator
            </h1>

            {/* Org line */}
            <p
              className="ls-d2"
              style={{
                margin: '12px 0 0',
                fontSize: 13.5,
                color: 'rgba(255,255,255,.48)',
                letterSpacing: '.01em',
                fontFamily: '-apple-system,"SF Pro Text",BlinkMacSystemFont,sans-serif',
              }}
            >
              Sydney Trains · Blue Mountains Line · Mt Victoria
            </p>

            {/* Hairline separator */}
            <div
              className="ls-d3"
              style={{
                margin: '32px 0',
                height: 1,
                background: 'linear-gradient(to right, rgba(255,255,255,.14) 0%, transparent 80%)',
              }}
            />

            {/* Feature list */}
            <ul
              className="ls-d4"
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}
              role="list"
            >
              {FEATURES.map((feat, i) => (
                <li key={i} className="ls-feat-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <span style={{
                    flex: '0 0 auto',
                    width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,113,227,.25)',
                    border: '1px solid rgba(0,113,227,.4)',
                    borderRadius: 6,
                    color: '#7ab8f5',
                    fontSize: 10,
                    fontWeight: 800,
                    lineHeight: 1,
                  }} aria-hidden="true">✓</span>
                  <span style={{
                    fontSize: 13.5,
                    color: 'rgba(255,255,255,.72)',
                    lineHeight: 1.5,
                    fontFamily: '-apple-system,"SF Pro Text",BlinkMacSystemFont,sans-serif',
                  }}>{feat}</span>
                </li>
              ))}
            </ul>

            {/* Trust badges */}
            <div
              className="ls-d5"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 36 }}
            >
              {TRUST_BADGES.map(b => (
                <span key={b} style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '4px 11px',
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.11)',
                  borderRadius: 999,
                  fontSize: 11,
                  color: 'rgba(255,255,255,.48)',
                  backdropFilter: 'blur(8px)',
                  letterSpacing: '.01em',
                }}>{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: FORM PANEL ─────────────────────────────────── */}
        <div
          className="ls-form-panel"
          style={{
            flex: '1 1 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 24px',
            background: '#fff',
            borderLeft: '1px solid rgba(0,0,0,.07)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Mobile-only logo (desktop hero replaces this) */}
            <div
              className="ls-mobile-logo"
              style={{
                display: 'none',  /* shown via media query */
                alignItems: 'center',
                gap: 11,
                marginBottom: 36,
              }}
            >
              <div style={{
                width: 38, height: 38,
                background: '#0071e3',
                borderRadius: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
                flexShrink: 0,
              }} aria-hidden="true">🚂</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f', letterSpacing: '-.01em' }}>
                  Driver Wage Calculator
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 1 }}>
                  Sydney Trains · EA 2025
                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="ls-d0" style={{ marginBottom: 30 }}>
              <h2 style={{
                margin: 0,
                fontSize: 27,
                fontWeight: 700,
                color: '#1d1d1f',
                letterSpacing: '-.025em',
                fontFamily: '-apple-system,"SF Pro Display",BlinkMacSystemFont,sans-serif',
              }}>
                Sign in
              </h2>
              <p style={{ margin: '7px 0 0', fontSize: 14, color: '#6e6e73', lineHeight: 1.4 }}>
                Enter your 8-digit employee ID to continue
              </p>
            </div>

            {/* Input group */}
            <div className="ls-d1">
              <label
                htmlFor="employee-id"
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1d1d1f',
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
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
                placeholder="12345678"
                value={id}
                onChange={(e) => setId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                disabled={busy}
                className="ls-input"
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  fontSize: 22,
                  fontFamily: '"SF Mono","Fira Code","Fira Mono",Menlo,Consolas,monospace',
                  letterSpacing: '.18em',
                  border: '1.5px solid #d1d1d6',
                  borderRadius: 12,
                  background: '#fafafa',
                  color: '#1d1d1f',
                  outline: 'none',
                  transition: 'border-color .15s, box-shadow .15s',
                  boxSizing: 'border-box',
                  boxShadow: '0 1px 3px rgba(0,0,0,.05)',
                }}
              />

              {/* 8-dot progress indicator */}
              <div
                style={{ display: 'flex', gap: 5, marginTop: 8, justifyContent: 'center' }}
                aria-hidden="true"
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 7, height: 7,
                      borderRadius: '50%',
                      background: i < id.length ? '#0071e3' : '#d1d1d6',
                      transition: 'background .12s ease',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Error alert */}
            {error && (
              <div
                className="ls-d2"
                role="alert"
                style={{
                  marginTop: 14,
                  padding: '10px 13px',
                  fontSize: 13,
                  color: '#b91c1c',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  lineHeight: 1.45,
                }}
              >
                <span style={{ flex: '0 0 auto', marginTop: 1 }} aria-hidden="true">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              type="button"
              onClick={submit}
              disabled={busy || id.length !== 8}
              className="ls-d3 ls-submit"
              style={{
                width: '100%',
                marginTop: 20,
                padding: '14px 20px',
                fontSize: 15,
                fontWeight: 600,
                color: '#fff',
                background: (busy || id.length !== 8) ? '#a8c8f0' : '#0071e3',
                border: 'none',
                borderRadius: 12,
                cursor: (busy || id.length !== 8) ? 'not-allowed' : 'pointer',
                boxShadow: (busy || id.length !== 8) ? 'none' : '0 2px 8px rgba(0,113,227,.28)',
                fontFamily: '-apple-system,"SF Pro Text",BlinkMacSystemFont,sans-serif',
                letterSpacing: '-.01em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {busy ? (
                <>
                  <svg
                    width="16" height="16" viewBox="0 0 16 16"
                    style={{ animation: 'lsSpin .75s linear infinite', flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6"
                      fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2.5" />
                    <path d="M8 2 A6 6 0 0 1 14 8"
                      fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in →'}
            </button>

            {/* First-time help card */}
            <div
              className="ls-d4"
              style={{
                marginTop: 20,
                padding: '13px 15px',
                background: '#f7f8fa',
                border: '1px solid #e5e5ea',
                borderRadius: 12,
                fontSize: 13,
                color: '#6e6e73',
                lineHeight: 1.55,
              }}
            >
              <span style={{ fontWeight: 600, color: '#1d1d1f' }}>First time here?</span>{' '}
              Ask your depot admin to add your employee ID to the allowlist.
            </div>

            {/* Divider */}
            <div
              className="ls-d5"
              style={{
                margin: '22px 0 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, height: 1, background: '#e5e5ea' }} />
              <span style={{ fontSize: 11, color: '#aeaeb2', letterSpacing: '.04em' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#e5e5ea' }} />
            </div>

            {/* Admin sign-in */}
            <div className="ls-d6" style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                className="ls-admin-link"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '7px 14px',
                  fontSize: 13,
                  color: '#6e6e73',
                  cursor: 'pointer',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                }}
              >
                🔐 Admin sign-in
              </button>
            </div>
          </div>
        </div>
      </div>

      {adminOpen && (
        <AdminSignInModal
          onClose={() => setAdminOpen(false)}
          onSubmit={(pw) => { ctx.setAdminPassword(pw); setAdminOpen(false) }}
        />
      )}
    </>
  )
}
