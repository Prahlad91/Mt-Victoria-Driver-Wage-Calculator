import { useState, useRef, useEffect } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import { getPhsForFortnight, NSW_PUBLIC_HOLIDAYS } from '../utils/nswPublicHolidays'
import type { SimpleUploadState, AssocChart, ParsedRosterData, ParsedScheduleData } from '../types'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function SetupTab({ onLoaded }: { onLoaded: () => void }) {
  const ctx = useFortnightContext()
  const [lineInput, setLine] = useState('1')
  // Initialise from fortnight-roster fn_start > master-roster fn_start > hardcoded fallback.
  // A useEffect below keeps this in sync when a roster uploads mid-session,
  // but only while the user hasn't manually edited the field.
  const rosterDate = ctx.masterRosterUpload.result?.fn_start || ctx.fnRosterUpload.result?.fn_start || ''
  const [dateInput, setDate] = useState(() => rosterDate || '2025-08-10')
  const [dateUserEdited, setDateUserEdited] = useState(false)
  const [phs,       setPHs]  = useState<string[]>(() =>
    getPhsForFortnight(rosterDate || '2025-08-10').map(p => p.date)
  )
  const [phAdd,     setPhAdd] = useState('')
  const [psInput,   setPS]   = useState('')
  const [err, setErr]        = useState('')
  const pRef = useRef<HTMLInputElement>(null)

  // When a roster finishes uploading (or is loaded from cache after mount),
  // auto-populate the date field — unless the user already manually set it.
  useEffect(() => {
    if (dateUserEdited) return
    const d = ctx.masterRosterUpload.result?.fn_start || ctx.fnRosterUpload.result?.fn_start
    if (d) setDate(d)
  }, [ctx.fnRosterUpload.result?.fn_start, ctx.masterRosterUpload.result?.fn_start, dateUserEdited])

  // Auto-fill public holidays from the NSW list whenever the fortnight date changes.
  // Any manually-added PHs beyond what the NSW list provides are preserved.
  useEffect(() => {
    const autoPhs = getPhsForFortnight(dateInput).map(p => p.date)
    setPHs(prev => {
      // Keep manual additions that aren't in the NSW auto-list, merge with auto
      const autoSet = new Set(autoPhs)
      const manualExtras = prev.filter(d => !autoSet.has(d))
      return [...autoPhs, ...manualExtras].sort()
    })
  }, [dateInput])

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
      {/* v3.29: split into admin-upload cards (admin only) vs read-only
          info rows for drivers.  Fortnight roster card is always shown
          because that's user-uploaded by every driver. */}
      <div className="card">
        <div className="card-header">
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{
                width:22,height:22,borderRadius:'50%',background:'var(--green)',
                color:'#fff',fontSize:11,fontWeight:700,display:'inline-flex',
                alignItems:'center',justifyContent:'center',flexShrink:0,
              }}>✓</span>
              <span style={{fontWeight:600,fontSize:14}}>
                {ctx.adminPassword ? 'Upload rosters & schedules' : 'Reference files provided by admin'}
              </span>
            </div>
            <p className="note" style={{marginTop:4,marginLeft:32}}>
              {ctx.adminPassword
                ? 'Upload once — saved server-side and visible to all drivers.'
                : 'These files are managed by the depot admin and shared with everyone.'}
            </p>
          </div>
        </div>
        <div className="card-body">
        {ctx.adminPassword ? (
          /* ── Admin view: full upload cards for master + schedules ────── */
          <>
            {/* Roster upload cards */}
            <div className="g2" style={{marginBottom:4}}>
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
                title="Fortnight Roster (swinger lines 201–214)"
                hint="Changes every fortnight — each driver uploads their own"
                icon="🔄"
                state={ctx.fnRosterUpload}
                onFile={ctx.uploadFnRoster}
                successMsg={ctx.fnRosterUpload.result
                  ? `${Object.keys(ctx.fnRosterUpload.result.lines).length} lines · ${ctx.fnRosterUpload.result.fn_start ?? ''} – ${ctx.fnRosterUpload.result.fn_end ?? ''}`
                  : ''}
              />
            </div>
            {/* Roster parse previews — full-width, collapsed by default */}
            {ctx.masterRosterUpload.result && (
              <RosterPreviewTable data={ctx.masterRosterUpload.result} />
            )}
            {ctx.fnRosterUpload.result && (
              <RosterPreviewTable data={ctx.fnRosterUpload.result} />
            )}

            {/* Schedule upload cards */}
            <div className="g2" style={{marginTop:10, marginBottom:4}}>
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
            {/* Schedule parse previews */}
            {ctx.weekdayScheduleUpload.result && (
              <SchedulePreviewTable data={ctx.weekdayScheduleUpload.result} />
            )}
            {ctx.weekendScheduleUpload.result && (
              <SchedulePreviewTable data={ctx.weekendScheduleUpload.result} />
            )}
          </>
        ) : (
          /* ── Driver view: read-only info rows for admin-provided files,
                + the driver's own fortnight-roster upload card ──────── */
          <>
            <AdminProvidedRow
              label="Master Roster"
              detail={ctx.masterRosterUpload.result
                ? `${Object.keys(ctx.masterRosterUpload.result.lines).length} lines · valid from ${ctx.masterRosterUpload.result.fn_start ?? '—'}`
                : null}
            />
            <AdminProvidedRow
              label="Weekday Schedule"
              detail={ctx.weekdayScheduleUpload.result
                ? `${Object.keys(ctx.weekdayScheduleUpload.result.diagrams).length} diagrams (3151–3168)`
                : null}
            />
            <AdminProvidedRow
              label="Weekend Schedule"
              detail={ctx.weekendScheduleUpload.result
                ? `${Object.keys(ctx.weekendScheduleUpload.result.diagrams).length} diagrams (3651–3664)`
                : null}
            />
            <div style={{height:14}} />
            <p className="note" style={{fontWeight:600, marginBottom:8}}>
              Your fortnight roster (you upload this each fortnight):
            </p>
            <div style={{maxWidth:'100%'}}>
              <UploadCard
                title="Fortnight Roster"
                hint="The fortnightly roster PDF the depot publishes — drop it here"
                icon="🔄"
                state={ctx.fnRosterUpload}
                onFile={ctx.uploadFnRoster}
                successMsg={ctx.fnRosterUpload.result
                  ? `${Object.keys(ctx.fnRosterUpload.result.lines).length} lines · ${ctx.fnRosterUpload.result.fn_start ?? ''} – ${ctx.fnRosterUpload.result.fn_end ?? ''}`
                  : ''}
              />
              {ctx.fnRosterUpload.result && (
                <RosterPreviewTable data={ctx.fnRosterUpload.result} />
              )}
            </div>
          </>
        )}
        </div>{/* end card-body */}
      </div>

      {/* ── Assoc / Un-assoc Payments Chart (admin only) ────────────────── */}
      {ctx.adminPassword && <AssocChartCard />}

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
            <input type="date" value={dateInput} onChange={e => { setDate(e.target.value); setDateUserEdited(true) }} />
          </div>
          <div>
            <label>Public holidays <span style={{color:'var(--text3)',fontWeight:400}}>auto-filled from NSW Gov list</span></label>
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
                  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                  const dateLabel = `${DOW[dd.getDay()]} ${dd.getDate()} ${MON[dd.getMonth()]}`
                  const phName = NSW_PUBLIC_HOLIDAYS.find(p => p.date === d)?.name ?? ''
                  return (
                    <span key={d} style={{display:'inline-flex',alignItems:'center',gap:5,
                      fontSize:12,padding:'4px 10px',borderRadius:20,
                      background:'var(--amber-bg)',color:'var(--amber)',
                      fontWeight:500}}>
                      📆 {dateLabel}{phName ? ` — ${phName}` : ''}
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

      {/* ── Step 3 (admin only — v3.29) ─────────────────────────────────── */}
      {ctx.adminPassword && (
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
      )}

      {/* ── Penalty reference (admin only — v3.29) ──────────────────────── */}
      {ctx.adminPassword && (
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
      )}{/* end admin-only penalty reference */}
    </>
  )
}

// ── AdminProvidedRow ────────────────────────────────────────────────────────
// v3.29: read-only info row shown to non-admin drivers in Step 1, for files
// the depot admin has uploaded centrally.  Replaces the upload card UI when
// the driver doesn't have the admin password.
function AdminProvidedRow({ label, detail }: { label: string; detail: string | null }) {
  const provided = detail !== null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px',
      background: provided ? 'var(--green-bg, rgba(26,122,60,.08))' : 'var(--amber-bg, rgba(232,140,30,.10))',
      border: `1px solid ${provided ? 'var(--green-border, #8fcca8)' : 'var(--amber-border, #e2c08d)'}`,
      borderRadius: 8,
      marginBottom: 6,
      fontSize: 12,
    }}>
      <span style={{ fontSize: 14 }}>{provided ? '✅' : '⚠️'}</span>
      <span style={{ fontWeight: 600, minWidth: 150 }}>{label}</span>
      <span style={{ color: provided ? 'var(--green-text)' : 'var(--amber-text)' }}>
        {provided ? detail : 'Not yet uploaded by admin — calculator may use built-in fallback data.'}
      </span>
    </div>
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

// Hardcoded baseline rows for the chart table.  Any diagram from the uploaded
// chart that is NOT in these lists is appended dynamically at render time so
// newly-added depot diagrams are never silently swallowed.
const ALL_WEEKDAY_DIAGS = [
  '3151','3152','3153','3154','3155','3156','3157','3158',
  '3159','3160','3161','3162','3163','3164','3165','3166','3167','3168',
  '3169','3170','3171',  // v3.38 fix: were missing from the list
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

  // Merge hardcoded baseline with any extra diagrams from the loaded chart so
  // newly-added depot diagrams are never silently hidden (v3.38 fix for 3169/3171).
  const chartKeys = Object.keys(ctx.assocChart)
  const weekdayDiags = [...new Set([
    ...ALL_WEEKDAY_DIAGS,
    ...chartKeys.filter(d => /^3[1-5]\d\d$/.test(d)),
  ])].sort()
  const weekendDiags = [...new Set([
    ...ALL_WEEKEND_DIAGS,
    ...chartKeys.filter(d => /^3[6-9]\d\d$/.test(d)),
  ])].sort()

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
    // v3.26/v3.28: route through the admin endpoint so the parsed result
    // persists server-side for all drivers.  Requires admin sign-in.
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file)
      if (!ctx.adminPassword) {
        throw new Error('Admin sign-in required to upload the chart. Click "🔐 Admin" in the header to sign in.')
      }
      const r = await fetch('/api/admin/upload-chart', {
        method: 'POST',
        body: form,
        headers: { 'X-Admin-Password': ctx.adminPassword },
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: 'Parse failed' }))
        throw new Error(e.detail || 'Unknown error')
      }
      const data = await r.json()
      // v3.37: apply the parsed chart directly (bypasses the CSV roundtrip that
      // previously dropped entries where only assocCalcMins > 0).
      ctx.loadAssocChartDirect(data.chart)
      if (data.warnings?.length) {
        // v3.38: DB-not-configured warning starts with ⚠ — show as error (red).
        // Other parse warnings are informational (amber).
        const dbWarning = (data.warnings as string[]).find((w: string) => w.startsWith('⚠'))
        if (dbWarning) setFileError(dbWarning)
        else setFileError(`Parsed with warnings: ${(data.warnings as string[]).join('; ')}`)
      } else markSaved()
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
        Upload the chart as-received from the depot: Excel (.xlsx), CSV, PDF, or image. The column headers are detected automatically.
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
          accept=".csv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif"
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
              Weekday diagrams (3151–3171+)
            </td>
          </tr>
          {weekdayDiags.map(diag => {
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
              Weekend diagrams (3651–3664+)
            </td>
          </tr>
          {weekendDiags.map(diag => {
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
  const { status, error, cached, fromServer } = state
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
            {fromServer ? (
              <span style={{marginLeft:6, fontSize:10, padding:'1px 6px', borderRadius:10,
                background:'rgba(0,113,227,.12)', color:'var(--accent)', border:'1px solid rgba(0,113,227,.4)'}}
                title="Loaded from the server (admin's published data, or your last upload). Click the card to replace.">
                🌐 from server · click to replace
              </span>
            ) : cached && (
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

// ── RosterPreviewTable (v3.40) ───────────────────────────────────────────────
// Shows a 14-day matrix of the parsed master or fortnight roster so the admin
// can visually validate what the parser read against the original PDF.
//
// Layout: one row per line, 14 day columns.  Each cell shows:
//   - Worked day:  diagram code (bold) + "HH:MM–HH:MM" beneath (tiny grey)
//   - ADO:         amber "ADO"
//   - OFF:         muted "—"
//   - Parser gap:  red "?" (empty diag string but r_start was set, or vice versa)
//
// Day headers use "Su 22", "Mo 23" … when fn_start is available (fortnight
// roster), or "D1"–"D14" for the master roster.  The line-number column is CSS
// sticky so it stays visible during horizontal scroll.  Collapsed by default.
function RosterPreviewTable({ data }: { data: ParsedRosterData }) {
  const [open, setOpen] = useState(false)

  const lines = Object.entries(data.lines).sort((a, b) => Number(a[0]) - Number(b[0]))
  if (lines.length === 0) return null

  const hasCrew = !!data.crew_names && Object.keys(data.crew_names).length > 0
  const isFortnightType = data.line_type === 'fortnight'

  // Day header labels
  const dayLabels: string[] = Array.from({ length: 14 }, (_, i) => {
    if (!data.fn_start) return `D${i + 1}`
    const d = new Date(data.fn_start + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()] + ' ' + d.getDate()
  })

  const totalDiagrams = lines.reduce((acc, [, days]) =>
    acc + days.filter(d => d.diag && d.diag !== 'OFF' && d.diag !== 'ADO').length, 0)

  const CELL_W = 64   // px per day column
  const LINE_W = 42   // px for line-number column
  const CREW_W = 88   // px for crew-name column

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <button
        className="btn-sm"
        style={{ fontSize: 11, color: 'var(--text2)' }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▲ Hide' : '▼ Show'} parsed {isFortnightType ? 'fortnight' : 'master'} roster
        {' '}— {lines.length} line{lines.length !== 1 ? 's' : ''},
        {' '}{totalDiagrams} work day{totalDiagrams !== 1 ? 's' : ''}
        {data.fn_start ? ` · ${data.fn_start}` : ''}
      </button>

      {open && (
        <div style={{
          overflowX: 'auto', marginTop: 8,
          border: '1px solid var(--border-mid)', borderRadius: 8,
        }}>
          <table style={{
            fontSize: 10, borderCollapse: 'collapse', tableLayout: 'fixed',
            minWidth: LINE_W + (hasCrew ? CREW_W : 0) + CELL_W * 14,
          }}>
            <colgroup>
              <col style={{ width: LINE_W }} />
              {hasCrew && <col style={{ width: CREW_W }} />}
              {dayLabels.map((_, i) => <col key={i} style={{ width: CELL_W }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{
                  padding: '4px 6px', textAlign: 'left', fontWeight: 600,
                  position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2,
                }}>Line</th>
                {hasCrew && (
                  <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>Crew</th>
                )}
                {dayLabels.map((lbl, i) => (
                  <th key={i} style={{
                    padding: '4px 3px', textAlign: 'center',
                    fontWeight: 500, whiteSpace: 'nowrap', fontSize: 9.5,
                  }}>
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(([lineNum, days], rowIdx) => {
                const rowBg = rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'
                const crew = data.crew_names?.[lineNum]
                return (
                  <tr key={lineNum} style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Sticky line-number cell */}
                    <td style={{
                      padding: '4px 6px', fontWeight: 700, verticalAlign: 'top',
                      position: 'sticky', left: 0, background: rowBg, zIndex: 1,
                    }}>
                      {lineNum}
                    </td>

                    {/* Optional crew name */}
                    {hasCrew && (
                      <td style={{
                        padding: '4px 4px', fontSize: 9, color: 'var(--text2)',
                        verticalAlign: 'top', maxWidth: CREW_W,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={crew}>
                        {crew ?? ''}
                      </td>
                    )}

                    {/* 14 day cells */}
                    {days.map((day, di) => {
                      const isOff  = !day.diag || day.diag === 'OFF'
                      const isAdo  = day.diag === 'ADO'
                      const isGap  = !isOff && !isAdo && (!day.diag || (!day.r_start && day.r_hrs === 8.0 && day.diag === ''))
                      const isEmpty = !isOff && !isAdo && day.diag === '' && day.r_start !== null
                      return (
                        <td key={di} style={{
                          padding: '3px 3px', textAlign: 'center', verticalAlign: 'top',
                          background: isEmpty
                            ? 'rgba(180,0,0,.08)'
                            : isAdo
                            ? 'rgba(232,140,30,.12)'
                            : undefined,
                          borderLeft: '1px solid var(--border)',
                        }}>
                          {isOff ? (
                            <span style={{ color: 'var(--text3)' }}>—</span>
                          ) : isAdo ? (
                            <span style={{ fontWeight: 700, color: 'var(--amber-text)', fontSize: 9 }}>ADO</span>
                          ) : isEmpty ? (
                            // Parser read times but no diagram — flag as a parse gap
                            <div style={{ lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 700, color: 'var(--red-text)', fontSize: 10 }}>?</div>
                              {day.r_start && (
                                <div style={{ color: 'var(--red-text)', fontSize: 8 }}>
                                  {day.r_start}–{day.r_end ?? '?'}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text1)', fontSize: 10 }}>
                                {day.diag}
                              </div>
                              {day.r_start && (
                                <div style={{ color: 'var(--text3)', fontSize: 8, whiteSpace: 'nowrap' }}>
                                  {day.r_start}–{day.r_end ?? '?'}{day.cm ? ' 🌙' : ''}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{
            padding: '6px 10px', borderTop: '1px solid var(--border)',
            fontSize: 10, color: 'var(--text2)', display: 'flex', gap: 16, flexWrap: 'wrap',
          }}>
            <span><span style={{ color: 'var(--text3)' }}>—</span> = OFF</span>
            <span><span style={{ fontWeight: 700, color: 'var(--amber-text)' }}>ADO</span> = Accrued day off</span>
            <span><span style={{ fontWeight: 700, color: 'var(--red-text)' }}>?</span> = Parser read times but no diagram — check source PDF</span>
            <span>🌙 = cross-midnight</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SchedulePreviewTable (v3.40) ─────────────────────────────────────────────
// Shows parsed weekday or weekend schedule diagrams in a compact table.
// Columns: Diagram | Type | Sign on | Sign off | Hours | KM | CM
// Collapsed by default.  Sorted by diagram number.
function SchedulePreviewTable({ data }: { data: ParsedScheduleData }) {
  const [open, setOpen] = useState(false)

  const diagrams = Object.entries(data.diagrams).sort((a, b) => Number(a[0]) - Number(b[0]))
  if (diagrams.length === 0) return null

  const label = data.schedule_type === 'weekend' ? 'weekend' : 'weekday'

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <button
        className="btn-sm"
        style={{ fontSize: 11, color: 'var(--text2)' }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? '▲ Hide' : '▼ Show'} parsed {label} schedule — {diagrams.length} diagram{diagrams.length !== 1 ? 's' : ''}
      </button>

      {open && (
        <div style={{
          overflowX: 'auto', marginTop: 8,
          border: '1px solid var(--border-mid)', borderRadius: 8,
        }}>
          <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '5px 10px', textAlign: 'left' }}>Diagram</th>
                <th style={{ padding: '5px 8px', textAlign: 'left' }}>Type</th>
                <th style={{ padding: '5px 10px', textAlign: 'center' }}>Sign on</th>
                <th style={{ padding: '5px 10px', textAlign: 'center' }}>Sign off</th>
                <th style={{ padding: '5px 10px', textAlign: 'right' }}>Hours</th>
                <th style={{ padding: '5px 10px', textAlign: 'right' }}>KM</th>
                <th style={{ padding: '5px 8px', textAlign: 'center' }}>CM</th>
              </tr>
            </thead>
            <tbody>
              {diagrams.map(([num, info], i) => {
                const missingTime = !info.sign_on || !info.sign_off
                return (
                  <tr key={num} style={{
                    borderTop: '1px solid var(--border)',
                    background: missingTime
                      ? 'rgba(180,0,0,.06)'
                      : i % 2 === 0 ? undefined : 'var(--surface-2)',
                  }}>
                    <td style={{ padding: '4px 10px', fontWeight: 700 }}>{num}</td>
                    <td style={{
                      padding: '4px 8px', color: 'var(--text2)',
                      textTransform: 'capitalize', fontSize: 10,
                    }}>
                      {info.day_type}
                    </td>
                    <td style={{
                      padding: '4px 10px', textAlign: 'center',
                      fontFamily: 'monospace', fontWeight: 500,
                      color: info.sign_on ? undefined : 'var(--red-text)',
                    }}>
                      {info.sign_on ?? '—'}
                    </td>
                    <td style={{
                      padding: '4px 10px', textAlign: 'center',
                      fontFamily: 'monospace', fontWeight: 500,
                      color: info.sign_off ? undefined : 'var(--red-text)',
                    }}>
                      {info.sign_off ?? '—'}
                    </td>
                    <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                      {info.r_hrs.toFixed(2)}
                    </td>
                    <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                      {info.km > 0
                        ? info.km.toFixed(3)
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      {info.cm
                        ? <span style={{ color: 'var(--accent)', fontSize: 13 }}>🌙</span>
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Legend for missing-time rows */}
          {diagrams.some(([, info]) => !info.sign_on || !info.sign_off) && (
            <div style={{
              padding: '6px 10px', borderTop: '1px solid var(--border)',
              fontSize: 10, color: 'var(--red-text)',
            }}>
              ⚠ Rows highlighted in red have missing sign-on or sign-off times — the parser could not extract them. These diagrams will use fallback times (08:00–16:00). Check the source PDF.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
