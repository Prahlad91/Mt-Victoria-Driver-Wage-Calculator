/* eslint-disable jsx-a11y/no-autofocus */
import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import AdminSignInModal from './AdminSignInModal'

/**
 * v3.36 — Sydney Trains brand login, left/right split layout.
 *
 * Left panel (55% desktop, 48% tablet):
 *   Navy hero — T-logo, wordmark, headline, 2×2 feature grid, trust badges,
 *   disclaimer footer. 3px orange right-border is the visual divider.
 *
 * Right panel (flex-1):
 *   Light-grey background, form card centred vertically, right-panel footer.
 *
 * Responsive:
 *   ≤768px  → flex-direction: column; left panel collapses to compact header
 *             band (descriptions hidden, orange bottom-border replaces right-border).
 *   ≤400px  → 1-col feature grid, descriptions restored.
 *   prefers-reduced-motion → transitions + spinner disabled.
 */

// ── Brand tokens (TfNSW Open Data / NSW Digital Design System) ───────────────
const NAVY    = '#002664'
const ORANGE  = '#F6891F'
const ORG_DK  = '#d9700e'
const TEXT    = '#22272B'
const TEXT_M  = '#495054'
const BG_R    = '#F2F2F2'
const BORDER  = '#CDD3D6'
const FOCUS   = '#0085B3'
const ERR     = '#B81237'
const ERR_BG  = '#F7E7EB'

const FEATURES = [
  { icon: '📋', title: 'EA 2025 Pay Rules',
    desc: 'All pay codes verified against real payslips — to the cent.' },
  { icon: '🕐', title: 'Lift-up & Layback',
    desc: 'Cl. 131 effective-window — ordinary and OT split correctly.' },
  { icon: '📏', title: 'KM Allowance',
    desc: 'Cl. 146.4 — 26-band credit table for intercity services.' },
  { icon: '💳', title: 'Payslip Breakdown',
    desc: 'Per-fortnight breakdown matching your payroll line items.' },
]

const TRUST_BADGES = ['EA 2025 Compliant', '🔒 Secure Login', '🏔 Mt Victoria']

// Sydney Trains "T" logo — orange square, white T crossbar + stem
function TrainsLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 36 36"
      role="img" aria-label="Sydney Trains logo"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect width="36" height="36" rx="4" fill={ORANGE} />
      <rect x="6"    y="8.5" width="24" height="5.5" rx="1.5" fill="white" />
      <rect x="13.5" y="8.5" width="9"  height="19"  rx="1.5" fill="white" />
    </svg>
  )
}

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
      {/* ─── Injected CSS ──────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        /* ── Root: horizontal split ── */
        .ls-root {
          min-height: 100vh;
          display: flex;
          flex-direction: row;          /* left | right */
          font-family: 'Public Sans', 'Helvetica Neue', Arial, sans-serif;
          color: ${TEXT};
          -webkit-font-smoothing: antialiased;
        }

        /* ════════════════════════════════════════════════════════════
           LEFT PANEL — navy hero
        ════════════════════════════════════════════════════════════ */
        .ls-left {
          flex: 0 0 55%;
          min-height: 100vh;
          background: ${NAVY};
          display: flex;
          flex-direction: column;
          border-right: 3px solid ${ORANGE};   /* orange divider stripe */
          position: relative;
          overflow: hidden;
        }

        /* Timetable-board horizontal line texture */
        .ls-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            0deg,
            transparent, transparent 47px,
            rgba(255,255,255,.025) 47px, rgba(255,255,255,.025) 48px
          );
          pointer-events: none;
        }

        /* Logo / wordmark row */
        .ls-lhdr {
          position: relative;
          z-index: 1;
          padding: 24px 36px;
          display: flex;
          align-items: center;
          gap: 13px;
          border-bottom: 1px solid rgba(255,255,255,.08);
          flex-shrink: 0;
        }
        .ls-lhdr-text {}
        .ls-lhdr-title {
          color: #fff;
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1;
        }
        .ls-lhdr-sub {
          color: rgba(255,255,255,.5);
          font-size: 11px;
          margin-top: 3px;
          letter-spacing: 0.01em;
        }

        /* Hero body — centred vertically */
        .ls-lbody {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 48px 40px;
        }

        .ls-lbody h1 {
          color: #fff;
          font-size: clamp(26px, 3vw, 40px);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.1;
          margin: 0 0 10px;
        }
        .ls-lbody-sub {
          color: rgba(255,255,255,.52);
          font-size: 14px;
          letter-spacing: 0.01em;
          margin: 0 0 32px;
          line-height: 1.4;
        }

        /* 2×2 feature grid */
        .ls-features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 30px;
        }
        .ls-feat {
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 5px;
          padding: 14px 14px 16px;
          transition: background .15s, border-color .15s;
        }
        .ls-feat:hover {
          background: rgba(255,255,255,.11);
          border-color: rgba(246,137,31,.38);
        }
        .ls-feat-icon {
          font-size: 18px;
          display: block;
          margin-bottom: 8px;
          line-height: 1;
        }
        .ls-feat-title {
          color: ${ORANGE};
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .ls-feat-desc {
          color: rgba(255,255,255,.65);
          font-size: 12px;
          line-height: 1.5;
        }

        /* Trust badges */
        .ls-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .ls-badge {
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 2px;
          padding: 3px 10px;
          font-size: 11px;
          color: rgba(255,255,255,.42);
          letter-spacing: 0.03em;
        }

        /* Left panel footer */
        .ls-lftr {
          position: relative;
          z-index: 1;
          padding: 14px 36px;
          font-size: 11px;
          color: rgba(255,255,255,.28);
          border-top: 1px solid rgba(255,255,255,.07);
          line-height: 1.65;
          flex-shrink: 0;
        }

        /* ════════════════════════════════════════════════════════════
           RIGHT PANEL — form
        ════════════════════════════════════════════════════════════ */
        .ls-right {
          flex: 1;
          min-height: 100vh;
          background: ${BG_R};
          display: flex;
          flex-direction: column;
        }

        /* Thin top bar with EA badge */
        .ls-rhdr {
          padding: 12px 24px;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          background: #fff;
          border-bottom: 1px solid ${BORDER};
          flex-shrink: 0;
        }
        .ls-ea-badge {
          background: rgba(246,137,31,.12);
          border: 1px solid rgba(246,137,31,.38);
          color: ${ORANGE};
          font-size: 10px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 2px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* Form area — centred */
        .ls-form-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 36px 28px;
        }

        /* Card */
        .ls-card {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border: 1px solid ${BORDER};
          border-radius: 6px;
          box-shadow: 0 2px 16px rgba(0,0,0,.09), 0 1px 3px rgba(0,0,0,.05);
          overflow: hidden;
        }
        .ls-card-head {
          padding: 22px 26px;
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
          font-size: 13px;
          color: ${TEXT_M};
          line-height: 1.45;
        }
        .ls-card-body { padding: 22px 26px 26px; }

        /* Label */
        .ls-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: ${TEXT};
          margin-bottom: 7px;
        }

        /* Input — NSW DS rectangular style */
        .ls-input {
          display: block;
          width: 100%;
          padding: 11px 14px;
          font-size: 20px;
          font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace;
          letter-spacing: 0.16em;
          color: ${TEXT};
          background: #fff;
          border: 1.5px solid ${BORDER};
          border-radius: 4px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .ls-input::placeholder { color: #c8c8cc; letter-spacing: 0.08em; }
        .ls-input:focus {
          border-color: ${FOCUS};
          box-shadow: 0 0 0 3px rgba(0,133,179,.2);
        }
        .ls-input:disabled { background: #f7f7f7; opacity: .6; cursor: not-allowed; }

        /* 8-dot progress indicator */
        .ls-dots {
          display: flex;
          gap: 6px;
          margin-top: 9px;
          justify-content: center;
        }
        .ls-dot {
          width: 7px;
          height: 7px;
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

        /* Primary button — train orange */
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
          background: ${ORG_DK};
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
          color: ${TEXT_M};
          line-height: 1.55;
        }

        /* OR divider */
        .ls-or {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 18px 0 14px;
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
          color: ${TEXT_M};
          cursor: pointer;
          text-align: center;
          transition: border-color .15s, color .15s, background .15s;
        }
        .ls-admin:hover {
          border-color: ${NAVY};
          color: ${NAVY};
          background: rgba(0,38,100,.04);
        }

        /* Right panel footer */
        .ls-rftr {
          padding: 12px 24px;
          text-align: center;
          font-size: 11px;
          color: #aeaeb2;
          border-top: 1px solid ${BORDER};
          background: #fff;
          flex-shrink: 0;
        }

        /* ════════════════════════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
        ════════════════════════════════════════════════════════════ */

        /* Tablet: tighten left panel */
        @media (max-width: 1100px) {
          .ls-left  { flex: 0 0 48%; }
          .ls-lbody { padding: 40px 32px; }
        }

        /* Mobile: flip to vertical stack */
        @media (max-width: 768px) {
          .ls-root  { flex-direction: column; }

          /* Left becomes a compact header band */
          .ls-left  {
            flex: 0 0 auto;
            min-height: auto;
            border-right: none;
            border-bottom: 3px solid ${ORANGE};
          }
          .ls-lhdr  { padding: 16px 20px; }
          .ls-lbody {
            padding: 20px 20px 24px;
            justify-content: flex-start;
          }
          .ls-lbody h1   { font-size: 24px; margin-bottom: 6px; }
          .ls-lbody-sub  { font-size: 12px; margin-bottom: 16px; }
          .ls-features   { gap: 8px; margin-bottom: 16px; }
          .ls-feat       { padding: 10px 10px 12px; }
          .ls-feat-desc  { display: none; }   /* hide verbose desc on mobile */
          .ls-badges     { display: none; }
          .ls-lftr       { display: none; }

          /* Right panel */
          .ls-right       { min-height: auto; }
          .ls-rhdr        { display: none; }  /* EA badge on right hidden when stacked */
          .ls-form-wrap   { padding: 24px 16px 40px; align-items: flex-start; }
          .ls-card-head   { padding: 16px 18px; }
          .ls-card-head h2 { font-size: 17px; }
          .ls-card-body   { padding: 18px 18px 22px; }
          .ls-input       { font-size: 18px; padding: 10px 12px; }
        }

        /* Very small phones: 1-column features, restore descriptions */
        @media (max-width: 400px) {
          .ls-features   { grid-template-columns: 1fr; }
          .ls-feat-desc  { display: block; }
          .ls-lhdr-sub   { display: none; }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .ls-spinner { animation: none; }
          .ls-btn, .ls-admin, .ls-feat { transition: none; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="ls-root">

        {/* ══ LEFT PANEL — Sydney Trains hero ══════════════════════════════ */}
        <div className="ls-left">

          {/* Logo / wordmark */}
          <div className="ls-lhdr">
            <TrainsLogo size={36} />
            <div className="ls-lhdr-text">
              <div className="ls-lhdr-title">Sydney Trains</div>
              <div className="ls-lhdr-sub">Blue Mountains Line · Mt Victoria Depot</div>
            </div>
          </div>

          {/* Hero body */}
          <div className="ls-lbody">
            <h1>Driver Wage<br />Calculator</h1>
            <p className="ls-lbody-sub">
              Sydney Trains · EA 2025 · Mt Victoria
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

            <div className="ls-badges" aria-label="Trust indicators">
              {TRUST_BADGES.map(b => (
                <span key={b} className="ls-badge">{b}</span>
              ))}
            </div>
          </div>

          {/* Left panel footer */}
          <div className="ls-lftr">
            Not an official Transport for NSW service.<br />
            For payroll queries, contact People &amp; Culture.
          </div>
        </div>

        {/* ══ RIGHT PANEL — sign-in form ═══════════════════════════════════ */}
        <div className="ls-right">

          {/* Slim top bar */}
          <div className="ls-rhdr" aria-hidden="true">
            <div className="ls-ea-badge">EA 2025</div>
          </div>

          {/* Form centred */}
          <main className="ls-form-wrap" role="main">
            <div className="ls-card">

              <div className="ls-card-head">
                <h2>Sign in to your account</h2>
                <p>Use your 8-digit employee ID to access the calculator</p>
              </div>

              <div className="ls-card-body">

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

                {/* Help */}
                <div id="ls-hint" className="ls-help">
                  <strong style={{ color: TEXT, fontWeight: 600 }}>Don't have access?</strong>{' '}
                  Ask your depot admin to add your employee ID to the allowlist.
                </div>

                {/* OR */}
                <div className="ls-or" aria-hidden="true">or</div>

                {/* Admin */}
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

          {/* Right footer */}
          <footer className="ls-rftr" role="contentinfo">
            Driver Wage Calculator · Mt Victoria Depot · Sydney Trains
          </footer>

        </div>{/* /right */}
      </div>{/* /root */}

      {adminOpen && (
        <AdminSignInModal
          onClose={() => setAdminOpen(false)}
          onSubmit={(pw) => { ctx.setAdminPassword(pw); setAdminOpen(false) }}
        />
      )}
    </>
  )
}
