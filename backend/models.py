"""Pydantic v2 models for the Mt Victoria Driver Wage Calculator API.
PRD ref: Section 9"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# ─── Request models ────────────────────────────────────────────────────────────

class DayState(BaseModel):
    """State for a single day in the fortnight. PRD §9.1"""
    model_config = ConfigDict(extra='ignore')

    date: str                          # YYYY-MM-DD
    dow: int                           # 0=Sun, 6=Sat
    ph: bool = False
    diag: str                          # full name e.g. '3151 SMB' / 'OFF' / 'ADO'
    diag_num: Optional[str] = None     # parsed 4-digit number e.g. '3151' (v3.4)
    time_source: str = 'none'          # 'schedule' | 'master' | 'builtin' | 'manual' | 'none' (v3.4)
    r_start: Optional[str] = None      # scheduled start HH:MM (editable from v3.10)
    r_end: Optional[str] = None        # scheduled end HH:MM (editable from v3.10)
    cm: bool = False
    r_hrs: float = 0.0                 # scheduled hours
    a_start: str = ''                  # actual start HH:MM
    a_end: str = ''                    # actual end HH:MM
    wobod: bool = False
    km: float = 0.0
    leave_cat: str = 'none'
    is_short_fortnight: bool = False
    claim_liftup_layback: bool = True  # NEW v3.10 — per-day toggle (PRD §5.7 / FR-02-F)


class RateConfig(BaseModel):
    base_rate: float = 49.81842
    ot1: float = 1.5
    ot2: float = 2.0
    sat_rate: float = 1.5
    sun_rate: float = 2.0
    sat_ot: float = 2.0
    ph_wkd: float = 1.5
    ph_wke: float = 2.5
    afternoon_rate: float = 4.84
    night_rate: float = 5.69
    early_rate: float = 4.84
    add_loading: float = 5.69
    wobod_rate: float = 2.0
    wobod_min: int = 4


class PayrollCodes(BaseModel):
    base: str = ''
    ot1: str = ''
    ot2: str = ''
    sat: str = ''
    sun: str = ''
    sat_ot: str = ''
    ph_wkd: str = ''
    ph_wke: str = ''
    afternoon: str = ''
    night: str = ''
    early: str = ''
    add_load: str = ''
    wobod: str = ''
    liftup: str = ''
    ado: str = ''
    unassoc: str = ''


class CalculateRequest(BaseModel):
    fortnight_start: str
    roster_line: int
    public_holidays: list[str] = Field(default_factory=list)
    payslip_total: Optional[float] = None
    config: RateConfig = Field(default_factory=RateConfig)
    codes: PayrollCodes = Field(default_factory=PayrollCodes)
    days: list[DayState]
    unassoc_amt: float = 0.0


# ─── Response models ──────────────────────────────────────────────────────────

class PayComponent(BaseModel):
    name: str
    ea: str
    code: str
    hrs: str
    rate: str
    amount: float
    cls: str = ''


class DayResult(BaseModel):
    date: str
    diag: str
    day_type: str
    hours: float
    paid_hrs: float
    total_pay: float
    components: list[PayComponent]
    flags: list[str]


class AuditResult(BaseModel):
    payslip_variance: Optional[float] = None
    fn_ot_hrs: float = 0.0
    km_bonus_hrs: float = 0.0
    ado_payout: float = 0.0
    fortnight_type: str
    flags: list[str]


class CalculateResponse(BaseModel):
    fortnight_start: str
    fortnight_type: str
    total_hours: float
    total_pay: float
    ado_payout: float
    fn_ot_hrs: float
    days: list[DayResult]
    component_totals: dict[str, float]
    audit: AuditResult


# ─── Upload response models ──────────────────────────────────────────────────────

class ParsedDayEntry(BaseModel):
    date: str
    diagram: str
    sign_on: Optional[str] = None
    sign_off: Optional[str] = None
    confidence: float = 1.0


class ParseRosterResponse(BaseModel):
    source_file: str
    parsed_days: list[ParsedDayEntry]
    warnings: list[str] = Field(default_factory=list)


class PayslipLineItem(BaseModel):
    code: str
    description: str
    hours: Optional[float] = None
    rate: Optional[float] = None
    amount: float


class ParsePayslipResponse(BaseModel):
    source_file: str
    format: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_gross: float
    line_items: list[PayslipLineItem]
    warnings: list[str] = Field(default_factory=list)


# ─── Roster ZIP upload models ──────────────────────────────────────────────────

class RosterDayEntry(BaseModel):
    diag: str
    r_start: Optional[str] = None
    r_end: Optional[str] = None
    cm: bool = False
    r_hrs: float = 0.0


class ParsedRosterResponse(BaseModel):
    source_file: str
    line_type: str
    fn_start: Optional[str] = None
    fn_end: Optional[str] = None
    lines: dict[str, list[RosterDayEntry]]
    warnings: list[str] = Field(default_factory=list)


# ─── Schedule ZIP upload models ────────────────────────────────────────────────────

class DiagramInfo(BaseModel):
    diag_num: str
    day_type: str
    sign_on: Optional[str] = None
    sign_off: Optional[str] = None
    r_hrs: float = 8.0
    km: float = 0.0
    cm: bool = False


class ParsedScheduleResponse(BaseModel):
    source_file: str
    schedule_type: str
    diagrams: dict[str, DiagramInfo]
    warnings: list[str] = Field(default_factory=list)
