import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate } from '../utils/dateUtils'
import { LEAVE_CATS } from '../utils/eaRules'
import type { DayResult, TimeSource } from '../types'

const DW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(d: Date) { return `${DW[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` }

function sourceBadge(src: TimeSource, diagNum: string | null) {
  switch (src) {
    case 'schedule':  return { label: '✓ Schedule', cls: 'src-schedule', tip: `Times from uploaded schedule (diagram ${diagNum ?? '?'})` }
    case 'fortnight': return { label: 'ⓘ Fortnight roster', cls: 'src-master', tip: 'Diagram not in uploaded schedule — using fortnight-roster times' }
    case 'master':    return { label: 'ⓘ Master roster', cls: 'src-master', tip: 'Diagram not in uploaded schedule — using master-roster times' }
    case 'builtin':   return { label: 'ⓘ Built-in', cls: 'src-master', tip: 'No master roster uploaded — using built-in fallback times' }
    case 'manual':    return { label: '✏ Manual', cls: 'src-manual', tip: 'Manually overridden by user' }
    case 'none':      return null
  }
}

// Day-type pill styles
function dayTypeBadge(diag: string, dow: number, ph: boolean) {
  if (diag === 'OFF') return { label: 'Off',      style: { background:'var(--surface-2)', color:'var(--text3)', border:'1px solid var(--border-mid)' } }
  if (diag === 'ADO') return { label: 'ADO',      style: { background:'var(--amber-bg)',  color:'var(--amber)' } }
  if (ph)             return { label: 'PH',        style: { background:'var(--amber-bg)',  color:'var(--amber)' } }
  if (diag === 'WOBOD' || diag.includes('WOBOD')) return { label: 'WOBOD', style: { background:'#fce7f3', color:'#9d174d' } }
  if (dow === 0)      return { label: 'Sunday',    style: { background:'#fce7f3', color:'#9d174d' } }
  if (dow === 6)      return { label: 'Saturday',  style: { background:'#ede9fe', color:'#6b21a8' } }
  return               { label: 'Weekday',         style: { background:'var(--accent-bg)', color:'var(--accent)' } }
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

  const dtb = dayTypeBadge(day.diag, day.dow, !!day.ph)

  const srcInfo   = sourceBadge(day.timeSource, day.diagNum)

  // Summary shown on the collapsed row.
  // v3.30: drivers (non-admin) see hours only — the $ amount is hidden in the
  // Daily Entry tab to keep it focused on data entry; full pay breakdown is
  // available in the Results tab.  Admin keeps the full hours-→-dollar summary.
  const isAdmin = !!ctx.adminPassword
  const summary = preview
    ? <span className={`day-summary${preview.total_pay > 0 ? ' has-pay' : ''}`}>
        {preview.hours.toFixed(1)} h{isAdmin && ` → $${preview.total_pay.toFixed(2)}`}
      </span>
    : <span className="day-summary">—</span>

  // Auto-suppress warning from preview flags
  const isSuppressed = preview?.flags.some(f => f.includes('shift swap') || f.includes('suppressed'))

  return (
    <div className={`day-row${open ? ' open' : ''}`} role="listitem">
      <div
        className="day-header"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }}}
        aria-label={`${fmtDate(d)}, ${dtb.label}${day.diagNum ? `, diagram ${day.diagNum}` : ''}`}
      >
        {/* Date */}
        <span className="day-date">{fmtDate(d)}</span>

        {/* Day-type pill */}
        <span className="badge" style={{ ...dtb.style, fontSize: 11, padding: '2px 9px', borderRadius: 20 }}>
          {dtb.label}
        </span>

        {/* Diagram badge */}
        {day.diagNum && (
          <span className="badge badge-diag" title={day.diag}>
            {day.diagNum}
          </span>
        )}

        {/* Time source badge */}
        {srcInfo && !isOffOrAdo && (
          <span className={`badge ${srcInfo.cls}`} title={srcInfo.tip} style={{ fontSize: 11 }}>
            {srcInfo.label}
          </span>
        )}

        {/* Auto-suppress warning chip */}
        {isSuppressed && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: 'var(--amber-bg)', color: 'var(--amber)',
            border: '1px solid rgba(180,83,9,0.25)',
          }}>
            ⚠ lift-up suppressed
          </span>
        )}

        {/* Times + KM summary (collapsed) */}
        {!isOffOrAdo && day.aStart && (
          <span className="day-roster-info" style={{ marginLeft: 4 }}>
            {day.aStart}–{day.aEnd}
            {day.km > 0 ? ` · ${day.km % 1 === 0 ? day.km.toFixed(0) : day.km.toFixed(1)} km` : ''}
          </span>
        )}

        {summary}
        <span className="chevron" aria-hidden="true">▼</span>
      </div>

      <div className={`day-body${open ? ' open' : ''}`}>
        <WorkForm i={i} isOffOrAdo={isOffOrAdo} hasManual={hasManual} showReset={showReset} />
      </div>
    </div>
  )
}

// ── Toggle group helper ──────────────────────────────────────────────────────
function ToggleGroup({
  label, value, onChange, yesLabel = 'Yes', noLabel = 'No',
}: {
  label: string; value: boolean; onChange: (v: boolean) => void
  yesLabel?: string; noLabel?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div className="toggle-group" role="group" aria-label={label}>
        <button
          className={`toggle-opt${value ? ' on' : ''}`}
          aria-pressed={value}
          onClick={() => onChange(true)}
          type="button"
        >
          {yesLabel}
        </button>
        <button
          className={`toggle-opt${!value ? ' on' : ''}`}
          aria-pressed={!value}
          onClick={() => onChange(false)}
          type="button"
        >
          {noLabel}
        </button>
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

  const editScheduledTime = (k: 'rStart' | 'rEnd', v: string) =>
    ctx.setDay(i, { [k]: v, timeSource: 'manual' } as any)

  const diagInput    = day.manualDiagInput || ''
  const setDiagInput = (v: string) => ctx.setDay(i, { manualDiagInput: v })

  const showWorkInputs = hasManual || !isOffOrAdo
  const srcInfo = sourceBadge(day.timeSource, day.diagNum)
  const claimYes = day.claimLiftupLayback !== false
  const isSuppressed = preview?.flags.some(f => f.includes('shift swap') || f.includes('suppressed'))

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
          <button className="btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={() => ctx.resetDay(i)}>
            ↩ Reset to {day._origDiag}
          </button>
        </div>
      )}

      {/* OFF / ADO — no override */}
      {isOffOrAdo && !hasManual && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            {day.diag === 'ADO' ? 'Accrued Day Off (ADO)' : 'Day off / RDO'} — no pay unless worked.
          </p>
          <button className="btn-sm btn-danger" onClick={() => ctx.markWorkedOnOff(i)}>
            + Worked (no diagram)
          </button>
        </div>
      )}

      {/* Diagram override */}
      <div style={{
        marginBottom: 14, padding: 12,
        background: 'var(--surface-2)', borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        <label style={{ textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          {hasManual ? 'Change diagram' : 'Override diagram (shift swap)'}
          <span style={{ color: 'var(--text3)', marginLeft: 6, fontWeight: 400, fontSize: 11 }}>
            e.g. 3158, 3651, 3160
          </span>
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            style={{ width: 140 }}
            placeholder="diagram no."
            value={diagInput}
            onChange={e => setDiagInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ctx.applyManualDiag(i, diagInput)}
          />
          <button className="btn-primary btn-sm" onClick={() => ctx.applyManualDiag(i, diagInput)}>
            Load ↗
          </button>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            Searches weekday &amp; weekend schedules
          </span>
        </div>
      </div>

      {showWorkInputs && (
        <>
          {/* Scheduled + Actual times — side by side */}
          <div className="times-block">
            {/* Scheduled */}
            <div className="times-col">
              <div className="times-heading" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                📌 Scheduled times
                {srcInfo && (
                  <span className={`badge ${srcInfo.cls}`} title={srcInfo.tip} style={{ fontSize: 11 }}>
                    {srcInfo.label}
                  </span>
                )}
              </div>
              <div className="times-row">
                <div>
                  <label>Start</label>
                  <input type="time" lang="en-GB" value={day.rStart || ''}
                    onChange={e => editScheduledTime('rStart', e.target.value)} />
                </div>
                <div>
                  <label>End</label>
                  <input type="time" lang="en-GB" value={day.rEnd || ''}
                    onChange={e => editScheduledTime('rEnd', e.target.value)} />
                </div>
              </div>
              {day.timeSource === 'fortnight' && (
                <p className="note" style={{ marginTop: 6, color: 'var(--amber)' }}>
                  ⚠ Schedule didn't have diagram #{day.diagNum ?? day.diag} — using fortnight-roster times. Edit above if needed.
                </p>
              )}
              {day.timeSource === 'master' && (
                <p className="note" style={{ marginTop: 6, color: 'var(--amber)' }}>
                  ⚠ Schedule didn't have diagram #{day.diagNum} — using master-roster times. Edit above if needed.
                </p>
              )}
              {day.timeSource === 'builtin' && (
                <p className="note" style={{ marginTop: 6, color: 'var(--amber)' }}>
                  ⚠ Times from built-in fallback. Upload master roster for accurate data.
                </p>
              )}
            </div>

            <div className="times-divider" aria-hidden="true" />

            {/* Actual */}
            <div className="times-col">
              <div className="times-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>⏱ Actual times</span>
                <button
                  className="btn-sm"
                  style={{ fontSize: 11, padding: '3px 10px' }}
                  onClick={() => ctx.copyScheduledToActual(i)}
                  disabled={!day.rStart}
                  title="Copy scheduled times"
                >
                  ↺ Same as scheduled
                </button>
              </div>
              <div className="times-row">
                <div>
                  <label>Start</label>
                  <input
                    type="time" lang="en-GB"
                    value={day.aStart}
                    onChange={e => ch('aStart', e.target.value)}
                    style={day.aStart !== day.rStart && day.rStart
                      ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px rgba(0,113,227,0.12)' }
                      : {}}
                  />
                </div>
                <div>
                  <label>End</label>
                  <input
                    type="time" lang="en-GB"
                    value={day.aEnd}
                    onChange={e => ch('aEnd', e.target.value)}
                    style={day.aEnd !== day.rEnd && day.rEnd
                      ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px rgba(0,113,227,0.12)' }
                      : {}}
                  />
                </div>
              </div>
              {day.km > 0 && (
                <p className="note" style={{ marginTop: 6, color: 'var(--text2)' }}>
                  {day.km.toFixed(3)} km
                </p>
              )}
            </div>
          </div>

          {/* Controls row: KM + toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 0 }}>KM</label>
              <input
                type="number" min="0" step="0.001"
                value={day.km || ''}
                onChange={e => ch('km', parseFloat(e.target.value) || 0)}
                style={{ width: 120 }}
              />
            </div>

            <ToggleGroup
              label="Lift-up / layback?"
              value={claimYes}
              onChange={v => ch('claimLiftupLayback', v)}
            />

            <ToggleGroup
              label="WOBOD?"
              value={!!day.wobod}
              onChange={v => ch('wobod', v)}
            />

            <ToggleGroup
              label="Cross-midnight?"
              value={!!day.cm}
              onChange={v => ch('cm', v)}
            />
          </div>

          {/* Auto-suppress warning */}
          {isSuppressed && (
            <div className="note-box" style={{ borderLeftColor: 'var(--amber)', marginBottom: 14 }}>
              ⚠ Auto-detected shift swap — low overlap between scheduled and actual times.
              Lift-up/layback claim suppressed. You can still override via the toggle.
            </div>
          )}

          {/* Lift-up/layback context note */}
          {day.rStart && day.aStart && (day.aStart !== day.rStart || day.aEnd !== day.rEnd) && !isSuppressed && (
            <div className="note-box" style={{ marginBottom: 14 }}>
              {claimYes
                ? 'ⓘ Actual differs from scheduled — effective window: earliest start to latest end (Cl. 131).'
                : 'ⓘ Actual differs from scheduled — pay computed on actual times only (lift-up/layback claim off).'}
            </div>
          )}

          {/* Leave type */}
          <div style={{ marginBottom: 14 }}>
            <label>Leave type</label>
            <select style={{ width: 320 }} value={day.leaveCat} onChange={e => ch('leaveCat', e.target.value)}>
              {LEAVE_CATS.map(lc => (
                <option key={lc.code} value={lc.code}>
                  {lc.label}{lc.eaRef ? ` (${lc.eaRef})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Live preview — admin only (v3.30).  Drivers see the full breakdown
              in the Results tab, so the per-day preview table is suppressed
              here to keep Daily Entry focused on data entry. */}
          {preview && ctx.adminPassword && <DayPreview preview={preview} />}
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
    return (
      <div className="alert alert-info" style={{ fontSize: 12 }}>
        {preview.flags[0] || 'ADO accruing — paid out on short fortnight.'}
      </div>
    )
  if (!preview.components.length) return null

  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text2)', marginBottom: 10,
      }}>
        Live pay preview
      </div>
      <table aria-label="Live pay preview">
        <thead>
          <tr>
            <th>Code</th>
            <th>Description</th>
            <th>EA ref</th>
            <th>Hrs</th>
            <th>Rate</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {preview.components.map((c, j) => (
            <tr key={j} className={c.cls === 'km-row' ? 'row-km' : c.cls === 'pen-row' ? 'row-pen' : ''}>
              <td><code>{c.code}</code></td>
              <td>{c.name}</td>
              <td className="ea-ref">{c.ea}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{c.hrs}</td>
              <td className="ea-ref">{c.rate}</td>
              <td className="text-right" style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: 'var(--green)',
              }}>
                ${c.amount.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="row-total">
            <td colSpan={3}><strong>Daily total</strong></td>
            <td style={{ fontFamily: 'var(--font-mono)' }}>{preview.hours.toFixed(2)} h</td>
            <td />
            <td className="text-right">
              <strong>${preview.total_pay.toFixed(2)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {preview.flags.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {preview.flags.map((f, j) => (
            <span key={j} className={`flag-chip${f.includes('ALERT') ? ' err' : ''}`}>
              {f.includes('ALERT') ? '🚨' : '⚑'} {f}
            </span>
          ))}
        </div>
      )}
    </>
  )
}
