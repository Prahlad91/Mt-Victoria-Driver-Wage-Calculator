import { useState } from 'react'
import { useFortnightContext } from '../context/FortnightContext'
import { parseDate, fmtDateShort } from '../utils/dateUtils'
import type { PayComponent } from '../types'

const API = (import.meta as any).env?.VITE_API_BASE || ''

export default function ResultsTab() {
  const ctx = useFortnightContext()
  const result = ctx.result
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null)

  if (!result) return (
    <div className="card">
      <p style={{color:'var(--text3)',fontSize:12}}>
        No result yet. Go to <strong>Daily Entry</strong> and click Calculate.
      </p>
    </div>
  )

  // ─── Payslip-format breakdown (v3.11) ────────────────────────────
  const fnComps = result.fortnight_components || []

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
      a.download = `wage_calc_${result.fortnight_start}.${kind}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(`Export failed: ${e.message}`)
    } finally {
      setExporting(null)
    }
  }

  const fnTypeBadge = result.fortnight_type === 'short'
    ? <span className="badge" style={{background:'var(--amber-bg)',color:'var(--amber-text)',marginLeft:8}}>⚡ SHORT</span>
    : <span className="badge" style={{background:'var(--blue-bg)',color:'var(--blue-text)',marginLeft:8}}>📋 LONG</span>

  const variance = result.audit?.payslip_variance
  const hasVariance = variance !== null && variance !== undefined

  return (
    <>
      {/* ── Header summary ───────────────────────────────────────── */}
      <div className="card">
        <h2>Fortnight pay summary {fnTypeBadge}</h2>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginTop:8}}>
          <div>
            <div style={{fontSize:11,color:'var(--text3)'}}>Fortnight start</div>
            <div style={{fontSize:18,fontWeight:600}}>{result.fortnight_start}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)'}}>Total hours worked</div>
            <div style={{fontSize:18,fontWeight:600}}>{result.total_hours.toFixed(2)}h</div>
            {result.fn_ot_hrs > 0 && (
              <div style={{fontSize:11,color:'var(--amber-text)'}}>
                ⚑ {result.fn_ot_hrs.toFixed(2)}h fortnight OT
              </div>
            )}
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)'}}>Gross total pay</div>
            <div style={{fontSize:24,fontWeight:700,color:'var(--green-text)'}}>
              ${result.total_pay.toFixed(2)}
            </div>
          </div>
        </div>

        {hasVariance && Math.abs(variance!) > 0.10 && (
          <div className="alert alert-info" style={{marginTop:10}}>
            <strong>Payslip variance:</strong> calculated ${result.total_pay.toFixed(2)} vs payslip total
            — difference ${Math.abs(variance!).toFixed(2)}{' '}
            {variance! > 0 ? '(possible underpayment)' : '(possible overpayment)'}.
          </div>
        )}

        <div style={{marginTop:12,display:'flex',gap:8}}>
          <button className="btn-primary" onClick={() => handleExport('pdf')} disabled={!!exporting}>
            {exporting === 'pdf' ? '⏳ Generating…' : '📄 Export PDF'}
          </button>
          <button onClick={() => handleExport('csv')} disabled={!!exporting}>
            {exporting === 'csv' ? '⏳ Generating…' : '📊 Export CSV'}
          </button>
        </div>
      </div>

      {/* ── Payslip-format breakdown (v3.11) ─────────────────────── */}
      {fnComps.length > 0 && (
        <div className="card">
          <h2>Payslip-format breakdown <span className="ea-ref">v3.11 — matches Sydney Trains payroll line items</span></h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Code</th>
                <th>Description</th>
                <th>EA ref</th>
                <th>Units</th>
                <th>Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {fnComps.map((c: PayComponent, i: number) => {
                const dateLabel = c.date
                  ? fmtDateShort(parseDate(c.date))
                  : <em style={{color:'var(--text3)'}}>fortnight</em>
                return (
                  <tr key={i} className={c.cls === 'pen-row' ? 'row-pen' : c.cls === 'km-row' ? 'row-km' : ''}>
                    <td style={{fontSize:11,color:'var(--text2)'}}>{dateLabel}</td>
                    <td><code>{c.code}</code></td>
                    <td>{c.name}</td>
                    <td style={{color:'var(--text3)',fontSize:11}}>{c.ea}</td>
                    <td>{c.hrs}</td>
                    <td style={{color:'var(--text3)',fontSize:11}}>{c.rate}</td>
                    <td className="text-right">${c.amount.toFixed(2)}</td>
                  </tr>
                )
              })}
              <tr className="row-total">
                <td colSpan={6}><strong>Total Gross Earnings</strong></td>
                <td className="text-right"><strong>${result.total_pay.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Per-day detail (drilldown) ──────────────────────────── */}
      <div className="card">
        <h2>Per-day detail</h2>
        {result.days.map(dr => {
          if (dr.day_type === 'off') return null
          if (dr.day_type === 'ado' && dr.total_pay === 0 && (!dr.components || dr.components.length === 0)) return null
          const d = parseDate(dr.date)
          return (
            <div key={dr.date} style={{marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                <strong>{fmtDateShort(d)}</strong>
                <span style={{fontSize:11,color:'var(--text3)'}}>{dr.diag}</span>
                <span style={{marginLeft:'auto',fontSize:13,fontWeight:600}}>
                  {dr.hours.toFixed(2)}h → ${dr.total_pay.toFixed(2)}
                </span>
              </div>
              {dr.components.length > 0 && (
                <table>
                  <thead>
                    <tr><th>Component</th><th>Code</th><th>EA</th><th>Units</th><th>Rate</th><th className="text-right">Amount</th></tr>
                  </thead>
                  <tbody>
                    {dr.components.map((c, j) => (
                      <tr key={j} className={c.cls === 'pen-row' ? 'row-pen' : c.cls === 'km-row' ? 'row-km' : ''}>
                        <td>{c.name}</td>
                        <td><code>{c.code}</code></td>
                        <td style={{color:'var(--text3)',fontSize:11}}>{c.ea}</td>
                        <td>{c.hrs}</td>
                        <td style={{color:'var(--text3)',fontSize:11}}>{c.rate}</td>
                        <td className="text-right">${c.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dr.flags.length > 0 && (
                <div style={{marginTop:4}}>
                  {dr.flags.map((f, j) => (
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

      {/* ── Audit flags ─────────────────────────────────────────── */}
      {result.audit && result.audit.flags && result.audit.flags.length > 0 && (
        <div className="card">
          <h2>Audit flags</h2>
          <ul style={{margin:0,paddingLeft:20,fontSize:12}}>
            {result.audit.flags.map((f: string, i: number) => (
              <li key={i} style={{color: f.includes('ALERT') || f.includes('⚠') ? 'var(--amber-text)' : 'var(--text2)', marginBottom:4}}>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
