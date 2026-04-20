import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function ResultsTab() {
  const ctx = useFortnightContext()
  const { result, calculating, calcError, payslipUpload } = ctx

  if (calculating) return <div className="card"><p style={{color:'var(--text3)',textAlign:'center',padding:20}}>⏳ Calculating...</p></div>
  if (!result) return (
    <div className="card">
      <p style={{color:'var(--text3)',fontSize:12}}>No results yet. Go to <strong>Daily Entry</strong> and click <strong>Calculate fortnight</strong>.</p>
      {calcError&&<div className="alert alert-err" style={{marginTop:8}}>⚠ {calcError}</div>}
    </div>
  )

  const threshold = result.fortnight_type==='short'?72:76

  return (
    <>
      {/* Metrics */}
      <div className="card">
        <h2>Fortnight Summary</h2>
        <div className="g4">
          <div className="metric"><div className="val">${result.total_pay.toFixed(2)}</div><div className="lbl">Calculated gross</div></div>
          <div className="metric"><div className="val">{result.total_hours.toFixed(2)}</div><div className="lbl">Actual hours worked</div></div>
          <div className="metric">
            <div className="val" style={{color:result.fn_ot_hrs>0?'var(--amber-text)':undefined}}>
              {result.fn_ot_hrs>0?`${result.fn_ot_hrs.toFixed(2)} ⛑`:'—'}
            </div>
            <div className="lbl">{result.fn_ot_hrs>0?`FN OT hrs (>${threshold}h threshold)`:'No fortnight OT'}</div>
          </div>
          <div className="metric">
            <div className="val" style={{color:result.ado_payout>0?'var(--amber-text)':'var(--text3)'}}>
              {result.ado_payout>0?`$${result.ado_payout.toFixed(2)}`:'—'}
            </div>
            <div className="lbl">{result.fortnight_type==='short'?'ADO payout (short FN)':'ADO accruing (long FN)'}</div>
          </div>
        </div>
      </div>

      {/* Export */}
      <div className="card" style={{padding:'10px 16px'}}>
        <div style={{display:'flex',gap:8}}>
          <button onClick={ctx.exportPdf}>⬇ Export PDF</button>
          <button onClick={ctx.exportCsv}>⬇ Export CSV</button>
        </div>
      </div>

      {/* 14-day breakdown */}
      <div className="card">
        <h2>14-Day Breakdown</h2>
        <table>
          <thead><tr><th>Date</th><th>Diagram</th><th>Type</th><th>Rostered</th><th>Actual</th><th>KMs</th><th>Hrs</th><th className="text-right">Pay</th></tr></thead>
          <tbody>
            {result.days.map((dr,i)=>{
              const cd=ctx.days[i]; const d=parseDate(dr.date)
              const typeColor=dr.day_type==='ph'?'var(--green-text)':dr.day_type==='sunday'?'var(--red-text)':dr.day_type==='saturday'?'var(--amber-text)':undefined
              const actDiff=(cd?.aStart&&cd?.rStart&&cd.aStart!==cd.rStart)||(cd?.aEnd&&cd?.rEnd&&cd.aEnd!==cd.rEnd)
              return (
                <tr key={dr.date}>
                  <td style={{whiteSpace:'nowrap',fontSize:11}}>{DW[d.getDay()]} {dr.date.slice(5)}</td>
                  <td style={{fontSize:11,color:'var(--text3)'}}>{dr.diag}</td>
                  <td style={{fontSize:11,color:typeColor}}>{dr.day_type.toUpperCase()}</td>
                  <td style={{fontSize:11,color:'var(--text3)'}}>{cd?.rStart?`${cd.rStart}–${cd.rEnd}`:'—'}</td>
                  <td style={{fontSize:11,color:actDiff?'var(--amber-text)':undefined}}>{cd?.aStart?`${cd.aStart}–${cd.aEnd}`:'—'}</td>
                  <td style={{fontSize:11}}>{cd?.km||'—'}</td>
                  <td>{dr.hours?dr.hours.toFixed(2):'—'}</td>
                  <td className="text-right">{dr.total_pay?`$${dr.total_pay.toFixed(2)}`:'—'}</td>
                </tr>
              )
            })}
            <tr className="row-total">
              <td colSpan={6}><strong>Fortnight total</strong></td>
              <td><strong>{result.total_hours.toFixed(2)}</strong></td>
              <td className="text-right"><strong>${result.total_pay.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Component totals */}
      <div className="card">
        <h2>Component Totals</h2>
        <table>
          <thead><tr><th>Pay component</th><th className="text-right">Fortnight total</th></tr></thead>
          <tbody>
            {Object.entries(result.component_totals).sort(([,a],[,b])=>b-a).map(([name,amt])=>(
              <tr key={name}><td style={{fontSize:11}}>{name}</td><td className="text-right">${amt.toFixed(2)}</td></tr>
            ))}
            <tr className="row-total"><td><strong>Gross total</strong></td><td className="text-right"><strong>${result.total_pay.toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      {/* Payslip comparison */}
      {payslipUpload.status==='success'&&payslipUpload.result&&(
        <div className="card">
          <h2>Payslip Comparison — {payslipUpload.result.source_file}</h2>
          <div className="g3" style={{marginBottom:10}}>
            <div className="metric"><div className="val">${result.total_pay.toFixed(2)}</div><div className="lbl">Calculated</div></div>
            <div className="metric"><div className="val">${payslipUpload.result.total_gross.toFixed(2)}</div><div className="lbl">Payslip total</div></div>
            <div className="metric">
              <div className="val" style={{color:Math.abs(result.total_pay-payslipUpload.result.total_gross)>0.10?'var(--red-text)':'var(--green-text)'}}>
                {(result.total_pay-payslipUpload.result.total_gross)>=0?'+':''}{(result.total_pay-payslipUpload.result.total_gross).toFixed(2)}
              </div>
              <div className="lbl">Variance (+ = underpaid)</div>
            </div>
          </div>
          <table>
            <thead><tr><th>Code</th><th>Description</th><th>Hrs</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {payslipUpload.result.line_items.map((li,i)=>(
                <tr key={i}>
                  <td><code>{li.code}</code></td>
                  <td style={{fontSize:11}}>{li.description}</td>
                  <td>{li.hours!=null?li.hours.toFixed(2):'—'}</td>
                  <td className="text-right">${li.amount.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="row-total"><td colSpan={3}><strong>Payslip gross</strong></td><td className="text-right"><strong>${payslipUpload.result.total_gross.toFixed(2)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Audit */}
      <div className="card">
        <h2>Audit Flags</h2>
        {result.audit.flags.length===0&&<div className="alert alert-ok">No anomalies detected.</div>}
        {result.audit.fortnight_type==='short'&&(
          <div className="alert alert-ok" style={{marginBottom:4}}>
            ✓ ADO payout included — <strong>short fortnight</strong>. 8×$49.818 = <strong>${result.audit.ado_payout.toFixed(2)}</strong>
          </div>
        )}
        {result.audit.fortnight_type==='long'&&(
          <div className="alert alert-info" style={{marginBottom:4}}>
            ℹ <strong>Long fortnight</strong> — no ADO this period. ADO accruing.
          </div>
        )}
        {result.audit.fn_ot_hrs>0&&(
          <div className="alert alert-err" style={{marginBottom:4}}>
            Fortnight OT: {result.total_hours.toFixed(2)}h exceeds {threshold}h threshold by <strong>{result.audit.fn_ot_hrs.toFixed(2)} hrs</strong>. Expect a FN OT line on payslip (Cl. 140.1).
          </div>
        )}
        {result.audit.km_bonus_hrs>0&&(
          <div className="alert alert-info" style={{marginBottom:4}}>
            ℹ Cl. 146.4 KM credits: {result.audit.km_bonus_hrs.toFixed(2)} bonus hrs this fortnight (ordinary rate, excluded from OT threshold).
          </div>
        )}
        {result.audit.flags.map((f,i)=>(
          <div key={i} className={`alert ${f.toLowerCase().includes('variance')||f.toLowerCase().includes('ot')?'alert-err':'alert-warn'}`} style={{marginBottom:4}}>{f}</div>
        ))}
      </div>
    </>
  )
}
