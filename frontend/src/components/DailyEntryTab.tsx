import { useFortnightContext } from '../context/FortnightContext'
import DayRow from './DayRow'

export default function DailyEntryTab({ onCalculated }: { onCalculated: () => void }) {
  const ctx = useFortnightContext()

  async function handleCalc() {
    const ok = await ctx.calculate()
    if (ok) onCalculated()
  }

  if (!ctx.fnLoaded) return (
    <div className="card" style={{ padding: '24px 20px' }}>
      <p style={{ color: 'var(--text2)', fontSize: 13 }}>
        Load a roster line from the <strong>Setup</strong> tab first.
      </p>
    </div>
  )

  return (
    <>
      <div className="toolbar">
        <button className="btn-primary" onClick={handleCalc} disabled={ctx.calculating}>
          {ctx.calculating ? '⏳ Calculating…' : '✦ Calculate fortnight'}
        </button>
{ctx.rosterUpload.status === 'success' && !ctx.rosterUpload.applied && (
          <button className="btn-primary btn-sm" onClick={ctx.applyUploadedRoster}>
            Apply uploaded roster
          </button>
        )}
        <span className="toolbar-label">
          <strong>Line {ctx.rosterLine}</strong>
          {ctx.loadedCrewName && (
            <>
              {'  '}
              <span
                title="Crew member from the uploaded fortnight roster"
                style={{
                  color: 'var(--accent)',
                  fontWeight: 600,
                }}
              >
                👤 {ctx.loadedCrewName}
              </span>
            </>
          )}
          {'  '}
          {ctx.days[0]?.date} – {ctx.days[13]?.date}
          {'  '}
          <span style={{
            color: ctx.fnType === 'short' ? 'var(--amber)' : 'var(--accent)',
            fontWeight: 600,
          }}>
            {ctx.fnType === 'short' ? '⚡ SHORT' : '📋 LONG'}
          </span>
        </span>
      </div>

      {ctx.calcError && (
        <div className="alert alert-err" style={{ marginBottom: 10 }}>
          ⚠ {ctx.calcError}
        </div>
      )}

      <div role="list" aria-label="Fortnight days">
        {ctx.days.map((_, i) => (
          <DayRow key={ctx.days[i].date} index={i} />
        ))}
      </div>
    </>
  )
}
