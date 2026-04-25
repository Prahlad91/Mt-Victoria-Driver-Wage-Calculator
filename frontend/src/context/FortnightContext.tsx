import {
  createContext, useContext, useState, useCallback, useMemo,
  useEffect, useRef, ReactNode,
} from 'react'
import type {
  DayState, RateConfig, PayrollCodes,
  CalculateResponse, RosterUploadState, PayslipUploadState,
  ParsedRosterData, ParsedScheduleData, DiagramInfo, SimpleUploadState,
  TimeSource,
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

/**
 * Extract the 4-digit diagram number from a diagram name.
 * '3151 SMB'   -> '3151'
 * '3158 RK'    -> '3158'
 * 'SBY'        -> null
 * 'OFF', 'ADO' -> null
 * '3651 [manual]' -> '3651'
 */
function extractDiagNum(diag: string | null | undefined): string | null {
  if (!diag) return null
  if (diag === 'OFF' || diag === 'ADO' || diag === 'WORKED') return null
  const first = diag.trim().split(/\s+/)[0]
  return /^\d{3,4}$/.test(first) ? first : null
}

interface Ctx {
  rosterLine: number; fnStart: string; publicHolidays: string[]; payslipTotal: number | null
  fnLoaded: boolean; fnType: 'short' | 'long' | null; rosterSource: RosterSource
  days: DayState[]; previews: ReturnType<typeof previewDay>[]
  config: RateConfig; codes: PayrollCodes; unassocAmt: number
  setConfig: (p: Partial<RateConfig>) => void; setCodes: (p: Partial<PayrollCodes>) => void
  setUnassocAmt: (n: number) => void; saveConfig: () => void; saveCodes: () => void
  rosterUpload: RosterUploadState; payslipUpload: PayslipUploadState
  masterRosterUpload:    SimpleUploadState<ParsedRosterData>
  fnRosterUpload:        SimpleUploadState<ParsedRosterData>
  weekdayScheduleUpload: SimpleUploadState<ParsedScheduleData>
  weekendScheduleUpload: SimpleUploadState<ParsedScheduleData>
  result: CalculateResponse | null; calculating: boolean; calcError: string | null
  loadLine:            (line: number, start: string, phs: string[], psTotal: number | null) => void
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
  calculate: () => Promise<void>; exportPdf: () => Promise<void>; exportCsv: () => Promise<void>
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

  const [config, setConfigState] = useState<RateConfig>(() => ({ ...DEFAULT_CONFIG, ...fromLS(LS_CFG, {}) }))
  const [codes,  setCodesState]  = useState<PayrollCodes>(() => ({ ...DEFAULT_CODES, ...fromLS(LS_CODES, {}) }))
  const [unassocAmt, setUnassocAmt] = useState<number>(() => fromLS(LS_UNASSOC, 0))

  const [rosterUpload,  setRU] = useState<RosterUploadState>({ status: 'idle', result: null, error: null, applied: false })
  const [payslipUpload, setPU] = useState<PayslipUploadState>({ status: 'idle', result: null, error: null })

  const [masterRosterUpload,    setMR] = useState<SimpleUploadState<ParsedRosterData>>(() => restoreCached<ParsedRosterData>(LS_MR))
  const [fnRosterUpload,        setFR] = useState<SimpleUploadState<ParsedRosterData>>(() => restoreCached<ParsedRosterData>(LS_FR))
  const [weekdayScheduleUpload, setWD] = useState<SimpleUploadState<ParsedScheduleData>>(() => restoreCached<ParsedScheduleData>(LS_WD))
  const [weekendScheduleUpload, setWE] = useState<SimpleUploadState<ParsedScheduleData>>(() => restoreCached<ParsedScheduleData>(LS_WE))

  const [result,      setResult]    = useState<CalculateResponse | null>(null)
  const [calculating, setCalcing]   = useState(false)
  const [calcError,   setCalcError] = useState<string | null>(null)

  // Refs so callbacks always see latest schedules without being recreated
  const wdSchedRef = useRef<ParsedScheduleData | null>(null)
  const weSchedRef = useRef<ParsedScheduleData | null>(null)
  wdSchedRef.current = weekdayScheduleUpload.result
  weSchedRef.current = weekendScheduleUpload.result

  const previews = useMemo(
    () => days.map(d => previewDay(d, config, codes, unassocAmt)),
    [days, config, codes, unassocAmt],
  )
  const fnType = useMemo<'short' | 'long' | null>(
    () => !fnLoaded ? null : days.some(d => d.diag === 'ADO') ? 'short' : 'long',
    [fnLoaded, days],
  )

  const setConfig  = useCallback((p: Partial<RateConfig>)  => setConfigState(prev => ({ ...prev, ...p })), [])
  const setCodes   = useCallback((p: Partial<PayrollCodes>) => setCodesState(prev => ({ ...prev, ...p })), [])
  const saveConfig = useCallback(() => { toLS(LS_CFG, config); toLS(LS_UNASSOC, unassocAmt) }, [config, unassocAmt])
  const saveCodes  = useCallback(() => toLS(LS_CODES, codes), [codes])

  // ── Schedule lookups ──────────────────────────────────────────────────────

  /**
   * Look up a diagram in BOTH schedules — returns the first match.
   * Used for manual diagram override (user could enter a weekend diagram on a
   * weekday or vice versa).
   */
  const findInBothSchedules = useCallback((
    diagNum: string,
    wd: ParsedScheduleData | null, we: ParsedScheduleData | null,
  ): DiagramInfo | null => {
    if (!diagNum) return null
    if (wd?.diagrams[diagNum]) return wd.diagrams[diagNum]
    if (we?.diagrams[diagNum]) return we.diagrams[diagNum]
    return null
  }, [])

  /**
   * Look up a diagram in the day-of-week appropriate schedule.
   * Used for roster-loaded days (we know which schedule to consult based on dow).
   */
  const findByDow = useCallback((
    diagNum: string | null, dow: number,
    wd: ParsedScheduleData | null, we: ParsedScheduleData | null,
  ): DiagramInfo | null => {
    if (!diagNum) return null
    const sched = (dow === 0 || dow === 6) ? we : wd
    return sched?.diagrams[diagNum] ?? null
  }, [])

  // ── Trigger 3: re-apply scheduled times AND KMs when a schedule arrives
  // AFTER a roster has been loaded. Also triggers on initial mount if cached
  // schedules are restored from localStorage.
  useEffect(() => {
    if (!fnLoaded || days.length === 0) return
    const wd = weekdayScheduleUpload.result
    const we = weekendScheduleUpload.result
    if (!wd && !we) return

    setDays(prev => prev.map(d => {
      // Skip OFF/ADO and any day that user manually overrode
      if (d.diag === 'OFF' || d.diag === 'ADO' || d.timeSource === 'manual') return d
      const sched = findByDow(d.diagNum, d.dow, wd, we)
      if (!sched) return d
      // Re-apply schedule data; preserve user-edited actual times
      const actualWasScheduled = d.aStart === d.rStart && d.aEnd === d.rEnd
      return {
        ...d,
        rStart: sched.sign_on,
        rEnd: sched.sign_off,
        cm: sched.cm,
        rHrs: sched.r_hrs,
        km: sched.km,
        timeSource: 'schedule',
        // If actual was previously synced to scheduled, keep them in sync
        aStart: actualWasScheduled ? (sched.sign_on || '') : d.aStart,
        aEnd:   actualWasScheduled ? (sched.sign_off || '') : d.aEnd,
      }
    }))
  // Only react to schedule changes; intentionally not depending on fnLoaded/days
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdayScheduleUpload.result, weekendScheduleUpload.result])

  // ── loadLine (Trigger 1) ──────────────────────────────────────────────────
  const loadLine = useCallback((
    line: number, start: string, phs: string[], psTotal: number | null,
  ) => {
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
        const diagNum = extractDiagNum(entry.diag)
        const sched = findByDow(diagNum, dow, wd, we)

        // Determine time source and times
        let timeSource: TimeSource
        let rStart: string | null, rEnd: string | null, cm: boolean, rHrs: number, km: number

        if (entry.diag === 'OFF' || entry.diag === 'ADO') {
          timeSource = 'none'
          rStart = null; rEnd = null; cm = false; rHrs = 0; km = 0
        } else if (sched) {
          // Schedule wins — authoritative source for times + KMs
          timeSource = 'schedule'
          rStart = sched.sign_on; rEnd = sched.sign_off; cm = sched.cm
          rHrs = sched.r_hrs; km = sched.km
        } else {
          // No schedule entry — fall back to master roster's own times
          timeSource = entry.r_start ? 'master' : 'none'
          rStart = entry.r_start; rEnd = entry.r_end; cm = entry.cm
          rHrs = entry.r_hrs; km = 0
        }

        return {
          date, dow, ph: phs.includes(date),
          diag: entry.diag, diagNum,
          rStart, rEnd, cm, rHrs,
          aStart: rStart || '', aEnd: rEnd || '',
          timeSource, km,
          wobod: false, leaveCat: 'none',
          manualDiag: null, manualDiagInput: '', workedOnOff: false,
          isShortFortnight: isShort,
        }
      })
    } else {
      // Built-in fallback
      source = 'builtin'
      const roster = ROSTER[String(line)]
      if (!roster) return
      const isShort = roster.some(e => e[4] === 'ADO')
      newDays = roster.map((entry, i) => {
        const [rS, rE, cmFlag, rHrsBuilt, diagBuilt] = entry
        const diag = String(diagBuilt)
        const date = dates[i]; const d = parseDate(date); const dow = d.getDay()
        const diagNum = extractDiagNum(diag)
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
          timeSource = rS ? 'builtin' : 'none'
          rStart = rS as string | null; rEnd = rE as string | null
          cm = Boolean(cmFlag); rHrs = Number(rHrsBuilt); km = 0
        }

        return {
          date, dow, ph: phs.includes(date),
          diag, diagNum,
          rStart, rEnd, cm, rHrs,
          aStart: rStart || '', aEnd: rEnd || '',
          timeSource, km,
          wobod: false, leaveCat: 'none',
          manualDiag: null, manualDiagInput: '', workedOnOff: false,
          isShortFortnight: isShort,
        }
      })
    }

    setRosterLine(line); setFnStart(snapped); setPHs(phs); setPsTotal(psTotal)
    setDays(newDays); setFnLoaded(true); setResult(null); setCalcError(null)
    setRosterSource(source)
  }, [
    masterRosterUpload.result, fnRosterUpload.result,
    weekdayScheduleUpload.result, weekendScheduleUpload.result, findByDow,
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

  // ── applyManualDiag (Trigger 2) ───────────────────────────────────────────
  // Searches BOTH weekday and weekend schedules for the entered diagram number.
  // Sets timeSource='manual' on success. Falls back to built-in ROSTER if the
  // diagram is not in either schedule.
  const applyManualDiag = useCallback((i: number, raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    setDays(prev => {
      const day = prev[i]
      const orig = day._origDiag || day.diag
      const origDiagNum = day._origDiagNum !== undefined ? day._origDiagNum : day.diagNum

      // Extract clean diagram number from input
      const inputNum = extractDiagNum(trimmed)

      let rStart: string | null = null, rEnd: string | null = null
      let cm = false, rHrs = 8.0, km = 0
      let diagName = trimmed + ' [manual]'
      let diagNum: string | null = inputNum
      let foundInSchedule = false

      // Step 1 — try BOTH schedules using the parsed diagram number
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

      // Step 2 — fall back to built-in ROSTER if no schedule hit
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
        workedOnOff: true,
      }
      return arr
    })
  }, [findInBothSchedules])

  const markWorkedOnOff = useCallback((i: number) =>
    setDays(prev => {
      const day = prev[i]; const n = [...prev]
      n[i] = {
        ...day,
        _origDiag: day._origDiag || day.diag,
        _origDiagNum: day._origDiagNum !== undefined ? day._origDiagNum : day.diagNum,
        manualDiag: 'WORKED', workedOnOff: true,
        diag: 'WORKED', diagNum: null,
        rStart: null, rEnd: null, cm: false, rHrs: 8,
        aStart: '', aEnd: '',
        timeSource: 'manual',
        wobod: false, km: 0,
      }
      return n
    }), [])

  const resetDay = useCallback((i: number) =>
    setDays(prev => {
      const day = prev[i]
      const orig = day._origDiag || 'OFF'
      const origDiagNum = day._origDiagNum !== undefined ? day._origDiagNum : null
      const n = [...prev]
      // Re-apply original by looking up schedule using original diagNum
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
        wobod: false, leaveCat: 'none',
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

  // ── Upload factory ────────────────────────────────────────────────────────
  function makeZipUploader<T>(endpoint: string, setter: (s: SimpleUploadState<T>) => void, lsKey: string) {
    return async (file: File) => {
      setter({ status: 'uploading', result: null, error: null })
      const form = new FormData(); form.append('file', file)
      try {
        const r = await fetch(endpoint, { method: 'POST', body: form })
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
  const uploadMasterRoster    = useCallback(makeZipUploader<ParsedRosterData>('/api/parse-master-roster',    setMR, LS_MR), [])
  const uploadFnRoster        = useCallback(makeZipUploader<ParsedRosterData>('/api/parse-fortnight-roster', setFR, LS_FR), [])
  const uploadWeekdaySchedule = useCallback(makeZipUploader<ParsedScheduleData>('/api/parse-schedule', setWD, LS_WD), [])
  const uploadWeekendSchedule = useCallback(makeZipUploader<ParsedScheduleData>('/api/parse-schedule', setWE, LS_WE), [])
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

  const calculate = useCallback(async () => {
    if (!days.length) return
    setCalcing(true); setCalcError(null)
    const isShort = days.some(d => d.diag === 'ADO')
    const tagged = days.map(d => ({ ...d, isShortFortnight: isShort }))
    try {
      const r = await fetch('/api/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fortnight_start: fnStart, roster_line: rosterLine, public_holidays: publicHolidays, payslip_total: payslipTotal, config, codes, days: tagged, unassoc_amt: unassocAmt }),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Error' })); throw new Error(e.detail) }
      setResult(await r.json())
    } catch (e) {
      const msg = (e as Error).message
      setCalcError(msg.includes('fetch') ? 'Cannot reach backend.' : msg)
    } finally { setCalcing(false) }
  }, [days, fnStart, rosterLine, publicHolidays, payslipTotal, config, codes, unassocAmt])

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
      days, previews, config, codes, unassocAmt,
      setConfig, setCodes, setUnassocAmt, saveConfig, saveCodes,
      rosterUpload, payslipUpload,
      masterRosterUpload, fnRosterUpload, weekdayScheduleUpload, weekendScheduleUpload,
      result, calculating, calcError,
      loadLine, fillAllRostered, copyScheduledToActual, setDay, applyManualDiag, markWorkedOnOff,
      resetDay, applyUploadedRoster,
      uploadRoster, uploadPayslip,
      uploadMasterRoster, uploadFnRoster, uploadWeekdaySchedule, uploadWeekendSchedule,
      calculate, exportPdf, exportCsv,
    }}>{children}</Context.Provider>
  )
}
