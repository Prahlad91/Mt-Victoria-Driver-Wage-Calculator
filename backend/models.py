"""Pydantic v2 models for the Mt Victoria Driver Wage Calculator API.
PRD ref: Section 9

v3.11 changes:
- alias_generator=to_camel + populate_by_name=True on all input models
  (the $0-result bug fix — frontend sends camelCase, backend expected snake_case)
- Added is_short_fortnight to CalculateRequest (frontend can override detection
  for cases where rostered ADO was overridden to WORKED via WOBOD)
- Added optional 'date' field to PayComponent (per-day vs fortnight-level)
- Added optional pool_to_ordinary flag to PayComponent
- Added fortnight_components list to CalculateResponse for payslip-format display
- claim_liftup_layback unchanged from v3.10
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


# ─── Base config that accepts both camelCase and snake_case ────────────────────────────

class CamelModel(BaseModel):
    """Base for any model that the frontend sends. Pydantic v2 generates a
    camelCase alias for every snake_case field; populate_by_name=True means
    the field can also be filled via its original snake_case name. extra='ignore'
    silently drops anything we don't know about."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra='ignore',
    )


# ─── Request models ───────────────────────────────────────────────────────

class DayState(CamelModel):
    """State for a single day in the fortnight. PRD §9.1"""
    date: str
    dow: int
    ph: bool = False
    diag: str
    diag_num: Optional[str] = None
    time_source: str = 'none'
    r_start: Optional[str] = None
    r_end: Optional[str] = None
    cm: bool = False
    r_hrs: float = 0.0
    a_start: str = ''
    a_end: str = ''
    wobod: bool = False
    km: float = 0.0
    leave_cat: str = 'none'
    is_short_fortnight: bool = False
    claim_liftup_layback: bool = True
    # NEW v3.11: track if this day was originally an ADO before manual override
    # so the fortnight-level short/long detection still works after override.
    was_ado: bool = False


class RateConfig(CamelModel):
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
    wobod_rate: float = 2.0  # legacy, no longer used after Cl. 140.4 rewrite
    wobod_min: int = 0  # v3.11: removed 4-hr min (no EA basis)


class PayrollCodes(CamelModel):
    base: str = '1001'
    ot1: str = '1026'
    ot2: str = '1110'
    sat: str = '1064'
    sun: str = ''
    sat_ot: str = ''
    ph_wkd: str = '5042'
    ph_wke: str = '1010'
    afternoon: str = ''
    night: str = '1487'
    early: str = '1483'
    add_load: str = '1470'
    wobod: str = '1059'
    liftup: str = ''
    ado: str = '1462'
    unassoc: str = ''


class CalculateRequest(CamelModel):
    fortnight_start: str
    roster_line: int
    public_holidays: list[str] = Field(default_factory=list)
    payslip_total: Optional[float] = None
    config: RateConfig = Field(default_factory=RateConfig)
    codes: PayrollCodes = Field(default_factory=PayrollCodes)
    days: list[DayState]
    unassoc_amt: float = 0.0
    # NEW v3.11: explicit short fortnight override. If None, auto-detect from days.
    is_short_fortnight: Optional[bool] = None


# ─── Response models ──────────────────────────────────────────────────────
# Response models ALSO need camelCase serialisation so the frontend can read them.

class PayComponent(BaseModel):
    """Single line in the payslip-style breakdown."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )
    name: str
    ea: str
    code: str
    hrs: str
    rate: str
    amount: float
    cls: str = ''
    date: Optional[str] = None  # NEW v3.11: per-day or fortnight-level
    pool_to_ordinary: bool = False  # NEW v3.11


class DayResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    date: str
    diag: str
    day_type: str
    hours: float
    paid_hrs: float
    total_pay: float
    components: list[PayComponent]
    flags: list[str]


class AuditResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    payslip_variance: Optional[float] = None
    fn_ot_hrs: float = 0.0
    km_bonus_hrs: float = 0.0
    ado_payout: float = 0.0
    fortnight_type: str
    flags: list[str]


class CalculateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    fortnight_start: str
    fortnight_type: str
    total_hours: float
    total_pay: float
    ado_payout: float
    fn_ot_hrs: float
    days: list[DayResult]
    component_totals: dict[str, float]
    audit: AuditResult
    # NEW v3.11: payslip-format component list (sorted by date, fortnight-level last)
    fortnight_components: list[PayComponent] = Field(default_factory=list)


# ─── Upload response models (server → frontend, can stay snake_case-only) ─────

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
