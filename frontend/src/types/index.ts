/**
 * TypeScript types for the Mt Victoria Driver Wage Calculator.
 * Mirror of the Pydantic models in backend/models.py
 * PRD ref: Section 9
 */

// ─── Day state (frontend) ──────────────────────────────────────────────────

export interface DayState {
  date: string;              // YYYY-MM-DD
  dow: number;               // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;              // '3158 RK' | 'OFF' | 'ADO'
  _origDiag?: string;        // original before manual override
  rStart: string | null;
  rEnd: string | null;
  cm: boolean;               // cross-midnight
  rHrs: number;
  aStart: string;
  aEnd: string;
  wobod: boolean;
  km: number;
  leaveCat: string;          // 'none' | 'SL' | 'AL' | ...
  manualDiag: string | null;
  manualDiagInput: string;
  workedOnOff: boolean;
  isShortFortnight: boolean; // set by context before API call
}

// ─── Config ────────────────────────────────────────────────────────────────

export interface RateConfig {
  base_rate: number;
  ot1: number;
  ot2: number;
  sat_rate: number;
  sun_rate: number;
  sat_ot: number;
  ph_wkd: number;
  ph_wke: number;
  afternoon_rate: number;
  night_rate: number;
  early_rate: number;
  add_loading: number;
  wobod_rate: number;
  wobod_min: number;
}

export interface PayrollCodes {
  base: string;
  ot1: string;
  ot2: string;
  sat: string;
  sun: string;
  sat_ot: string;
  ph_wkd: string;
  ph_wke: string;
  afternoon: string;
  night: string;
  early: string;
  add_load: string;
  wobod: string;
  liftup: string;
  ado: string;
  unassoc: string;
}

// ─── API request ───────────────────────────────────────────────────────────

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

// ─── API response ──────────────────────────────────────────────────────────

export interface PayComponent {
  name: string;
  ea: string;
  code: string;
  hrs: string;
  rate: string;
  amount: number;
  cls: string;
}

export interface DayResult {
  date: string;
  diag: string;
  day_type: string;
  hours: number;
  paid_hrs: number;
  total_pay: number;
  components: PayComponent[];
  flags: string[];
}

export interface AuditResult {
  payslip_variance?: number;
  fn_ot_hrs: number;
  km_bonus_hrs: number;
  ado_payout: number;
  fortnight_type: string;
  flags: string[];
}

export interface CalculateResponse {
  fortnight_start: string;
  fortnight_type: 'short' | 'long';
  total_hours: number;
  total_pay: number;
  ado_payout: number;
  fn_ot_hrs: number;
  days: DayResult[];
  component_totals: Record<string, number>;
  audit: AuditResult;
}

// ─── Upload response types ─────────────────────────────────────────────────

export interface ParsedDayEntry {
  date: string;
  diagram: string;
  sign_on: string | null;
  sign_off: string | null;
  confidence: number;
}

export interface ParseRosterResponse {
  source_file: string;
  parsed_days: ParsedDayEntry[];
  warnings: string[];
}

export interface PayslipLineItem {
  code: string;
  description: string;
  hours?: number;
  rate?: number;
  amount: number;
}

export interface ParsePayslipResponse {
  source_file: string;
  format: string;
  period_start?: string;
  period_end?: string;
  total_gross: number;
  line_items: PayslipLineItem[];
  warnings: string[];
}

// ─── Upload state (UI) ─────────────────────────────────────────────────────

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export interface RosterUploadState {
  status: UploadStatus;
  result: ParseRosterResponse | null;
  error: string | null;
  applied: boolean;
}

export interface PayslipUploadState {
  status: UploadStatus;
  result: ParsePayslipResponse | null;
  error: string | null;
}
