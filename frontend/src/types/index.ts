/**
 * TypeScript types for the Mt Victoria Driver Wage Calculator.
 * Mirror of backend/models.py
 * PRD ref: Section 9
 */

export type TimeSource = 'schedule' | 'master' | 'builtin' | 'manual' | 'none'

// ─── Day state (PRD §9.1)
export interface DayState {
  date: string;              // YYYY-MM-DD
  dow: number;               // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;              // full diagram name e.g. '3151 SMB' | 'OFF' | 'ADO' | '3651 [manual]'
  diagNum: string | null;    // parsed 4-digit number e.g. '3151'; null for OFF/ADO/SBY
  _origDiag?: string;        // original diagram name before manual override
  _origDiagNum?: string | null;  // original diagNum before override
  rStart: string | null;     // SCHEDULED start HH:MM (editable from v3.10)
  rEnd: string | null;       // SCHEDULED end HH:MM (editable from v3.10)
  cm: boolean;
  rHrs: number;              // scheduled hours
  aStart: string;            // ACTUAL start HH:MM (user-editable)
  aEnd: string;              // ACTUAL end HH:MM (user-editable)
  timeSource: TimeSource;    // where rStart/rEnd came from
  km: number;
  claimLiftupLayback: boolean;  // NEW v3.10 — per-day toggle, default true (PRD §5.7 / FR-02-F)
  wobod: boolean;
  leaveCat: string;
  manualDiag: string | null;
  manualDiagInput: string;
  workedOnOff: boolean;
  isShortFortnight: boolean;
}

export interface RateConfig {
  base_rate: number; ot1: number; ot2: number;
  sat_rate: number; sun_rate: number; sat_ot: number;
  ph_wkd: number; ph_wke: number;
  afternoon_rate: number; night_rate: number; early_rate: number;
  add_loading: number; wobod_rate: number; wobod_min: number;
}

export interface PayrollCodes {
  base: string; ot1: string; ot2: string; sat: string; sun: string;
  sat_ot: string; ph_wkd: string; ph_wke: string; afternoon: string;
  night: string; early: string; add_load: string; wobod: string;
  liftup: string; ado: string; unassoc: string;
}

export interface CalculateRequest {
  fortnight_start: string;
  roster_line: number;
  public_holidays: string[];
  payslip_total?: number;
  config: RateConfig;
  codes: PayrollCodes;
  days: DayState[];
  unassoc_amt: number;
}

export interface PayComponent {
  name: string; ea: string; code: string; hrs: string;
  rate: string; amount: number; cls: string;
}

export interface DayResult {
  date: string; diag: string; day_type: string;
  hours: number; paid_hrs: number; total_pay: number;
  components: PayComponent[]; flags: string[];
}

export interface AuditResult {
  payslip_variance?: number; fn_ot_hrs: number;
  km_bonus_hrs: number; ado_payout: number;
  fortnight_type: string; flags: string[];
}

export interface CalculateResponse {
  fortnight_start: string; fortnight_type: 'short' | 'long';
  total_hours: number; total_pay: number; ado_payout: number; fn_ot_hrs: number;
  days: DayResult[]; component_totals: Record<string, number>; audit: AuditResult;
}

export interface ParsedDayEntry {
  date: string; diagram: string;
  sign_on: string | null; sign_off: string | null; confidence: number;
}

export interface ParseRosterResponse {
  source_file: string; parsed_days: ParsedDayEntry[]; warnings: string[];
}

export interface PayslipLineItem {
  code: string; description: string;
  hours?: number; rate?: number; amount: number;
}

export interface ParsePayslipResponse {
  source_file: string; format: string;
  period_start?: string; period_end?: string;
  total_gross: number; line_items: PayslipLineItem[]; warnings: string[];
}

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface RosterUploadState {
  status: UploadStatus; result: ParseRosterResponse | null;
  error: string | null; applied: boolean;
}

export interface PayslipUploadState {
  status: UploadStatus; result: ParsePayslipResponse | null; error: string | null;
}

export interface RosterDayEntry {
  diag: string;
  r_start: string | null;
  r_end: string | null;
  cm: boolean;
  r_hrs: number;
}

export interface ParsedRosterData {
  source_file: string;
  line_type: 'master' | 'fortnight';
  fn_start: string | null;
  fn_end: string | null;
  lines: Record<string, RosterDayEntry[]>;
  warnings: string[];
}

export interface DiagramInfo {
  diag_num: string;
  day_type: string;
  sign_on: string | null;
  sign_off: string | null;
  r_hrs: number;
  km: number;
  cm: boolean;
}

export interface ParsedScheduleData {
  source_file: string;
  schedule_type: 'weekday' | 'weekend';
  diagrams: Record<string, DiagramInfo>;
  warnings: string[];
}

export interface SimpleUploadState<T> {
  status: UploadStatus;
  result: T | null;
  error: string | null;
}
