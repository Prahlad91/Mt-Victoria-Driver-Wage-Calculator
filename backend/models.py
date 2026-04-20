"""Pydantic v2 models for the Mt Victoria Driver Wage Calculator API.
PRD ref: Section 9"""
from typing import Optional
from pydantic import BaseModel, Field


# ─── Request models ──────────────────────────────────────────────────────────

class DayState(BaseModel):
    """State for a single day in the fortnight. PRD §9.1"""
    date: str                          # YYYY-MM-DD
    dow: int                           # 0=Sun, 6=Sat
    ph: bool = False                   # is public holiday
    diag: str                          # diagram name ('3158 RK', 'OFF', 'ADO')
    r_start: Optional[str] = None      # rostered start HH:MM
    r_end: Optional[str] = None        # rostered end HH:MM
    cm: bool = False                   # cross-midnight
    r_hrs: float = 0.0                 # rostered hours
    a_start: str = ""                  # actual start HH:MM
    a_end: str = ""                    # actual end HH:MM
    wobod: bool = False
    km: float = 0.0
    leave_cat: str = "none"            # 'none' | 'SL' | 'AL' | ...
    is_short_fortnight: bool = False   # set by compute_fortnight


class RateConfig(BaseModel):
    """Configurable pay rates. PRD §9.3"""
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
    """Payroll codes for payslip matching."""
    base: str = ""
    ot1: str = ""
    ot2: str = ""
    sat: str = ""
    sun: str = ""
    sat_ot: str = ""
    ph_wkd: str = ""
    ph_wke: str = ""
    afternoon: str = ""
    night: str = ""
    early: str = ""
    add_load: str = ""
    wobod: str = ""
    liftup: str = ""
    ado: str = ""
    unassoc: str = ""


class CalculateRequest(BaseModel):
    """Full fortnight calculation request. PRD §9.2"""
    fortnight_start: str               # YYYY-MM-DD (Sunday)
    roster_line: int
    public_holidays: list[str] = Field(default_factory=list)
    payslip_total: Optional[float] = None
    config: RateConfig = Field(default_factory=RateConfig)
    codes: PayrollCodes = Field(default_factory=PayrollCodes)
    days: list[DayState]               # exactly 14 items
    unassoc_amt: float = 0.0


# ─── Response models ─────────────────────────────────────────────────────────

class PayComponent(BaseModel):
    """Single pay line item. PRD §9.2"""
    name: str
    ea: str                            # EA clause reference
    code: str                          # payroll code
    hrs: str                           # hours or 'flat'
    rate: str                          # rate description
    amount: float
    cls: str = ""                      # CSS class hint: 'pen-row' | 'km-row' | ''


class DayResult(BaseModel):
    date: str
    diag: str
    day_type: str                      # 'weekday' | 'saturday' | 'sunday' | 'ph'
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
    fortnight_type: str                # 'short' | 'long'
    flags: list[str]


class CalculateResponse(BaseModel):
    """Full fortnight calculation response. PRD §9.3"""
    fortnight_start: str
    fortnight_type: str                # 'short' | 'long'
    total_hours: float
    total_pay: float
    ado_payout: float
    fn_ot_hrs: float
    days: list[DayResult]
    component_totals: dict[str, float] # component name → total amount
    audit: AuditResult


# ─── Upload response models ───────────────────────────────────────────────────

class ParsedDayEntry(BaseModel):
    """One day parsed from a roster PDF. PRD §9.4"""
    date: str
    diagram: str
    sign_on: Optional[str] = None      # HH:MM
    sign_off: Optional[str] = None     # HH:MM
    confidence: float = 1.0            # 0.0–1.0


class ParseRosterResponse(BaseModel):
    source_file: str
    parsed_days: list[ParsedDayEntry]
    warnings: list[str] = Field(default_factory=list)


class PayslipLineItem(BaseModel):
    """One line item from a payslip. PRD §9.5"""
    code: str
    description: str
    hours: Optional[float] = None
    rate: Optional[float] = None
    amount: float


class ParsePayslipResponse(BaseModel):
    source_file: str
    format: str                        # 'nsw_payslip' | 'sydney_crew'
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_gross: float
    line_items: list[PayslipLineItem]
    warnings: list[str] = Field(default_factory=list)
