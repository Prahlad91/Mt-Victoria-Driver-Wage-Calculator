import { useState, useEffect } from 'react'
import SetupTab from './components/SetupTab'
import DailyEntryTab from './components/DailyEntryTab'
import ResultsTab from './components/ResultsTab'
import RatesTab from './components/RatesTab'
import KmTableTab from './components/KmTableTab'
import AdminSignInModal from './components/AdminSignInModal'
import { useFortnightContext } from './context/FortnightContext'

type Tab = 'setup' | 'daily' | 'results' | 'rates' | 'km'
const ALL_TABS: { id: Tab; label: string }[] = [
  { id: 'setup',   label: 'Setup' },
  { id: 'daily',   label: 'Daily Entry' },
  { id: 'results', label: 'Results' },
  { id: 'rates',   label: 'Rates & Codes' },
  { id: 'km',      label: 'KM Table' },
]
// v3.29: tabs that only admins see.  Drivers (non-admin) get a slimmer task-
// focused UI per the PRD §3.29 spec.
const ADMIN_ONLY_TABS: ReadonlySet<Tab> = new Set(['rates', 'km'])

export default function App() {
  const [active, setActive] = useState<Tab>('setup')
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const { result, fnType, fnLoaded, rosterLine, adminPassword, setAdminPassword } = useFortnightContext()

  // v3.29: build the visible-tab list from admin state, and redirect away
  // from hidden tabs when admin signs out so the active state stays valid.
  const isAdmin = !!adminPassword
  const visibleTabs = isAdmin ? ALL_TABS : ALL_TABS.filter(t => !ADMIN_ONLY_TABS.has(t.id))
  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_TABS.has(active)) setActive('setup')
  }, [isAdmin, active])

  return (
    <>
      {/* ── Sticky frosted-glass header ───────────────────── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-logo">
            <div className="app-header-mark" aria-hidden="true">🚂</div>
            <div className="app-header-text">
              <div className="app-header-title">Driver Wage Calculator</div>
              <div className="app-header-sub">Sydney Trains · Blue Mountains Line · Mt Victoria</div>
            </div>
          </div>

          <div className="app-header-right">
            {fnLoaded && fnType === 'short' && (
              <span className="badge badge-ado" style={{fontSize:11}}>⚡ Short fortnight</span>
            )}
            {fnLoaded && fnType === 'long' && (
              <span className="badge" style={{background:'var(--accent-bg)',color:'var(--accent)',fontSize:11}}>
                📋 Long fortnight
              </span>
            )}
            {fnLoaded && rosterLine && (
              <span className="badge" style={{background:'var(--surface-2)',border:'1px solid var(--border-mid)',color:'var(--text2)',fontSize:11}}>
                Line {rosterLine}
              </span>
            )}
            <span className="badge" style={{background:'var(--accent-bg)',color:'var(--accent)',fontSize:11}}>
              EA 2025
            </span>
            {/* v3.26/v3.28: admin sign-in pill — opens modal to enter ADMIN_PASSWORD */}
            {adminPassword ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Sign out as admin?')) setAdminPassword(null)
                }}
                className="badge"
                title="Signed in as admin. Click to sign out."
                style={{
                  background: 'var(--green-bg)', color: 'var(--green)',
                  fontSize: 11, border: '1px solid #8fcca8', cursor: 'pointer',
                  padding: '2px 8px', borderRadius: 999,
                }}
              >
                👤 Admin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAdminModalOpen(true)}
                className="badge"
                title="Sign in as admin to upload master roster / schedules / chart."
                style={{
                  background: 'var(--surface-2)', color: 'var(--text2)',
                  fontSize: 11, border: '1px solid var(--border-mid)', cursor: 'pointer',
                  padding: '2px 8px', borderRadius: 999,
                }}
              >
                🔐 Admin
              </button>
            )}
            <a href="/legacy" target="_blank" rel="noreferrer"
               style={{fontSize:11,color:'var(--text2)',textDecoration:'none'}}>
              Legacy →
            </a>
          </div>
        </div>
      </header>

      {/* v3.26/v3.28: admin sign-in modal */}
      {adminModalOpen && (
        <AdminSignInModal
          onClose={() => setAdminModalOpen(false)}
          onSubmit={(pw) => { setAdminPassword(pw); setAdminModalOpen(false) }}
        />
      )}

      {/* ── Sticky tab bar ────────────────────────────────── */}
      <nav className="tabs-bar" aria-label="App sections">
        <div className="tabs-inner">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              className={`tab${active === t.id ? ' active' : ''}`}
              onClick={() => setActive(t.id)}
              aria-selected={active === t.id}
              role="tab"
            >
              {t.label}
              {t.id === 'results' && result && <span className="tab-dot" aria-label="calculated" />}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Main content ──────────────────────────────────── */}
      <main className="app" role="main">
        {active === 'setup'   && <SetupTab   onLoaded={() => setActive('daily')} />}
        {active === 'daily'   && <DailyEntryTab onCalculated={() => setActive('results')} />}
        {active === 'results' && <ResultsTab />}
        {active === 'rates'   && <RatesTab />}
        {active === 'km'      && <KmTableTab />}
      </main>
    </>
  )
}
