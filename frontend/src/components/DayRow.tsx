import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import { LEAVE_CATS } from '../utils/eaRules'
import type { DayResult, TimeSource } from '../types'

const DW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d: Date) { return `${DW[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }

// Time source → user-facing label and colour
function sourceBadge(src: TimeSource, diagNum: string | null) {
  switch (src) {
    case 'schedule': return { label: '✓ Schedule', cls: 'src-schedule', tip: `Times loaded from uploaded schedule (diagram ${diagNum ?? '?'})` }
    case 'master':   return { label: 'ⓘ Master roster', cls: 'src-master',  tip: 'Diagram not found in uploaded schedule — using master roster times' }
    case 'builtin':  return { label: 'ⓘ Built-in', cls: 'src-master', tip: 'No master roster uploaded — using built-in fallback times' }
    case 'manual':   return { label: '✏ Manual', cls: 'src-manual',   tip: 'Manually overridden by user (diagram or scheduled times edited)' }
    case 'none':     return null
  }
}

export default function DayRow({ index: i }: { index: number }) {
  const ctx     = useFortnightContext()
  const [open, setOpen] = useState(false)
  const day     = ctx.days[i]
  const preview = ctx.previews[i]
  const d       = parseDate(day.date)

  const isOff      = day.diag === 'OFF'
  const isAdo      = day.diag === 'ADO'
  const isOffOrAdo = isOff || isAdo
  const hasManual  = Boolean(day.manualDiag)
  const showReset  = Boolean(day._origDiag)

  // Day-type badge
  let dayBadge = null
  if (isOff)         dayBadge = <span className="badge badge-off">OFF</span>
  else if (isAdo)    dayBadge = <span className="badge badge-ado">ADO</span>
  else if (day.ph)   dayBadge = <span className="badge badge-ph">PH</span>
  else if (day.dow === 0) dayBadge = <span className="badge badge-sun">Sun</span>
  else if (day.dow === 6) dayBadge = <span className="badge badge-sat">Sat</span>

  // Diagram number badge — prominent, always shown for work days
  const diagNumBadge = day.diagNum
    ? <span className="badge badge-diag" title={day.diag}>#{day.diagNum}</span>
    : null

  // Time source badge
  const srcInfo = sourceBadge(day.timeSource, day.diagNum)
  const srcBadge = srcInfo
    ? <span className={`badge ${srcInfo.cls}`} title={srcInfo.tip}>{srcInfo.label}</span>
    : null

  const summary = preview
    ? <span className={`day-summary${preview.total_pay > 0 ? ' has-pay' : ''}`}>
        {preview.hours.toFixed(1)}h → ${preview.total_pay.toFixed(2)}
      </span>
    : <span className="day-summary">—</span>

  return (
    <div className={`day-row${open ? ' open' : ''}`}>
      <div className="day-header" onClick={() => setOpen(o => !o)}>
        <span className="day-date">{fmtDate(d)}</span>
        {dayBadge}
        {diagNumBadge}
        {srcBadge}
        {!isOffOrAdo && day.diag && (
          <span className="day-roster-info" style={{fontSize:11,color:'var(--text2)'}}>
            {day.diag.replace(' [manual]', '')}
            {day.rStart && ` · ${day.rStart}–${day.rEnd}`}
          </span>
        )}
        {summary}
        <span className="chevron">▼</span>
      </div>
      <div className={`day-body${open ? ' open' : ''}`}>
        <WorkForm i={i} isOffOrAdo={isOffOrAdo} hasManual={hasManual} showReset={showReset} />
      </div>
    </div>
  )
}

// ── Unified day form ─────────────────────────────────────────────────────────
function WorkForm({
  i, isOffOrAdo, hasManual, showReset,
}: {
  i: number; isOffOrAdo: boolean; hasManual: boolean; showReset: boolean
}) {
  const ctx     = useFortnightContext()
  const day     = ctx.days[i]
  const preview = ctx.previews[i]
  const ch = (k: keyof typeof day, v: any) => ctx.setDay(i, { [k]: v } as any)

  // When user edits scheduled time/end, also flip timeSource to 'manual' so
  // the badge correctly indicates the value is no longer authoritative-from-source
  // PRD §FR-02-B v3.10
  const editScheduledTime = (k: 'rStart' | 'rEnd', v: string) =>
    ctx.setDay(i, { [k]: v, timeSource: 'manual' } as any)

  const diagInput    = day.manualDiagInput || ''
  const setDiagInput = (v: string) => ctx.setDay(i, { manualDiagInput: v })

  const showWorkInputs = hasManual || !isOffOrAdo
  const srcInfo = sourceBadge(day.timeSource, day.diagNum)

  // Default Yes when undefined (legacy session state from before v3.10)
  const claimYes = day.claimLiftupLayback !== false

  return (
    <>
      {/* Reset banner */}
      {showReset && (
        <div className="reset-banner">
          <span>
            Override active — original: <strong>{day._origDiag}</strong>
            {day._origDiagNum && <> (#{day._origDiagNum})</>}
            {' · '}now: <strong>{day.diag}</strong>
          </span>
          <button className="btn-sm btn-danger" style={{marginLeft:'auto'}} onClick={() => ctx.resetDay(i)}>
            ↩ Reset to {day._origDiag}
          </button>
        </div>
      )}

      {/* OFF/ADO info (only when no override) */}
      {isOffOrAdo && !hasManual && (
        <div style={{marginBottom:10}}>
          <p style={{fontSize:12,color:'var(--text3)',marginBottom:8}}>
            {day.diag === 'ADO' ? 'Accrued Day Off (ADO)' : 'Day off / RDO'} — no pay unless worked.
          </p>
          <button className="btn-sm btn-danger" onClick={() => ctx.markWorkedOnOff(i)}>
            + Worked (no diagram)
          </button>
        </div>
      )}

      {/* Diagram override input — available on all day types */}
      <div style={{marginBottom:12,padding:8,background:'var(--bg2)',borderRadius:6}}>
        <label style={{fontSize:11,fontWeight:600}}>
          {hasManual ? 'Change to a different diagram' : 'Override diagram (shift swap)'}
          <span style={{color:'var(--text3)',marginLeft:6,fontWeight:400}}>e.g. 3158, 3651, 3160</span>
        </label>
        <div style={{display:'flex',gap:6,alignItems:'center',marginTop:4}}>
          <input
            type="text" style={{width:140}}
            placeholder="diagram no."
            value={diagInput}
            onChange={e => setDiagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ctx.applyManualDiag(i, diagInput)}
          />
          <button className="btn-primary btn-sm" onClick={() => ctx.applyManualDiag(i, diagInput)}>
            Load ↗
          </button>
          <span style={{fontSize:10,color:'var(--text3)',marginLeft:8}}>
            Searches both weekday &amp; weekend schedules
          </span>
        </div>
      </div>

      {showWorkInputs && (
        <>
          {/* Scheduled times — EDITABLE in v3.10 (PRD §FR-02-B) */}
          <div style={{
            padding:10, background:'var(--bg2)', borderRadius:6, marginBottom:8,
            border:'1px solid var(--border)',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <strong style={{fontSize:12}}>Scheduled times</strong>
              {srcInfo && <span className={`badge ${srcInfo.cls}`} title={srcInfo.tip}>{srcInfo.label}</span>}
              {day.diagNum && <span style={{fontSize:11,color:'var(--text3)'}}>diagram #{day.diagNum}</span>}
              <span style={{fontSize:10,color:'var(--text3)',marginLeft:'auto'}}>editable — overrides schedule data</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <div>
                <label style={{fontSize:10,color:'var(--text3)'}}>Scheduled start</label>
                <input type="time" value={day.rStart || ''}
                  onChange={e => editScheduledTime('rStart', e.target.value)} />
              </div>
              <div>
                <label style={{fontSize:10,color:'var(--text3)'}}>Scheduled end</label>
                <input type="time" value={day.rEnd || ''}
                  onChange={e => editScheduledTime('rEnd', e.target.value)} />
              </div>
              <div>
                <label style={{fontSize:10,color:'var(--text3)'}}>Scheduled hours</label>
                <input type="text" value={day.rHrs ? day.rHrs.toFixed(2) + 'h' : '—'} disabled
                  style={{background:'var(--bg3)',color:'var(--text2)',cursor:'not-allowed'}} />
              </div>
            </div>
            {day.timeSource === 'master' && (
              <p className="note" style={{marginTop:6,color:'var(--amber-text)'}}>
                ⚠ Schedule didn't have diagram #{day.diagNum} — times taken from master roster instead. You can edit them above.
              </p>
            )}
            {day.timeSource === 'builtin' && (
              <p className="note" style={{marginTop:6,color:'var(--amber-text)'}}>
                ⚠ Times from built-in fallback. Upload master roster + schedule for accurate data, or edit above.
              </p>
            )}
          </div>

          {/* Actual times (user-editable) */}
          <div style={{
            padding:10, background:'var(--bg1)', borderRadius:6, marginBottom:8,
            border:'1px solid var(--green-bg)',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <strong style={{fontSize:12}}>Actual times</strong>
              <span style={{fontSize:11,color:'var(--text3)'}}>what really happened</span>
              <button className="btn-sm" style={{marginLeft:'auto'}}
                onClick={() => ctx.copyScheduledToActual(i)}
                disabled={!day.rStart}
                title="Copy scheduled times to actual">
                ↺ Same as scheduled
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <label style={{fontSize:10,color:'var(--text3)'}}>Actual start</label>
                <input type="time" value={day.aStart} onChange={e => ch('aStart', e.target.value)} />
              </div>
              <div>
                <label style={{fontSize:10,color:'var(--text3)'}}>Actual end</label>
                <input type="time" value={day.aEnd} onChange={e => ch('aEnd', e.target.value)} />
              </div>
            </div>
            {day.rStart && day.aStart && (day.aStart !== day.rStart || day.aEnd !== day.rEnd) && (
              <p className="note" style={{marginTop:6,color:'var(--blue-text)'}}>
                {claimYes
                  ? 'ⓘ Actual differs from scheduled — pay computed on effective window (earliest start to latest end).'
                  : 'ⓘ Actual differs from scheduled — pay computed strictly on actual times (lift-up/layback claim disabled).'}
              </p>
            )}
          </div>

          {/* Other inputs (3-column) */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
            <div>
              <label>KMs <span style={{color:'var(--text3)',fontWeight:400,fontSize:10}}>
                {day.km > 0 && day.timeSource === 'schedule' ? '✓ from schedule' : ''}
              </span></label>
              <input type="number" min="0" step="0.001"
                value={day.km || ''}
                onChange={e => ch('km', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label>WOBOD</label>
              <select value={day.wobod ? '1' : '0'} onChange={e => ch('wobod', e.target.value === '1')}>
                <option value="0">No</option><option value="1">Yes</option>
              </select>
            </div>
            <div>
              <label>Cross-midnight</label>
              <select value={day.cm ? '1' : '0'} onChange={e => ch('cm', e.target.value === '1')}>
                <option value="0">No</option><option value="1">Yes</option>
              </select>
            </div>
          </div>

          {/* Claim lift-up/layback toggle — NEW v3.10 (PRD §FR-02-F) */}
          <div style={{
            display:'grid', gridTemplateColumns:'auto 1fr', gap:10, alignItems:'center',
            marginBottom:8, padding:8, background:'var(--bg2)', borderRadius:6,
            border:'1px solid var(--border)',
          }}>
            <div>
              <label style={{fontSize:11,fontWeight:600}}>Claim lift-up / layback / buildup?</label>
              <select value={claimYes ? '1' : '0'}
                style={{marginTop:2}}
                onChange={e => ch('claimLiftupLayback', e.target.value === '1')}>
                <option value="1">Yes (default)</option>
                <option value="0">No — actual times only</option>
              </select>
            </div>
            <p style={{fontSize:11,color:'var(--text3)',margin:0,lineHeight:1.4}}>
              {claimYes
                ? <><strong>Yes:</strong> hours = max(scheduled end, actual end) − min(scheduled start, actual start). Driver paid for full scheduled shift PLUS any extension before/after (Cl. 131).</>
                : <><strong>No:</strong> hours = actual end − actual start. No lift-up/layback components, no scheduled-hours guarantee.</>}
            </p>
          </div>

          <div style={{marginBottom:8}}>
            <label>Leave type</label>
            <select style={{width:300}} value={day.leaveCat} onChange={e => ch('leaveCat', e.target.value)}>
              {LEAVE_CATS.map(lc => (
                <option key={lc.code} value={lc.code}>{lc.label}{lc.eaRef ? ` (${lc.eaRef})` : ''}</option>
              ))}
            </select>
          </div>

          {preview && <DayPreview preview={preview} />}
        </>
      )}
    </>
  )
}

// ── Per-day pay breakdown ────────────────────────────────────────────────────
function DayPreview({ preview }: { preview: DayResult }) {
  if (!preview) return null
  if (preview.day_type === 'off') return null
  if (preview.day_type === 'ado' && preview.total_pay === 0)
    return <div className="alert alert-info" style={{fontSize:11}}>{preview.flags[0] || 'ADO accruing — paid out on short fortnight.'}</div>
  if (!preview.components.length) return null
  return (
    <>
      <table style={{marginTop:6}}>
        <thead>
          <tr><th>Component</th><th>EA ref</th><th>Code</th><th>Hrs</th><th>Rate</th><th className="text-right">Amount</th></tr>
        </thead>
        <tbody>
          {preview.components.map((c, j) => (
            <tr key={j} className={c.cls === 'km-row' ? 'row-km' : c.cls === 'pen-row' ? 'row-pen' : ''}>
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
            <td />
            <td className="text-right"><strong>${preview.total_pay.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      <div style={{marginTop:4}}>
        {preview.flags.map((f, j) => (
          <span key={j} className={`flag-chip${f.includes('ALERT') ? ' err' : ''}`}>
            {f.includes('ALERT') ? '🚨' : '⚑'} {f}
          </span>
        ))}
      </div>
    </>
  )
}
