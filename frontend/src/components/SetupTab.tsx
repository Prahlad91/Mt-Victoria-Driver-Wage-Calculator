import { useState, useRef } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function SetupTab({ onLoaded }: { onLoaded:()=>void }) {
  const ctx = useFortnightContext()
  const [lineInput, setLine] = useState('1')
  const [dateInput, setDate] = useState('2025-08-10')
  const [phInput,   setPH]   = useState('')
  const [psInput,   setPS]   = useState('')
  const [err, setErr]        = useState('')
  const rRef = useRef<HTMLInputElement>(null)
  const pRef = useRef<HTMLInputElement>(null)

  function handleLoad() {
    const line = parseInt(lineInput)
    if (isNaN(line)||line<1){setErr('Enter a valid line number (1–22 or 201–210)');return}
    const phs   = phInput.split(',').map(s=>s.trim()).filter(Boolean)
    const psVal = parseFloat(psInput)
    ctx.loadLine(line, dateInput, phs, isNaN(psVal)?null:psVal)
    setErr('')
    onLoaded()
  }

  return (
    <>
      <div className="card">
        <h2>Fortnight Setup</h2>
        <div className="g3" style={{marginBottom:12}}>
          <div>
            <label>Roster line <span style={{color:'var(--text3)'}}>1–22 or 201–210</span></label>
            <input type="number" min="1" max="210" value={lineInput} onChange={e=>setLine(e.target.value)} />
            {err && <p style={{color:'var(--red-text)',fontSize:11,marginTop:3}}>{err}</p>}
          </div>
          <div>
            <label>Fortnight start <span style={{color:'var(--text3)'}}>Sunday</span></label>
            <input type="date" value={dateInput} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label>Public holidays <span style={{color:'var(--text3)'}}>YYYY-MM-DD, comma-sep</span></label>
            <input type="text" placeholder="e.g. 2025-08-11" value={phInput} onChange={e=>setPH(e.target.value)} />
          </div>
        </div>
        <div className="g2" style={{marginBottom:12}}>
          <div>
            <label>Payslip total to verify ($) — optional</label>
            <input type="number" step="0.01" placeholder="e.g. 4250.00" value={psInput} onChange={e=>setPS(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleLoad}>Load roster line ↗</button>

        {ctx.fnLoaded && ctx.days.length>0 && (
          <>
            <div className="line-preview">
              <strong>Line {ctx.rosterLine} loaded.</strong>{' '}
              {ctx.days[0].date} – {ctx.days[13].date}{' · '}
              {ctx.days.filter(d=>d.diag!=='OFF'&&d.diag!=='ADO').length} work days{' · '}
              {ctx.days.filter(d=>d.diag==='ADO').length} ADO{' · '}
              <span style={{color:ctx.fnType==='short'?'var(--amber-text)':'var(--blue-text)',fontWeight:600}}>
                {ctx.fnType==='short'?'⚡ SHORT fortnight — ADO paid out':'📋 LONG fortnight — ADO accruing'}
              </span>
            </div>
            <div className="fn-chips">
              {ctx.days.map((d,i)=>{
                const cls=d.diag==='ADO'?'ado':d.diag!=='OFF'?'work':''
                const dd=parseDate(d.date)
                return <span key={i} className={`fn-chip ${cls}`}>{DW[dd.getDay()]} {d.date.slice(5)} {d.diag}</span>
              })}
            </div>
          </>
        )}
      </div>

      <div className="g2">
        <UploadCard
          title="Upload Roster PDF"
          hint="e.g. MTVICDRWD191025_1.pdf"
          status={ctx.rosterUpload.status}
          error={ctx.rosterUpload.error}
          applied={ctx.rosterUpload.applied}
          warnings={ctx.rosterUpload.result?.warnings||[]}
          onFile={f=>ctx.uploadRoster(f)}
          fileRef={rRef} accept=".pdf"
          successMsg={ctx.rosterUpload.result?`Parsed ${ctx.rosterUpload.result.parsed_days.length} days from ${ctx.rosterUpload.result.source_file}`:''}
          extraAction={ctx.rosterUpload.status==='success'&&!ctx.rosterUpload.applied&&ctx.fnLoaded?{label:'Apply to daily entry →',onClick:ctx.applyUploadedRoster}:undefined}
        />
        <UploadCard
          title="Upload Payslip"
          hint="NSW_Payslip.xlsx or Sydney_Crew_Payslip.xlsx"
          status={ctx.payslipUpload.status}
          error={ctx.payslipUpload.error}
          warnings={ctx.payslipUpload.result?.warnings||[]}
          onFile={f=>ctx.uploadPayslip(f)}
          fileRef={pRef} accept=".xlsx,.pdf"
          successMsg={ctx.payslipUpload.result?`${ctx.payslipUpload.result.line_items.length} line items · Total $${ctx.payslipUpload.result.total_gross.toFixed(2)}`:''}
        />
      </div>

      <div className="card">
        <h3>Shift Penalty Rules — Cl. 134 (EA 2025)</h3>
        <table>
          <thead><tr><th>Item</th><th>Type</th><th>Definition</th><th>Rate</th><th>Unit</th><th>Note</th></tr></thead>
          <tbody>
            <tr><td>Base</td><td>Ordinary</td><td>Weekday ordinary hours</td><td>$49.818</td><td>per hr</td><td>Sch. 4A</td></tr>
            <tr><td>Item 6</td><td>Afternoon</td><td>Commences before AND finishes after 18:00</td><td>$4.84</td><td>per hr</td><td>Cl. 134.3(b) rounding</td></tr>
            <tr><td>Item 7</td><td>Night</td><td>Sign-on 18:00–03:59</td><td>$5.69</td><td>per hr</td><td>Same rounding</td></tr>
            <tr><td>Item 8</td><td>Early morning</td><td>Sign-on 04:00–05:30</td><td>$4.84</td><td>per hr</td><td>Same rounding</td></tr>
            <tr><td>Item 9</td><td>Additional</td><td>Sign-on/off 01:01–03:59 Mon–Fri (not PH, not OT)</td><td>$5.69</td><td>per shift flat</td><td>Cl. 134.4</td></tr>
          </tbody>
        </table>
        <p className="note" style={{marginTop:8}}>⚠️ Penalties NOT payable on Saturday, Sunday, or Public Holidays (Cl. 134.3(a)).</p>
        <p className="note">Rounding rule Cl. 134.3(b): fraction &lt;30 min → disregard; ≥30 min → round up to next hour.</p>
      </div>
    </>
  )
}

interface UploadCardProps {
  title:string; hint:string
  status:'idle'|'uploading'|'success'|'error'
  error:string|null; applied?:boolean; warnings:string[]
  onFile:(f:File)=>void; fileRef:React.RefObject<HTMLInputElement>; accept:string
  successMsg:string; extraAction?:{label:string;onClick:()=>void}
}

function UploadCard({title,hint,status,error,applied,warnings,onFile,fileRef,accept,successMsg,extraAction}:UploadCardProps) {
  const [drag,setDrag] = useState(false)
  const cardCls = `upload-card${drag?' drag-over':''}${status==='success'?' success':''}${status==='error'?' error':''}`
  return (
    <div className="card" style={{padding:0}}>
      <div className={cardCls}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onFile(f)}}
        onClick={()=>fileRef.current?.click()}
      >
        <div className="upload-icon">{status==='uploading'?'⏳':status==='success'?'✅':status==='error'?'❌':'📄'}</div>
        <div style={{fontWeight:600,fontSize:12,marginBottom:4}}>{title}</div>
        {status==='idle'&&<><div style={{fontSize:11,color:'var(--text2)'}}>Drop file here or click to browse</div><div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>{hint}</div></>}
        {status==='uploading'&&<div style={{fontSize:11,color:'var(--text2)'}}>Parsing...</div>}
        {status==='success'&&<div style={{fontSize:11,color:'var(--green-text)'}}>{successMsg}</div>}
        {status==='error'&&<div style={{fontSize:11,color:'var(--red-text)'}}>{error}</div>}
        <input ref={fileRef} type="file" accept={accept} style={{display:'none'}}
          onChange={e=>{const f=e.target.files?.[0];if(f)onFile(f);e.target.value=''}}
          onClick={e=>e.stopPropagation()} />
      </div>
      {warnings.length>0&&<div style={{padding:'8px 12px'}}>{warnings.map((w,i)=><p key={i} className="note" style={{color:'var(--amber-text)'}}>⚠ {w}</p>)}</div>}
      {extraAction&&!applied&&<div style={{padding:'0 12px 12px'}}><button className="btn-primary btn-sm" onClick={e=>{e.stopPropagation();extraAction.onClick()}}>{extraAction.label}</button></div>}
      {applied&&<div style={{padding:'0 12px 12px'}}><span style={{fontSize:11,padding:'3px 8px',borderRadius:4,background:'var(--green-bg)',color:'var(--green-text)',display:'inline-block'}}>✓ Applied to daily entry</span></div>}
    </div>
  )
}
