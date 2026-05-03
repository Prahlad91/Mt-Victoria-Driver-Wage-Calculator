import { useState, useRef } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import type { SimpleUploadState } from '../types'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function SetupTab({ onLoaded }: { onLoaded: () => void }) {
  const ctx = useFortnightContext()
  const [lineInput, setLine] = useState('1')
  const [dateInput, setDate] = useState('2025-08-10')
  const [phs,       setPHs]  = useState<string[]>([])
  const [phAdd,     setPhAdd] = useState('')
  const [psInput,   setPS]   = useState('')
  const [err, setErr]        = useState('')
  const pRef = useRef<HTMLInputElement>(null)

  function addPH() {
    if (phAdd && !phs.includes(phAdd)) {
      setPHs(prev => [...prev, phAdd].sort())
      setPhAdd('')
    }
  }

  function removePH(d: string) {
    setPHs(prev => prev.filter(x => x !== d))
  }

  const fnEnd = dateInput ? (() => {
    const d = new Date(dateInput + 'T00:00:00'); d.setDate(d.getDate() + 13)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })() : ''

  function handleLoad() {
    const line = parseInt(lineInput)
    if (isNaN(line) || line < 1) { setErr('Enter a valid line number (1–22 or 201–210)'); return }
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

      {/* ── Assoc / Un-assoc Payments Chart ─────────────────────────────── */}
      <AssocChartCard />

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
            <label>Public holidays</label>
            {phs.length > 0 && (
              <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:5}}>
                {phs.map(d => (
                  <span key={d} style={{display:'inline-flex',alignItems:'center',gap:3,
                    fontSize:11,padding:'2px 8px',borderRadius:4,
                    background:'var(--blue-bg)',color:'var(--blue-text)',
                    border:'1px solid #93c5fd'}}>
                    {d}
                    <button style={{background:'none',border:'none',cursor:'pointer',
                      color:'inherit',padding:0,lineHeight:1,fontSize:14}}
                      title="Remove" onClick={() => removePH(d)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:4}}>
              <input type="date" value={phAdd} min={dateInput} max={fnEnd}
                style={{flex:1}}
                onChange={e => setPhAdd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPH()} />
              <button className="btn-sm btn-primary" onClick={addPH} disabled={!phAdd}>+ Add</button>
            </div>
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

// ── AssocChartCard ──────────────────────────────────────────────────────────────

const ALL_WEEKDAY_DIAGS = [
  '3151','3152','3153','3154','3155','3156','3157','3158',
  '3159','3160','3161','3162','3163','3164','3165','3166','3167','3168',
]
const ALL_WEEKEND_DIAGS = [
  '3651','3652','3653','3654','3655','3656','3657','3658',
  '3659','3660','3661','3662','3663','3664',
]

function AssocChartCard() {
  const ctx = useFortnightContext()
  const [fileError,  setFileError]  = useState<string | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [saved,      setSaved]      = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function markSaved() { setSaved(true); setTimeout(() => setSaved(false), 2500) }

  async function handleFile(file: File) {
    setFileError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (ext === 'csv' || ext === 'txt') {
      // CSV: parse client-side — no round-trip needed
      const text = await file.text()
      const err = ctx.loadAssocChartCsv(text)
      if (err) setFileError(err)
      else markSaved()
      return
    }

    // PDF or image: send to backend for parsing
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file)
      const r = await fetch('/api/parse-assoc-chart', { method: 'POST', body: form })
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: 'Parse failed' }))
        throw new Error(e.detail || 'Unknown error')
      }
      const data = await r.json()
      // data.chart: Record<string, {unAssocMins, assocPaymentMins}>
      // Convert to the CSV text format and feed through the same loader
      const lines = ['diagram,un_assoc_mins,assoc_payment_mins']
      for (const [diag, entry] of Object.entries(data.chart as Record<string, {unAssocMins:number, assocPaymentMins:number}>)) {
        lines.push(`${diag},${entry.unAssocMins},${entry.assocPaymentMins}`)
      }
      const err = ctx.loadAssocChartCsv(lines.join('\n'))
      if (err) setFileError(err)
      else {
        if (data.warnings?.length) setFileError(`Parsed with warnings: ${data.warnings.join('; ')}`)
        markSaved()
      }
    } catch (e) {
      setFileError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function downloadTemplate() {
    const rows = [
      'diagram,un_assoc_mins,assoc_payment_mins',
      '3151,0,0',
      '3153,182,0',
      '3154,30,0',
      '3155,0,30',
      '3159,38,0',
      '3160,0,0',
      '3161,116,0',
      '3164,71,0',
      '3165,71,0',
      '3166,0,0',
      '3167,0,0',
      '3168,0,0',
      '3651,0,0',
      '3652,0,0',
      '3653,35,32',
      '3655,10,0',
      '3656,10,0',
      '3657,30,0',
      '3658,30,0',
      '3659,0,0',
      '3660,0,0',
      '3661,0,0',
      '3662,0,0',
      '3664,0,0',
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), {
      href: url, download: 'assoc_unassoc_chart.csv',
    }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <h2>
        Assoc / Un-assoc Payments Chart
        <span className="ea-ref" style={{marginLeft:8}}>(Cl. 157.1(b) / Cl. 146.4 — used for 1454 calculation)</span>
        {ctx.assocChartIsCustom
          ? <span className="badge" style={{marginLeft:8,background:'var(--green-bg)',color:'var(--green-text)',border:'1px solid #8fcca8'}}>✓ Custom chart loaded</span>
          : <span className="badge badge-off" style={{marginLeft:8}}>Built-in defaults</span>
        }
      </h2>
      <p className="note" style={{marginBottom:8}}>
        The chart provides Un-associated and Associated Payment times per diagram number, used to compute
        the "build-up" hours (code 1454) via: <em>max(0, un-assoc + assoc + dist_credit − shift_length)</em>.
        Upload a new CSV (or PDF / image) whenever the depot issues an updated chart.
        Rows highlighted in blue have non-zero values.
      </p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <button className="btn-sm btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? '⏳ Parsing…' : '📂 Upload chart'}
        </button>
        <button className="btn-sm" onClick={downloadTemplate}>⬇ Download CSV template</button>
        {ctx.assocChartIsCustom && (
          <button className="btn-sm" style={{color:'var(--amber-text)'}} onClick={ctx.resetAssocChart}>
            ↩ Reset to built-in defaults
          </button>
        )}
        {saved && <span className="saved-msg">Saved ✓</span>}
        {fileError && (
          <span style={{color: fileError.startsWith('Parsed with') ? 'var(--amber-text)' : 'var(--red-text)', fontSize:11}}>
            {fileError}
          </span>
        )}
        <input ref={fileRef} type="file"
          accept=".csv,.txt,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
          style={{display:'none'}}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </div>
      <table style={{fontSize:11}}>
        <thead>
          <tr>
            <th>Diagram</th>
            <th>Un-assoc mins</th>
            <th>Un-assoc hrs</th>
            <th>Assoc payment mins</th>
            <th>Assoc payment hrs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={5} style={{
              fontWeight:600, background:'var(--blue-bg)', color:'var(--blue-text)',
              padding:'3px 8px', fontSize:10, letterSpacing:'0.05em', textTransform:'uppercase',
            }}>
              Weekday diagrams (3151–3168)
            </td>
          </tr>
          {ALL_WEEKDAY_DIAGS.map(diag => {
            const entry = ctx.assocChart[diag] ?? { unAssocMins: 0, assocPaymentMins: 0 }
            const nonZero = entry.unAssocMins > 0 || entry.assocPaymentMins > 0
            return (
              <tr key={diag} style={nonZero ? {background:'var(--blue-bg)'} : undefined}>
                <td style={{fontWeight:600}}>{diag}</td>
                <td>{entry.unAssocMins}</td>
                <td>{(entry.unAssocMins / 60).toFixed(2)}</td>
                <td>{entry.assocPaymentMins}</td>
                <td>{(entry.assocPaymentMins / 60).toFixed(2)}</td>
              </tr>
            )
          })}
          <tr>
            <td colSpan={5} style={{
              fontWeight:600, background:'var(--blue-bg)', color:'var(--blue-text)',
              padding:'3px 8px', fontSize:10, letterSpacing:'0.05em', textTransform:'uppercase',
            }}>
              Weekend diagrams (3651–3664)
            </td>
          </tr>
          {ALL_WEEKEND_DIAGS.map(diag => {
            const entry = ctx.assocChart[diag] ?? { unAssocMins: 0, assocPaymentMins: 0 }
            const nonZero = entry.unAssocMins > 0 || entry.assocPaymentMins > 0
            return (
              <tr key={diag} style={nonZero ? {background:'var(--blue-bg)'} : undefined}>
                <td style={{fontWeight:600}}>{diag}</td>
                <td>{entry.unAssocMins}</td>
                <td>{(entry.unAssocMins / 60).toFixed(2)}</td>
                <td>{entry.assocPaymentMins}</td>
                <td>{(entry.assocPaymentMins / 60).toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note" style={{marginTop:8}}>
        Accepted formats: <strong>CSV</strong> (<code>diagram,un_assoc_mins,assoc_payment_mins</code>),
        <strong> PDF</strong>, or <strong>image</strong> (.png / .jpg / .webp / .tiff).
        PDF and image files are parsed on the server (OCR for images).
        CSV is the most reliable format; use the template above as a starting point.
      </p>
    </div>
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
