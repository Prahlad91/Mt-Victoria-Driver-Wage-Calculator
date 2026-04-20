import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'

const RATE_DEFS = [
  {k:'base_rate',  label:'Base hourly rate ($/hr)',             ea:'Sch. 4A'},
  {k:'ot1',        label:'OT tier 1 multiplier (first 2 hrs)', ea:'Cl. 140.1'},
  {k:'ot2',        label:'OT tier 2 multiplier (beyond 2 hrs)',ea:'Cl. 140.1'},
  {k:'sat_rate',   label:'Saturday rate (x)',                  ea:'Sch. 4A'},
  {k:'sun_rate',   label:'Sunday rate (x)',                    ea:'Cl. 133'},
  {k:'sat_ot',     label:'Saturday OT >8 hrs (x)',             ea:'Cl. 140+Sch.4A'},
  {k:'ph_wkd',     label:'PH weekday (x)',                     ea:'Cl. 31'},
  {k:'ph_wke',     label:'PH weekend (x)',                     ea:'Cl. 31'},
  {k:'afternoon_rate', label:'Afternoon shift ($/hr)',         ea:'Sch.4B Item 6'},
  {k:'night_rate', label:'Night shift ($/hr)',                 ea:'Sch.4B Item 7'},
  {k:'early_rate', label:'Early morning ($/hr)',               ea:'Sch.4B Item 8'},
  {k:'add_loading',label:'Additional loading ($/shift flat)',  ea:'Sch.4B Item 9'},
  {k:'wobod_rate', label:'WOBOD rate (x)',                     ea:'Cl. 136'},
  {k:'wobod_min',  label:'WOBOD minimum hours',               ea:'Cl. 136'},
] as const

const CODE_DEFS = [
  {k:'base',    label:'Ordinary time'},
  {k:'ot1',     label:'OT first 2 hrs'},
  {k:'ot2',     label:'OT beyond 2 hrs'},
  {k:'sat',     label:'Saturday'},
  {k:'sun',     label:'Sunday'},
  {k:'sat_ot',  label:'Saturday OT'},
  {k:'ph_wkd',  label:'PH weekday'},
  {k:'ph_wke',  label:'PH weekend'},
  {k:'afternoon',label:'Afternoon shift'},
  {k:'night',   label:'Night shift'},
  {k:'early',   label:'Early morning'},
  {k:'add_load',label:'Additional loading'},
  {k:'wobod',   label:'WOBOD'},
  {k:'liftup',  label:'Lift-up / Layback / Buildup'},
  {k:'ado',     label:'ADO payout'},
  {k:'unassoc', label:'Un-associated duties'},
] as const

export default function RatesTab() {
  const ctx = useFortnightContext()
  const [cfgSaved, setCfgSaved]   = useState(false)
  const [codeSaved, setCodeSaved] = useState(false)

  function handleSaveCfg()  { ctx.saveConfig(); setCfgSaved(true);  setTimeout(()=>setCfgSaved(false),2000) }
  function handleSaveCodes(){ ctx.saveCodes();  setCodeSaved(true); setTimeout(()=>setCodeSaved(false),2000) }

  return (
    <>
      <div className="card">
        <h2>Pay rates <span className="ea-ref">(EA 2025 Sch. 4A/4B — 1 Jul 2025 values pre-set)</span></h2>
        <div className="g3">
          {RATE_DEFS.map(d=>(
            <div key={d.k}>
              <label>{d.label} <span className="ea-ref">{d.ea}</span></label>
              <input type="number" step="any"
                value={(ctx.config as any)[d.k]}
                onChange={e=>ctx.setConfig({[d.k]:parseFloat(e.target.value)||0} as any)} />
            </div>
          ))}
        </div>
        <hr />
        <button onClick={handleSaveCfg}>Save rates</button>
        {cfgSaved&&<span className="saved-msg">Saved ✓</span>}
        <p className="note" style={{marginTop:8}}>Rates are saved to localStorage and persist across browser sessions.</p>
      </div>

      <div className="card">
        <h2>Payroll codes <span className="ea-ref">(from your payslip — for matching display only, no effect on calculations)</span></h2>
        <div className="g3">
          {CODE_DEFS.map(d=>(
            <div key={d.k}>
              <label>{d.label}</label>
              <input type="text" placeholder="payslip code"
                value={(ctx.codes as any)[d.k]||''}
                onChange={e=>ctx.setCodes({[d.k]:e.target.value} as any)} />
            </div>
          ))}
        </div>
        <hr />
        <button onClick={handleSaveCodes}>Save codes</button>
        {codeSaved&&<span className="saved-msg">Saved ✓</span>}
      </div>

      <div className="card">
        <h2>Un-associated duties <span className="ea-ref">(Cl. 146.4(d) / Cl. 157.2)</span></h2>
        <p className="note" style={{marginBottom:8}}>Additional duties not directly associated with train operations (road review, pilot prep, etc.) are payable for shifts ≥161 km.</p>
        <div className="g2">
          <div>
            <label>$ per shift (≥161 km)</label>
            <input type="number" step="0.01" value={ctx.unassocAmt} onChange={e=>ctx.setUnassocAmt(parseFloat(e.target.value)||0)} />
          </div>
          <div>
            <label>Payroll code</label>
            <input type="text" placeholder="code from payslip" value={ctx.codes.unassoc||''} onChange={e=>ctx.setCodes({unassoc:e.target.value})} />
          </div>
        </div>
        <div style={{marginTop:10}}>
          <button onClick={handleSaveCfg}>Save</button>
          {cfgSaved&&<span className="saved-msg">Saved ✓</span>}
        </div>
      </div>
    </>
  )
}
