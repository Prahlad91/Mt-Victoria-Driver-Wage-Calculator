import { useState } from 'react'
import SetupTab from './components/SetupTab'
import DailyEntryTab from './components/DailyEntryTab'
import ResultsTab from './components/ResultsTab'
import RatesTab from './components/RatesTab'
import KmTableTab from './components/KmTableTab'
import { useFortnightContext } from './context/FortnightContext'

type Tab = 'setup' | 'daily' | 'results' | 'rates' | 'km'
const TABS: { id: Tab; label: string }[] = [
  { id: 'setup',   label: 'Setup' },
  { id: 'daily',   label: 'Daily Entry' },
  { id: 'results', label: 'Results' },
  { id: 'rates',   label: 'Rates & Codes' },
  { id: 'km',      label: 'KM Table' },
]

export default function App() {
  const [active, setActive] = useState<Tab>('setup')
  const { result } = useFortnightContext()
  return (
    <div className="app">
      <header className="app-header">
        <h1>Mt Victoria Driver Wage Calculator</h1>
        <span className="ea-badge">EA 2025</span>
        <a href="/legacy" className="legacy-link" target="_blank" rel="noreferrer">Legacy app →</a>
      </header>
      <div className="tabs">
        {TABS.map(t => (
          <div key={t.id} className={`tab${active === t.id ? ' active' : ''}`} onClick={() => setActive(t.id)}>
            {t.label}
            {t.id === 'results' && result && <span className="tab-dot">✓</span>}
          </div>
        ))}
      </div>
      {active === 'setup'   && <SetupTab   onLoaded={() => setActive('daily')} />}
      {active === 'daily'   && <DailyEntryTab onCalculated={() => setActive('results')} />}
      {active === 'results' && <ResultsTab />}
      {active === 'rates'   && <RatesTab />}
      {active === 'km'      && <KmTableTab />}
    </div>
  )
}
