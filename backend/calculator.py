"""EA 2025 pay calculation engine — Mt Victoria Driver Wage Calculator.
This module is the authoritative calculation source. The frontend has a
lightweight copy (calcPreview.ts) for live previews only.
PRD ref: Section 5 (all EA rules), Solution Design Section 4.3

DO NOT modify pay logic without first updating PRD.md.
"""
from __future__ import annotations
from typing import Optional
import json
from pathlib import Path
from models import (
    DayState, RateConfig, PayComponent, DayResult,
    CalculateRequest, CalculateResponse, AuditResult,
)

DATA_DIR = Path(__file__).parent / "data"


# ─── KM credit table (Cl. 146.4) ─────────────────────────────────────────────

_KM_BANDS: list[dict] = json.loads((DATA_DIR / "km_bands.json").read_text())


def get_km_credit(km: float) -> Optional[float]:
    """Return credited hours for a given km distance. PRD §5.5 / Cl. 146.4(a).
    Returns None if km < 161 (actual time applies).
    """
    if km <= 0:
        return None
    for band in _KM_BANDS:
        lo = band["min_km"]
        hi = band.get("max_km")
        if hi is None:  # extension band (644+)
            extra = km - 644
            steps = (extra + 15.999) // 16  # ceil(extra / 16)
            return band["base_at_644"] + steps * band["increment_per_16km"]
        if lo <= km < hi:
            return band.get("credited_hrs")  # None for the <161 band
    return None


# ─── EA Cl. 134.3(b) rounding ────────────────────────────────────────────────

def round_hrs_ea(hrs: float) -> int:
    """Cl. 134.3(b): <30 min fraction disregarded; 30–59 min = 1 full hour."""
    whole = int(hrs)
    frac_mins = (hrs - whole) * 60
    return whole if frac_mins < 30 else whole + 1


# ─── Time helpers ─────────────────────────────────────────────────────────────

def _to_mins(t: str) -> Optional[int]:
    if not t:
        return None
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _to_hrs(mins: float) -> float:
    return mins / 60


# ─── Shift penalty (Sch. 4B / Cl. 134.3) ─────────────────────────────────────

class _PenaltyResult:
    def __init__(self, amount, name, code, item, hrs, shift_type, add_load):
        self.amount = amount
        self.name = name
        self.code = code
        self.item = item
        self.hrs = hrs
        self.shift_type = shift_type
        self.add_load = add_load


def _get_shift_penalty(
    s_min: int, e_min: int, ord_hrs: float,
    is_sat: bool, is_sun: bool, is_ph: bool, dow: int,
    cfg: RateConfig, codes,
) -> _PenaltyResult:
    """Determine shift type and compute penalty. PRD §5.4"""
    if is_sat or is_sun or is_ph:
        return _PenaltyResult(0, "", "", "", 0, None, False)

    shift_type = None
    if s_min >= 1080 or s_min < 240:
        shift_type = "night"       # 18:00–03:59
    elif 240 <= s_min <= 330:
        shift_type = "early"       # 04:00–05:30
    elif s_min < 1080 < e_min:
        shift_type = "afternoon"   # before 18:00, ends after 18:00

    rate_map = {"night": cfg.night_rate, "early": cfg.early_rate, "afternoon": cfg.afternoon_rate}
    item_map = {"night": "Item 7 Sch.4B", "early": "Item 8 Sch.4B", "afternoon": "Item 6 Sch.4B"}
    name_map = {"night": "Night shift", "early": "Early morning", "afternoon": "Afternoon shift"}
    code_map = {"night": codes.night, "early": codes.early, "afternoon": codes.afternoon}

    pen_hrs = 0
    pen_amt = 0.0
    if shift_type:
        pen_hrs = round_hrs_ea(ord_hrs)
        pen_amt = pen_hrs * rate_map[shift_type]

    # Item 9: 01:01–03:59 Mon–Fri, not PH
    add_load = (not is_ph) and (1 <= dow <= 5) and (61 <= s_min <= 239)

    return _PenaltyResult(
        amount=pen_amt,
        name=name_map.get(shift_type, ""),
        code=code_map.get(shift_type, "") if shift_type else "",
        item=item_map.get(shift_type, "") if shift_type else "",
        hrs=pen_hrs,
        shift_type=shift_type,
        add_load=add_load,
    )


# ─── Core per-day calculation ─────────────────────────────────────────────────

def compute_day(day: DayState, cfg: RateConfig, codes, unassoc_amt: float = 0.0) -> DayResult:
    """All pay components for one day. PRD §FR-03, all of §5."""
    is_sat = day.dow == 6
    is_sun = day.dow == 0
    is_ph = day.ph
    B = cfg.base_rate

    # ── OFF days ──────────────────────────────────────────────────────────────
    if day.diag == "OFF":
        return DayResult(
            date=day.date, diag=day.diag, day_type="off",
            hours=0, paid_hrs=0, total_pay=0, components=[], flags=[],
        )

    # ── ADO days (PRD §5.8 / FR-08) ──────────────────────────────────────────
    if day.diag == "ADO":
        if day.is_short_fortnight:
            ado_pay = 8.0 * B
            return DayResult(
                date=day.date, diag=day.diag, day_type="ado",
                hours=8.0, paid_hrs=8.0, total_pay=round(ado_pay, 2),
                components=[PayComponent(
                    name="ADO — accrued day off pay (8 hrs ordinary)",
                    ea="Cl. 120 / ADO accrual", code=codes.ado or "—",
                    hrs="8.00", rate=f"${B:.4f}/hr", amount=round(ado_pay, 2), cls="km-row",
                )],
                flags=["ADO paid out — short fortnight. 8 hrs at ordinary rate."],
            )
        else:
            return DayResult(
                date=day.date, diag=day.diag, day_type="ado",
                hours=0, paid_hrs=0, total_pay=0, components=[],
                flags=["ADO accruing — long fortnight (payout in next fortnight)."],
            )

    # ── Leave categories (PRD §5.9) ───────────────────────────────────────────
    if day.leave_cat and day.leave_cat != "none":
        return _compute_leave(day, cfg, codes)

    # ── No times entered ──────────────────────────────────────────────────────
    if not day.a_start or not day.a_end:
        return DayResult(
            date=day.date, diag=day.diag, day_type="weekday",
            hours=0, paid_hrs=0, total_pay=0, components=[],
            flags=["Enter actual times."],
        )

    components: list[PayComponent] = []
    flags: list[str] = []

    # ── Parse times ───────────────────────────────────────────────────────────
    s_min = _to_mins(day.a_start)
    e_min = _to_mins(day.a_end)
    if day.cm or (e_min is not None and s_min is not None and e_min <= s_min):
        e_min += 1440
    actual_hrs = _to_hrs(e_min - s_min)
    ord_hrs = min(actual_hrs, 8.0)
    ot_hrs = max(0.0, actual_hrs - 8.0)
    ot1h = min(ot_hrs, 2.0)
    ot2h = max(0.0, ot_hrs - 2.0)

    # ── KM credit (Cl. 146.4) ─────────────────────────────────────────────────
    km_credited = None
    km_bonus = 0.0
    km_applied = False
    if day.km > 0:
        km_credited = get_km_credit(day.km)
        if km_credited is not None and km_credited > actual_hrs:
            km_bonus = km_credited - actual_hrs
            km_applied = True

    if km_credited is not None and km_credited >= 257 and actual_hrs > 10:
        flags.append("ALERT: Double shift >10 hrs — driver must be relieved at terminal on return (Cl. 146.4(f)).")
    if km_credited is not None and km_credited >= 370:
        flags.append(">370 km shift — max 4/week, relieved at terminal, 8 hr traffic cap (Cl. 146.4(g-i)).")
        if actual_hrs > 8:
            flags.append(f"ALERT: >370 km shift — {actual_hrs:.2f} hrs in traffic exceeds 8 hr cap (Cl. 146.4(i)).")

    day_type = "ph" if is_ph else ("sunday" if is_sun else ("saturday" if is_sat else "weekday"))
    pen = _get_shift_penalty(s_min, e_min, ord_hrs, is_sat, is_sun, is_ph, day.dow, cfg, codes)

    # ── Build pay components ───────────────────────────────────────────────────
    if day.wobod:
        # WOBOD: double time, min 4 hrs (Cl. 136)
        wh = max(actual_hrs, float(cfg.wobod_min))
        components.append(PayComponent(
            name="WOBOD — work on book-off day", ea="Cl. 136", code=codes.wobod or "—",
            hrs=f"{wh:.2f}", rate=f"{cfg.wobod_rate}× (${B * cfg.wobod_rate:.4f}/hr)",
            amount=round(wh * B * cfg.wobod_rate, 2), cls="",
        ))
        flags.append(f"WOBOD: double time, min {cfg.wobod_min} hrs (Cl. 136).")

    elif is_ph:
        rate = cfg.ph_wke if (is_sat or is_sun) else cfg.ph_wkd
        code = codes.ph_wke if (is_sat or is_sun) else codes.ph_wkd
        ph_hrs = max(actual_hrs, km_credited or 0)
        components.append(PayComponent(
            name=f"Public holiday — {'weekend' if is_sat or is_sun else 'weekday'} ({rate}×)",
            ea="Cl. 31", code=code or "—",
            hrs=f"{ph_hrs:.2f}", rate=f"{rate}×",
            amount=round(ph_hrs * B * rate, 2), cls="",
        ))
        flags.append(f"PH {rate}× applied. Day in lieu accrues (Cl. 31).")

    elif is_sun:
        components.append(PayComponent(
            name="Sunday time — ordinary", ea="Cl. 133/54", code=codes.sun or "—",
            hrs=f"{ord_hrs:.2f}", rate=f"{cfg.sun_rate}×",
            amount=round(ord_hrs * B * cfg.sun_rate, 2), cls="",
        ))
        if ot1h + ot2h > 0:
            oh = ot1h + ot2h
            components.append(PayComponent(
                name="Sunday OT (Cl. 144 — Sunday rate applies)", ea="Cl. 140", code=codes.sun or "—",
                hrs=f"{oh:.2f}", rate=f"{cfg.sun_rate}×",
                amount=round(oh * B * cfg.sun_rate, 2), cls="",
            ))

    elif is_sat:
        components.append(PayComponent(
            name="Saturday — ordinary", ea="Cl. 54/134", code=codes.sat or "—",
            hrs=f"{ord_hrs:.2f}", rate=f"{cfg.sat_rate}×",
            amount=round(ord_hrs * B * cfg.sat_rate, 2), cls="",
        ))
        if ot1h + ot2h > 0:
            oh = ot1h + ot2h
            components.append(PayComponent(
                name="Saturday OT >8 hrs", ea="Cl. 140+Sch.4A", code=codes.sat_ot or "—",
                hrs=f"{oh:.2f}", rate=f"{cfg.sat_ot}×",
                amount=round(oh * B * cfg.sat_ot, 2), cls="",
            ))
            flags.append("Saturday OT >8 hrs — double time (EA 2025 Sch. 4A).")

    else:
        # Weekday ordinary + OT
        components.append(PayComponent(
            name="Ordinary time", ea="Sch. 4A", code=codes.base or "—",
            hrs=f"{ord_hrs:.2f}", rate=f"${B:.4f}/hr",
            amount=round(ord_hrs * B, 2), cls="",
        ))
        if ot1h > 0:
            components.append(PayComponent(
                name="OT — first 2 hrs", ea="Cl. 140.1", code=codes.ot1 or "—",
                hrs=f"{ot1h:.2f}", rate=f"{cfg.ot1}×",
                amount=round(ot1h * B * cfg.ot1, 2), cls="",
            ))
        if ot2h > 0:
            components.append(PayComponent(
                name="OT — beyond 2 hrs", ea="Cl. 140.1", code=codes.ot2 or "—",
                hrs=f"{ot2h:.2f}", rate=f"{cfg.ot2}×",
                amount=round(ot2h * B * cfg.ot2, 2), cls="",
            ))
        if pen.amount > 0:
            pen_rate = cfg.night_rate if pen.shift_type == "night" else (
                cfg.early_rate if pen.shift_type == "early" else cfg.afternoon_rate)
            components.append(PayComponent(
                name=f"{pen.name} ({pen.item}) — {pen.hrs} hrs × ${pen_rate}/hr",
                ea="Sch.4B / Cl. 134.3", code=pen.code or "—",
                hrs=str(pen.hrs), rate=f"${pen_rate}/hr · Cl.134.3(b) rounded",
                amount=round(pen.amount, 2), cls="pen-row",
            ))
        if pen.add_load:
            components.append(PayComponent(
                name="Additional loading (Item 9) — sign on/off 01:01–03:59",
                ea="Sch.4B / Cl. 134.4", code=codes.add_load or "—",
                hrs="flat", rate=f"${cfg.add_loading:.2f}/shift",
                amount=round(cfg.add_loading, 2), cls="pen-row",
            ))

    # ── KM credit bonus ───────────────────────────────────────────────────────
    if km_applied and km_bonus > 0:
        b_rate = cfg.sat_rate if is_sat else (cfg.sun_rate if is_sun else 1.0)
        components.append(PayComponent(
            name=f"Cl. 146.4 KM credit — {day.km:.0f} km → {km_credited} hrs credited, bonus {km_bonus:.2f} hrs",
            ea="Cl. 146.4(a)(b)", code=codes.base or "—",
            hrs=f"{km_bonus:.2f}", rate="Ordinary rate — NOT included in OT (Cl. 146.4(b))",
            amount=round(km_bonus * B * b_rate, 2), cls="km-row",
        ))
        flags.append(f"KM credit: {day.km:.0f} km → {km_credited} hrs. Actual: {actual_hrs:.2f} hrs. Bonus {km_bonus:.2f} hrs.")

    if day.km > 0 and km_credited is None:
        flags.append(f"{day.km:.0f} km < 161 — all actual time paid normally (Cl. 146.4(c)).")

    if day.km >= 161 and unassoc_amt > 0 and not day.wobod:
        components.append(PayComponent(
            name="Un-associated duties (≥161 km)", ea="Cl. 146.4(d) / Cl. 157.2",
            code=codes.unassoc or "—", hrs="—", rate=f"${unassoc_amt:.2f}/shift",
            amount=round(unassoc_amt, 2), cls="km-row",
        ))

    # ── Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1) ────────────────────
    if not day.wobod:
        liftup_gap = _calc_liftup_gap(day)
        layback_gap = _calc_layback_gap(day)
        for gap, label, ea_ref in [
            (liftup_gap, "Lift-up / buildup (started before rostered)", "Cl. 131 / Cl. 140.1"),
            (layback_gap, "Layback / extend (finished after rostered)", "Cl. 131 / Cl. 140.1"),
        ]:
            if gap > 0:
                _add_gap_components(components, flags, gap, label, ea_ref,
                                     actual_hrs, B, cfg, codes, is_sat, is_sun, is_ph)

    if ot_hrs > 0 and not day.wobod:
        flags.append(f"Daily OT: {ot_hrs:.2f} hrs beyond 8-hr ordinary limit (Cl. 140.1).")

    total = round(sum(c.amount for c in components), 2)
    paid_hrs = max(actual_hrs, km_credited or 0) if km_applied else actual_hrs

    return DayResult(
        date=day.date, diag=day.diag, day_type=day_type,
        hours=round(actual_hrs, 2), paid_hrs=round(paid_hrs, 2),
        total_pay=total, components=components, flags=flags,
    )


# ─── Lift-up / Layback helpers ────────────────────────────────────────────────

def _calc_liftup_gap(day: DayState) -> float:
    """Hours driver worked before rostered start. PRD §5.7"""
    if not (day.r_start and day.a_start):
        return 0.0
    rs = _to_mins(day.r_start)
    a_s = _to_mins(day.a_start)
    if rs is None or a_s is None or a_s >= rs:
        return 0.0
    return _to_hrs(rs - a_s)


def _calc_layback_gap(day: DayState) -> float:
    """Hours driver worked after rostered end. PRD §5.7"""
    if not (day.r_end and day.a_end):
        return 0.0
    re = _to_mins(day.r_end)
    ae = _to_mins(day.a_end)
    if re is None or ae is None:
        return 0.0
    if day.cm:
        if re is not None:
            re += 1440
        if ae is not None:
            ae += 1440
    return _to_hrs(max(0, ae - re))


def _add_gap_components(
    components, flags, gap_hrs, label, ea_ref,
    actual_hrs, B, cfg, codes, is_sat, is_sun, is_ph,
):
    """Add pay components for a lift-up or layback gap. PRD §5.7"""
    ord_remainder = max(0.0, 8.0 - (actual_hrs - gap_hrs))
    gap_ord = min(gap_hrs, ord_remainder)
    gap_ot = max(0.0, gap_hrs - gap_ord)
    gap_ot1 = min(gap_ot, 2.0)
    gap_ot2 = max(0.0, gap_ot - 2.0)

    def _ord_rate():
        if is_ph:
            return cfg.ph_wke if (is_sat or is_sun) else cfg.ph_wkd
        if is_sun:
            return cfg.sun_rate
        if is_sat:
            return cfg.sat_rate
        return 1.0

    def _ot1_rate():
        if is_ph:
            return cfg.ph_wke if (is_sat or is_sun) else cfg.ph_wkd
        if is_sun:
            return cfg.sun_rate
        if is_sat:
            return cfg.sat_ot
        return cfg.ot1

    def _ot2_rate():
        if is_ph:
            return cfg.ph_wke if (is_sat or is_sun) else cfg.ph_wkd
        if is_sun:
            return cfg.sun_rate
        if is_sat:
            return cfg.sat_ot
        return cfg.ot2

    if gap_ord > 0:
        r = _ord_rate()
        components.append(PayComponent(
            name=f"{label} — ordinary rate ({gap_ord:.2f} hrs within 8-hr limit)",
            ea=ea_ref, code=codes.liftup or "—",
            hrs=f"{gap_ord:.2f}", rate=f"{r if r != 1.0 else 'ordinary'}",
            amount=round(gap_ord * B * r, 2), cls="pen-row",
        ))
    if gap_ot1 > 0:
        r = _ot1_rate()
        components.append(PayComponent(
            name=f"{label} — OT rate (first 2 hrs beyond 8)",
            ea=ea_ref, code=codes.liftup or "—",
            hrs=f"{gap_ot1:.2f}", rate=f"{r}×",
            amount=round(gap_ot1 * B * r, 2), cls="pen-row",
        ))
    if gap_ot2 > 0:
        r = _ot2_rate()
        components.append(PayComponent(
            name=f"{label} — OT rate (beyond 2 hrs)",
            ea=ea_ref, code=codes.liftup or "—",
            hrs=f"{gap_ot2:.2f}", rate=f"{r}×",
            amount=round(gap_ot2 * B * r, 2), cls="pen-row",
        ))
    flags.append(f"{label}: {gap_hrs:.2f} hrs — {gap_ord:.2f} at ordinary, {gap_ot:.2f} at OT rate.")


# ─── Leave calculation ────────────────────────────────────────────────────────

def _compute_leave(day: DayState, cfg: RateConfig, codes) -> DayResult:
    """Compute pay for leave categories. PRD §5.9"""
    B = cfg.base_rate
    cat = day.leave_cat
    r_hrs = day.r_hrs or 8.0

    leave_map = {
        "SL":   (r_hrs, B, "Sick leave — ordinary rate", "Cl. 30.4"),
        "CL":   (r_hrs, B, "Carer's leave — base rate", "Cl. 30.7(b)(ix)"),
        "BL":   (r_hrs, B, "Bereavement leave — base rate", "Cl. 30.8(k)(iv)"),
        "JD":   (r_hrs, B, "Jury duty — ordinary pay", "Cl. 30.8(g)"),
        "LWOP": (0, 0, "Leave without pay", "—"),
        "PHNW": (8.0, B, "Public holiday not worked — 8 hrs", "Cl. 31.7"),
        "PD":   (8.0, B, "Picnic day — 8 hrs ordinary", "Cl. 32.1"),
    }

    if cat in leave_map:
        hrs, rate, name, ea = leave_map[cat]
        amount = round(hrs * rate, 2)
        comps = [PayComponent(name=name, ea=ea, code="—", hrs=f"{hrs:.2f}", rate=f"${rate:.4f}/hr", amount=amount, cls="")] if amount > 0 else []
        return DayResult(
            date=day.date, diag=day.diag, day_type="leave",
            hours=hrs, paid_hrs=hrs, total_pay=amount,
            components=comps, flags=[f"{cat}: {name} ({ea})."],
        )

    if cat == "AL":
        base = 8.0 * B
        loading = base * 0.20  # 20% shiftworker rate (Cl. 30.2(a)(ii))
        comps = [
            PayComponent(name="Annual leave — 8 hrs ordinary", ea="Cl. 30.1", code="—", hrs="8.00", rate=f"${B:.4f}/hr", amount=round(base, 2), cls=""),
            PayComponent(name="Annual leave loading — 20% (shiftworker)", ea="Cl. 30.2(a)(ii)", code="—", hrs="8.00", rate="20% of ordinary", amount=round(loading, 2), cls="pen-row"),
        ]
        return DayResult(
            date=day.date, diag=day.diag, day_type="leave",
            hours=8.0, paid_hrs=8.0, total_pay=round(base + loading, 2),
            components=comps, flags=["AL: 8 hrs ordinary + 20% loading (shiftworker Cl. 30.2(a)(ii))."],
        )

    if cat == "PHW":
        loading = r_hrs * B * 1.5
        add_day = 8.0 * B
        comps = [
            PayComponent(name="PHW — 150% loading on hrs worked", ea="Cl. 31.5(a)", code="—", hrs=f"{r_hrs:.2f}", rate="1.5× ordinary", amount=round(loading, 2), cls=""),
            PayComponent(name="PHW — additional day pay (ordinary)", ea="Cl. 31.5(b)", code="—", hrs="8.00", rate=f"${B:.4f}/hr", amount=round(add_day, 2), cls=""),
        ]
        return DayResult(
            date=day.date, diag=day.diag, day_type="leave",
            hours=r_hrs, paid_hrs=r_hrs, total_pay=round(loading + add_day, 2),
            components=comps, flags=["PHW: 150% loading + additional 8 hr day pay (or day in lieu) — Cl. 31.5."],
        )

    return DayResult(
        date=day.date, diag=day.diag, day_type="leave",
        hours=0, paid_hrs=0, total_pay=0, components=[], flags=[f"Unknown leave category: {cat}"],
    )


# ─── Fortnight entry point ────────────────────────────────────────────────────

def compute_fortnight(req: CalculateRequest) -> CalculateResponse:
    """Compute gross pay for the full fortnight. PRD §FR-03."""
    is_short = any(d.diag == "ADO" for d in req.days)
    fn_threshold = 72.0 if is_short else 76.0

    # Tag each day with fortnight type
    for d in req.days:
        d.is_short_fortnight = is_short

    day_results = [compute_day(d, req.config, req.codes, req.unassoc_amt) for d in req.days]

    total_hrs = sum(r.hours for r in day_results)
    total_pay = round(sum(r.total_pay for r in day_results), 2)
    fn_ot_hrs = max(0.0, total_hrs - fn_threshold)
    ado_payout = sum(
        c.amount for r in day_results
        for c in r.components
        if "ADO" in c.name
    )
    km_bonus_hrs = sum(
        float(c.hrs) for r in day_results
        for c in r.components
        if "KM credit" in c.name and c.hrs != "—"
    )

    # Component totals
    comp_totals: dict[str, float] = {}
    for r in day_results:
        for c in r.components:
            comp_totals[c.name] = round(comp_totals.get(c.name, 0.0) + c.amount, 2)

    # Audit
    audit_flags = []
    payslip_variance = None
    if req.payslip_total and req.payslip_total > 0:
        payslip_variance = round(total_pay - req.payslip_total, 2)
        if abs(payslip_variance) > 0.10:
            direction = "underpayment" if payslip_variance > 0 else "overpayment"
            audit_flags.append(
                f"Payslip variance: calculated ${total_pay:.2f} vs payslip ${req.payslip_total:.2f} "
                f"(${abs(payslip_variance):.2f} possible {direction})"
            )
    if fn_ot_hrs > 0:
        audit_flags.append(f"Fortnight OT: {fn_ot_hrs:.2f} hrs above {fn_threshold:.0f}-hr threshold (Cl. 140.1).")
    for r in day_results:
        for f in r.flags:
            if "ALERT" in f:
                audit_flags.append(f"{r.date}: {f}")

    return CalculateResponse(
        fortnight_start=req.fortnight_start,
        fortnight_type="short" if is_short else "long",
        total_hours=round(total_hrs, 2),
        total_pay=total_pay,
        ado_payout=round(ado_payout, 2),
        fn_ot_hrs=round(fn_ot_hrs, 2),
        days=day_results,
        component_totals=comp_totals,
        audit=AuditResult(
            payslip_variance=payslip_variance,
            fn_ot_hrs=round(fn_ot_hrs, 2),
            km_bonus_hrs=round(km_bonus_hrs, 2),
            ado_payout=round(ado_payout, 2),
            fortnight_type="short" if is_short else "long",
            flags=audit_flags,
        ),
    )
