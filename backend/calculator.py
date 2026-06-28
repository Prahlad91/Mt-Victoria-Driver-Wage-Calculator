"""EA 2025 pay calculation engine — Mt Victoria Driver Wage Calculator v3.11
PRD ref: Section 5

DO NOT modify pay logic without first updating PRD.md.

v3.11 — corrected against actual payslip reconciliation ($7,336.55 test case):
  - WOBOD rewritten per Cl. 140.4 + Cl. 140.7 with weekday counter
  - Afternoon detection fixed: Cl. 134.1(a) — ordinary time (first 8h) must
    span 18:00, not actual sign-off
  - 2dp hours rounding before multiply (matches payroll system exactly)
  - Auto-detect non-overlap shift swap (overlap < 50% of shorter shift) →
    suppresses claim with warning; user can override
  - ADO ±4hr Adjustment as fortnight-level component (1462)
  - KM fallback to schedule when actual=0 (handled at frontend, but supported)
  - Payslip-style line items with real codes (1001, 1010, 1026, 1059, 1064,
    1100, 1110, 1462, 1470, 1483, 1487, 5042)
  - Removed: 4-hr WOBOD minimum (no EA basis)
"""
from __future__ import annotations
from typing import Optional
from decimal import Decimal, ROUND_HALF_UP
import json
from pathlib import Path
from models import (
    DayState, RateConfig, PayrollCodes, PayComponent, DayResult,
    CalculateRequest, CalculateResponse, AuditResult,
)

DATA_DIR = Path(__file__).parent / "data"

# ─── Rounding helpers ─────────────────────────────────────────────────────

def r2(x: float) -> float:
    """Round to 2dp using HALF_UP (matches payroll)."""
    return float(Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def r2_hrs(x: float) -> float:
    """Round HOURS to 2dp BEFORE rate multiplication (critical for payroll match)."""
    return float(Decimal(str(x)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


# ─── Time helpers ────────────────────────────────────────────────────────

def _to_mins(t: str) -> Optional[int]:
    if not t:
        return None
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _to_hrs(mins: float) -> float:
    return mins / 60


# ─── EA Cl. 134.3(b) rounding ─────────────────────────────────────────

def round_hrs_ea(hrs: float) -> int:
    """Cl. 134.3(b): <30 min disregarded; 30–59 min → 1 full hour."""
    whole = int(hrs)
    frac_mins = (hrs - whole) * 60
    return whole if frac_mins < 30 else whole + 1


# ─── KM credit table (Cl. 146.4) ────────────────────────────────────────

try:
    _KM_BANDS_DATA = json.loads((DATA_DIR / "km_bands.json").read_text())
except Exception:
    _KM_BANDS_DATA = []

_KM_BANDS_FALLBACK = [
    {"min_km": 161, "max_km": 193, "credited_hrs": 5.0},
    {"min_km": 193, "max_km": 225, "credited_hrs": 6.0},
    {"min_km": 225, "max_km": 257, "credited_hrs": 8.0},
    {"min_km": 257, "max_km": 290, "credited_hrs": 8.0},
    {"min_km": 290, "max_km": 322, "credited_hrs": 9.0},
    {"min_km": 322, "max_km": 338, "credited_hrs": 10.0},
    {"min_km": 338, "max_km": 354, "credited_hrs": 10.5},
    {"min_km": 354, "max_km": 370, "credited_hrs": 11.0},
    {"min_km": 370, "max_km": 386, "credited_hrs": 11.5},
    {"min_km": 386, "max_km": 402, "credited_hrs": 12.0},
    {"min_km": 402, "max_km": 418, "credited_hrs": 12.5},
    {"min_km": 418, "max_km": 435, "credited_hrs": 13.0},
    {"min_km": 435, "max_km": 451, "credited_hrs": 13.5},
    {"min_km": 451, "max_km": 467, "credited_hrs": 14.0},
    {"min_km": 467, "max_km": 483, "credited_hrs": 14.5},
    {"min_km": 483, "max_km": 499, "credited_hrs": 15.0},
    {"min_km": 499, "max_km": 515, "credited_hrs": 15.5},
    {"min_km": 515, "max_km": 531, "credited_hrs": 16.0},
    {"min_km": 531, "max_km": 547, "credited_hrs": 16.5},
    {"min_km": 547, "max_km": 563, "credited_hrs": 17.0},
    {"min_km": 563, "max_km": 579, "credited_hrs": 17.5},
    {"min_km": 579, "max_km": 595, "credited_hrs": 18.0},
    {"min_km": 595, "max_km": 612, "credited_hrs": 18.5},
    {"min_km": 612, "max_km": 628, "credited_hrs": 19.0},
    {"min_km": 628, "max_km": 644, "credited_hrs": 19.5},
    {"min_km": 644, "max_km": None, "base_at_644": 19.5, "increment_per_16km": 0.5},
]
_KM_BANDS = _KM_BANDS_DATA or _KM_BANDS_FALLBACK


def get_km_credit(km: float) -> Optional[float]:
    """Return credited hours for given km. PRD §5.5 / Cl. 146.4(a)."""
    if km <= 0 or km < 161:
        return None
    for band in _KM_BANDS:
        lo = band["min_km"]
        hi = band.get("max_km")
        if hi is None:
            extra = km - 644
            steps = (extra + 15.999) // 16
            return band["base_at_644"] + steps * band["increment_per_16km"]
        if lo <= km < hi:
            return band.get("credited_hrs")
    return None


# ─── Window resolution (Cl. 131 — effective window with auto-suppress) ───

def _resolve_window(day: DayState) -> dict:
    """Resolve the time window per PRD §5.7 with auto-detect non-overlap.
    
    Auto-suppress rule: if actual and scheduled overlap < 50% of the shorter
    shift, the calc treats it as a shift swap and ignores the claim toggle
    (forces claim=No). User can still override the toggle but a warning
    flag is emitted.
    """
    a_s = _to_mins(day.a_start)
    a_e = _to_mins(day.a_end)
    if a_s is None or a_e is None:
        return {'valid': False}
    if day.cm or a_e <= a_s:
        a_e += 1440
    actual_hrs = _to_hrs(a_e - a_s)
    
    base = {
        'valid': True, 'a_s': a_s, 'a_e': a_e,
        'eff_s': a_s, 'eff_e': a_e,
        'worked_hrs': actual_hrs, 'actual_hrs': actual_hrs,
        'liftup_hrs': 0.0, 'layback_hrs': 0.0,
        'claim_active': False, 'auto_suppressed': False, 'overlap_ratio': 1.0,
    }
    
    # WOBOD ignores the toggle entirely
    if day.wobod:
        return base
    
    # No scheduled times → use actual
    if not day.r_start or not day.r_end:
        return base
    
    r_s = _to_mins(day.r_start)
    r_e = _to_mins(day.r_end)
    if r_s is None or r_e is None:
        return base
    if day.cm or r_e <= r_s:
        r_e += 1440
    
    # Calculate overlap
    overlap_start = max(a_s, r_s)
    overlap_end = min(a_e, r_e)
    overlap_mins = max(0, overlap_end - overlap_start)
    sched_mins = r_e - r_s
    actual_mins = a_e - a_s
    min_duration = min(sched_mins, actual_mins)
    overlap_ratio = overlap_mins / min_duration if min_duration > 0 else 0
    base['overlap_ratio'] = overlap_ratio
    
    is_shift_swap = overlap_ratio < 0.25  # <25% = clear swap; 25-50% = shifted start, allow claim
    user_wants_claim = day.claim_liftup_layback
    
    if user_wants_claim and not is_shift_swap:
        eff_s = min(a_s, r_s)
        eff_e = max(a_e, r_e)
        return {
            **base,
            'eff_s': eff_s, 'eff_e': eff_e,
            'worked_hrs': _to_hrs(eff_e - eff_s),
            'liftup_hrs': _to_hrs(max(0, r_s - a_s)),
            'layback_hrs': _to_hrs(max(0, a_e - r_e)),
            'claim_active': True,
        }
    elif user_wants_claim and is_shift_swap:
        return {**base, 'auto_suppressed': True}
    else:
        return base


# ─── Shift class (Cl. 134.1) — uses ACTUAL sign-on ──────────────────────────

def _get_shift_class(a_s: int, a_e: int) -> Optional[str]:
    """Cl. 134.1 shift classes. Critical fix in v3.11: afternoon requires
    ORDINARY TIME (first 8h) to span 18:00, not just actual end > 18:00.
    
    Cl. 134.1(a): Afternoon = ordinary time commences before AND concludes
                  after 1800. Ordinary = first 8h of shift. So afternoon when
                  10:00 ≤ sign_on < 18:00 (i.e. sign_on + 8h > 18:00).
    Cl. 134.1(b): Night = sign-on between 18:00 and 03:59
    Cl. 134.1(c): Early = sign-on between 04:00 and 05:30
    """
    s_min = a_s % 1440
    if s_min >= 1080 or s_min < 240:  # 18:00–03:59
        return 'night'
    if 240 <= s_min <= 330:  # 04:00–05:30
        return 'early'
    if 600 <= s_min < 1080:  # 10:00–17:59 (ordinary ends after 18:00)
        return 'afternoon'
    return None


def _add_loading_eligible(a_s: int, dow: int, is_ph: bool) -> bool:
    """Cl. 134.4 Item 9: weekday Mon-Fri, sign-on 01:01-03:59, NOT PH."""
    s_min = a_s % 1440
    return (not is_ph) and (1 <= dow <= 5) and (61 <= s_min <= 239)


# ─── Component constructor ──────────────────────────────────────────

def _comp(code: str, name: str, ea: str, units: str, rate_str: str,
          amount: float, cls: str = '', date: Optional[str] = None,
          pool: bool = False) -> PayComponent:
    return PayComponent(
        code=code, name=name, ea=ea,
        hrs=units, rate=rate_str, amount=r2(amount),
        cls=cls, date=date, pool_to_ordinary=pool,
    )


# ─── Per-day calculation ──────────────────────────────────────────

def compute_day(day: DayState, cfg: RateConfig, codes: PayrollCodes,
                unassoc_amt: float = 0.0) -> DayResult:
    """Compute per-day pay components in payslip format. PRD §5."""
    is_sat = day.dow == 6
    is_sun = day.dow == 0
    is_ph = day.ph
    B = cfg.base_rate
    
    # ─── OFF / ADO / Leave fast paths ───────────────────────────────
    if day.diag == "OFF":
        return DayResult(
            date=day.date, diag=day.diag, day_type="off",
            hours=0, paid_hrs=0, total_pay=0,
            components=[], flags=[],
        )
    
    if day.diag == "ADO":
        # ADO day in roster — pay handled at fortnight level via
        # the ADO Adjustment (1462). Per-day pay = $0.
        return DayResult(
            date=day.date, diag=day.diag, day_type="ado",
            hours=0, paid_hrs=0, total_pay=0,
            components=[],
            flags=["ADO day — fortnight ±4hr adjustment applied at fortnight level (Cl. 120)."],
        )
    
    if day.leave_cat and day.leave_cat != "none" and day.leave_cat != "PDWP":
        return _compute_leave(day, cfg, codes)
    
    # No actual times → no pay
    if not day.a_start or not day.a_end:
        return DayResult(
            date=day.date, diag=day.diag, day_type="weekday",
            hours=0, paid_hrs=0, total_pay=0,
            components=[], flags=["Enter actual times."],
        )
    
    # Resolve window
    win = _resolve_window(day)
    if not win.get('valid'):
        return DayResult(
            date=day.date, diag=day.diag, day_type="weekday",
            hours=0, paid_hrs=0, total_pay=0,
            components=[], flags=["Could not resolve time window."],
        )
    
    components: list[PayComponent] = []
    flags: list[str] = []
    
    a_s = win['a_s']; a_e = win['a_e']
    actual_hrs = r2_hrs(win['actual_hrs'])
    worked_hrs = r2_hrs(win['worked_hrs'])
    
    # Window flags
    if win['auto_suppressed']:
        flags.append(
            f"⚠ Auto-detected shift swap (only {win['overlap_ratio']*100:.0f}% overlap "
            f"between actual and scheduled). Lift-up/layback claim suppressed — paid on "
            f"actual times only. Override the toggle to force claim if intended."
        )
    elif win['claim_active']:
        if win['liftup_hrs'] > 0:
            flags.append(f"Lift-up: {win['liftup_hrs']:.2f} hrs before scheduled "
                         f"({day.r_start} ← {day.a_start}) — included in effective window (Cl. 131).")
        if win['layback_hrs'] > 0:
            flags.append(f"Layback: {win['layback_hrs']:.2f} hrs after scheduled "
                         f"({day.r_end} → {day.a_end}) — included in effective window (Cl. 131).")
    
    km = day.km
    km_credited = get_km_credit(km) if km > 0 else None
    
    day_type = "ph" if is_ph else ("sunday" if is_sun else ("saturday" if is_sat else "weekday"))
    
    # ─── WOBOD (Cl. 140.4 + 140.7) ──────────────────────────────────
    # Primary rate depends on day type and (for weekdays) WOBOD-shift counter.
    # The counter is owned by compute_fortnight, so we emit a placeholder DayResult
    # with the actual hours and a "is_wobod" sentinel via flags. Components are
    # populated by compute_fortnight in pass 2.
    if day.wobod:
        return DayResult(
            date=day.date, diag=day.diag, day_type=day_type,
            hours=actual_hrs, paid_hrs=actual_hrs,
            total_pay=0,  # filled by compute_fortnight
            components=[],
            flags=flags + [f"__WOBOD_PENDING__:{actual_hrs}"],
        )
    
    # ─── Non-WOBOD ─────────────────────────────────────────────────
    ord_h = r2_hrs(min(worked_hrs, 8.0))
    ot_h = r2_hrs(max(0.0, worked_hrs - 8.0))
    # Cl. 78.3: first 3 hours of daily OT at 1.5×, beyond that at 2.0×.
    # (Fixed v3.19 — was incorrectly using a 2-hour boundary.)
    ot1h = r2_hrs(min(ot_h, 3.0))
    ot2h = r2_hrs(max(0.0, ot_h - 3.0))
    
    if is_ph:
        # PH worked: base at 1× pooled, loading at 0.5× (wkdy) or 1.5× (weekend)
        loading_pct = 1.5 if (is_sat or is_sun) else 0.5
        loading_rate = B * loading_pct
        ph_h = r2_hrs(max(worked_hrs, km_credited or 0))
        components.append(_comp(
            codes.base or '1001', 'Ordinary Hours (PH worked, base portion)', 'Sch. 4A',
            f'{ph_h:.2f} hrs', f'${B:.5f}/hr',
            ph_h * B, date=day.date, pool=True,
        ))
        loading_code = (codes.ph_wke or '1010') if (is_sat or is_sun) else (codes.ph_wkd or '5042')
        components.append(_comp(
            loading_code,
            f'PH worked loading (+{int(loading_pct*100)}%, {"weekend" if (is_sat or is_sun) else "weekday"})',
            'Cl. 31.5(a)',
            f'{ph_h:.2f} hrs', f'${loading_rate:.5f}/hr',
            ph_h * loading_rate, date=day.date,
        ))
        flags.append(f"PH worked: loading + additional day pay accrues (Cl. 31.5(b)).")
    
    elif is_sun:
        components.append(_comp(
            codes.base or '1001', 'Ordinary Hours (Sunday, base portion)', 'Sch. 4A',
            f'{ord_h:.2f} hrs', f'${B:.5f}/hr',
            ord_h * B, date=day.date, pool=True,
        ))
        components.append(_comp(
            codes.sun or '', 'Loading @ 100% Sunday', 'Cl. 54.2',
            f'{ord_h:.2f} hrs', f'${B:.5f}/hr',
            ord_h * B, date=day.date,
        ))
        if ot1h + ot2h > 0:
            ot_total = r2_hrs(ot1h + ot2h)
            components.append(_comp(
                codes.sat_ot or '1027', 'Sched OT 200%', 'Cl. 140.2(d)',
                f'{ot_total:.2f} hrs', f'${B*2:.5f}/hr (200%)',
                ot_total * B * 2.0, date=day.date,
            ))
    
    elif is_sat:
        components.append(_comp(
            codes.base or '1001', 'Ordinary Hours (Saturday, base portion)', 'Sch. 4A',
            f'{ord_h:.2f} hrs', f'${B:.5f}/hr',
            ord_h * B, date=day.date, pool=True,
        ))
        sat_loading = B * 0.5
        components.append(_comp(
            codes.sat or '1064', 'Loading @ 50% Saturday', 'Cl. 54.1',
            f'{ord_h:.2f} hrs', f'${sat_loading:.5f}/hr',
            ord_h * sat_loading, date=day.date,
        ))
        if ot1h + ot2h > 0:
            ot_total = r2_hrs(ot1h + ot2h)
            components.append(_comp(
                codes.sat_ot or '1027', 'Sched OT 200%', 'Cl. 140.2(b)',
                f'{ot_total:.2f} hrs', f'${B*2:.5f}/hr (200%)',
                ot_total * B * 2.0, date=day.date,
            ))
    
    else:
        # Weekday
        components.append(_comp(
            codes.base or '1001', 'Ordinary Hours', 'Sch. 4A',
            f'{ord_h:.2f} hrs', f'${B:.5f}/hr',
            ord_h * B, date=day.date, pool=True,
        ))
        if ot1h > 0:
            ot1_rate = B * 1.5
            components.append(_comp(
                codes.ot1 or '1026', 'Sched OT 150%', 'Cl. 140.2(a)',
                f'{ot1h:.2f} hrs', f'${ot1_rate:.5f}/hr',
                ot1h * ot1_rate, date=day.date,
            ))
        if ot2h > 0:
            ot2_rate = B * 2.0
            components.append(_comp(
                codes.ot2 or '1110', 'Sched OT 200%', 'Cl. 140.2(a)',
                f'{ot2h:.2f} hrs', f'${ot2_rate:.5f}/hr',
                ot2h * ot2_rate, date=day.date,
            ))
        # Shift penalty (Cl. 134.1)
        sc = _get_shift_class(a_s, a_e)
        if sc:
            pen_rate = (cfg.night_rate if sc == 'night' else
                        cfg.early_rate if sc == 'early' else
                        cfg.afternoon_rate)
            pen_h = round_hrs_ea(ord_h)
            pen_code = (codes.night if sc == 'night' else
                        codes.early if sc == 'early' else
                        codes.afternoon)
            pen_name = ('Night Shift Dvrs/Grds Hrl' if sc == 'night' else
                        'Morning Shift Dvrs/Grds H' if sc == 'early' else
                        'Afternoon Shift Dvrs/Grds')
            pen_clause = f'Item {7 if sc=="night" else 8 if sc=="early" else 6} Sch.4B'
            components.append(_comp(
                pen_code or '', pen_name, pen_clause,
                f'{float(pen_h):.2f} hrs', f'${pen_rate:.5f}/hr',
                pen_h * pen_rate, date=day.date, cls='pen-row',
            ))
        # Item 9 (Cl. 134.4)
        if _add_loading_eligible(a_s, day.dow, is_ph):
            components.append(_comp(
                codes.add_load or '1470',
                'Special Loading Drvs/Grds', 'Cl. 134.4',
                '1.00 hrs', f'${cfg.add_loading:.5f}/hr',
                cfg.add_loading, date=day.date, cls='pen-row',
            ))
    
    # 1454 "Assoc Wrk Time (Mileage)" per Cl. 157.1(b) / Cl. 146.4
    # Formula: Build Up = max(0, Un-Assoc + Assoc Payment + Distance Payment − Shift Length)
    # "Shift Length" = the EFFECTIVE paid window: max(r_hrs, lift-up window).
    # When lift-up is claimed and extends beyond r_hrs, the driver is already
    # being paid for that extra time — the build-up competes against the effective
    # window, not just the scheduled hours. E.g. diagram 3155 with lift-up 01:06→10:32
    # gives an effective window of 9:26 > assoc calc of 8:30 → no build-up.
    sched_hrs = day.r_hrs if day.r_hrs > 0 else actual_hrs
    # Use the effective lift-up window if it's larger than scheduled r_hrs.
    # win['worked_hrs'] already reflects the full window when claim_active is True.
    if win.get('claim_active') and worked_hrs > sched_hrs:
        sched_hrs = worked_hrs
    un_assoc  = day.un_assoc_hrs  or 0.0
    assoc_pay = day.assoc_payment_hrs or 0.0
    dist_pay  = km_credited or 0.0
    total_credit = un_assoc + assoc_pay + dist_pay
    # Use the chart's pre-computed build-up only when lift-up hasn't extended
    # the window (otherwise the static value would over-pay).
    liftup_extends = win.get('claim_active') and worked_hrs > (day.r_hrs or actual_hrs)
    if day.assoc_build_up_hrs > 0 and not liftup_extends:
        build_up = r2_hrs(day.assoc_build_up_hrs)
    else:
        build_up = r2_hrs(max(0.0, total_credit - sched_hrs))
    if build_up > 0:
        b_rate = B  # Cl. 157.1(b): assoc/un-assoc build-up always at base rate
        components.append(_comp(
            codes.km or '1454',
            f'Assoc Wrk Time (Mileage) — {km:.0f} km: '
            f'un-assoc {un_assoc:.2f}h + assoc {assoc_pay:.2f}h + dist {dist_pay:.2f}h = {total_credit:.2f}h',
            'Cl. 157.1(b) / Cl. 146.4', f'{build_up:.2f} hrs', f'${b_rate:.5f}/hr',
            build_up * b_rate, date=day.date, cls='km-row',
        ))
        flags.append(
            f"1454: un-assoc {un_assoc:.2f}h + assoc {assoc_pay:.2f}h + dist {dist_pay:.2f}h "
            f"= {total_credit:.2f}h vs sched {sched_hrs:.2f}h → build-up +{build_up:.2f}h."
        )
    
    # Cl. 143.5 / Item 12 Sch.4B — flat $14.55 when actual shift > 10h and ≤ 16h
    if 10.0 < actual_hrs <= 16.0:
        components.append(_comp(
            codes.exp_over_10h or '1496',
            'Exp More Than 10 Hours',
            'Cl. 143.5 / Item 12 Sch.4B',
            '1.00', f'${cfg.exp_over_10h_rate:.5f}',
            cfg.exp_over_10h_rate, date=day.date, cls='pen-row',
        ))

    # PDWP — Picnic Day Worked and Paid: extra 8h ordinary on top of shift pay (Cl. 32.1)
    # Only added when actual hours > 0 (i.e. the driver actually worked).
    if day.leave_cat == 'PDWP' and worked_hrs > 0:
        extra = r2(8.0 * B)
        components.append(_comp(
            '', 'Picnic Day — additional 8 hrs', 'Cl. 32.1',
            '8.00 hrs', f'${B:.5f}/hr', extra, date=day.date,
        ))
        flags.append("PDWP: worked shift paid at applicable rates + additional 8-hr ordinary (Cl. 32.1).")

    if ot_h > 0:
        flags.append(f"Daily OT: {ot_h:.2f} hrs beyond 8-hr ordinary limit (Cl. 78.3).")

    total = r2(sum(c.amount for c in components))
    paid_hrs = r2(worked_hrs + build_up) if build_up > 0 else worked_hrs

    return DayResult(
        date=day.date, diag=day.diag, day_type=day_type,
        hours=worked_hrs, paid_hrs=r2(paid_hrs),
        total_pay=total, components=components, flags=flags,
    )


def _compute_leave(day: DayState, cfg: RateConfig, codes: PayrollCodes) -> DayResult:
    """Leave categories. PRD §5.9. v3.11: PHNW uses 5042/1010 split."""
    B = cfg.base_rate
    cat = day.leave_cat
    r_hrs = day.r_hrs or 8.0
    
    if cat == 'PHNW':
        is_weekend_ph = (day.dow == 0 or day.dow == 6)
        code = (codes.ph_wke or '1010') if is_weekend_ph else (codes.ph_wkd or '5042')
        name = 'PHNW / TC'
        amt = r2(8.0 * B)
        return DayResult(
            date=day.date, diag=day.diag, day_type='leave',
            hours=0, paid_hrs=8.0, total_pay=amt,
            components=[_comp(code, name, 'Cl. 31.7',
                              '8.00 hrs', f'${B:.5f}/hr', amt, date=day.date)],
            flags=[f"PHNW / TC: 8 hrs ordinary (Cl. 31.7)."],
        )
    
    # v3.30: Sick leave pays the entire scheduled shift at ordinary rate, with
    # a 8-hour minimum.  Shifts ≤ 8h are paid out as 8h; shifts > 8h are paid
    # for the full scheduled duration.  No OT split applies to sick days.
    # v3.38: Carer's leave applies the same rule (same EA treatment — no OT,
    # 8-hour minimum).
    sl_hrs = max(r_hrs, 8.0)
    leave_map = {
        "SL":   (sl_hrs, B, "Sick leave",            "Cl. 30.4"),
        "CL":   (sl_hrs, B, "Carer's leave",         "Cl. 30.7(b)(ix)"),
        "BL":   (r_hrs,  B, "Bereavement leave",     "Cl. 30.8(k)(iv)"),
        "JD":   (r_hrs,  B, "Jury duty",             "Cl. 30.8(g)"),
        "LWOP": (0,     0, "Leave without pay",     "—"),
        "RDO":  (0,     0, "Roster day off (RDO)",   "—"),
    }
    
    if cat in leave_map:
        hrs, rate, name, ea = leave_map[cat]
        amt = r2(hrs * rate)
        comps = ([_comp('', name, ea, f'{hrs:.2f} hrs', f'${rate:.5f}/hr', amt, date=day.date)]
                 if amt > 0 else [])
        return DayResult(date=day.date, diag=day.diag, day_type='leave',
                         hours=0, paid_hrs=hrs, total_pay=amt,
                         components=comps, flags=[f"{cat}: {name} ({ea})."])
    
    if cat == 'AL':
        base = r2(8.0 * B)
        loading = r2(7.92 * B * 0.20)   # EA: loading calculated on 7.92 hrs, not 8.00
        return DayResult(
            date=day.date, diag=day.diag, day_type='leave',
            hours=0, paid_hrs=8.0, total_pay=r2(base + loading),
            components=[
                _comp('', 'Annual leave', 'Cl. 30.1', '8.00 hrs', f'${B:.5f}/hr', base, date=day.date),
                _comp('', 'Annual leave loading 20%', 'Cl. 30.2(a)(ii)',
                      '7.92 hrs', '20% loading', loading, date=day.date),
            ],
            flags=["AL: 8 hrs ordinary + 7.92 hrs × 20% loading (Cl. 30.2(a)(ii))."],
        )
    
    if cat == 'PHW':
        pay_hrs = r_hrs
        if day.a_start and day.a_end:
            a_s = _to_mins(day.a_start); a_e = _to_mins(day.a_end)
            if a_s is not None and a_e is not None:
                if day.cm or a_e <= a_s: a_e += 1440
                pay_hrs = r2_hrs((a_e - a_s) / 60)
        loading = r2(pay_hrs * B * 1.5)
        add_day = r2(8.0 * B)
        return DayResult(
            date=day.date, diag=day.diag, day_type='leave',
            hours=pay_hrs, paid_hrs=pay_hrs, total_pay=r2(loading + add_day),
            components=[
                _comp('', 'PHW — 150% loading', 'Cl. 31.5(a)',
                      f'{pay_hrs:.2f} hrs', '1.5× ordinary', loading, date=day.date),
                _comp('', 'PHW — additional day', 'Cl. 31.5(b)',
                      '8.00 hrs', f'${B:.5f}/hr', add_day, date=day.date),
            ],
            flags=["PHW: 150% loading + additional day (Cl. 31.5)."],
        )

    if cat == 'PHWA':
        pay_hrs = r_hrs
        if day.a_start and day.a_end:
            a_s = _to_mins(day.a_start); a_e = _to_mins(day.a_end)
            if a_s is not None and a_e is not None:
                if day.cm or a_e <= a_s: a_e += 1440
                pay_hrs = r2_hrs((a_e - a_s) / 60)
        loading = r2(pay_hrs * B * 1.5)
        return DayResult(
            date=day.date, diag=day.diag, day_type='leave',
            hours=pay_hrs, paid_hrs=pay_hrs, total_pay=r2(loading),
            components=[
                _comp('', 'PHW — 150% loading', 'Cl. 31.5(a)',
                      f'{pay_hrs:.2f} hrs', '1.5× ordinary', loading, date=day.date),
            ],
            flags=[
                "PHW (accrued): 150% loading paid; "
                "additional 8-hr day accrues for future use (Cl. 31.5(b))."
            ],
        )
    
    return DayResult(date=day.date, diag=day.diag, day_type='leave',
                     hours=0, paid_hrs=0, total_pay=0,
                     components=[], flags=[f"Unknown leave: {cat}"])


# ─── Fortnight aggregation ──────────────────────────────────────────

def compute_fortnight(req: CalculateRequest) -> CalculateResponse:
    """Compute gross pay for the full fortnight in payslip format."""
    days = req.days
    cfg = req.config
    codes = req.codes
    B = cfg.base_rate
    
    # Short-fortnight detection — explicit override OR auto-detect
    explicit = getattr(req, 'is_short_fortnight', None)
    if explicit is not None:
        is_short = explicit
    else:
        # Auto-detect: any rostered ADO day OR any day with was_ado=True
        # (was_ado handles the case where user worked an ADO day as WOBOD)
        is_short = any(d.diag == "ADO" or getattr(d, 'was_ado', False) for d in days)
    
    for d in days:
        d.is_short_fortnight = is_short
    
    # ─── Pass 1: per-day calc ─────────────────────────────────────────
    day_results = [compute_day(d, cfg, codes, req.unassoc_amt) for d in days]
    
    # ─── Pass 2: WOBOD components (with weekday counter) ─────────────
    weekday_wobod_count = 0
    for i, dr in enumerate(day_results):
        # Find the WOBOD pending sentinel
        wobod_flag = next((f for f in dr.flags if f.startswith('__WOBOD_PENDING__:')), None)
        if not wobod_flag:
            continue
        
        actual_hrs_str = wobod_flag.split(':')[1]
        wobod_hrs = r2_hrs(float(actual_hrs_str))
        day = days[i]
        dow = day.dow
        
        # Determine primary rate per Cl. 140.4. Code mapping per Prahlad's payslip:
        #   150% → code 1100 (Overtime @ 150%)
        #   250% → code 1110 (Overtime @ 250%)
        #   200% → code 1110 (Overtime @ 200%) — same code, different rate label
        if dow == 0:  # Sunday WOBOD = 250% per Cl. 140.4(d)
            primary_pct = 250
            primary_clause = 'Cl. 140.4(d)'
            primary_code = '1110'
            primary_name = 'Overtime @ 250%'
        elif dow == 6:  # Saturday
            primary_pct = 200
            primary_clause = 'Cl. 140.4(c)'
            primary_code = '1110'
            primary_name = 'Overtime @ 200%'
        else:  # Weekday
            weekday_wobod_count += 1
            if weekday_wobod_count <= 2:
                primary_pct = 150
                primary_clause = 'Cl. 140.4(a)'
                primary_code = '1100'
                primary_name = f'Overtime @ 150% (wkdy WOBOD #{weekday_wobod_count})'
            else:
                primary_pct = 200
                primary_clause = 'Cl. 140.4(b)'
                primary_code = '1110'
                primary_name = f'Overtime @ 200% (wkdy WOBOD #{weekday_wobod_count})'
        
        primary_rate = B * primary_pct / 100
        addl_rate = B * 0.5
        
        primary_comp = _comp(
            primary_code, primary_name, primary_clause,
            f'{wobod_hrs:.2f} hrs', f'${primary_rate:.5f}/hr',
            wobod_hrs * primary_rate, date=day.date,
        )
        addl_comp = _comp(
            codes.wobod or '1059', 'WOBOD — Loading @ 50%', 'Cl. 140.7',
            f'{wobod_hrs:.2f} hrs', f'${addl_rate:.5f}/hr',
            wobod_hrs * addl_rate, date=day.date,
        )
        
        # Replace empty components with the two WOBOD components
        dr.components = [primary_comp, addl_comp]
        dr.total_pay = r2(primary_comp.amount + addl_comp.amount)

        # Cl. 143.5 / Item 12 Sch.4B — also applies on WOBOD shifts > 10h
        if 10.0 < wobod_hrs <= 16.0:
            exp_comp = _comp(
                codes.exp_over_10h or '1496',
                'Exp More Than 10 Hours',
                'Cl. 143.5 / Item 12 Sch.4B',
                '1.00', f'${cfg.exp_over_10h_rate:.5f}',
                cfg.exp_over_10h_rate, date=day.date, cls='pen-row',
            )
            dr.components.append(exp_comp)
            dr.total_pay = r2(dr.total_pay + exp_comp.amount)
        # 1454 Assoc Wrk Time (Mileage) — applies to WOBOD days too (Cl. 157.1(b) / Cl. 146.4)
        km = day.km or 0.0
        km_credited_w = get_km_credit(km) if km > 0 else None
        un_assoc_w  = day.un_assoc_hrs or 0.0
        assoc_pay_w = day.assoc_payment_hrs or 0.0
        dist_pay_w  = km_credited_w or 0.0
        total_credit_w = un_assoc_w + assoc_pay_w + dist_pay_w
        sched_hrs_w = day.r_hrs if day.r_hrs > 0 else wobod_hrs
        if day.assoc_build_up_hrs > 0:
            build_up_w = r2_hrs(day.assoc_build_up_hrs)
        else:
            build_up_w = r2_hrs(max(0.0, total_credit_w - sched_hrs_w))
        if build_up_w > 0:
            km_comp_w = _comp(
                codes.km or '1454',
                f'Assoc Wrk Time (Mileage) — {km:.0f} km: '
                f'un-assoc {un_assoc_w:.2f}h + assoc {assoc_pay_w:.2f}h + dist {dist_pay_w:.2f}h = {total_credit_w:.2f}h',
                'Cl. 157.1(b) / Cl. 146.4', f'{build_up_w:.2f} hrs', f'${B:.5f}/hr',
                build_up_w * B, date=day.date, cls='km-row',
            )
            dr.components.append(km_comp_w)
            dr.total_pay = r2(dr.total_pay + km_comp_w.amount)
            dr.flags.append(
                f"1454: un-assoc {un_assoc_w:.2f}h + assoc {assoc_pay_w:.2f}h + dist {dist_pay_w:.2f}h "
                f"= {total_credit_w:.2f}h vs sched {sched_hrs_w:.2f}h → build-up +{build_up_w:.2f}h."
            )
        # Replace the sentinel flag with a real description
        dr.flags = [f for f in dr.flags if not f.startswith('__WOBOD_PENDING__')]
        dr.flags.append(
            f"WOBOD: {primary_pct}% primary (Cl. 140.4) + 50% Train Crew loading (Cl. 140.7) "
            f"= {primary_pct + 50}% combined. No OT split, no shift penalties (Cl. 140.4)."
        )
    
    # ─── Pass 3: pool 'pool_to_ordinary' components into one fortnight 1001 line ───
    fortnight_components: list[PayComponent] = []
    pooled_hrs = 0.0
    pooled_amount = 0.0
    
    for dr in day_results:
        for c in dr.components:
            if c.pool_to_ordinary:
                hrs_val = float(c.hrs.split()[0])
                pooled_hrs += hrs_val
                pooled_amount += c.amount
            else:
                fortnight_components.append(c)
    
    if pooled_hrs > 0:
        fortnight_components.append(_comp(
            codes.base or '1001', 'Ordinary Hours', 'Sch. 4A',
            f'{r2_hrs(pooled_hrs):.2f} hrs', f'${B:.5f}/hr',
            pooled_amount,  # NB: sum-of-rounded matches payslip (3188.40 vs 3188.38)
            date=None,  # fortnight-level
        ))
    
    # ─── Pass 4: ADO ±4hr Adjustment ─────────────────────────────────
    ado_adj_hrs = 4.00 if is_short else -4.00
    sign = '+' if is_short else '−'
    ado_adj_amt = r2(ado_adj_hrs * B)
    fortnight_components.append(_comp(
        codes.ado or '1462',
        f'Accrued Day Off — Adjustm ({sign}{abs(ado_adj_hrs):.2f}h, '
        f'{"short" if is_short else "long"} fortnight)',
        'Cl. 120 / ADO accrual',
        f'{ado_adj_hrs:+.2f} hrs', f'${B:.5f}/hr',
        ado_adj_amt,
        date=req.fortnight_start,
    ))
    
    # ─── Sort components: by date asc, fortnight-level (date=None) last ──
    def _sort_key(c: PayComponent):
        return (1 if c.date is None else 0, c.date or '', c.code)
    fortnight_components.sort(key=_sort_key)
    
    # ─── Totals ──────────────────────────────────────────────────────────
    # Total hrs is sum of worked hrs from all days (not pooled)
    total_hrs = sum(dr.hours for dr in day_results)
    # Total pay is sum of all fortnight_components (this is the authoritative total)
    total_pay = r2(sum(c.amount for c in fortnight_components))
    
    # ADO payout (for legacy fields)
    ado_payout = ado_adj_amt if is_short else 0.0
    
    # Fortnightly OT threshold
    fn_threshold = 72.0 if is_short else 76.0
    fn_ot_hrs = max(0.0, total_hrs - fn_threshold)
    
    # Component totals (legacy aggregation)
    comp_totals: dict[str, float] = {}
    for c in fortnight_components:
        key = c.name
        comp_totals[key] = r2(comp_totals.get(key, 0.0) + c.amount)
    
    # Audit
    audit_flags = []
    payslip_variance = None
    if req.payslip_total and req.payslip_total > 0:
        payslip_variance = r2(total_pay - req.payslip_total)
        if abs(payslip_variance) > 0.10:
            direction = "underpayment" if payslip_variance > 0 else "overpayment"
            audit_flags.append(
                f"Payslip variance: calculated ${total_pay:.2f} vs payslip ${req.payslip_total:.2f} "
                f"(${abs(payslip_variance):.2f} possible {direction})"
            )
    if fn_ot_hrs > 0:
        audit_flags.append(f"Fortnight OT: {fn_ot_hrs:.2f} hrs above {fn_threshold:.0f}-hr threshold (Cl. 78.3).")
    for dr in day_results:
        for f in dr.flags:
            if "ALERT" in f or "⚠" in f:
                audit_flags.append(f"{dr.date}: {f}")
    
    km_bonus_hrs = 0.0
    for dr in day_results:
        for c in dr.components:
            if c.cls == 'km-row' and c.hrs.endswith(' hrs'):
                try:
                    km_bonus_hrs += float(c.hrs.split()[0])
                except ValueError:
                    pass
    
    return CalculateResponse(
        fortnight_start=req.fortnight_start,
        fortnight_type="short" if is_short else "long",
        total_hours=r2(total_hrs),
        total_pay=total_pay,
        ado_payout=r2(ado_payout),
        fn_ot_hrs=r2(fn_ot_hrs),
        days=day_results,
        component_totals=comp_totals,
        audit=AuditResult(
            payslip_variance=payslip_variance,
            fn_ot_hrs=r2(fn_ot_hrs),
            km_bonus_hrs=r2(km_bonus_hrs),
            ado_payout=r2(ado_payout),
            fortnight_type="short" if is_short else "long",
            flags=audit_flags,
        ),
        fortnight_components=fortnight_components,
    )
