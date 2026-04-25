import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import { LEAVE_CATS } from '../utils/eaRules'
import type { DayResult } from '../types'

const DW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d: Date) { return `${DW[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }

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

  // Header badge — shows day type or manual override
  let badge = null
  if (hasManual) {
    badge = <span className="badge badge-manual">✏ {day.diag}</span>
  } else if (isOff) {
    badge = <span className="badge badge-off">OFF</span>
  } else if (isAdo) {
    badge = <span className="badge badge-ado">ADO</span>
  } else if (day.ph) {
    badge = <span className="badge badge-ph">PH</span>
  } else if (day.dow === 0) {
    badge = <span className="badge badge-sun">Sun</span>
  } else if (day.dow === 6) {
    badge = <span className="badge badge-sat">Sat</span>
  }

  const rosterInfo = day.rStart
    ? <span className="day-roster-info">{day.rStart}–{day.rEnd} · {day.rHrs.toFixed(2)}h</span>
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
        {badge}{rosterInfo}{summary}
        <span className="chevron">▼</span>
      </div>
      <div className={`day-body${open ? ' open' : ''}`}>
        {/* Show the work form for all days — the OFF/ADO message is shown inline */}
        <WorkForm i={i} isOffOrAdo={isOffOrAdo} hasManual={hasManual} showReset={showReset} />
      </div>
    </div>
  )
}

// ── Unified work form (all day types) ────────────────────────────────────────
function WorkForm({
  i, isOffOrAdo, hasManual, showReset,
}: {
  i: number; isOffOrAdo: boolean; hasManual: boolean; showReset: boolean
}) {
  const ctx     = useFortnightContext()
  const day     = ctx.days[i]
  const preview = ctx.previews[i]
  const ch = (k: keyof typeof day, v: any) => ctx.setDay(i, { [k]: v } as any)

  const diagInput = day.manualDiagInput || ''
  const setDiagInput = (v: string) => ctx.setDay(i, { manualDiagInput: v })

  // Whether to show the work-time inputs section
  // Show if: day has a work diagram (not bare OFF/ADO), or a manual override is active
  const showWorkInputs = hasManual || !isOffOrAdo

  return (
    <>
      {/* ── Reset banner (shown when any override is active) ── */}
      {showReset && (
        <div className="reset-banner">
          <span>
            Override active on <strong>{day._origDiag || 'OFF'}</strong> day
            {' — '}diagram: <strong>{day.diag}</strong>
          </span>
          <button
            className="btn-sm btn-danger"
            style={{ marginLeft: 'auto' }}
            onClick={() => ctx.resetDay(i)}
          >
            ↩ Reset to {day._origDiag || 'OFF'}
          </button>
        </div>
      )}

      {/* ── OFF/ADO info (only when no override) ── */}
      {isOffOrAdo && !hasManual && (
        <div style={{ marginBottom: 10 }}>
          <p className="type-label" style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            {day.diag === 'ADO' ? 'Accrued Day Off (ADO)' : 'Day off / RDO'} — no pay unless worked.
          </p>
          <button className="btn-sm btn-danger" onClick={() => ctx.markWorkedOnOff(i)}>
            + Worked (no diagram)
          </button>
        </div>
      )}

      {/* ── Diagram override — available on ALL day types ── */}
      <div style={{ marginBottom: 10 }}>
        <label>
          {isOffOrAdo && !hasManual ? 'Load a different diagram (shift swap)' : 'Override diagram'}
          <span style={{ color: 'var(--text3)', marginLeft: 6, fontWeight: 400 }}>
            e.g. 3158, 3651, SBY
          </span>
        </label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            style={{ width: 160 }}
            placeholder="diagram / schedule no."
            value={diagInput}
            onChange={e => setDiagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ctx.applyManualDiag(i, diagInput)}
          />
          <button className="btn-primary btn-sm" onClick={() => ctx.applyManualDiag(i, diagInput)}>
            Load ↗
          </button>
        </div>
        {hasManual && (
          <p className="note" style={{ marginTop: 4 }}>
            Times and KMs loaded from schedule. Edit below if needed.
          </p>
        )}
      </div>

      {/* ── Work time inputs (shown for all non-bare-OFF/ADO days) ── */}
      {showWorkInputs && (
        <>
          <div className="shift-inputs">
            <div>
              <label>Actual start <span style={{ color: 'var(--text3)' }}>rostered: {day.rStart || '—'}</span></label>
              <input type="time" value={day.aStart} onChange={e => ch('aStart', e.target.value)} />
            </div>
            <div>
              <label>Actual end <span style={{ color: 'var(--text3)' }}>rostered: {day.rEnd || '—'}</span></label>
              <input type="time" value={day.aEnd} onChange={e => ch('aEnd', e.target.value)} />
            </div>
            <div>
              <label>KMs</label>
              <input type="number" min="0" step="1" value={day.km || ''} onChange={e => ch('km', parseFloat(e.target.value) || 0)} />
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
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn-sm"
                onClick={() => { if (day.rStart) ctx.setDay(i, { aStart: day.rStart || '', aEnd: day.rEnd || '' }) }}
              >
                ☰ Rostered
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Leave type</label>
            <select style={{ width: 300 }} value={day.leaveCat} onChange={e => ch('leaveCat', e.target.value)}>
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

// ── Per-day pay breakdown table ───────────────────────────────────────────────
function DayPreview({ preview }: { preview: DayResult }) {
  if (!preview) return null
  if (preview.day_type === 'off') return null
  if (preview.day_type === 'ado' && preview.total_pay === 0)
    return <div className="alert alert-info" style={{ fontSize: 11 }}>{preview.flags[0] || 'ADO accruing — paid out on short fortnight.'}</div>
  if (!preview.components.length) return null
  return (
    <>
      <table style={{ marginTop: 6 }}>
        <thead>
          <tr><th>Component</th><th>EA ref</th><th>Code</th><th>Hrs</th><th>Rate</th><th className="text-right">Amount</th></tr>
        </thead>
        <tbody>
          {preview.components.map((c, j) => (
            <tr key={j} className={c.cls === 'km-row' ? 'row-km' : c.cls === 'pen-row' ? 'row-pen' : ''}>
              <td>{c.name}</td>
              <td style={{ color: 'var(--text3)', fontSize: 11 }}>{c.ea}</td>
              <td><code>{c.code}</code></td>
              <td>{c.hrs}</td>
              <td style={{ color: 'var(--text3)', fontSize: 11 }}>{c.rate}</td>
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
      <div style={{ marginTop: 4 }}>
        {preview.flags.map((f, j) => (
          <span key={j} className={`flag-chip${f.includes('ALERT') ? ' err' : ''}`}>
            {f.includes('ALERT') ? '🚨' : '⚑'} {f}
          </span>
        ))}
      </div>
    </>
  )
}
