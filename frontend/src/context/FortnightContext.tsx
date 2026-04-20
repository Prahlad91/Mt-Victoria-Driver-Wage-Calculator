import {
  createContext, useContext, useState, useCallback, useMemo, ReactNode,
} from 'react'
import type {
  DayState, RateConfig, PayrollCodes,
  CalculateResponse, ParseRosterResponse, ParsePayslipResponse,
  RosterUploadState, PayslipUploadState,
} from '../types'
import { DEFAULT_CONFIG, DEFAULT_CODES, previewDay } from '../utils/calcPreview'
import { ROSTER } from '../constants/roster'
import { toSunday, makeFortnight, parseDate } from '../utils/dateUtils'

const LS_CFG = 'mvwc_config', LS_CODES = 'mvwc_codes', LS_UNASSOC = 'mvwc_unassoc'
function fromLS<T>(k: string, fb: T): T {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb } catch { return fb }
}

interface Ctx {
  rosterLine:number; fnStart:string; publicHolidays:string[]; payslipTotal:number|null
  fnLoaded:boolean; fnType:'short'|'long'|null
  days:DayState[]; previews:ReturnType<typeof previewDay>[]
  config:RateConfig; codes:PayrollCodes; unassocAmt:number
  setConfig:(p:Partial<RateConfig>)=>void; setCodes:(p:Partial<PayrollCodes>)=>void
  setUnassocAmt:(n:number)=>void; saveConfig:()=>void; saveCodes:()=>void
  rosterUpload:RosterUploadState; payslipUpload:PayslipUploadState
  result:CalculateResponse|null; calculating:boolean; calcError:string|null
  loadLine:(line:number,start:string,phs:string[],psTotal:number|null)=>void
  fillAllRostered:()=>void
  setDay:(i:number,patch:Partial<DayState>)=>void
  applyManualDiag:(i:number,diagInput:string)=>void
  markWorkedOnOff:(i:number)=>void
  resetDay:(i:number)=>void
  applyUploadedRoster:()=>void
  uploadRoster:(file:File)=>Promise<void>
  uploadPayslip:(file:File)=>Promise<void>
  calculate:()=>Promise<void>
  exportPdf:()=>Promise<void>
  exportCsv:()=>Promise<void>
}

const Context = createContext<Ctx|null>(null)
export function useFortnightContext() {
  const c = useContext(Context)
  if (!c) throw new Error('Must be inside FortnightProvider')
  return c
}

export function FortnightProvider({ children }: { children: ReactNode }) {
  const [rosterLine, setRosterLine] = useState(1)
  const [fnStart, setFnStart]       = useState('')
  const [publicHolidays, setPHs]    = useState<string[]>([])
  const [payslipTotal, setPsTotal]  = useState<number|null>(null)
  const [fnLoaded, setFnLoaded]     = useState(false)
  const [days, setDays]             = useState<DayState[]>([])
  const [config, setConfigState]    = useState<RateConfig>(()=>({...DEFAULT_CONFIG,...fromLS(LS_CFG,{})}))
  const [codes, setCodesState]      = useState<PayrollCodes>(()=>({...DEFAULT_CODES,...fromLS(LS_CODES,{})}))
  const [unassocAmt, setUnassocAmt] = useState<number>(()=>fromLS(LS_UNASSOC,0))
  const [rosterUpload,  setRU]  = useState<RosterUploadState>({status:'idle',result:null,error:null,applied:false})
  const [payslipUpload, setPU]  = useState<PayslipUploadState>({status:'idle',result:null,error:null})
  const [result, setResult]         = useState<CalculateResponse|null>(null)
  const [calculating, setCalcing]   = useState(false)
  const [calcError, setCalcError]   = useState<string|null>(null)

  const previews = useMemo(()=>days.map(d=>previewDay(d,config,codes,unassocAmt)),[days,config,codes,unassocAmt])
  const fnType   = useMemo<'short'|'long'|null>(()=>!fnLoaded?null:days.some(d=>d.diag==='ADO')?'short':'long',[fnLoaded,days])

  const setConfig  = useCallback((p:Partial<RateConfig>)=>setConfigState(prev=>({...prev,...p})),[])
  const setCodes   = useCallback((p:Partial<PayrollCodes>)=>setCodesState(prev=>({...prev,...p})),[])
  const saveConfig = useCallback(()=>{ localStorage.setItem(LS_CFG,JSON.stringify(config)); localStorage.setItem(LS_UNASSOC,JSON.stringify(unassocAmt)) },[config,unassocAmt])
  const saveCodes  = useCallback(()=>localStorage.setItem(LS_CODES,JSON.stringify(codes)),[codes])

  const loadLine = useCallback((line:number,start:string,phs:string[],psTotal:number|null)=>{
    const roster = ROSTER[String(line)]
    if (!roster) return
    const snapped = toSunday(start)
    const dates   = makeFortnight(snapped)
    const isShort = roster.some(e=>e[4]==='ADO')
    const newDays:DayState[] = roster.map((entry,i)=>{
      const [rStart,rEnd,cm,rHrs,diag] = entry
      const date = dates[i]; const d = parseDate(date)
      return {
        date, dow:d.getDay(), ph:phs.includes(date), diag:String(diag),
        rStart:rStart as string|null, rEnd:rEnd as string|null,
        cm:Boolean(cm), rHrs:Number(rHrs),
        aStart:(rStart as string)||'', aEnd:(rEnd as string)||'',
        wobod:false, km:0, leaveCat:'none',
        manualDiag:null, manualDiagInput:'', workedOnOff:false, isShortFortnight:isShort,
      }
    })
    setRosterLine(line); setFnStart(snapped); setPHs(phs); setPsTotal(psTotal)
    setDays(newDays); setFnLoaded(true); setResult(null); setCalcError(null)
  },[])

  const fillAllRostered = useCallback(()=>setDays(prev=>prev.map(d=>(!d.rStart||d.diag==='OFF'||d.diag==='ADO')?d:{...d,aStart:d.rStart||'',aEnd:d.rEnd||''})),[  ])
  const setDay = useCallback((i:number,patch:Partial<DayState>)=>setDays(prev=>{const n=[...prev];n[i]={...n[i],...patch};return n}),[])

  const applyManualDiag = useCallback((i:number,raw:string)=>{
    if (!raw.trim()) return
    setDays(prev=>{
      const day=prev[i]; const orig=day._origDiag||day.diag
      let rStart:string|null=null,rEnd:string|null=null,cm=false,rHrs=8.0,diagName=raw.trim()+' [manual]'
      const n=parseInt(raw)
      if (!isNaN(n)&&ROSTER[String(n)]) {
        const e=ROSTER[String(n)]![i]
        if (e&&e[0]){rStart=e[0] as string;rEnd=e[1] as string;cm=Boolean(e[2]);rHrs=Number(e[3]);diagName=String(e[4])+' [manual]'}
      } else {
        let found=false
        for (const entries of Object.values(ROSTER)){if(found||!entries)break;for(const e of entries){if(e[4]&&String(e[4]).toLowerCase().includes(raw.toLowerCase())&&e[0]){rStart=e[0] as string;rEnd=e[1] as string;cm=Boolean(e[2]);rHrs=Number(e[3]);diagName=String(e[4])+' [manual]';found=true;break}}}
      }
      const arr=[...prev]
      arr[i]={...day,_origDiag:orig,manualDiag:raw,manualDiagInput:raw,diag:diagName,rStart,rEnd,cm,rHrs,aStart:rStart||'',aEnd:rEnd||'',workedOnOff:true}
      return arr
    })
  },[])

  const markWorkedOnOff = useCallback((i:number)=>setDays(prev=>{const day=prev[i];const n=[...prev];n[i]={...day,_origDiag:day._origDiag||day.diag,manualDiag:'WORKED',workedOnOff:true,diag:'WORKED',rStart:null,rEnd:null,cm:false,rHrs:8,aStart:'',aEnd:'',wobod:false,km:0};return n}),[])
  const resetDay = useCallback((i:number)=>setDays(prev=>{const day=prev[i];const orig=day._origDiag||'OFF';const n=[...prev];n[i]={...day,diag:orig,_origDiag:undefined,manualDiag:null,manualDiagInput:'',workedOnOff:false,rStart:null,rEnd:null,cm:false,rHrs:0,aStart:'',aEnd:'',wobod:false,km:0,leaveCat:'none'};return n}),[])

  const applyUploadedRoster = useCallback(()=>{
    if (!rosterUpload.result) return
    setDays(prev=>{const n=[...prev];rosterUpload.result!.parsed_days.forEach(p=>{const idx=n.findIndex(d=>d.date===p.date);if(idx>=0&&p.sign_on&&p.sign_off)n[idx]={...n[idx],aStart:p.sign_on,aEnd:p.sign_off}});return n})
    setRU(prev=>({...prev,applied:true}))
  },[rosterUpload.result])

  const uploadRoster = useCallback(async(file:File)=>{
    setRU({status:'uploading',result:null,error:null,applied:false})
    const form=new FormData();form.append('file',file)
    try{const r=await fetch('/api/parse-roster',{method:'POST',body:form});if(!r.ok){const e=await r.json().catch(()=>({detail:'Parse failed'}));throw new Error(e.detail)};setRU({status:'success',result:await r.json(),error:null,applied:false})}catch(e){setRU({status:'error',result:null,error:(e as Error).message,applied:false})}
  },[])

  const uploadPayslip = useCallback(async(file:File)=>{
    setPU({status:'uploading',result:null,error:null})
    const form=new FormData();form.append('file',file)
    try{const r=await fetch('/api/parse-payslip',{method:'POST',body:form});if(!r.ok){const e=await r.json().catch(()=>({detail:'Parse failed'}));throw new Error(e.detail)};setPU({status:'success',result:await r.json(),error:null})}catch(e){setPU({status:'error',result:null,error:(e as Error).message})}
  },[])

  const calculate = useCallback(async()=>{
    if (!days.length) return
    setCalcing(true);setCalcError(null)
    const isShort=days.some(d=>d.diag==='ADO')
    const tagged=days.map(d=>({...d,isShortFortnight:isShort}))
    try{
      const r=await fetch('/api/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fortnight_start:fnStart,roster_line:rosterLine,public_holidays:publicHolidays,payslip_total:payslipTotal,config,codes,days:tagged,unassoc_amt:unassocAmt})})
      if(!r.ok){const e=await r.json().catch(()=>({detail:'Error'}));throw new Error(e.detail)}
      setResult(await r.json())
    }catch(e){
      const msg=(e as Error).message
      setCalcError(msg.includes('fetch')?'Cannot reach backend. Start it: cd backend && uvicorn main:app --reload':msg)
    }finally{setCalcing(false)}
  },[days,fnStart,rosterLine,publicHolidays,payslipTotal,config,codes,unassocAmt])

  const exportPdf = useCallback(async()=>{
    if(!result)return;const r=await fetch('/api/export/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});if(!r.ok)return
    const url=URL.createObjectURL(await r.blob());const a=Object.assign(document.createElement('a'),{href:url,download:`wage_calc_${fnStart}.pdf`});a.click();URL.revokeObjectURL(url)
  },[result,fnStart])

  const exportCsv = useCallback(async()=>{
    if(!result)return;const r=await fetch('/api/export/csv',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});if(!r.ok)return
    const url=URL.createObjectURL(new Blob([await r.text()],{type:'text/csv'}));const a=Object.assign(document.createElement('a'),{href:url,download:`wage_calc_${fnStart}.csv`});a.click();URL.revokeObjectURL(url)
  },[result,fnStart])

  return (
    <Context.Provider value={{
      rosterLine,fnStart,publicHolidays,payslipTotal,fnLoaded,fnType,
      days,previews,config,codes,unassocAmt,
      setConfig,setCodes,setUnassocAmt,saveConfig,saveCodes,
      rosterUpload,payslipUpload,result,calculating,calcError,
      loadLine,fillAllRostered,setDay,applyManualDiag,markWorkedOnOff,
      resetDay,applyUploadedRoster,uploadRoster,uploadPayslip,
      calculate,exportPdf,exportCsv,
    }}>{children}</Context.Provider>
  )
}
