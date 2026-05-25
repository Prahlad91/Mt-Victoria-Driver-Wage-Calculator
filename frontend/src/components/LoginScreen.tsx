/* eslint-disable jsx-a11y/no-autofocus */
import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import AdminSignInModal from './AdminSignInModal'

/**
 * v3.35 — Sydney Trains brand login screen.
 *
 * Colours from TfNSW Open Data / NSW Digital Design System:
 *   #F6891F  train orange (TfNSW trains mode colour)
 *   #002664  NSW Government brand dark (navy)
 *   #22272B  text dark
 *   #495054  text mid
 *   #CDD3D6  border
 *   #0085B3  focus blue
 *   #B81237  error red
 *
 * Layout (top → bottom):
 *   1. 56px navy nav  +  3px orange accent bar
 *   2. Navy hero  →  headline + 4-column feature grid
 *   3. Centered white form card
 *   4. Dark footer (disclaimer)
 *
 * Fully responsive via CSS class breakpoints:
 *   ≥1024px  4-column feature grid, roomy hero
 *   600-1023 auto-fit feature grid, standard padding
 *   ≤600px   2-column feature grid, compact nav/hero, card full-width
 *   ≤400px   1-column feature grid, feature desc re-shown
 */

// ── Brand tokens ──────────────────────────────────────────────────────────────
const NAVY      = '#002664'
const ORANGE    = '#F6891F'
const ORG_DARK  = '#d9700e'   // button hover
const TEXT      = '#22272B'
const TEXT_MID  = '#495054'
const BG        = '#F2F2F2'
const BORDER    = '#CDD3D6'
const FOCUS     = '#0085B3'
const ERR       = '#B81237'
const ERR_BG    = '#F7E7EB'

// ── Feature cards ─────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '📋', title: 'EA 2025 Pay Rules',
    desc: 'All pay codes and allowances verified against real payslips — to the cent.' },
  { icon: '🕐', title: 'Lift-up & Layback',
    desc: 'Cl. 131 effective-window — ordinary and OT split correctly.' },
  { icon: '📏', title: 'KM Allowance',
    desc: 'Cl. 146.4 — 26-band credit table for intercity services.' },
  { icon: '💳', title: 'Payslip Breakdown',
    desc: 'Fortnight-by-fortnight breakdown matching your payroll line items.' },
]

// ── Sydney Trains "T" logo ────────────────────────────────────────────────────
// Approximates the official orange-square / white-T mark.
function TrainsLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 36 36"
      role="img" aria-label="Sydney Trains logo"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="36" height="36" rx="4" fill={ORANGE} />
      {/* cross-bar */}
      <rect x="6"    y="8.5" width="24" height="5.5" rx="1.5" fill="white" />
      {/* stem */}
      <rect x="13.5" y="8.5" width="9"  height="19"  rx="1.5" fill="white" />
    </svg>
  )
}

// ── Spinner SVG ───────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="ls-spinner" width="16" height="16" viewBox="0 0 16 16"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6"
        fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2.5" />
      <path d="M8 2 A6 6 0 0 1 14 8"
        fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const ctx = useFortnightContext()
  const [id, setId]           = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)

  async function submit() {
    const trimmed = id.trim()
    if (!/^\d{8}$/.test(trimmed)) { setError('Employee ID must be exactly 8 digits.'); return }
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: trimmed }),
      })
      let data: { token?: string; detail?: string } = {}
      try { data = await r.json() } catch { /* ignore */ }
      if (!r.ok) {
        if      (r.status === 429) setError(data.detail || 'Too many attempts. Try again in 1 hour.')
        else if (r.status === 423) setError(data.detail || 'Account temporarily locked. Contact your admin.')
        else if (r.status === 401) setError("Employee ID not on the allowlist. Contact your depot admin.")
        else if (r.status === 503) setError(data.detail || 'Sign-in temporarily unavailable. Try again shortly.')
        else                       setError(data.detail || 'Sign-in failed.')
        return
      }
      if (!data.token) { setError('No token returned — contact your admin.'); return }
      ctx.signIn(data.token)
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  return (
    <>
      {/* ─── Injected CSS ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        /* Root */
        .ls-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: 'Public Sans', 'Helvetica Neue', Arial, sans-serif;
          background: ${BG};
          color: ${TEXT};
          -webkit-font-smoothing: antialiased;
        }

        /* ── Nav bar ── */
        .ls-nav {
          background: ${NAVY};
          height: 56px;
          padding: 0 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .ls-nav-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ls-nav-wordmark { line-height: 1; }
        .ls-nav-title {
          color: #fff;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .ls-nav-sub {
          color: rgba(255,255,255,.5);
          font-size: 11px;
          margin-top: 2px;
          letter-spacing: 0.01em;
        }
        .ls-nav-badge {
          background: rgba(246,137,31,.18);
          border: 1px solid rgba(246,137,31,.4);
          color: ${ORANGE};
          font-size: 10px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 2px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* Orange accent stripe */
        .ls-accent {
          height: 3px;
          background: ${ORANGE};
          flex-shrink: 0;
        }

        /* ── Hero ── */
        .ls-hero {
          background: ${NAVY};
          padding: 52px 28px 44px;
          text-align: center;
          position: relative;
          overflow: hidden;
          flex-shrink: 0;
        }
        /* Subtle horizontal line texture — train-timetable aesthetic */
        .ls-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 47px,
            rgba(255,255,255,.028) 47px,
            rgba(255,255,255,.028) 48px
          );
          pointer-events: none;
        }
        .ls-hero-inner {
          position: relative;
          z-index: 1;
          max-width: 840px;
          margin: 0 auto;
        }
        .ls-hero h1 {
          color: #fff;
          font-size: clamp(26px, 4.5vw, 44px);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 10px;
        }
        .ls-hero-sub {
          color: rgba(255,255,255,.55);
          font-size: clamp(13px, 1.8vw, 15px);
          letter-spacing: 0.01em;
          margin: 0 0 30px;
        }

        /* Feature grid */
        .ls-features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
        }
        .ls-feat {
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 5px;
          padding: 14px 14px 16px;
          text-align: left;
          transition: background .15s, border-color .15s;
          cursor: default;
        }
        .ls-feat:hover {
          background: rgba(255,255,255,.11);
          border-color: rgba(246,137,31,.35);
        }
        .ls-feat-icon {
          font-size: 19px;
          display: block;
          margin-bottom: 8px;
          line-height: 1;
        }
        .ls-feat-title {
          color: ${ORANGE};
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .ls-feat-desc {
          color: rgba(255,255,255,.68);
          font-size: 12.5px;
          line-height: 1.5;
        }

        /* ── Form section ── */
        .ls-form-section {
          flex: 1;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 36px 16px 52px;
        }

        /* Card */
        .ls-card {
          width: 100%;
          max-width: 480px;
          background: #fff;
          border: 1px solid ${BORDER};
          border-radius: 6px;
          box-shadow: 0 2px 16px rgba(0,0,0,.09), 0 1px 3px rgba(0,0,0,.05);
          overflow: hidden;
        }
        .ls-card-head {
          padding: 22px 28px;
          border-bottom: 1px solid #ebebeb;
          border-left: 4px solid ${ORANGE};
        }
        .ls-card-head h2 {
          margin: 0;
          font-size: 19px;
          font-weight: 700;
          color: ${TEXT};
          letter-spacing: -0.015em;
        }
        .ls-card-head p {
          margin: 5px 0 0;
          font-size: 13.5px;
          color: ${TEXT_MID};
          line-height: 1.45;
        }
        .ls-card-body { padding: 24px 28px 28px; }

        /* Label */
        .ls-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: ${TEXT};
          margin-bottom: 7px;
        }

        /* Input — NSW DS style */
        .ls-input {
          display: block;
          width: 100%;
          padding: 11px 14px;
          font-size: 21px;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          color: ${TEXT};
          background: #fff;
          border: 1.5px solid ${BORDER};
          border-radius: 4px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ls-input::placeholder { color: ${BORDER}; letter-spacing: 0.08em; }
        .ls-input:focus {
          border-color: ${FOCUS};
          box-shadow: 0 0 0 3px rgba(0,133,179,.2);
        }
        .ls-input:disabled { background: #f7f7f7; opacity: .6; cursor: not-allowed; }

        /* 8-dot progress */
        .ls-dots {
          display: flex;
          gap: 6px;
          margin-top: 9px;
          justify-content: center;
        }
        .ls-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          transition: background .12s;
        }

        /* Error */
        .ls-error {
          margin-top: 14px;
          padding: 10px 13px;
          background: ${ERR_BG};
          border: 1px solid #f0b8c4;
          border-left: 3px solid ${ERR};
          border-radius: 4px;
          color: ${ERR};
          font-size: 13px;
          line-height: 1.45;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        /* Primary button — Sydney Trains orange */
        .ls-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-top: 20px;
          padding: 13px 20px;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          color: #fff;
          background: ${ORANGE};
          border: none;
          border-radius: 4px;
          cursor: pointer;
          letter-spacing: -0.01em;
          box-shadow: 0 2px 6px rgba(246,137,31,.35);
          transition: background .15s, transform .1s, box-shadow .15s;
        }
        .ls-btn:hover:not(:disabled) {
          background: ${ORG_DARK};
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(246,137,31,.45);
        }
        .ls-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(246,137,31,.3);
        }
        .ls-btn:disabled {
          background: #c8c8c8;
          box-shadow: none;
          cursor: not-allowed;
        }
        @keyframes ls-spin { to { transform: rotate(360deg); } }
        .ls-spinner { animation: ls-spin .75s linear infinite; }

        /* Help box */
        .ls-help {
          margin-top: 18px;
          padding: 12px 14px;
          background: #f7f8fa;
          border: 1px solid #ebebeb;
          border-radius: 4px;
          font-size: 13px;
          color: ${TEXT_MID};
          line-height: 1.55;
        }

        /* OR divider */
        .ls-or {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 20px 0 16px;
          color: #aeaeb2;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ls-or::before, .ls-or::after {
          content: '';
          flex: 1;
          height: 1px;
          background: ${BORDER};
        }

        /* Admin ghost button */
        .ls-admin {
          display: block;
          width: 100%;
          padding: 10px 14px;
          background: none;
          border: 1.5px solid ${BORDER};
          border-radius: 4px;
          font-size: 13.5px;
          font-weight: 600;
          font-family: inherit;
          color: ${TEXT_MID};
          cursor: pointer;
          text-align: center;
          transition: border-color .15s, color .15s, background .15s;
        }
        .ls-admin:hover {
          border-color: ${NAVY};
          color: ${NAVY};
          background: rgba(0,38,100,.04);
        }

        /* ── Footer ── */
        .ls-footer {
          background: #22272b;
          padding: 14px 24px;
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,.38);
          flex-shrink: 0;
          line-height: 1.7;
        }

        /* ═══ RESPONSIVE BREAKPOINTS ═══════════════════════════════════════ */

        /* ── ≥1024px: roomy desktop ── */
        @media (min-width: 1024px) {
          .ls-hero { padding: 64px 28px 56px; }
          .ls-features { grid-template-columns: repeat(4, 1fr); }
        }

        /* ── ≤768px: tablet ── */
        @media (max-width: 768px) {
          .ls-hero { padding: 40px 20px 32px; }
        }

        /* ── ≤600px: mobile ── */
        @media (max-width: 600px) {
          .ls-nav { height: 52px; padding: 0 16px; }
          .ls-nav-title { font-size: 15px; }
          .ls-nav-sub { display: none; }
          .ls-hero { padding: 28px 16px 24px; }
          .ls-features { grid-template-columns: 1fr 1fr; gap: 8px; }
          .ls-feat { padding: 10px 10px 12px; }
          .ls-feat-desc { display: none; }        /* hide verbose text on small screens */
          .ls-form-section { padding: 24px 12px 40px; }
          .ls-card-head { padding: 16px 18px; border-left-width: 3px; }
          .ls-card-head h2 { font-size: 17px; }
          .ls-card-body { padding: 18px 18px 22px; }
          .ls-input { font-size: 18px; padding: 10px 12px; }
        }

        /* ── ≤400px: very small phones (restore 1-col + desc) ── */
        @media (max-width: 400px) {
          .ls-features { grid-template-columns: 1fr; }
          .ls-feat-desc { display: block; }
        }

        /* ── Reduced motion ── */
        @media (prefers-reduced-motion: reduce) {
          .ls-spinner { animation: none; }
          .ls-btn, .ls-admin, .ls-feat { transition: none; }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="ls-root">

        {/* ── 1. Top nav bar ─────────────────────────────────────────────── */}
        <nav className="ls-nav" role="navigation" aria-label="Sydney Trains">
          <div className="ls-nav-left">
            <TrainsLogo size={36} />
            <div className="ls-nav-wordmark">
              <div className="ls-nav-title">Sydney Trains</div>
              <div className="ls-nav-sub">Blue Mountains Line · Mt Victoria Depot</div>
            </div>
          </div>
          <div className="ls-nav-badge" aria-label="Enterprise Agreement 2025">EA 2025</div>
        </nav>

        {/* ── Orange accent bar ───────────────────────────────────────────── */}
        <div className="ls-accent" aria-hidden="true" />

        {/* ── 2. Hero section ────────────────────────────────────────────── */}
        <section className="ls-hero" aria-labelledby="hero-heading">
          <div className="ls-hero-inner">
            <h1 id="hero-heading">Driver Wage Calculator</h1>
            <p className="ls-hero-sub">
              Sydney Trains · Blue Mountains Line · Mt Victoria
            </p>
            <div className="ls-features" role="list" aria-label="App features">
              {FEATURES.map(f => (
                <article key={f.title} className="ls-feat" role="listitem">
                  <span className="ls-feat-icon" aria-hidden="true">{f.icon}</span>
                  <div className="ls-feat-title">{f.title}</div>
                  <div className="ls-feat-desc">{f.desc}</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Form card ───────────────────────────────────────────────── */}
        <main className="ls-form-section" role="main">
          <div className="ls-card">

            {/* Card header */}
            <div className="ls-card-head">
              <h2>Sign in to your account</h2>
              <p>Use your 8-digit employee ID to access the calculator</p>
            </div>

            {/* Card body */}
            <div className="ls-card-body">

              {/* Employee ID input */}
              <label htmlFor="employee-id" className="ls-label">
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
                aria-describedby={error ? 'ls-err' : 'ls-hint'}
                aria-invalid={error ? 'true' : 'false'}
              />

              {/* 8-dot character progress */}
              <div className="ls-dots" aria-hidden="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="ls-dot"
                    style={{ background: i < id.length ? ORANGE : BORDER }}
                  />
                ))}
              </div>

              {/* Inline error */}
              {error && (
                <div id="ls-err" className="ls-error" role="alert" aria-live="assertive">
                  <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={submit}
                disabled={busy || id.length !== 8}
                className="ls-btn"
                aria-busy={busy}
              >
                {busy ? <><Spinner /> Signing in…</> : 'Sign in →'}
              </button>

              {/* First-time help */}
              <div id="ls-hint" className="ls-help">
                <strong style={{ color: TEXT, fontWeight: 600 }}>Don't have access?</strong>{' '}
                Ask your depot admin to add your employee ID to the allowlist.
              </div>

              {/* OR divider */}
              <div className="ls-or" aria-hidden="true">or</div>

              {/* Admin sign-in */}
              <button
                type="button"
                onClick={() => setAdminOpen(true)}
                className="ls-admin"
                aria-label="Sign in as depot admin"
              >
                🔐 Admin sign-in
              </button>

            </div>{/* /card-body */}
          </div>{/* /card */}
        </main>

        {/* ── 4. Footer ──────────────────────────────────────────────────── */}
        <footer className="ls-footer" role="contentinfo">
          Driver Wage Calculator · Mt Victoria Depot · Sydney Trains
          <br />
          Not an official Transport for NSW service.
          For payroll queries, contact People &amp; Culture.
        </footer>

      </div>

      {/* Admin password modal */}
      {adminOpen && (
        <AdminSignInModal
          onClose={() => setAdminOpen(false)}
          onSubmit={(pw) => { ctx.setAdminPassword(pw); setAdminOpen(false) }}
        />
      )}
    </>
  )
}
