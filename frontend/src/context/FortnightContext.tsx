import {
  createContext, useContext, useState, useCallback, useMemo,
  useEffect, useRef, ReactNode,
} from 'react'
import type {
  DayState, RateConfig, PayrollCodes,
  CalculateResponse, RosterUploadState, PayslipUploadState,
  ParsedRosterData, ParsedScheduleData, DiagramInfo, SimpleUploadState,
  TimeSource, AssocChart,
} from '../types'
import { DEFAULT_CONFIG, DEFAULT_CODES, previewDay } from '../utils/calcPreview'
import { ROSTER } from '../constants/roster'
import { toSunday, makeFortnight, parseDate } from '../utils/dateUtils'

const LS_CFG     = 'mvwc_config'
const LS_CODES   = 'mvwc_codes'
const LS_UNASSOC = 'mvwc_unassoc'
const LS_MR      = 'mvwc_master_roster'
const LS_FR      = 'mvwc_fn_roster'
const LS_WD      = 'mvwc_weekday_schedule'
const LS_WE      = 'mvwc_weekend_schedule'
const LS_AC      = 'mvwc_assoc_chart'      // v3.12: Assoc/Un-assoc payments chart
const LS_VERSION = 'mvwc_cache_version'

// ─── Default Assoc/Un-assoc chart — Mt Victoria depot, effective 19-04-26
// (v3.24, replaces the Oct-2025 baked-in chart with the values from
// `docs/111616112.pdf`).  Only diagrams that appear on the chart are listed;
// all others default to zero un-assoc / assoc-pay / build-up, so the 1454
// build-up reduces to the standard EA 146.4 formula.
//
// Column mapping from the physical chart:
//   unAssocMins       ← "Un-Associated Payment Time"
//   assocPaymentMins  ← "Associated Payment Time"
//   assocCalcMins     ← "Associated Calculation" (= un_assoc + assoc_pay + dist_pay)
//   buildUpMins       ← "Total Build Up Over Shift Length"  (used directly when > 0)
//
// New chart's notable changes vs Oct-2025: removed 3154, 3159, 3160, 3164, 3653;
// added 3151, 3156, 3158, 3162, 3167, 3169, 3171, 3651, 3652, 3658, 3659, 3661,
// 3662, 3664; substantial value shifts on 3155, 3161, 3165, 3168, 3657, 3660.
const DEFAULT_ASSOC_CHART: AssocChart = {
  // Weekday diagrams (effective 19-04-26)
  '3151': { unAssocMins: 0,   assocPaymentMins: 7,  assocCalcMins: 427, buildUpMins: 0   },
  '3153': { unAssocMins: 160, assocPaymentMins: 0,  assocCalcMins: 460, buildUpMins: 0   },
  '3155': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 470, buildUpMins: 0   },
  '3156': { unAssocMins: 20,  assocPaymentMins: 0,  assocCalcMins: 440, buildUpMins: 0   },
  '3158': { unAssocMins: 39,  assocPaymentMins: 0,  assocCalcMins: 459, buildUpMins: 0   },
  '3161': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 51  },
  '3162': { unAssocMins: 80,  assocPaymentMins: 0,  assocCalcMins: 500, buildUpMins: 0   },
  '3165': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 480, buildUpMins: 0   },
  '3167': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 420, buildUpMins: 0   },
  '3168': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 7   },
  '3169': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 480, buildUpMins: 0   },
  '3171': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 35  },
  // Weekend diagrams (effective 19-04-26)
  '3651': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 420, buildUpMins: 0   },
  '3652': { unAssocMins: 22,  assocPaymentMins: 89, assocCalcMins: 591, buildUpMins: 7   },
  '3655': { unAssocMins: 10,  assocPaymentMins: 0,  assocCalcMins: 550, buildUpMins: 0   },
  '3656': { unAssocMins: 10,  assocPaymentMins: 0,  assocCalcMins: 550, buildUpMins: 0   },
  '3657': { unAssocMins: 50,  assocPaymentMins: 0,  assocCalcMins: 590, buildUpMins: 81  },
  '3658': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 0   },
  '3659': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 0   },
  '3660': { unAssocMins: 217, assocPaymentMins: 0,  assocCalcMins: 697, buildUpMins: 238 },
  '3661': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 2   },
  '3662': { unAssocMins: 0,   assocPaymentMins: 0,  assocCalcMins: 540, buildUpMins: 1   },
  '3664': { unAssocMins: 50,  assocPaymentMins: 0,  assocCalcMins: 470, buildUpMins: 0   },
}

// PRD §6.10 — cache invalidation. v3.11 forces clear because v3.10 and earlier
// had a Pydantic camelCase bug that returned $0 for all calculations and bad
// schedule cache from the v3.7 column-interleave parser.
// v3.15: bumped from 3.12 → 3.15 to invalidate cached fortnight + master roster
// data parsed by the pre-v3.14 anchor mapping. Without clearing LS_FR / LS_MR
// the user keeps seeing shifted days for line 209 etc. (Wed shows Fri's data)
// because the cached ParsedRosterData was produced by the buggy old parser.
// v3.24: bumped from 3.15 → 3.24 — DEFAULT_ASSOC_CHART replaced with the
// 19-04-26 chart values; users with a localStorage copy of the Oct-2025
// chart need to drop it so they pick up the new built-in defaults.
// v3.41: bumped from 3.24 → 3.41 — 3155 unAssocMins corrected to 0 (was 50).
// Any cached chart in localStorage will be cleared so users get the updated DEFAULT.
const CACHE_SCHEMA_VERSION = '3.41'

if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage.getItem(LS_VERSION)
    if (stored !== CACHE_SCHEMA_VERSION) {
      window.localStorage.removeItem(LS_WD)
      window.localStorage.removeItem(LS_WE)
      // v3.15: also clear roster caches so the new parser output replaces the old.
      window.localStorage.removeItem(LS_MR)
      window.localStorage.removeItem(LS_FR)
      // v3.24: clear cached assoc/un-assoc chart so users pick up the new
      // 19-04-26 baked-in DEFAULT_ASSOC_CHART instead of their stale copy.
      window.localStorage.removeItem(LS_AC)
      window.localStorage.setItem(LS_VERSION, CACHE_SCHEMA_VERSION)
      // eslint-disable-next-line no-console
      console.info(
        `[mvwc] Cache schema bumped to ${CACHE_SCHEMA_VERSION} ` +
        `(was ${stored ?? 'unset'}). Cleared cached roster + schedule data — please re-upload them in the Setup tab.`
      )
    }
  } catch { /* localStorage unavailable */ }
}

// ─── Session id + admin token (v3.26 — server bootstrap, see PRD §6.12) ────
//
// `mvwc_session_id` is a v4 UUID generated once per browser and persisted in
// localStorage.  Sent as `X-Session-Id` header on every fortnight-roster
// request so the server can scope rows to this browser (per v3.23 — fortnight
// roster is user-uploaded, each user owns their own row).
//
// `mvwc_admin_password` lives in sessionStorage (NOT localStorage) — cleared
// when the browser tab closes.  This is a stopgap before the proper JWT
// auth PR; secrets-in-sessionStorage are vulnerable to XSS but the surface is
// minimal because we don't render arbitrary HTML.  v3.28 renamed from
// `mvwc_admin_token` so currently-signed-in admins re-enter their password
// once on next page load (the rename forces a fresh sign-in).

const LS_SID            = 'mvwc_session_id'
const SS_ADMIN_PASSWORD = 'mvwc_admin_password'

function _newSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return (crypto as Crypto & { randomUUID: () => string }).randomUUID()
    }
  } catch { /* fall through */ }
  // Fallback: 32-char hex from Math.random (less entropy but unique enough)
  const hex = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)]
  return s
}

function getSessionId(): string {
  try {
    let sid = localStorage.getItem(LS_SID)
    if (!sid) {
      sid = _newSessionId()
      localStorage.setItem(LS_SID, sid)
    }
    return sid
  } catch {
    // localStorage blocked (e.g. private mode) — return a per-call UUID; the
    // user won't have persistent server-side fortnight roster but everything
    // else still works.
    return _newSessionId()
  }
}

function getAdminPassword(): string | null {
  try { return sessionStorage.getItem(SS_ADMIN_PASSWORD) } catch { return null }
}
function setAdminPasswordStorage(password: string | null) {
  try {
    if (password) sessionStorage.setItem(SS_ADMIN_PASSWORD, password)
    else sessionStorage.removeItem(SS_ADMIN_PASSWORD)
  } catch { /* ignore */ }
}

// v3.32 — driver JWT (employee-ID login).  Stored in localStorage so it
// survives tab close (drivers don't want to re-enter their ID daily).  The
// JWT carries the employee ID + role + exp, so we don't need a separate
// "user" record in localStorage.

const LS_AUTH_JWT = 'mvwc_auth_jwt'

interface JwtClaims {
  sub: string          // employee_id
  role: string         // 'driver' | 'admin'
  iat: number          // issued-at (unix seconds)
  exp: number          // expires-at (unix seconds)
}

function _decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    // base64url → base64 → atob
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      payload.length + (4 - payload.length % 4) % 4, '=',
    )
    return JSON.parse(atob(b64)) as JwtClaims
  } catch { return null }
}

function _isExpired(claims: JwtClaims | null): boolean {
  if (!claims?.exp) return true
  // 5-second clock-skew slack
  return claims.exp <= (Date.now() / 1000) - 5
}

function getAuthJwt(): string | null {
  try {
    const t = localStorage.getItem(LS_AUTH_JWT)
    if (!t) return null
    if (_isExpired(_decodeJwt(t))) {
      localStorage.removeItem(LS_AUTH_JWT)
      return null
    }
    return t
  } catch { return null }
}

function setAuthJwtStorage(token: string | null) {
  try {
    if (token) localStorage.setItem(LS_AUTH_JWT, token)
    else localStorage.removeItem(LS_AUTH_JWT)
  } catch { /* ignore */ }
}


function fromLS<T>(k: string, fb: T): T {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb } catch { return fb }
}
function toLS(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch {}
}
function restoreCached<T>(lsKey: string): SimpleUploadState<T> {
  const cached = fromLS<T | null>(lsKey, null)
  if (cached) return { status: 'success', result: cached, error: null }
  return { status: 'idle', result: null, error: null }
}

const isSwinger = (line: number) => line >= 201
export type RosterSource = 'builtin' | 'master' | 'fortnight'

function extractDiagNum(diag: string | null | undefined): string | null {
  if (!diag) return null
  if (diag === 'OFF' || diag === 'ADO' || diag === 'WORKED') return null
  const first = diag.trim().split(/\s+/)[0]
  return /^\d{3,4}$/.test(first) ? first : null
}

interface Ctx {
  rosterLine: number; fnStart: string; publicHolidays: string[]; payslipTotal: number | null
  fnLoaded: boolean; fnType: 'short' | 'long' | null; rosterSource: RosterSource
  /** Crew member name from the fortnight roster, if the loaded line came from
   *  a fortnight-roster upload with a crew-name column.  null otherwise. */
  loadedCrewName: string | null
  days: DayState[]; previews: ReturnType<typeof previewDay>[]
  config: RateConfig; codes: PayrollCodes; unassocAmt: number
  setConfig: (p: Partial<RateConfig>) => void; setCodes: (p: Partial<PayrollCodes>) => void
  setUnassocAmt: (n: number) => void; saveConfig: () => void; saveCodes: () => void
  rosterUpload: RosterUploadState; payslipUpload: PayslipUploadState
  masterRosterUpload:    SimpleUploadState<ParsedRosterData>
  fnRosterUpload:        SimpleUploadState<ParsedRosterData>
  weekdayScheduleUpload: SimpleUploadState<ParsedScheduleData>
  weekendScheduleUpload: SimpleUploadState<ParsedScheduleData>
  // v3.12: assoc/un-assoc chart
  assocChart: AssocChart; assocChartIsCustom: boolean
  loadAssocChartCsv: (csvText: string) => string | null  // returns error or null
  loadAssocChartDirect: (chart: AssocChart) => void      // v3.37: direct from server upload
  resetAssocChart: () => void
  // v3.26: admin sign-in (sessionStorage-backed) + per-browser session id.
  // v3.28: renamed adminToken → adminPassword (was a token-named field but
  // semantically a human-memorable password since v3.28).
  adminPassword: string | null
  setAdminPassword: (pw: string | null) => void
  sessionId: string
  // v3.32: driver auth (employee ID → JWT in localStorage).
  authJwt: string | null
  authUser: { sub: string; role: string; exp: number } | null
  signIn: (token: string) => void
  signOut: () => void
  result: CalculateResponse | null; calculating: boolean; calcError: string | null
  loadLine:            (line: number, start: string, phs: string[], psTotal: number | null) => string | null
  fillAllRostered:     () => void
  copyScheduledToActual: (i: number) => void
  setDay:              (i: number, patch: Partial<DayState>) => void
  applyManualDiag:     (i: number, diagInput: string) => void
  markWorkedOnOff:     (i: number) => void
  resetDay:            (i: number) => void
  applyUploadedRoster: () => void
  uploadRoster:         (file: File) => Promise<void>
  uploadPayslip:        (file: File) => Promise<void>
  uploadMasterRoster:    (file: File) => Promise<void>
  uploadFnRoster:        (file: File) => Promise<void>
  uploadWeekdaySchedule: (file: File) => Promise<void>
  uploadWeekendSchedule: (file: File) => Promise<void>
  calculate: () => Promise<boolean>; exportPdf: () => Promise<void>; exportCsv: () => Promise<void>
}

const Context = createContext<Ctx | null>(null)
export function useFortnightContext() {
  const c = useContext(Context)
  if (!c) throw new Error('Must be inside FortnightProvider')
  return c
}

export function FortnightProvider({ children }: { children: ReactNode }) {
  const [rosterLine, setRosterLine]     = useState(1)
  const [fnStart,    setFnStart]        = useState('')
  const [publicHolidays, setPHs]        = useState<string[]>([])
  const [payslipTotal,   setPsTotal]    = useState<number | null>(null)
  const [fnLoaded,       setFnLoaded]   = useState(false)
  const [days,           setDays]       = useState<DayState[]>([])
  const [rosterSource, setRosterSource] = useState<RosterSource>('builtin')
  const [loadedCrewName, setLoadedCrewName] = useState<string | null>(null)

  const [config, setConfigState] = useState<RateConfig>(() => ({ ...DEFAULT_CONFIG, ...fromLS(LS_CFG, {}) }))
  const [codes,  setCodesState]  = useState<PayrollCodes>(() => ({ ...DEFAULT_CODES, ...fromLS(LS_CODES, {}) }))
  const [unassocAmt, setUnassocAmt] = useState<number>(() => fromLS(LS_UNASSOC, 0))

  // v3.12: assoc/un-assoc chart — loaded from localStorage, falling back to built-in defaults
  const [assocChart,       setAssocChart]       = useState<AssocChart>(() => fromLS<AssocChart | null>(LS_AC, null) ?? DEFAULT_ASSOC_CHART)
  const [assocChartIsCustom, setAssocChartIsCustom] = useState<boolean>(() => fromLS<AssocChart | null>(LS_AC, null) !== null)

  const [rosterUpload,  setRU] = useState<RosterUploadState>({ status: 'idle', result: null, error: null, applied: false })
  const [payslipUpload, setPU] = useState<PayslipUploadState>({ status: 'idle', result: null, error: null })

  const [masterRosterUpload,    setMR] = useState<SimpleUploadState<ParsedRosterData>>(() => restoreCached<ParsedRosterData>(LS_MR))
  const [fnRosterUpload,        setFR] = useState<SimpleUploadState<ParsedRosterData>>(() => restoreCached<ParsedRosterData>(LS_FR))
  const [weekdayScheduleUpload, setWD] = useState<SimpleUploadState<ParsedScheduleData>>(() => restoreCached<ParsedScheduleData>(LS_WD))
  const [weekendScheduleUpload, setWE] = useState<SimpleUploadState<ParsedScheduleData>>(() => restoreCached<ParsedScheduleData>(LS_WE))

  const [result,      setResult]    = useState<CalculateResponse | null>(null)
  const [calculating, setCalcing]   = useState(false)
  const [calcError,   setCalcError] = useState<string | null>(null)

  // v3.26: admin password state.  Reads sessionStorage on mount; setter syncs
  // both React state and sessionStorage so the modal in App.tsx stays in lock-step.
  // v3.28: renamed from adminToken — the secret is now a human-chosen password,
  // not a random 64-char hex token.
  const [adminPassword, setAdminPasswordState] = useState<string | null>(() => getAdminPassword())
  const setAdminPassword = useCallback((pw: string | null) => {
    setAdminPasswordStorage(pw)
    setAdminPasswordState(pw)
  }, [])

  // v3.32: driver JWT + decoded claims.  authJwt is the raw token attached
  // to API requests as Authorization: Bearer; authUser is the decoded
  // identity for the UI (employee_id, role).  signIn/signOut sync both
  // React state and localStorage.
  const [authJwt, setAuthJwtState]   = useState<string | null>(() => getAuthJwt())
  const [authUser, setAuthUserState] = useState<JwtClaims | null>(() => {
    const t = getAuthJwt()
    return t ? _decodeJwt(t) : null
  })
  const signIn = useCallback((token: string) => {
    setAuthJwtStorage(token)
    setAuthJwtState(token)
    setAuthUserState(_decodeJwt(token))
  }, [])
  const signOut = useCallback(() => {
    setAuthJwtStorage(null)
    setAuthJwtState(null)
    setAuthUserState(null)
  }, [])
  // Session id is generated lazily on first call to getSessionId(); exposed
  // here for any consumer (e.g. SetupTab swinger-validation message) that
  // wants to surface it.
  const sessionId = useMemo(() => getSessionId(), [])

  const wdSchedRef = useRef<ParsedScheduleData | null>(null)
  const weSchedRef = useRef<ParsedScheduleData | null>(null)
  wdSchedRef.current = weekdayScheduleUpload.result
  weSchedRef.current = weekendScheduleUpload.result

  const previews = useMemo(
    () => days.map(d => previewDay(d, config, codes, unassocAmt, assocChart)),
    [days, config, codes, unassocAmt, assocChart],
  )
  // v3.11: short fortnight detection now considers BOTH diag === 'ADO' AND wasAdo
  // (the latter handles cases where user worked an ADO day as WOBOD).
  const fnType = useMemo<'short' | 'long' | null>(
    () => !fnLoaded ? null : days.some(d => d.diag === 'ADO' || d.wasAdo) ? 'short' : 'long',
    [fnLoaded, days],
  )

  const setConfig  = useCallback((p: Partial<RateConfig>)  => setConfigState(prev => ({ ...prev, ...p })), [])
  const setCodes   = useCallback((p: Partial<PayrollCodes>) => setCodesState(prev => ({ ...prev, ...p })), [])
  const saveConfig = useCallback(() => { toLS(LS_CFG, config); toLS(LS_UNASSOC, unassocAmt) }, [config, unassocAmt])
  const saveCodes  = useCallback(() => toLS(LS_CODES, codes), [codes])

  /** Parse a CSV upload for the assoc/unassoc chart.
   *  Columns: diagram, un_assoc_mins, assoc_payment_mins[, assoc_calc_mins, build_up_mins]
   *  Header row optional. Returns null on success, error message on failure. */
  const loadAssocChartCsv = useCallback((csvText: string): string | null => {
    try {
      const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
      if (!lines.length) return 'Empty file'
      const chart: AssocChart = {}
      let skipped = 0
      for (const line of lines) {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        if (!cols[0]) continue
        // Skip header rows
        if (/[a-zA-Z]/.test(cols[0])) { skipped++; continue }
        const diag     = cols[0]
        const unMin    = parseInt(cols[1] ?? '0', 10) || 0
        const assMin   = parseInt(cols[2] ?? '0', 10) || 0
        // Optional cols 4+5: assoc_calc_mins, build_up_mins
        const calcMin  = cols[3] !== undefined ? (parseInt(cols[3], 10) || 0) : undefined
        const buildMin = cols[4] !== undefined ? (parseInt(cols[4], 10) || 0) : undefined
        if (unMin > 0 || assMin > 0 || (calcMin ?? 0) > 0 || (buildMin ?? 0) > 0) {
          chart[diag] = {
            unAssocMins: unMin, assocPaymentMins: assMin,
            ...(calcMin  !== undefined ? { assocCalcMins: calcMin  } : {}),
            ...(buildMin !== undefined ? { buildUpMins:   buildMin } : {}),
          }
        }
      }
      if (!Object.keys(chart).length && skipped === lines.length) {
        return 'No valid rows found (header-only or all zeros?)'
      }
      toLS(LS_AC, chart)
      setAssocChart(chart)
      setAssocChartIsCustom(true)
      return null
    } catch (e) {
      return `Parse error: ${(e as Error).message}`
    }
  }, [])

  const resetAssocChart = useCallback(() => {
    try { localStorage.removeItem(LS_AC) } catch {}
    setAssocChart(DEFAULT_ASSOC_CHART)
    setAssocChartIsCustom(false)
  }, [])

  // v3.37: Direct chart setter — used by SetupTab after a successful admin upload
  // so the parsed server response is applied without a CSV roundtrip (which
  // previously discarded entries where only assocCalcMins > 0).
  const loadAssocChartDirect = useCallback((chart: AssocChart) => {
    toLS(LS_AC, chart)
    setAssocChart(chart)
    setAssocChartIsCustom(true)
  }, [])

  const findInBothSchedules = useCallback((
    diagNum: string,
    wd: ParsedScheduleData | null, we: ParsedScheduleData | null,
  ): DiagramInfo | null => {
    if (!diagNum) return null
    if (wd?.diagrams[diagNum]) return wd.diagrams[diagNum]
    if (we?.diagrams[diagNum]) return we.diagrams[diagNum]
    return null
  }, [])

  const findByDow = useCallback((
    diagNum: string | null, dow: number,
    wd: ParsedScheduleData | null, we: ParsedScheduleData | null,
  ): DiagramInfo | null => {
    if (!diagNum) return null
    const sched = (dow === 0 || dow === 6) ? we : wd
    return sched?.diagrams[diagNum] ?? null
  }, [])

  // Reverse lookup: when the master roster has no diagram number, match by sign-on+sign-off.
  // Uses exact match first, then ±2 min tolerance (master roster can differ by 1 min from schedule).
  const findByTimes = useCallback((
    rStart: string | null, rEnd: string | null, dow: number,
    wd: ParsedScheduleData | null, we: ParsedScheduleData | null,
  ): { diagNum: string; info: DiagramInfo } | null => {
    if (!rStart || !rEnd) return null
    const sched = (dow === 0 || dow === 6) ? we : wd
    if (!sched) return null
    for (const [diagNum, info] of Object.entries(sched.diagrams)) {
      if (info.sign_on === rStart && info.sign_off === rEnd) return { diagNum, info }
    }
    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
    const s0 = toMins(rStart), e0 = toMins(rEnd)
    for (const [diagNum, info] of Object.entries(sched.diagrams)) {
      if (!info.sign_on || !info.sign_off) continue
      if (Math.abs(toMins(info.sign_on) - s0) <= 5 && Math.abs(toMins(info.sign_off) - e0) <= 5)
        return { diagNum, info }
    }
    return null
  }, [])

  // v3.26: server bootstrap.  On mount, fetch admin-published artifacts
  // (master roster, weekday/weekend schedule, assoc chart) and this browser's
  // most recent fortnight roster (scoped by X-Session-Id) from the v3.22 +
  // v3.23 endpoints.  Any 200 response hydrates state and overwrites any
  // stale localStorage cache.  404 / network errors are silently ignored so
  // the app degrades gracefully to localStorage / built-ins.
  useEffect(() => {
    let cancelled = false
    const sid = getSessionId()

    async function tryFetch<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
      try {
        const r = await fetch(url, { headers })
        if (!r.ok) return null
        return await r.json() as T
      } catch { return null }
    }

    ;(async () => {
      // Admin-published (public reads, no auth required)
      const [master, weekday, weekend, chart] = await Promise.all([
        tryFetch<ParsedRosterData>('/api/roster/current'),
        tryFetch<ParsedScheduleData>('/api/schedule/current?type=weekday'),
        tryFetch<ParsedScheduleData>('/api/schedule/current?type=weekend'),
        tryFetch<{ chart: Record<string, AssocChart[string]> }>('/api/chart/current'),
      ])
      if (cancelled) return
      if (master) {
        toLS(LS_MR, master)
        setMR({ status: 'success', result: master, error: null, fromServer: true })
      }
      if (weekday) {
        toLS(LS_WD, weekday)
        setWD({ status: 'success', result: weekday, error: null, fromServer: true })
      }
      if (weekend) {
        toLS(LS_WE, weekend)
        setWE({ status: 'success', result: weekend, error: null, fromServer: true })
      }
      if (chart?.chart && Object.keys(chart.chart).length) {
        toLS(LS_AC, chart.chart)
        setAssocChart(chart.chart as AssocChart)
        setAssocChartIsCustom(true)
      }
      // User fortnight roster (scoped to this browser's session id)
      const fn = await tryFetch<ParsedRosterData>('/api/fortnight-roster/current', { 'X-Session-Id': sid })
      if (cancelled) return
      if (fn) {
        toLS(LS_FR, fn)
        setFR({ status: 'success', result: fn, error: null, fromServer: true })
      }
    })()
    return () => { cancelled = true }
  // Run once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!fnLoaded || days.length === 0) return
    const wd = weekdayScheduleUpload.result
    const we = weekendScheduleUpload.result
    if (!wd && !we) return

    setDays(prev => prev.map(d => {
      if (d.diag === 'OFF' || d.diag === 'ADO' || d.timeSource === 'manual') return d
      // Actual times are kept in sync unless the user has manually diverged them
      // (i.e. aStart no longer matches the currently-stored rStart).
      const actualUnchanged = !d.aStart || d.aStart === d.rStart
      const actualEndUnchanged = !d.aEnd || d.aEnd === d.rEnd
      const sched = findByDow(d.diagNum, d.dow, wd, we)
      if (sched) {
        return {
          ...d,
          rStart: sched.sign_on, rEnd: sched.sign_off,
          cm: sched.cm, rHrs: sched.r_hrs, km: sched.km,
          timeSource: 'schedule',
          aStart: actualUnchanged    ? sched.sign_on  : d.aStart,
          aEnd:   actualEndUnchanged ? sched.sign_off : d.aEnd,
        }
      }
      // Named-duty preservation (v3.15): skip findByTimes re-mapping for
      // non-numeric duties (SBY, AMV01, MSBYD3, DSP, …) — the roster names the
      // duty explicitly and we must not silently relabel it as a 4-digit
      // diagram that happens to share the same scheduled times.
      const diagStartsNumeric = /^\d/.test((d.diag || '').trim())
      const ts = diagStartsNumeric ? findByTimes(d.rStart, d.rEnd, d.dow, wd, we) : null
      if (!ts) return d
      return {
        ...d,
        diagNum: ts.diagNum,
        rStart: ts.info.sign_on, rEnd: ts.info.sign_off,
        cm: ts.info.cm, rHrs: ts.info.r_hrs, km: ts.info.km,
        timeSource: 'schedule',
        aStart: actualUnchanged    ? ts.info.sign_on  : d.aStart,
        aEnd:   actualEndUnchanged ? ts.info.sign_off : d.aEnd,
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdayScheduleUpload.result, weekendScheduleUpload.result])

  const loadLine = useCallback((
    line: number, start: string, phs: string[], psTotal: number | null,
  ): string | null => {
    // Point 7: swinger lines 201–214 require the fortnight roster.
    // The fortnight roster is the ONLY authoritative source for swinger duties;
    // falling back to master-roster or built-in data for these lines is wrong.
    if (isSwinger(line) && !fnRosterUpload.result) {
      return (
        `Line ${line} is a swinger line (201–214). ` +
        'Please upload the Fortnight Roster in Step 1 first — ' +
        'swinger duty assignments are not in the master roster.'
      )
    }

    const snapped = toSunday(start)
    const dates   = makeFortnight(snapped)
    const mrData  = masterRosterUpload.result
    const frData  = fnRosterUpload.result
    const wd      = weekdayScheduleUpload.result
    const we      = weekendScheduleUpload.result

    let source: RosterSource = 'builtin'
    let rosterEntries: ParsedRosterData['lines'][string] | undefined
    if (isSwinger(line)) {
      if (frData?.lines[String(line)])      { source = 'fortnight'; rosterEntries = frData.lines[String(line)] }
      else if (mrData?.lines[String(line)]) { source = 'master';    rosterEntries = mrData.lines[String(line)] }
    } else {
      if (mrData?.lines[String(line)])      { source = 'master';    rosterEntries = mrData.lines[String(line)] }
    }

    let newDays: DayState[]

    if (source !== 'builtin' && rosterEntries && rosterEntries.length === 14) {
      const isShort = rosterEntries.some(e => e.diag === 'ADO')
      newDays = rosterEntries.map((entry, i) => {
        const date = dates[i]; const d = parseDate(date); const dow = d.getDay()

        // PH days become PHNW regardless of what the roster says
        if (phs.includes(date)) {
          return {
            date, dow, ph: true,
            diag: 'PHNW', diagNum: null,
            rStart: null, rEnd: null, cm: false, rHrs: 8,
            aStart: '', aEnd: '',
            timeSource: 'none' as TimeSource, km: 0,
            claimLiftupLayback: false,
            wobod: false, leaveCat: 'PHNW',
            manualDiag: null, manualDiagInput: '', workedOnOff: false,
            isShortFortnight: isShort,
            wasAdo: entry.diag === 'ADO',
          }
        }

        let diagNum = extractDiagNum(entry.diag)
        const sched = findByDow(diagNum, dow, wd, we)

        let timeSource: TimeSource
        let rStart: string | null, rEnd: string | null, cm: boolean, rHrs: number, km: number

        if (entry.diag === 'OFF' || entry.diag === 'ADO') {
          timeSource = 'none'
          rStart = null; rEnd = null; cm = false; rHrs = 0; km = 0
        } else if (sched) {
          timeSource = 'schedule'
          rStart = sched.sign_on; rEnd = sched.sign_off; cm = sched.cm
          rHrs = sched.r_hrs; km = sched.km
        } else {
          // Named-duty preservation (v3.15): if the roster explicitly names a
          // non-numeric duty (SBY, AMV01, MSBYD3, DSP, training codes …), the
          // roster is authoritative for the duty type — don't silently re-map
          // to a 4-digit diagram just because the schedule has one with the
          // same sign-on/sign-off times.  findByTimes() is still used as a
          // recovery fallback for numeric diagrams that couldn't cleanly
          // parse their 4-digit number.
          const diagStartsNumeric = /^\d/.test(entry.diag.trim())
          const ts = diagStartsNumeric
            ? findByTimes(entry.r_start, entry.r_end, dow, wd, we)
            : null
          if (ts) {
            timeSource = 'schedule'
            diagNum = ts.diagNum
            rStart = ts.info.sign_on; rEnd = ts.info.sign_off
            cm = ts.info.cm; rHrs = ts.info.r_hrs; km = ts.info.km
          } else {
            // v3.17: badge tracks the actual roster source ('fortnight' for
            // swinger lines, 'master' for permanent lines) instead of always
            // labelling roster-derived times as "Master roster".
            timeSource = entry.r_start ? (source as TimeSource) : 'none'
            rStart = entry.r_start; rEnd = entry.r_end; cm = entry.cm
            rHrs = entry.r_hrs; km = 0
          }
        }

        return {
          date, dow, ph: false,
          diag: entry.diag, diagNum,
          rStart, rEnd, cm, rHrs,
          aStart: rStart || '', aEnd: rEnd || '',
          timeSource, km,
          claimLiftupLayback: true,
          wobod: false, leaveCat: 'none',
          manualDiag: null, manualDiagInput: '', workedOnOff: false,
          isShortFortnight: isShort,
          wasAdo: entry.diag === 'ADO',  // v3.11
        }
      })
    } else {
      source = 'builtin'
      const roster = ROSTER[String(line)]
      if (!roster) return
      const isShort = roster.some(e => e[4] === 'ADO')
      newDays = roster.map((entry, i) => {
        const [rS, rE, cmFlag, rHrsBuilt, diagBuilt] = entry
        const diag = String(diagBuilt)
        const date = dates[i]; const d = parseDate(date); const dow = d.getDay()

        // PH days become PHNW regardless of what the roster says
        if (phs.includes(date)) {
          return {
            date, dow, ph: true,
            diag: 'PHNW', diagNum: null,
            rStart: null, rEnd: null, cm: false, rHrs: 8,
            aStart: '', aEnd: '',
            timeSource: 'none' as TimeSource, km: 0,
            claimLiftupLayback: false,
            wobod: false, leaveCat: 'PHNW',
            manualDiag: null, manualDiagInput: '', workedOnOff: false,
            isShortFortnight: isShort,
            wasAdo: diag === 'ADO',
          }
        }

        let diagNum = extractDiagNum(diag)
        const sched = findByDow(diagNum, dow, wd, we)

        let timeSource: TimeSource
        let rStart: string | null, rEnd: string | null, cm: boolean, rHrs: number, km: number

        if (diag === 'OFF' || diag === 'ADO') {
          timeSource = 'none'
          rStart = null; rEnd = null; cm = false; rHrs = 0; km = 0
        } else if (sched) {
          timeSource = 'schedule'
          rStart = sched.sign_on; rEnd = sched.sign_off; cm = sched.cm
          rHrs = sched.r_hrs; km = sched.km
        } else {
          const builtinStart = rS as string | null
          const builtinEnd   = rE as string | null
          // Named-duty preservation (v3.15) — see corresponding comment in
          // the roster-driven branch above.
          const diagStartsNumeric = /^\d/.test(diag.trim())
          const ts = diagStartsNumeric
            ? findByTimes(builtinStart, builtinEnd, dow, wd, we)
            : null
          if (ts) {
            timeSource = 'schedule'
            diagNum = ts.diagNum
            rStart = ts.info.sign_on; rEnd = ts.info.sign_off
            cm = ts.info.cm; rHrs = ts.info.r_hrs; km = ts.info.km
          } else {
            timeSource = builtinStart ? 'builtin' : 'none'
            rStart = builtinStart; rEnd = builtinEnd
            cm = Boolean(cmFlag); rHrs = Number(rHrsBuilt); km = 0
          }
        }

        return {
          date, dow, ph: false,
          diag, diagNum,
          rStart, rEnd, cm, rHrs,
          aStart: rStart || '', aEnd: rEnd || '',
          timeSource, km,
          claimLiftupLayback: true,
          wobod: false, leaveCat: 'none',
          manualDiag: null, manualDiagInput: '', workedOnOff: false,
          isShortFortnight: isShort,
          wasAdo: diag === 'ADO',  // v3.11
        }
      })
    }

    // Capture the crew member name when loading from the fortnight roster —
    // shown in the daily-entry toolbar so the user can confirm the right line.
    const crewName =
      source === 'fortnight'
        ? (frData?.crew_names?.[String(line)] ?? null)
        : null

    setRosterLine(line); setFnStart(snapped); setPHs(phs); setPsTotal(psTotal)
    setDays(newDays); setFnLoaded(true); setResult(null); setCalcError(null)
    setRosterSource(source); setLoadedCrewName(crewName)
    return null
  }, [
    masterRosterUpload.result, fnRosterUpload.result,
    weekdayScheduleUpload.result, weekendScheduleUpload.result, findByDow, findByTimes,
  ])

  const fillAllRostered = useCallback(() =>
    setDays(prev => prev.map(d =>
      (!d.rStart || d.diag === 'OFF' || d.diag === 'ADO') ? d
        : { ...d, aStart: d.rStart || '', aEnd: d.rEnd || '' }
    )), [])

  const copyScheduledToActual = useCallback((i: number) =>
    setDays(prev => {
      const day = prev[i]
      if (!day.rStart) return prev
      const n = [...prev]
      n[i] = { ...day, aStart: day.rStart || '', aEnd: day.rEnd || '' }
      return n
    }), [])

  const setDay = useCallback((i: number, patch: Partial<DayState>) =>
    setDays(prev => { const n = [...prev]; n[i] = { ...n[i], ...patch }; return n }), [])

  const applyManualDiag = useCallback((i: number, raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setDays(prev => {
      const day = prev[i]
      const orig = day._origDiag || day.diag
      const origDiagNum = day._origDiagNum !== undefined ? day._origDiagNum : day.diagNum
      // v3.11: preserve wasAdo even after override (so short-fortnight detection still works)
      const wasAdo = day.wasAdo || orig === 'ADO'

      const inputNum = extractDiagNum(trimmed)

      let rStart: string | null = null, rEnd: string | null = null
      let cm = false, rHrs = 8.0, km = 0
      let diagName = trimmed + ' [manual]'
      let diagNum: string | null = inputNum
      let foundInSchedule = false

      if (inputNum) {
        const sched = findInBothSchedules(inputNum, wdSchedRef.current, weSchedRef.current)
        if (sched) {
          rStart = sched.sign_on; rEnd = sched.sign_off
          cm = sched.cm; rHrs = sched.r_hrs; km = sched.km
          diagName = `${inputNum} [manual]`
          diagNum = inputNum
          foundInSchedule = true
        }
      }

      if (!foundInSchedule) {
        const n = parseInt(trimmed, 10)
        if (!isNaN(n) && ROSTER[String(n)]) {
          const e = ROSTER[String(n)]![i]
          if (e && e[0]) {
            rStart = e[0] as string; rEnd = e[1] as string
            cm = Boolean(e[2]); rHrs = Number(e[3])
            diagName = String(e[4]) + ' [manual]'
            diagNum = extractDiagNum(String(e[4]))
          }
        }
      }

      const arr = [...prev]
      arr[i] = {
        ...day,
        _origDiag: orig,
        _origDiagNum: origDiagNum,
        manualDiag: trimmed,
        manualDiagInput: trimmed,
        diag: diagName,
        diagNum,
        rStart, rEnd, cm, rHrs, km,
        aStart: rStart || '',
        aEnd:   rEnd   || '',
        timeSource: 'manual',
        claimLiftupLayback: day.claimLiftupLayback ?? true,
        workedOnOff: true,
        wasAdo,  // v3.11
      }
      return arr
    })
  }, [findInBothSchedules])

  const markWorkedOnOff = useCallback((i: number) =>
    setDays(prev => {
      const day = prev[i]; const n = [...prev]
      const orig = day._origDiag || day.diag
      const wasAdo = day.wasAdo || orig === 'ADO'  // v3.11
      n[i] = {
        ...day,
        _origDiag: orig,
        _origDiagNum: day._origDiagNum !== undefined ? day._origDiagNum : day.diagNum,
        manualDiag: 'WORKED', workedOnOff: true,
        diag: 'WORKED', diagNum: null,
        rStart: null, rEnd: null, cm: false, rHrs: 8,
        aStart: '', aEnd: '',
        timeSource: 'manual',
        claimLiftupLayback: day.claimLiftupLayback ?? true,
        wobod: false, km: 0,
        wasAdo,  // v3.11
      }
      return n
    }), [])

  const resetDay = useCallback((i: number) =>
    setDays(prev => {
      const day = prev[i]
      const orig = day._origDiag || 'OFF'
      const origDiagNum = day._origDiagNum !== undefined ? day._origDiagNum : null
      const n = [...prev]
      const sched = findByDow(origDiagNum, day.dow, wdSchedRef.current, weSchedRef.current)
      let timeSource: TimeSource
      let rStart: string | null, rEnd: string | null, cm: boolean, rHrs: number, km: number
      if (orig === 'OFF' || orig === 'ADO') {
        timeSource = 'none'
        rStart = null; rEnd = null; cm = false; rHrs = 0; km = 0
      } else if (sched) {
        timeSource = 'schedule'
        rStart = sched.sign_on; rEnd = sched.sign_off; cm = sched.cm
        rHrs = sched.r_hrs; km = sched.km
      } else {
        timeSource = 'none'
        rStart = null; rEnd = null; cm = false; rHrs = 0; km = 0
      }
      n[i] = {
        ...day, diag: orig, diagNum: origDiagNum,
        _origDiag: undefined, _origDiagNum: undefined,
        manualDiag: null, manualDiagInput: '', workedOnOff: false,
        rStart, rEnd, cm, rHrs, km, timeSource,
        aStart: rStart || '', aEnd: rEnd || '',
        claimLiftupLayback: true,
        wobod: false, leaveCat: 'none',
        wasAdo: orig === 'ADO',  // v3.11
      }
      return n
    }), [findByDow])

  const applyUploadedRoster = useCallback(() => {
    if (!rosterUpload.result) return
    setDays(prev => {
      const n = [...prev]
      rosterUpload.result!.parsed_days.forEach(p => {
        const idx = n.findIndex(d => d.date === p.date)
        if (idx >= 0 && p.sign_on && p.sign_off) n[idx] = { ...n[idx], aStart: p.sign_on, aEnd: p.sign_off }
      })
      return n
    })
    setRU(prev => ({ ...prev, applied: true }))
  }, [rosterUpload.result])

  // v3.26: makeZipUploader gains a `scope` argument that controls which auth
  // header is attached.
  //   'admin' — POST /api/admin/*  with X-Admin-Token (returns 401/503 if not signed in)
  //   'user'  — POST /api/upload-* with X-Session-Id  (always works; per-browser scope)
  //   'public'— legacy /api/parse-* endpoints, no headers
  type UploadScope = 'admin' | 'user' | 'public'
  function makeZipUploader<T>(
    endpoint: string,
    setter: (s: SimpleUploadState<T>) => void,
    lsKey: string,
    scope: UploadScope = 'public',
  ) {
    return async (file: File) => {
      setter({ status: 'uploading', result: null, error: null })
      const form = new FormData(); form.append('file', file)
      const headers: Record<string, string> = {}
      if (scope === 'admin') {
        const pw = getAdminPassword()
        if (!pw) {
          setter({
            status: 'error', result: null,
            error: 'Admin sign-in required to upload this file. Click "🔐 Admin" in the header to sign in.',
          })
          return
        }
        headers['X-Admin-Password'] = pw
      } else if (scope === 'user') {
        headers['X-Session-Id'] = getSessionId()
      }
      try {
        const r = await fetch(endpoint, { method: 'POST', body: form, headers })
        if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Parse failed' })); throw new Error(e.detail) }
        const data: T = await r.json()
        toLS(lsKey, data)
        setter({ status: 'success', result: data, error: null })
      } catch (e) {
        setter({ status: 'error', result: null, error: (e as Error).message })
      }
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  // v3.26: rerouted to v3.22/v3.23 endpoints.  Admin endpoints require sign-in
  // (X-Admin-Token); the fortnight roster is per-user (X-Session-Id).
  const uploadMasterRoster    = useCallback(makeZipUploader<ParsedRosterData>(
    '/api/admin/upload-roster', setMR, LS_MR, 'admin'), [])
  const uploadFnRoster        = useCallback(makeZipUploader<ParsedRosterData>(
    '/api/upload-fortnight-roster', setFR, LS_FR, 'user'), [])
  const uploadWeekdaySchedule = useCallback(makeZipUploader<ParsedScheduleData>(
    '/api/admin/upload-schedule?type=weekday', setWD, LS_WD, 'admin'), [])
  const uploadWeekendSchedule = useCallback(makeZipUploader<ParsedScheduleData>(
    '/api/admin/upload-schedule?type=weekend', setWE, LS_WE, 'admin'), [])
  /* eslint-enable react-hooks/exhaustive-deps */

  const uploadRoster = useCallback(async (file: File) => {
    setRU({ status: 'uploading', result: null, error: null, applied: false })
    const form = new FormData(); form.append('file', file)
    try {
      const r = await fetch('/api/parse-roster', { method: 'POST', body: form })
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Parse failed' })); throw new Error(e.detail) }
      setRU({ status: 'success', result: await r.json(), error: null, applied: false })
    } catch (e) { setRU({ status: 'error', result: null, error: (e as Error).message, applied: false }) }
  }, [])

  const uploadPayslip = useCallback(async (file: File) => {
    setPU({ status: 'uploading', result: null, error: null })
    const form = new FormData(); form.append('file', file)
    try {
      const r = await fetch('/api/parse-payslip', { method: 'POST', body: form })
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Parse failed' })); throw new Error(e.detail) }
      setPU({ status: 'success', result: await r.json(), error: null })
    } catch (e) { setPU({ status: 'error', result: null, error: (e as Error).message }) }
  }, [])

  const calculate = useCallback(async (): Promise<boolean> => {
    if (!days.length) return false
    setCalcing(true); setCalcError(null)
    // v3.11: short fortnight detection now respects wasAdo (handles ADO-day overrides)
    const isShort = days.some(d => d.diag === 'ADO' || d.wasAdo)
    // v3.12: enrich each day with assoc/unassoc chart data keyed by diagNum
    const tagged = days.map(d => {
      const entry = assocChart[d.diagNum || '']
      return {
        ...d,
        isShortFortnight: isShort,
        unAssocHrs:       entry ? entry.unAssocMins        / 60 : 0,
        assocPaymentHrs:  entry ? entry.assocPaymentMins   / 60 : 0,
        // When the physical chart has a pre-computed "Build Up" value, send it so
        // the backend uses it directly instead of re-deriving from the formula.
        assocBuildUpHrs:  (entry?.buildUpMins ?? 0) > 0 ? entry!.buildUpMins! / 60 : 0,
      }
    })
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // v3.32: attach Bearer token if signed in.  /api/calculate is JWT-gated.
      if (authJwt) headers['Authorization'] = `Bearer ${authJwt}`
      const r = await fetch('/api/calculate', {
        method: 'POST', headers,
        body: JSON.stringify({
          fortnight_start: fnStart,
          roster_line: rosterLine,
          public_holidays: publicHolidays,
          payslip_total: payslipTotal,
          config, codes,
          days: tagged,
          unassoc_amt: unassocAmt,
          is_short_fortnight: isShort,  // v3.11
        }),
      })
      // v3.32: token expired or invalid → bounce to login.
      if (r.status === 401) {
        signOut()
        throw new Error('Your session has expired.  Please sign in again.')
      }
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); throw new Error(e.detail) }
      setResult(await r.json())
      return true
    } catch (e) {
      const msg = (e as Error).message
      setCalcError(msg.includes('fetch') ? 'Cannot reach backend.' : msg)
      return false
    } finally { setCalcing(false) }
  }, [days, fnStart, rosterLine, publicHolidays, payslipTotal, config, codes, unassocAmt, assocChart, authJwt, signOut])

  const exportPdf = useCallback(async () => {
    if (!result) return
    const r = await fetch('/api/export/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
    if (!r.ok) return
    const url = URL.createObjectURL(await r.blob())
    Object.assign(document.createElement('a'), { href: url, download: `wage_calc_${fnStart}.pdf` }).click()
    URL.revokeObjectURL(url)
  }, [result, fnStart])

  const exportCsv = useCallback(async () => {
    if (!result) return
    const r = await fetch('/api/export/csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) })
    if (!r.ok) return
    const url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `wage_calc_${fnStart}.csv` }).click()
    URL.revokeObjectURL(url)
  }, [result, fnStart])

  return (
    <Context.Provider value={{
      rosterLine, fnStart, publicHolidays, payslipTotal, fnLoaded, fnType, rosterSource,
      loadedCrewName,
      days, previews, config, codes, unassocAmt,
      setConfig, setCodes, setUnassocAmt, saveConfig, saveCodes,
      rosterUpload, payslipUpload,
      masterRosterUpload, fnRosterUpload, weekdayScheduleUpload, weekendScheduleUpload,
      assocChart, assocChartIsCustom, loadAssocChartCsv, loadAssocChartDirect, resetAssocChart,
      adminPassword, setAdminPassword, sessionId,
      authJwt, authUser, signIn, signOut,
      result, calculating, calcError,
      loadLine, fillAllRostered, copyScheduledToActual, setDay, applyManualDiag, markWorkedOnOff,
      resetDay, applyUploadedRoster,
      uploadRoster, uploadPayslip,
      uploadMasterRoster, uploadFnRoster, uploadWeekdaySchedule, uploadWeekendSchedule,
      calculate, exportPdf, exportCsv,
    }}>{children}</Context.Provider>
  )
}
