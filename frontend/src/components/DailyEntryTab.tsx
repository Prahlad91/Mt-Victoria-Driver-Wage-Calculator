import { useFortnightContext } from '../context/FortnightContext'
import DayRow from './DayRow'

export default function DailyEntryTab({ onCalculated }:{onCalculated:()=>void}) {
  const ctx = useFortnightContext()

  async function handleCalc() {
    await ctx.calculate()
    if (ctx.result) onCalculated()
  }

  if (!ctx.fnLoaded) return (
    <div className="card">
      <p style={{color:'var(--text3)',fontSize:12}}>Load a roster line from the <strong>Setup</strong> tab first.</p>
    </div>
  )

  return (
    <>
      <div className="toolbar">
        <button className="btn-primary" onClick={handleCalc} disabled={ctx.calculating}>
          {ctx.calculating?'⏳ Calculating...':'Calculate fortnight ↗'}
        </button>
        <button onClick={ctx.fillAllRostered}>Fill all with rostered times</button>
        {ctx.rosterUpload.status==='success'&&!ctx.rosterUpload.applied&&(
          <button className="btn-primary btn-sm" onClick={ctx.applyUploadedRoster}>Apply uploaded roster</button>
        )}
        <span className="toolbar-label">
          Line {ctx.rosterLine} · {ctx.days[0]?.date} – {ctx.days[13]?.date}{' · '}
          <span style={{color:ctx.fnType==='short'?'var(--amber-text)':'var(--blue-text)',fontWeight:500}}>
            {ctx.fnType==='short'?'⚡ SHORT':'📋 LONG'}
          </span>
        </span>
      </div>
      {ctx.calcError&&<div className="alert alert-err" style={{marginBottom:8}}>⚠ {ctx.calcError}</div>}
      {ctx.days.map((_,i)=><DayRow key={ctx.days[i].date} index={i} />)}
    </>
  )
}
