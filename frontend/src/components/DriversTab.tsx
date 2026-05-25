import { useEffect, useState, useCallback } from 'react'
import { useFortnightContext } from '../context/FortnightContext'

/**
 * v3.33 — Admin "Drivers" tab.
 *
 * Manages the employee-ID allowlist via the v3.31 admin endpoints:
 *   GET    /api/admin/employees            list
 *   POST   /api/admin/employees            add
 *   DELETE /api/admin/employees/{id}       remove
 *   POST   /api/admin/employees/{id}/unlock  clear lockout
 *   GET    /api/admin/audit?employee_id=…  recent attempts
 *
 * Admin-gated by X-Admin-Password header (same pattern as the other
 * /api/admin/* endpoints).  Lives behind the v3.29 admin-tab gate so
 * it's only reachable when admin is signed in.
 */
interface Employee {
  employee_id: string
  label?: string | null
  created_by?: string | null
  created_at: string
  locked_until?: string | null
  failed_attempts: number
  last_failed_at?: string | null
  last_login_at?: string | null
}

interface AuditAttempt {
  employee_id: string
  ip_address?: string | null
  user_agent?: string | null
  result: string
  attempted_at: string
}

export default function DriversTab() {
  const ctx = useFortnightContext()
  const pw = ctx.adminPassword

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  const [newId, setNewId]       = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding]     = useState(false)

  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [audit, setAudit]             = useState<AuditAttempt[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const authHeaders = useCallback(
    () => (pw ? { 'X-Admin-Password': pw } : ({} as Record<string, string>)),
    [pw],
  )

  const refresh = useCallback(async () => {
    if (!pw) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/employees', { headers: authHeaders() })
      if (!r.ok) {
        const e = await r.json().catch(() => ({ detail: 'Failed' }))
        throw new Error(e.detail || `HTTP ${r.status}`)
      }
      const data = await r.json()
      setEmployees(data.employees || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [authHeaders, pw])

  useEffect(() => { refresh() }, [refresh])

  function flashSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 2500)
  }

  async function addEmployee() {
    const eid = newId.trim()
    setError(null)
    if (!/^\d{8}$/.test(eid)) {
      setError('Employee ID must be exactly 8 digits.')
      return
    }
    setAdding(true)
    try {
      const r = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: eid, label: newLabel.trim() || null }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
      if (data.added) {
        flashSuccess(`Added employee ${eid}.`)
      } else {
        flashSuccess(`Employee ${eid} was already on the allowlist.`)
      }
      setNewId(''); setNewLabel('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function removeEmployee(eid: string) {
    if (!confirm(`Remove ${eid} from the allowlist?  This driver will no longer be able to sign in.  Their audit-log history is preserved.`)) return
    setError(null)
    try {
      const r = await fetch(`/api/admin/employees/${eid}`, {
        method: 'DELETE', headers: authHeaders(),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
      flashSuccess(`Removed ${eid}.`)
      if (expandedRow === eid) setExpandedRow(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function unlockEmployee(eid: string) {
    setError(null)
    try {
      const r = await fetch(`/api/admin/employees/${eid}/unlock`, {
        method: 'POST', headers: authHeaders(),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`)
      flashSuccess(`Unlocked ${eid}.`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function toggleExpand(eid: string) {
    if (expandedRow === eid) {
      setExpandedRow(null)
      setAudit([])
      return
    }
    setExpandedRow(eid)
    setAuditLoading(true)
    try {
      const r = await fetch(`/api/admin/audit?employee_id=${encodeURIComponent(eid)}&limit=25`, {
        headers: authHeaders(),
      })
      const data = await r.json().catch(() => ({}))
      setAudit(data.attempts || [])
    } catch (e) {
      setAudit([])
      setError(`Audit fetch failed: ${(e as Error).message}`)
    } finally {
      setAuditLoading(false)
    }
  }

  // ── Format helpers ──────────────────────────────────────────────────────
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleString('en-AU', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }
  const isLocked = (e: Employee): boolean => {
    if (!e.locked_until) return false
    try { return new Date(e.locked_until) > new Date() } catch { return false }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!pw) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="note">🔐 Admin sign-in required to manage the driver allowlist.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Add driver card ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{
              width:22,height:22,borderRadius:'50%',background:'var(--accent)',
              color:'#fff',fontSize:11,fontWeight:700,display:'inline-flex',
              alignItems:'center',justifyContent:'center',flexShrink:0,
            }}>+</span>
            <span style={{fontWeight:600,fontSize:14}}>Add a driver</span>
          </div>
        </div>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:10,alignItems:'end'}}>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>
                Employee ID (8 digits)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                placeholder="00000000"
                value={newId}
                onChange={e => setNewId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onKeyDown={e => { if (e.key === 'Enter') addEmployee() }}
                style={{
                  width: '100%', padding: '8px 10px',
                  fontFamily: 'var(--font-mono)', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6,
                }}
              />
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>
                Label / name (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Mike Smith — Mt Vic"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addEmployee() }}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6,
                }}
              />
            </div>
            <button
              className="btn-primary"
              onClick={addEmployee}
              disabled={adding || newId.length !== 8}
              style={{padding: '8px 16px'}}
            >
              {adding ? '⏳' : 'Add'}
            </button>
          </div>
          {error && (
            <div className="alert alert-err" style={{marginTop:10,fontSize:12}}>
              ⚠ {error}
            </div>
          )}
          {success && (
            <div className="alert alert-info" style={{marginTop:10,fontSize:12,background:'var(--green-bg)',color:'var(--green-text)',border:'1px solid #8fcca8'}}>
              ✓ {success}
            </div>
          )}
        </div>
      </div>

      {/* ── Allowlist table ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{
              width:22,height:22,borderRadius:'50%',background:'var(--green)',
              color:'#fff',fontSize:11,fontWeight:700,display:'inline-flex',
              alignItems:'center',justifyContent:'center',flexShrink:0,
            }}>{employees.length}</span>
            <span style={{fontWeight:600,fontSize:14}}>Allowlisted drivers</span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="btn-sm"
              style={{marginLeft:'auto',fontSize:11}}
            >
              {loading ? '⏳' : '↻'} Refresh
            </button>
          </div>
        </div>
        <div className="card-body">
          {employees.length === 0 ? (
            <p className="note" style={{textAlign:'center',padding:'20px 0'}}>
              No drivers on the allowlist yet. Add one above to let them sign in.
            </p>
          ) : (
            <table style={{width:'100%',fontSize:12}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left'}}>Employee ID</th>
                  <th style={{textAlign:'left'}}>Label</th>
                  <th style={{textAlign:'left'}}>Created</th>
                  <th style={{textAlign:'left'}}>Last login</th>
                  <th style={{textAlign:'left'}}>Status</th>
                  <th style={{textAlign:'right'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => {
                  const locked = isLocked(e)
                  const expanded = expandedRow === e.employee_id
                  return (
                    <>
                      <tr
                        key={e.employee_id}
                        onClick={() => toggleExpand(e.employee_id)}
                        style={{cursor:'pointer'}}
                      >
                        <td style={{fontFamily:'var(--font-mono)',fontWeight:600}}>
                          {expanded ? '▾' : '▸'} {e.employee_id}
                        </td>
                        <td style={{color:'var(--text2)'}}>{e.label || '—'}</td>
                        <td style={{fontSize:11,color:'var(--text3)'}}>{fmtDate(e.created_at)}</td>
                        <td style={{fontSize:11,color:'var(--text3)'}}>{fmtDate(e.last_login_at)}</td>
                        <td>
                          {locked ? (
                            <span style={{
                              background:'rgba(232,140,30,.12)',color:'var(--amber-text)',
                              border:'1px solid #e2c08d',borderRadius:10,
                              padding:'2px 8px',fontSize:11,fontWeight:600,
                            }}>
                              🔒 Locked
                            </span>
                          ) : (
                            <span style={{
                              background:'var(--green-bg)',color:'var(--green-text)',
                              border:'1px solid #8fcca8',borderRadius:10,
                              padding:'2px 8px',fontSize:11,fontWeight:600,
                            }}>
                              ✓ Active
                            </span>
                          )}
                          {e.failed_attempts > 0 && (
                            <span style={{marginLeft:6,fontSize:10,color:'var(--text3)'}}>
                              {e.failed_attempts} fails
                            </span>
                          )}
                        </td>
                        <td style={{textAlign:'right'}} onClick={(ev) => ev.stopPropagation()}>
                          {locked && (
                            <button
                              className="btn-sm"
                              onClick={() => unlockEmployee(e.employee_id)}
                              style={{marginRight:4,fontSize:11}}
                              title="Clear lockout + failure counter"
                            >
                              🔓 Unlock
                            </button>
                          )}
                          <button
                            className="btn-sm"
                            onClick={() => removeEmployee(e.employee_id)}
                            style={{fontSize:11,color:'var(--red-text)'}}
                          >
                            🗑️ Remove
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${e.employee_id}-audit`}>
                          <td colSpan={6} style={{background:'var(--surface-2)',padding:12}}>
                            <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>
                              Recent login attempts (last 25, max 30-day retention)
                            </div>
                            {auditLoading ? (
                              <p className="note">Loading…</p>
                            ) : audit.length === 0 ? (
                              <p className="note">No attempts recorded.</p>
                            ) : (
                              <table style={{width:'100%',fontSize:11}}>
                                <thead>
                                  <tr>
                                    <th style={{textAlign:'left'}}>When</th>
                                    <th style={{textAlign:'left'}}>Result</th>
                                    <th style={{textAlign:'left'}}>IP</th>
                                    <th style={{textAlign:'left'}}>User agent</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {audit.map((a, i) => (
                                    <tr key={i}>
                                      <td style={{fontSize:10,color:'var(--text3)'}}>{fmtDate(a.attempted_at)}</td>
                                      <td>
                                        <span style={resultChipStyle(a.result)}>{a.result}</span>
                                      </td>
                                      <td style={{fontFamily:'var(--font-mono)',fontSize:10}}>{a.ip_address || '—'}</td>
                                      <td style={{fontSize:10,color:'var(--text3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                        {a.user_agent || '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <p className="note" style={{margin:0}}>
            <strong>How drivers sign in:</strong> share the URL with your allowlisted drivers; they enter their 8-digit employee ID on the login screen and get instant access.  No password is set — the ID alone is the credential.
          </p>
          <p className="note" style={{marginTop:6}}>
            <strong>Rate limit + lockout:</strong> 5 failed sign-in attempts per IP per hour return HTTP 429.  10 failed attempts on a specific ID within 24 hours auto-lock that ID for 24 hours; admin can unlock anytime via the 🔓 button.
          </p>
          <p className="note" style={{marginTop:6}}>
            <strong>Audit retention:</strong> login attempts are kept for 30 days then auto-purged.  Click any row above to expand and view its recent activity.
          </p>
        </div>
      </div>
    </>
  )
}

function resultChipStyle(result: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
    fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
  }
  if (result === 'success') return { ...base, background: 'var(--green-bg)', color: 'var(--green-text)', border: '1px solid #8fcca8' }
  if (result === 'failed_rate_limited_ip' || result === 'failed_locked') {
    return { ...base, background: 'rgba(232,140,30,.12)', color: 'var(--amber-text)', border: '1px solid #e2c08d' }
  }
  return { ...base, background: '#fff4f4', color: '#b30000', border: '1px solid #f8c0c0' }
}
