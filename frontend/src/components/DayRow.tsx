import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import { LEAVE_CATS } from '../utils/eaRules'
import type { DayResult } from '../types'

const DW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d:Date){ return `${DW[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }

export default function DayRow({ index:i }:{index:number}) {
  const ctx = useFortnightContext()
  const [open,setOpen] = useState(false)
  const day     = ctx.days[i]
  const preview = ctx.previews[i]

  const isOff      = day.diag==='OFF'
  const isAdo      = day.diag==='ADO'
  const isOffOrAdo = isOff||isAdo
  const hasManual  = Boolean(day.manualDiag)
  const showPicker = isOffOrAdo && !hasManual
  const showReset  = Boolean(day._origDiag)

  const d = parseDate(day.date)

  // Badge
  let badge = null
  if (!hasManual) {
    if      (isOff)    badge = <span className="badge badge-off">OFF</span>
    else if (isAdo)    badge = <span className="badge badge-ado">ADO</span>
    else if (day.ph)   badge = <span className="badge badge-ph">PH</span>
    else if (day.dow===0) badge = <span className="badge badge-sun">Sun</span>
    else if (day.dow===6) badge = <span className="badge badge-sat">Sat</span>
  } else {
    badge = <span className="badge badge-manual">{day.diag}</span>
  }

  const rosterInfo = (!isOffOrAdo||hasManual) && day.rStart
    ? <span className="day-roster-info">{day.rStart}–{day.rEnd} · rostered {day.rHrs.toFixed(2)}h</span>
    : null

  const summary = preview
    ? <span className={`day-summary${preview.total_pay>0?' has-pay':''}`}>{preview.hours.toFixed(1)}h → ${preview.total_pay.toFixed(2)}</span>
    : <span className="day-summary">—</span>

  return (
    <div className={`day-row${open?' open':''}`}>
      <div className="day-header" onClick={()=>setOpen(o=>!o)}>
        <span className="day-date">{fmtDate(d)}</span>
        {badge}{rosterInfo}{summary}
        <span className="chevron">▼</span>
      </div>
      <div className={`day-body${open?' open':''}`}>
        {showPicker
          ? <OffAdoPicker i={i} isAdo={isAdo} />
          : <WorkForm i={i} showReset={showReset} />
        }
      </div>
    </div>
  )
}

// ── OFF/ADO picker form ──────────────────────────────────────────
function OffAdoPicker({ i, isAdo }:{i:number;isAdo:boolean}) {
  const ctx = useFortnightContext()
  const day = ctx.days[i]
  const diag = day.manualDiagInput||''
  function setDiag(v:string){ ctx.setDay(i,{manualDiagInput:v}) }
  return (
    <div className="off-ado-form">
      <p className="type-label">{isAdo?'Accrued Day Off (ADO)':'Day off / RDO'} — no pay unless worked.</p>
      <div className="off-ado-actions">
        <div>
          <label>Manual diagram / schedule no. <span style={{color:'var(--text3)'}}>for shift swaps or day-off work</span></label>
          <input type="text" style={{width:180}} placeholder="e.g. 3158 or line 7"
            value={diag} onChange={e=>setDiag(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&ctx.applyManualDiag(i,diag)} />
        </div>
        <button className="btn-primary btn-sm" onClick={()=>ctx.applyManualDiag(i,diag)}>Load diagram ↗</button>
        <button className="btn-sm btn-danger" onClick={()=>ctx.markWorkedOnOff(i)}>+ Worked (no diagram)</button>
      </div>
    </div>
  )
}

// ── Work shift form (also used for manual diag on OFF/ADO) ─────────────────
function WorkForm({ i, showReset }:{i:number;showReset:boolean}) {
  const ctx  = useFortnightContext()
  const day  = ctx.days[i]
  const preview = ctx.previews[i]
  const ch = (k:keyof typeof day, v:any) => ctx.setDay(i,{[k]:v} as any)

  return (
    <>
      {showReset&&(
        <div className="reset-banner">
          <span>Working on <strong>{day._origDiag||'OFF'}</strong> day — diagram: <strong>{day.diag}</strong></span>
          <button className="btn-sm btn-danger" style={{marginLeft:'auto'}} onClick={()=>ctx.resetDay(i)}>↩ Reset to {day._origDiag||'OFF'}</button>
        </div>
      )}
      <div className="shift-inputs">
        <div>
          <label>Actual start <span style={{color:'var(--text3)'}}>rostered: {day.rStart||'—'}</span></label>
          <input type="time" value={day.aStart} onChange={e=>ch('aStart',e.target.value)} />
        </div>
        <div>
          <label>Actual end <span style={{color:'var(--text3)'}}>rostered: {day.rEnd||'—'}</span></label>
          <input type="time" value={day.aEnd} onChange={e=>ch('aEnd',e.target.value)} />
        </div>
        <div>
          <label>KMs</label>
          <input type="number" min="0" step="1" value={day.km||''} onChange={e=>ch('km',parseFloat(e.target.value)||0)} />
        </div>
        <div>
          <label>WOBOD</label>
          <select value={day.wobod?'1':'0'} onChange={e=>ch('wobod',e.target.value==='1')}>
            <option value="0">No</option><option value="1">Yes</option>
          </select>
        </div>
        <div>
          <label>Cross-midnight</label>
          <select value={day.cm?'1':'0'} onChange={e=>ch('cm',e.target.value==='1')}>
            <option value="0">No</option><option value="1">Yes</option>
          </select>
        </div>
        <div style={{display:'flex',alignItems:'flex-end'}}>
          <button className="btn-sm" onClick={()=>{if(day.rStart)ctx.setDay(i,{aStart:day.rStart||'',aEnd:day.rEnd||''})}}>☰ Rostered</button>
        </div>
      </div>
      <div style={{marginBottom:8}}>
        <label>Leave type</label>
        <select style={{width:300}} value={day.leaveCat} onChange={e=>ch('leaveCat',e.target.value)}>
          {LEAVE_CATS.map(lc=><option key={lc.code} value={lc.code}>{lc.label}{lc.eaRef?` (${lc.eaRef})`:''}</option>)}
        </select>
      </div>
      {preview&&<DayPreview preview={preview}/>}
    </>
  )
}

// ── Per-day breakdown table ──────────────────────────────────────────────
function DayPreview({ preview }:{preview:DayResult}) {
  if (!preview) return null
  if (preview.day_type==='off') return null
  if (preview.day_type==='ado'&&preview.total_pay===0)
    return <div className="alert alert-info" style={{fontSize:11}}>{preview.flags[0]||'ADO accruing — paid out on short fortnight.'}</div>
  if (!preview.components.length) return null
  return (
    <>
      <table style={{marginTop:6}}>
        <thead>
          <tr><th>Component</th><th>EA ref</th><th>Code</th><th>Hrs</th><th>Rate</th><th className="text-right">Amount</th></tr>
        </thead>
        <tbody>
          {preview.components.map((c,j)=>(
            <tr key={j} className={c.cls==='km-row'?'row-km':c.cls==='pen-row'?'row-pen':''}>
              <td>{c.name}</td>
              <td style={{color:'var(--text3)',fontSize:11}}>{c.ea}</td>
              <td><code>{c.code}</code></td>
              <td>{c.hrs}</td>
              <td style={{color:'var(--text3)',fontSize:11}}>{c.rate}</td>
              <td className="text-right">${c.amount.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="row-total">
            <td colSpan={3}><strong>Daily total</strong></td>
            <td>{preview.hours.toFixed(2)} hrs</td>
            <td/>
            <td className="text-right"><strong>${preview.total_pay.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div style={{marginTop:4}}>
        {preview.flags.map((f,j)=>(
          <span key={j} className={`flag-chip${f.includes('ALERT')?' err':''}`}>{f.includes('ALERT')?'🚨':'⚑'} {f}</span>
        ))}
      </div>
    </>
  )
}
