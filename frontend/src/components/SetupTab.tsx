import { useState, useRef } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import type { SimpleUploadState, AssocChart } from '../types'

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
    if (isNaN(line) || line < 1) { setErr('Enter a valid line number (1–22 or 201–214)'); return }
    const psVal = parseFloat(psInput)
    const loadErr = ctx.loadLine(line, dateInput, phs, isNaN(psVal) ? null : psVal)
    if (loadErr) { setErr(loadErr); return }
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
        <div className="card-header">
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{
                width:22,height:22,borderRadius:'50%',background:'var(--green)',
                color:'#fff',fontSize:11,fontWeight:700,display:'inline-flex',
                alignItems:'center',justifyContent:'center',flexShrink:0,
              }}>✓</span>
              <span style={{fontWeight:600,fontSize:14}}>Upload rosters &amp; schedules</span>
            </div>
            <p className="note" style={{marginTop:4,marginLeft:32}}>Upload once — saved in browser and reloaded automatically</p>
          </div>
        </div>
        <div className="card-body">
        <div className="g2" style={{marginBottom:10}}>
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
        <div className="g2" style={{marginTop:0}}>
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
        </div>{/* end card-body */}
      </div>

      {/* ── Assoc / Un-assoc Payments Chart ─────────────────────────────── */}
      <AssocChartCard />

      {/* ── Step 2 ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{
              width:22,height:22,borderRadius:'50%',background:'var(--accent)',
              color:'#fff',fontSize:11,fontWeight:700,display:'inline-flex',
              alignItems:'center',justifyContent:'center',flexShrink:0,
            }}>2</span>
            <span style={{fontWeight:600,fontSize:14}}>Load roster line</span>
            {srcBadge}
          </div>
        </div>
        <div className="card-body">

        {isSwingerLine ? (
          <div className={`alert ${ctx.fnRosterUpload.status === 'success' ? 'alert-info' : 'alert-err'}`} style={{marginBottom:10,fontSize:11}}>
            {ctx.fnRosterUpload.status === 'success'
              ? <>✓ Line {lineInput} is a <strong>swinger line</strong>. Duty assignments loaded from the <strong>Fortnight Roster</strong>.</>
              : <>⚠ Line {lineInput} is a <strong>swinger line (201–214)</strong>. <strong>Fortnight Roster is required</strong> — upload it in Step 1 before loading this line.</>
            }
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
            <label>Roster line <span style={{color:'var(--text3)'}}>1–22 or 201–214</span></label>
            <input type="number" min="1" max="214" value={lineInput} onChange={e => setLine(e.target.value)} />
            {err && <p style={{color:'var(--red-text)',fontSize:11,marginTop:3}}>{err}</p>}
          </div>
          <div>
            <label>Fortnight start <span style={{color:'var(--text3)'}}>Sunday</span></label>
            <input type="date" value={dateInput} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label>Public holidays</label>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
              <input type="date" value={phAdd} min={dateInput} max={fnEnd}
                style={{width:180}}
                onChange={e => setPhAdd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPH()} />
              <button className="btn-sm btn-primary" onClick={addPH} disabled={!phAdd}>+ Add</button>
            </div>
            {phs.length > 0 && (
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {phs.map(d => {
                  const dd = new Date(d + 'T00:00:00')
                  const label = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd.getDay()]} ${dd.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dd.getMonth()]} ${dd.getFullYear()}`
                  return (
                    <span key={d} style={{display:'inline-flex',alignItems:'center',gap:5,
                      fontSize:12,padding:'4px 10px',borderRadius:20,
                      background:'var(--amber-bg)',color:'var(--amber)',
                      fontWeight:500}}>
                      📆 {label}
                      <button style={{all:'unset',cursor:'pointer',color:'inherit',
                        opacity:0.7,fontSize:14,lineHeight:1}}
                        title="Remove" onClick={() => removePH(d)}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className="g2" style={{marginBottom:12}}>
          <div>
            <label>Payslip total to verify ($) — optional</label>
            <input type="number" step="0.01" placeholder="e.g. 4250.00" value={psInput} onChange={e => setPS(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" style={{marginTop:6}} onClick={handleLoad}>Load roster line →</button>

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

        </div>{/* end card-body */}
      </div>

      {/* ── Step 3 ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{
              width:22,height:22,borderRadius:'50%',background:'var(--surface-2)',
              color:'var(--text3)',fontSize:11,fontWeight:700,display:'inline-flex',
              alignItems:'center',justifyContent:'center',flexShrink:0,
              border:'1px solid var(--border-mid)',
            }}>3</span>
            <span style={{fontWeight:600,fontSize:14}}>Upload payslip</span>
            <span className="note" style={{fontWeight:400}}>optional — compare calculated vs actual pay</span>
          </div>
        </div>
        <div className="card-body">
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
        </div>{/* end card-body */}
      </div>

      {/* ── Penalty reference ────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-body">
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
      </div>
    </>
  )
}

// ── Assoc chart text parser (mirrors backend _parse_chart_text) ─────────────────

const _DIAG_RE_G = /\b(3(?:15[1-9]|1[6][0-8]|6[5-9]\d|6[0-4]\d))\b/g
const _DIAG_RE   = /\b(3(?:15[1-9]|1[6][0-8]|6[5-9]\d|6[0-4]\d))\b/
const _DIAG_SET  = new Set([
  ...Array.from({ length: 18 }, (_, i) => 3151 + i),
  ...Array.from({ length: 14 }, (_, i) => 3651 + i),
])

function _mins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  const v = h * 60 + (m || 0)
  return v >= 0 && v <= 1439 ? v : 0
}

function parseChartText(text: string): { chart: AssocChart; warnings: string[] } {
  const chart: AssocChart = {}
  const warnings: string[] = []
  let diagFound = 0
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    // find every diagram number on this line (handles cases where OCR puts multiple on one line)
    const diagMatches = [...trimmed.matchAll(_DIAG_RE_G)]
    for (const dm of diagMatches) {
      const diag = dm[1]
      if (!_DIAG_SET.has(parseInt(diag))) continue
      diagFound++

      // Combine current line + next 3 lines into one window.
      // Table OCR often puts each column on its own line; looking ahead
      // ensures we collect the time values even when they aren't inline.
      const window = [trimmed, lines[i + 1] ?? '', lines[i + 2] ?? '', lines[i + 3] ?? ''].join(' ')
      const times = [...window.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(m => m[1])
      if (times.length < 2) continue

      const unMins  = _mins(times[0])
      const ascMins = _mins(times[1])
      if (unMins > 0 || ascMins > 0) chart[diag] = { unAssocMins: unMins, assocPaymentMins: ascMins }
    }
  }

  if (diagFound === 0)
    warnings.push('No Mt Victoria diagram numbers (3151–3168 / 3651–3664) found. Is this the correct chart?')
  return { chart, warnings }
}

/** Scale up + greyscale + contrast — dramatically improves Tesseract accuracy on table images. */
function preprocessImageForOCR(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = img.naturalWidth < 2000 ? 2 : 1
        const canvas = document.createElement('canvas')
        canvas.width  = img.naturalWidth  * scale
        canvas.height = img.naturalHeight * scale
        const ctx2d = canvas.getContext('2d')!
        ctx2d.filter = 'grayscale(100%) contrast(160%)'
        ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')), 'image/png')
      } catch (e) { URL.revokeObjectURL(url); reject(e) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
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

    // ── CSV / TXT: client-side parse ──────────────────────────────────────────
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text()
      const err = ctx.loadAssocChartCsv(text)
      if (err) setFileError(err)
      else markSaved()
      return
    }

    // ── Image: Tesseract.js client-side OCR ───────────────────────────────────
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif'].includes(ext)) {
      setUploading(true)
      try {
        // Pre-process: greyscale + contrast boost + 2× scale if image is small
        const processed = await preprocessImageForOCR(file)

        // Dynamic import keeps tesseract.js out of the initial bundle
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('eng')
        // PSM 6 = "assume a single uniform block of text" — best for table images
        await worker.setParameters({ tessedit_pageseg_mode: '6' as any })
        const { data: { text } } = await worker.recognize(processed)
        await worker.terminate()

        const { chart, warnings } = parseChartText(text)
        // Build CSV and load — even if all values are zero we show the result
        const csvLines = ['diagram,un_assoc_mins,assoc_payment_mins',
          ...Object.entries(chart).map(([d, e]) => `${d},${e.unAssocMins},${e.assocPaymentMins}`)]
        if (Object.keys(chart).length > 0) {
          const err = ctx.loadAssocChartCsv(csvLines.join('\n'))
          if (err) setFileError(err)
          else if (warnings.length) setFileError(`Saved ✓ — with warnings: ${warnings.join('; ')}`)
          else markSaved()
        } else {
          setFileError(warnings[0] ?? 'No non-zero diagram data found. Check the image is the correct chart, or use the CSV template.')
        }
      } catch (e) {
        setFileError(`OCR failed: ${(e as Error).message}`)
      } finally {
        setUploading(false)
      }
      return
    }

    // ── PDF: send to backend (pdfplumber, no tesseract needed) ────────────────
    // v3.26: route through the admin endpoint so the parsed result persists
    // server-side for all drivers.  Requires admin sign-in (X-Admin-Token).
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file)
      if (!ctx.adminToken) {
        throw new Error('Admin sign-in required to upload the chart. Click "🔐 Admin" in the header to sign in.')
      }
      const r = await fetch('/api/admin/upload-chart', {
        method: 'POST',
        body: form,
        headers: { 'X-Admin-Token': ctx.adminToken },
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: 'Parse failed' }))
        throw new Error(e.detail || 'Unknown error')
      }
      const data = await r.json()
      // v3.25: forward all 4 chart fields (was dropping assocCalcMins +
      // buildUpMins).  loadAssocChartCsv accepts a 3-or-5-column CSV.
      type ChartEntry = {
        unAssocMins: number
        assocPaymentMins: number
        assocCalcMins?: number
        buildUpMins?: number
      }
      const lines = ['diagram,un_assoc_mins,assoc_payment_mins,assoc_calc_mins,build_up_mins',
        ...Object.entries(data.chart as Record<string, ChartEntry>)
          .map(([d, e]) => `${d},${e.unAssocMins ?? 0},${e.assocPaymentMins ?? 0},${e.assocCalcMins ?? 0},${e.buildUpMins ?? 0}`)]
      const err = ctx.loadAssocChartCsv(lines.join('\n'))
      if (err) setFileError(err)
      else {
        if (data.warnings?.length) setFileError(`Parsed with warnings: ${data.warnings.join('; ')}`)
        else markSaved()
      }
    } catch (e) {
      setFileError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function downloadTemplate() {
    const rows = [
      'diagram,un_assoc_mins,assoc_payment_mins,assoc_calc_mins,build_up_mins',
      '3151,0,0,0,0',
      '3153,182,0,482,0',
      '3154,30,0,510,0',
      '3155,0,30,510,25',
      '3159,38,0,518,0',
      '3160,0,0,540,51',
      '3161,116,0,596,70',
      '3164,71,0,551,0',
      '3165,71,0,371,0',
      '3166,0,0,0,0',
      '3167,0,0,0,0',
      '3168,0,0,540,27',
      '3651,0,0,0,0',
      '3652,0,0,0,0',
      '3653,35,32,547,0',
      '3655,10,0,550,0',
      '3656,10,0,550,0',
      '3657,30,0,510,30',
      '3658,0,0,0,0',
      '3659,0,0,0,0',
      '3660,30,0,510,30',
      '3661,0,0,0,0',
      '3662,0,0,0,0',
      '3664,0,0,0,0',
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
      <div className="card-body">
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
            <th title="Un-assoc + Assoc Payment + Dist Pay (pre-computed)">Assoc Calc mins</th>
            <th title="Build-up from physical chart (used directly when > 0)">Build Up mins</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={7} style={{
              fontWeight:600, background:'var(--blue-bg)', color:'var(--blue-text)',
              padding:'3px 8px', fontSize:10, letterSpacing:'0.05em', textTransform:'uppercase',
            }}>
              Weekday diagrams (3151–3168)
            </td>
          </tr>
          {ALL_WEEKDAY_DIAGS.map(diag => {
            const entry = ctx.assocChart[diag] ?? { unAssocMins: 0, assocPaymentMins: 0 }
            const nonZero = entry.unAssocMins > 0 || entry.assocPaymentMins > 0 || (entry.buildUpMins ?? 0) > 0
            return (
              <tr key={diag} style={nonZero ? {background:'var(--blue-bg)'} : undefined}>
                <td style={{fontWeight:600}}>{diag}</td>
                <td>{entry.unAssocMins}</td>
                <td>{(entry.unAssocMins / 60).toFixed(2)}</td>
                <td>{entry.assocPaymentMins}</td>
                <td>{(entry.assocPaymentMins / 60).toFixed(2)}</td>
                <td style={{color: entry.assocCalcMins ? undefined : 'var(--muted)'}}>{entry.assocCalcMins ?? '—'}</td>
                <td style={{fontWeight: (entry.buildUpMins ?? 0) > 0 ? 700 : undefined,
                            color: (entry.buildUpMins ?? 0) > 0 ? 'var(--green-text)' : 'var(--muted)'}}>
                  {(entry.buildUpMins ?? 0) > 0 ? entry.buildUpMins : '—'}
                </td>
              </tr>
            )
          })}
          <tr>
            <td colSpan={7} style={{
              fontWeight:600, background:'var(--blue-bg)', color:'var(--blue-text)',
              padding:'3px 8px', fontSize:10, letterSpacing:'0.05em', textTransform:'uppercase',
            }}>
              Weekend diagrams (3651–3664)
            </td>
          </tr>
          {ALL_WEEKEND_DIAGS.map(diag => {
            const entry = ctx.assocChart[diag] ?? { unAssocMins: 0, assocPaymentMins: 0 }
            const nonZero = entry.unAssocMins > 0 || entry.assocPaymentMins > 0 || (entry.buildUpMins ?? 0) > 0
            return (
              <tr key={diag} style={nonZero ? {background:'var(--blue-bg)'} : undefined}>
                <td style={{fontWeight:600}}>{diag}</td>
                <td>{entry.unAssocMins}</td>
                <td>{(entry.unAssocMins / 60).toFixed(2)}</td>
                <td>{entry.assocPaymentMins}</td>
                <td>{(entry.assocPaymentMins / 60).toFixed(2)}</td>
                <td style={{color: entry.assocCalcMins ? undefined : 'var(--muted)'}}>{entry.assocCalcMins ?? '—'}</td>
                <td style={{fontWeight: (entry.buildUpMins ?? 0) > 0 ? 700 : undefined,
                            color: (entry.buildUpMins ?? 0) > 0 ? 'var(--green-text)' : 'var(--muted)'}}>
                  {(entry.buildUpMins ?? 0) > 0 ? entry.buildUpMins : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note" style={{marginTop:8}}>
        Accepted formats: <strong>CSV</strong> (<code>diagram,un_assoc_mins,assoc_payment_mins[,assoc_calc_mins,build_up_mins]</code>),
        <strong> PDF</strong>, or <strong>image</strong> (.png / .jpg / .webp / .tiff).
        PDF and image files are parsed on the server (OCR for images).
        CSV is the most reliable format; use the template above as a starting point.
        The <strong>Build Up</strong> column (green) is used directly by the calculator when present — it overrides the formula.
      </p>
      </div>
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
