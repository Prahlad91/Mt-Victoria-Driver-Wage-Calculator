import { useState, useRef } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import type { SimpleUploadState } from '../types'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function SetupTab({ onLoaded }: { onLoaded: () => void }) {
  const ctx = useFortnightContext()
  const [lineInput, setLine] = useState('1')
  const [dateInput, setDate] = useState('2025-08-10')
  const [phInput,   setPH]   = useState('')
  const [psInput,   setPS]   = useState('')
  const [err, setErr]        = useState('')
  const pRef = useRef<HTMLInputElement>(null)

  function handleLoad() {
    const line = parseInt(lineInput)
    if (isNaN(line) || line < 1) { setErr('Enter a valid line number (1–22 or 201–210)'); return }
    const phs   = phInput.split(',').map(s => s.trim()).filter(Boolean)
    const psVal = parseFloat(psInput)
    ctx.loadLine(line, dateInput, phs, isNaN(psVal) ? null : psVal)
    setErr('')
    onLoaded()
  }

  const srcBadge = !ctx.fnLoaded ? null
    : ctx.rosterSource === 'master'    ? <span className="badge" style={{background:'var(--green-bg)',color:'var(--green-text)',border:'1px solid #8fcca8',marginLeft:8}}>✓ Master roster</span>
    : ctx.rosterSource === 'fortnight' ? <span className="badge" style={{background:'var(--blue-bg)',color:'var(--blue-text)',border:'1px solid #93c5fd',marginLeft:8}}>✓ Fortnight roster</span>
    : <span className="badge badge-off" style={{marginLeft:8}}>Built-in data</span>

  const isSwingerLine = parseInt(lineInput) >= 201

  return (
    <>
      {/* ── Step 1 ──────────────────────────────────────────────────────── */}
      <div className="card">
        <h2>Step 1 — Upload rosters &amp; schedules
          <span className="note" style={{fontWeight:400,marginLeft:8,textTransform:'none',letterSpacing:0}}>
            Upload once — data is saved in your browser and reloaded automatically
          </span>
        </h2>
        <div className="g2" style={{marginBottom:8}}>
          <UploadCard
            title="Master Roster (annual, lines 1–22)"
            hint="Mt_Victoria_Drivers_Master.pdf — upload once a year"
            icon="📌"
            state={ctx.masterRosterUpload}
            onFile={ctx.uploadMasterRoster}
            successMsg={ctx.masterRosterUpload.result
              ? `${Object.keys(ctx.masterRosterUpload.result.lines).length} lines · ${ctx.masterRosterUpload.result.fn_start ?? ''}`
              : ''}
          />
          <UploadCard
            title="Fortnight Roster (swinger lines 201–210)"
            hint="Changes every fortnight — upload at the start of each new fortnight"
            icon="🔄"
            state={ctx.fnRosterUpload}
            onFile={ctx.uploadFnRoster}
            successMsg={ctx.fnRosterUpload.result
              ? `${Object.keys(ctx.fnRosterUpload.result.lines).length} lines · ${ctx.fnRosterUpload.result.fn_start ?? ''} – ${ctx.fnRosterUpload.result.fn_end ?? ''}`
              : ''}
          />
        </div>
        <div className="g2">
          <UploadCard
            title="Weekday Schedule (auto-fills KMs & times)"
            hint="MTVICDRWD…_weekday.pdf — diagrams 3151–3168"
            icon="🗓️"
            state={ctx.weekdayScheduleUpload}
            onFile={ctx.uploadWeekdaySchedule}
            successMsg={ctx.weekdayScheduleUpload.result
              ? `${Object.keys(ctx.weekdayScheduleUpload.result.diagrams).length} diagrams loaded`
              : ''}
          />
          <UploadCard
            title="Weekend Schedule (auto-fills KMs & times)"
            hint="MTVICDRWE…_weekend.pdf — diagrams 3651–3664"
            icon="🗓️"
            state={ctx.weekendScheduleUpload}
            onFile={ctx.uploadWeekendSchedule}
            successMsg={ctx.weekendScheduleUpload.result
              ? `${Object.keys(ctx.weekendScheduleUpload.result.diagrams).length} diagrams loaded`
              : ''}
          />
        </div>
      </div>

      {/* ── Step 2 ──────────────────────────────────────────────────────── */}
      <div className="card">
        <h2>Step 2 — Load roster line {srcBadge}</h2>

        {isSwingerLine ? (
          <div className="alert alert-info" style={{marginBottom:10,fontSize:11}}>
            ⓘ Line {lineInput || '201+'} is a <strong>swinger line</strong>. Diagram assignments come from the{' '}
            {ctx.fnRosterUpload.status === 'success'
              ? <strong>Fortnight Roster ✓</strong>
              : <>Fortnight Roster <span style={{color:'var(--amber-text)'}}>— not yet uploaded</span></>}
            {ctx.masterRosterUpload.status === 'success' && ctx.fnRosterUpload.status !== 'success'
              && ' — will fall back to Master Roster'}.
          </div>
        ) : (
          <div className="alert alert-info" style={{marginBottom:10,fontSize:11}}>
            ⓘ Lines 1–22 use the <strong>Master Roster</strong> for diagram assignments.{' '}
            {ctx.masterRosterUpload.status === 'success'
              ? <span style={{color:'var(--green-text)'}}>✓ Master Roster ready.</span>
              : <span style={{color:'var(--amber-text)'}}>Not yet uploaded — built-in data will be used.</span>}
          </div>
        )}

        <div className="g3" style={{marginBottom:12}}>
          <div>
            <label>Roster line <span style={{color:'var(--text3)'}}>1–22 or 201–210</span></label>
            <input type="number" min="1" max="210" value={lineInput} onChange={e => setLine(e.target.value)} />
            {err && <p style={{color:'var(--red-text)',fontSize:11,marginTop:3}}>{err}</p>}
          </div>
          <div>
            <label>Fortnight start <span style={{color:'var(--text3)'}}>Sunday</span></label>
            <input type="date" value={dateInput} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label>Public holidays <span style={{color:'var(--text3)'}}>YYYY-MM-DD, comma-sep</span></label>
            <input type="text" placeholder="e.g. 2025-08-11" value={phInput} onChange={e => setPH(e.target.value)} />
          </div>
        </div>
        <div className="g2" style={{marginBottom:12}}>
          <div>
            <label>Payslip total to verify ($) — optional</label>
            <input type="number" step="0.01" placeholder="e.g. 4250.00" value={psInput} onChange={e => setPS(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleLoad}>Load roster line ↗</button>

        {ctx.fnLoaded && ctx.days.length > 0 && (
          <>
            <div className="line-preview">
              <strong>Line {ctx.rosterLine} loaded</strong>
              {srcBadge}
              {' · '}{ctx.days[0].date} – {ctx.days[13].date}
              {' · '}{ctx.days.filter(d => d.diag !== 'OFF' && d.diag !== 'ADO').length} work days
              {' · '}{ctx.days.filter(d => d.diag === 'ADO').length} ADO{' · '}
              <span style={{color: ctx.fnType === 'short' ? 'var(--amber-text)' : 'var(--blue-text)', fontWeight:600}}>
                {ctx.fnType === 'short' ? '⚡ SHORT fortnight — ADO paid out' : '📋 LONG fortnight — ADO accruing'}
              </span>
              {(ctx.weekdayScheduleUpload.status === 'success' || ctx.weekendScheduleUpload.status === 'success') && (
                <span style={{color:'var(--green-text)',marginLeft:8,fontSize:11}}>✓ KMs auto-filled from schedule</span>
              )}
            </div>
            <div className="fn-chips">
              {ctx.days.map((d, i) => {
                const cls = d.diag === 'ADO' ? 'ado' : d.diag !== 'OFF' ? 'work' : ''
                const dd = parseDate(d.date)
                return <span key={i} className={`fn-chip ${cls}`}>{DW[dd.getDay()]} {d.date.slice(5)} {d.diag}</span>
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Step 3 ──────────────────────────────────────────────────────── */}
      <div className="card">
        <h2>Step 3 — Upload payslip
          <span className="note" style={{fontWeight:400,textTransform:'none',letterSpacing:0,marginLeft:8}}>optional — compare calculated vs actual pay</span>
        </h2>
        <div style={{maxWidth:480}}>
          <UploadCard
            title="Payslip"
            hint="NSW_Payslip.xlsx or Sydney_Crew_Payslip.xlsx"
            icon="🧾"
            state={ctx.payslipUpload}
            onFile={ctx.uploadPayslip}
            successMsg={ctx.payslipUpload.result
              ? `${ctx.payslipUpload.result.line_items.length} line items · Total $${ctx.payslipUpload.result.total_gross.toFixed(2)}`
              : ''}
            fileRef={pRef}
            accept=".xlsx,.pdf"
          />
        </div>
      </div>

      {/* ── Penalty reference ────────────────────────────────────────────── */}
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

// ── UploadCard ──────────────────────────────────────────────────────────────────

interface UploadCardProps {
  title: string; hint: string; icon?: string
  state: SimpleUploadState<any>; onFile: (f: File) => void; successMsg: string
  fileRef?: React.RefObject<HTMLInputElement>; accept?: string
  extraAction?: { label: string; onClick: () => void }; applied?: boolean
}

function UploadCard({ title, hint, icon = '📄', state, onFile, successMsg, fileRef, accept = '*', extraAction, applied }: UploadCardProps) {
  const [drag, setDrag] = useState(false)
  const localRef = useRef<HTMLInputElement>(null)
  const ref = fileRef || localRef
  const { status, error, cached } = state
  const cardCls = `upload-card${drag ? ' drag-over' : ''}${status === 'success' ? ' success' : ''}${status === 'error' ? ' error' : ''}`

  return (
    <div style={{marginBottom:0}}>
      <div
        className={cardCls}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        onClick={() => ref.current?.click()}
      >
        <div className="upload-icon">{status === 'uploading' ? '⏳' : status === 'success' ? '✅' : status === 'error' ? '❌' : icon}</div>
        <div style={{fontWeight:600, fontSize:12, marginBottom:4}}>{title}</div>

        {status === 'idle'      && <div style={{fontSize:11, color:'var(--text2)'}}>Drop file here or click to browse</div>}
        {status === 'idle'      && <div style={{fontSize:10, color:'var(--text3)', marginTop:4}}>{hint}</div>}
        {status === 'uploading' && <div style={{fontSize:11, color:'var(--text2)'}}>Parsing…</div>}
        {status === 'success'   && (
          <div style={{fontSize:11, color:'var(--green-text)'}}>
            {successMsg}
            {cached && (
              <span style={{marginLeft:6, fontSize:10, padding:'1px 6px', borderRadius:10,
                background:'rgba(26,122,60,.12)', color:'var(--green-text)', border:'1px solid #8fcca8'}}>
                cached · click to replace
              </span>
            )}
          </div>
        )}
        {status === 'error' && <div style={{fontSize:11, color:'var(--red-text)'}}>{error}</div>}

        <input ref={ref} type="file" accept={accept} style={{display:'none'}}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
          onClick={e => e.stopPropagation()} />
      </div>

      {state.result && (state.result as any).warnings?.length > 0 && (
        <div style={{paddingTop:6}}>
          {(state.result as any).warnings.map((w: string, i: number) => (
            <p key={i} className="note" style={{color:'var(--amber-text)'}}>⚠ {w}</p>
          ))}
        </div>
      )}
      {extraAction && !applied && (
        <div style={{paddingTop:6}}>
          <button className="btn-primary btn-sm" onClick={e => { e.stopPropagation(); extraAction.onClick() }}>{extraAction.label}</button>
        </div>
      )}
      {applied && (
        <div style={{paddingTop:6}}>
          <span style={{fontSize:11, padding:'3px 8px', borderRadius:4, background:'var(--green-bg)', color:'var(--green-text)', display:'inline-block'}}>✓ Applied to daily entry</span>
        </div>
      )}
    </div>
  )
}
