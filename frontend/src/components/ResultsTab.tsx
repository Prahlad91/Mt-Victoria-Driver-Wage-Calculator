import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate, fmtDateShort } from '../utils/dateUtils'
import type { PayComponent } from '../types'

const API = (import.meta as any).env?.VITE_API_BASE || ''

// Code → chip colour
function codeStyle(code: string): React.CSSProperties {
  const n = parseInt(code)
  if (n === 1001 || n === 1026)                 return { background: 'var(--accent-bg)',  color: 'var(--accent)' }
  if (n === 1462)                                return { background: 'var(--green-bg)',   color: 'var(--green)'  }
  if (n === 1470 || n === 1010 || n === 5042)   return { background: 'var(--amber-bg)',   color: 'var(--amber)'  }
  if (n === 1487 || n === 1483)                  return { background: '#ede9fe',            color: '#6b21a8'       }
  if (n === 1059 || n === 1100 || n === 1110)   return { background: '#fce7f3',            color: '#9d174d'       }
  if (n === 1454)                                return { background: '#e0f2fe',            color: '#0369a1'       }
  if (n === 1064)                                return { background: '#fef9c3',            color: '#713f12'       }
  return { background: 'var(--surface-2)', color: 'var(--text2)' }
}

export default function ResultsTab() {
  const ctx = useFortnightContext()
  const result = ctx.result
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null)

  if (!result) return (
    <div className="card" style={{ padding: '24px 20px' }}>
      <p style={{ color: 'var(--text2)', fontSize: 13 }}>
        No result yet. Go to <strong>Daily Entry</strong> and click Calculate.
      </p>
    </div>
  )

  const fnComps  = result.fortnightComponents || []
  const variance = result.audit?.payslipVariance
  const hasVariance = variance !== null && variance !== undefined
  const varianceOk  = hasVariance && Math.abs(variance!) <= 0.10
  const varianceBig = hasVariance && Math.abs(variance!) > 0.10

  // Derived metrics
  const ordinaryHrs = fnComps
    .filter((c: PayComponent) => c.code === '1001')
    .reduce((s: number, c: PayComponent) => s + (parseFloat(String(c.hrs)) || 0), 0)

  const otHrs = result.days.reduce((s: number, dr: any) => {
    if (!dr.components) return s
    return s + dr.components
      .filter((c: PayComponent) => c.code === '1026')
      .reduce((ss: number, c: PayComponent) => ss + (parseFloat(String(c.hrs)) || 0), 0)
  }, 0)

  const adoPayout = fnComps
    .filter((c: PayComponent) => c.code === '1462')
    .reduce((s: number, c: PayComponent) => s + c.amount, 0)

  async function handleExport(kind: 'pdf' | 'csv') {
    setExporting(kind)
    try {
      const r = await fetch(`${API}/api/export/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      })
      if (!r.ok) throw new Error(`Export ${kind} failed: ${r.status}`)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wage_calc_${result.fortnightStart}.${kind}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(`Export failed: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      {/* ── Match / variance banner ──────────────────────── */}
      {varianceOk && (
        <div className="match-banner" role="status">
          <div className="match-banner-icon">✓</div>
          <div className="match-banner-text">
            <div className="match-banner-title">
              Payslip matches — ${result.totalPay.toFixed(2)} (variance ${Math.abs(variance!).toFixed(2)})
            </div>
            <div className="match-banner-sub">
              v3.12 · Line {result.rosterLine ?? ctx.rosterLine} · {result.fortnightStart}
              {' · '}{result.fortnightType === 'short' ? 'Short fortnight' : 'Long fortnight'}
            </div>
          </div>
          <div className="match-banner-actions">
            <button className="btn-sm" onClick={() => handleExport('pdf')} disabled={!!exporting}>
              {exporting === 'pdf' ? '⏳' : '↓'} Export PDF
            </button>
            <button className="btn-sm" onClick={() => handleExport('csv')} disabled={!!exporting}>
              {exporting === 'csv' ? '⏳' : '↓'} Export CSV
            </button>
          </div>
        </div>
      )}

      {varianceBig && (
        <div className="match-banner warn" role="alert">
          <div className="match-banner-icon">⚠</div>
          <div className="match-banner-text">
            <div className="match-banner-title">
              Variance ${Math.abs(variance!).toFixed(2)} — calculated ${result.totalPay.toFixed(2)}
              {variance! > 0 ? ' (possible underpayment)' : ' (possible overpayment)'}
            </div>
            <div className="match-banner-sub">
              v3.12 · Line {result.rosterLine ?? ctx.rosterLine} · {result.fortnightStart}
            </div>
          </div>
          <div className="match-banner-actions">
            <button className="btn-sm" onClick={() => handleExport('pdf')} disabled={!!exporting}>
              {exporting === 'pdf' ? '⏳' : '↓'} PDF
            </button>
            <button className="btn-sm" onClick={() => handleExport('csv')} disabled={!!exporting}>
              {exporting === 'csv' ? '⏳' : '↓'} CSV
            </button>
          </div>
        </div>
      )}

      {/* No payslip total entered — just show export buttons */}
      {!hasVariance && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn-primary" onClick={() => handleExport('pdf')} disabled={!!exporting}>
            {exporting === 'pdf' ? '⏳ Generating…' : '↓ Export PDF'}
          </button>
          <button className="btn-sm" onClick={() => handleExport('csv')} disabled={!!exporting}>
            {exporting === 'csv' ? '⏳ Generating…' : '↓ Export CSV'}
          </button>
        </div>
      )}

      {/* ── Metric cards ─────────────────────────────────── */}
      <div className="g4" style={{ marginBottom: 12 }} role="region" aria-label="Summary metrics">
        <div className="metric">
          <div className="lbl">Total gross earnings</div>
          <div className="val" style={{ color: 'var(--green)' }}>
            ${result.totalPay.toFixed(2)}
          </div>
        </div>
        <div className="metric">
          <div className="lbl">Ordinary hours</div>
          <div className="val">{(ordinaryHrs || result.totalHours).toFixed(2)} h</div>
          {result.fnOtHrs > 0 && (
            <div className="sub" style={{ color: 'var(--amber)' }}>
              +{result.fnOtHrs.toFixed(2)} h fn OT
            </div>
          )}
        </div>
        <div className="metric">
          <div className="lbl">Overtime hours</div>
          <div className="val">{otHrs.toFixed(2)} h</div>
        </div>
        {adoPayout > 0 ? (
          <div className="metric">
            <div className="lbl">ADO payout</div>
            <div className="val" style={{ color: 'var(--accent)' }}>${adoPayout.toFixed(2)}</div>
            <div className="sub">+4.00 h · short fortnight</div>
          </div>
        ) : (
          <div className="metric">
            <div className="lbl">Fortnight type</div>
            <div className="val" style={{ fontSize: 18, paddingTop: 4 }}>
              {result.fortnightType === 'short' ? '⚡ Short' : '📋 Long'}
            </div>
          </div>
        )}
      </div>

      {/* ── Payslip-format breakdown ──────────────────────── */}
      {fnComps.length > 0 && (
        <div className="card">
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Payslip-format breakdown</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              v3.12 — matches Sydney Trains payroll line items
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table aria-label="Payslip breakdown" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>Date</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>EA ref</th>
                  <th>Units</th>
                  <th>Rate</th>
                  <th className="text-right" style={{ paddingRight: 20 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {fnComps.map((c: PayComponent, idx: number) => {
                  const dateLabel = c.date
                    ? fmtDateShort(parseDate(c.date))
                    : <em style={{ color: 'var(--text3)' }}>fortnight</em>
                  return (
                    <tr key={idx}>
                      <td style={{ paddingLeft: 20, fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {dateLabel}
                      </td>
                      <td>
                        <code style={{ ...codeStyle(c.code) }}>{c.code}</code>
                      </td>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="ea-ref">{c.ea}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{c.hrs}</td>
                      <td className="ea-ref">{c.rate}</td>
                      <td className="text-right" style={{
                        paddingRight: 20,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        ${c.amount.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="row-total">
                  <td style={{ paddingLeft: 20 }} colSpan={6}>
                    <strong>Total Gross Earnings</strong>
                  </td>
                  <td className="text-right" style={{
                    paddingRight: 20,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--green)',
                  }}>
                    <strong>${result.totalPay.toFixed(2)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per-day detail ────────────────────────────────── */}
      <div className="card">
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Per-day detail</div>
        </div>
        <div style={{ padding: '0 20px' }}>
          {result.days.map((dr: any) => {
            if (dr.dayType === 'off') return null
            if (dr.dayType === 'ado' && dr.totalPay === 0 && (!dr.components || dr.components.length === 0)) return null
            const d = parseDate(dr.date)
            return (
              <div key={dr.date} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{fmtDateShort(d)}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{dr.diag}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 13, fontWeight: 600,
                    fontFamily: 'var(--font-mono)', color: 'var(--green)',
                  }}>
                    {dr.hours.toFixed(2)} h → ${dr.totalPay.toFixed(2)}
                  </span>
                </div>
                {dr.components && dr.components.length > 0 && (
                  <table>
                    <thead>
                      <tr>
                        <th>Component</th><th>Code</th><th>EA</th>
                        <th>Units</th><th>Rate</th><th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dr.components.map((c: PayComponent, j: number) => (
                        <tr key={j} className={c.cls === 'pen-row' ? 'row-pen' : c.cls === 'km-row' ? 'row-km' : ''}>
                          <td>{c.name}</td>
                          <td><code style={{ ...codeStyle(c.code) }}>{c.code}</code></td>
                          <td className="ea-ref">{c.ea}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{c.hrs}</td>
                          <td className="ea-ref">{c.rate}</td>
                          <td className="text-right" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            ${c.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {dr.flags && dr.flags.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {dr.flags.map((f: string, j: number) => (
                      <span key={j} className={`flag-chip${f.includes('ALERT') || f.includes('⚠') ? ' err' : ''}`}>
                        {f.includes('⚠') ? '' : '⚑ '}{f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Audit flags ──────────────────────────────────── */}
      {result.audit?.flags?.length > 0 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Audit flags</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
            {result.audit.flags.map((f: string, i: number) => (
              <li key={i} style={{
                color: f.includes('ALERT') || f.includes('⚠') ? 'var(--amber)' : 'var(--text2)',
              }}>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
