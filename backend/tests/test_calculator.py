"""Unit tests for the EA 2025 calculation engine.
Every test maps to a PRD section and EA clause.
Run from backend/: pytest tests/ -v
"""
import pytest
from models import RateConfig, PayrollCodes, DayState, CalculateRequest
from calculator import compute_day, compute_fortnight, get_km_credit, round_hrs_ea
from helpers import make_day

B = 49.81842  # EA 2025 base rate (Sch. 4A)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def r2(n: float) -> float:
    return round(n, 2)


def names(day_result) -> list:
    return [c.name for c in day_result.components]


def amount_by_keyword(day_result, keyword: str) -> float:
    return r2(sum(c.amount for c in day_result.components if keyword.lower() in c.name.lower()))


def _make_fn_request(days, payslip_total=None, is_short_fortnight=None):
    return CalculateRequest(
        fortnight_start="2025-08-10",
        roster_line=1,
        public_holidays=[],
        payslip_total=payslip_total,
        config=RateConfig(),
        codes=PayrollCodes(),
        days=days,
        unassoc_amt=0.0,
        is_short_fortnight=is_short_fortnight,
    )


# ─── EA Cl. 134.3(b) rounding ────────────────────────────────────────────── PRD §5.4

class TestEARounding:
    def test_under_30_min_disregarded(self):
        assert round_hrs_ea(8.4) == 8

    def test_exactly_30_min_rounds_up(self):
        assert round_hrs_ea(8.5) == 9

    def test_59_min_rounds_up(self):
        assert round_hrs_ea(7.983) == 8

    def test_whole_number_unchanged(self):
        assert round_hrs_ea(8.0) == 8


# ─── KM credit table (Cl. 146.4) ─────────────────────────────────────────── PRD §5.5

class TestKmCredit:
    def test_below_161_returns_none(self):
        assert get_km_credit(160) is None
        assert get_km_credit(0) is None

    def test_161_band(self):
        assert get_km_credit(161) == 5.0
        assert get_km_credit(192) == 5.0

    def test_225_band(self):
        # v3.12: corrected to 8.0h (was 7.0h — depot chart evidence)
        assert get_km_credit(225) == 8.0
        assert get_km_credit(256) == 8.0

    def test_257_band(self):
        assert get_km_credit(257) == 8.0
        assert get_km_credit(289) == 8.0

    def test_290_band(self):
        assert get_km_credit(290) == 9.0

    def test_644_extension(self):
        assert get_km_credit(660) == 20.0   # 644+16 = +0.5 → 20.0
        assert get_km_credit(676) == 20.5   # 644+32 = +1.0 → 20.5


# ─── Ordinary weekday ────────────────────────────────────────────────────── PRD §5.1

class TestOrdinaryWeekday:
    def test_exactly_8hrs_no_ot(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B)
        assert result.hours == 8.0
        assert not any("OT" in n for n in names(result))

    def test_off_day_returns_zero(self, cfg, codes):
        day = make_day(diag="OFF", a_start="", a_end="", dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == 0.0
        assert result.hours == 0.0


# ─── Overtime (Cl. 78.3) ─────────────────────────────────────────────────── PRD §5.2
#
# Cl. 78.3 (Page 93 of the EA 2025): "Overtime worked in excess of 8 hours in any
# one Shift will be paid at the rate of time and one half for the first 3 hours
# and double time thereafter."

class TestOvertime:
    def test_exactly_2hrs_ot_tier1(self, cfg, codes):
        """10 hrs: 8 ordinary + 2 OT at 1.5×. Code 1026."""
        day = make_day(a_start="06:00", a_end="16:00", dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(r2(8 * B) + r2(2 * B * 1.5))
        assert any(c.code == "1026" for c in result.components)
        assert not any(c.code == "1110" for c in result.components)

    def test_3hrs_ot_all_at_tier1(self, cfg, codes):
        """11 hrs: 8 ordinary + 3 OT all at 1.5× (still within the 3-hr tier-1 band).
        Was incorrectly 2+1 split in v3.18 and earlier (fixed v3.19 per Cl. 78.3)."""
        day = make_day(a_start="06:00", a_end="17:00", dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(r2(8 * B) + r2(3 * B * 1.5))
        assert any(c.code == "1026" for c in result.components)
        assert not any(c.code == "1110" for c in result.components)

    def test_4hrs_ot_splits_at_3(self, cfg, codes):
        """12 hrs: 8 ordinary + 3 OT tier1 (1.5×) + 1 OT tier2 (2.0×). Code 1110 emitted.
        Locks in the Cl. 78.3 3-hr boundary so a future regression cannot move it."""
        day = make_day(a_start="06:00", a_end="18:00", dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(r2(8 * B) + r2(3 * B * 1.5) + r2(1 * B * 2.0))
        assert any(c.code == "1026" for c in result.components)
        assert any(c.code == "1110" for c in result.components)


# ─── Shift penalties (Sch. 4B / Cl. 134.3) ──────────────────────────────── PRD §5.4

class TestShiftPenalties:
    def test_night_shift_penalty_applied(self, cfg, codes):
        """Sign-on 22:00 (night) — Item 7 (code 1487) applied."""
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=1)
        result = compute_day(day, cfg, codes)
        assert any(c.code == "1487" for c in result.components)
        pen = amount_by_keyword(result, "Night")
        assert pen == r2(8 * 5.69)

    def test_early_morning_penalty_applied(self, cfg, codes):
        """Sign-on 04:30 (early morning) — Item 8 (code 1483) applied."""
        day = make_day(a_start="04:30", a_end="12:30", dow=2)
        result = compute_day(day, cfg, codes)
        assert any(c.code == "1483" for c in result.components)
        pen = amount_by_keyword(result, "Morning")
        assert pen == r2(8 * 4.84)

    def test_afternoon_penalty_not_triggered_before_1800(self, cfg, codes):
        """Sign-on 09:00: ordinary ends 17:00 < 18:00 → NO afternoon penalty (v3.11 fix)."""
        day = make_day(a_start="09:00", a_end="18:30", dow=1)
        result = compute_day(day, cfg, codes)
        assert not any("Afternoon" in n for n in names(result))

    def test_afternoon_penalty_triggered_after_1800(self, cfg, codes):
        """Sign-on 14:00: ordinary ends 22:00 > 18:00 → afternoon penalty applies."""
        day = make_day(a_start="14:00", a_end="22:30", dow=3)
        result = compute_day(day, cfg, codes)
        assert any("Afternoon" in n for n in names(result))

    def test_no_penalty_on_saturday(self, cfg, codes):
        """Shift penalties NOT payable on Saturday (Cl. 134.3(a))."""
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=6)
        result = compute_day(day, cfg, codes)
        assert not any(c.code in ("1487", "1483") for c in result.components)

    def test_no_penalty_on_sunday(self, cfg, codes):
        day = make_day(a_start="04:00", a_end="12:00", dow=0)
        result = compute_day(day, cfg, codes)
        assert not any(c.code in ("1487", "1483") for c in result.components)

    def test_no_penalty_on_ph(self, cfg, codes):
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=1, ph=True)
        result = compute_day(day, cfg, codes)
        assert not any(c.code in ("1487", "1483") for c in result.components)

    def test_ea_rounding_under_30min(self, cfg, codes):
        """7h 20min night shift: 20 min fraction < 30 → 7 hrs penalty billed, not 8."""
        day = make_day(a_start="22:00", a_end="05:20", r_start="22:00", r_end="05:20", cm=True, dow=1)
        result = compute_day(day, cfg, codes)
        pen = amount_by_keyword(result, "Night")
        assert pen == r2(7 * 5.69)


# ─── Weekend rates ───────────────────────────────────────────────────────── PRD §5.1

class TestWeekendRates:
    def test_saturday_ordinary(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=6)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 1.5)

    def test_sunday_ordinary(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=0)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(r2(8 * B) + r2(8 * B))

    def test_saturday_ot_double_time(self, cfg, codes):
        """Saturday OT >8 hrs is double time (Sch. 4A)."""
        day = make_day(a_start="06:00", a_end="15:00", dow=6)  # 9 hrs
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 1.5 + 1 * B * 2.0)


# ─── Public holiday (Cl. 31) ─────────────────────────────────────────────── PRD §5.3

class TestPublicHoliday:
    def test_ph_weekday_rate(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=1, ph=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 1.5)

    def test_ph_weekend_rate(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=6, ph=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 2.5)


# ─── KM credit pay (Cl. 146.4) ──────────────────────────────────────────── PRD §5.5

class TestKmCreditPay:
    def test_290km_credits_9hrs_on_7hr_shift(self, cfg, codes):
        """7 hr shift (sched + actual) + 290 km → 9 hrs credited → 2 hrs build-up at ordinary rate.
        v3.12: formula uses r_hrs (sched shift length), not actual hours.
        make_day has r_hrs=8.0 default, so we pass r_hrs=7.0 to match the 7-hr actual."""
        day = make_day(a_start="06:00", a_end="13:00", km=290.0, dow=1,
                       claim_liftup_layback=False, r_hrs=7.0)
        result = compute_day(day, cfg, codes)
        km_bonus = amount_by_keyword(result, "Assoc Wrk Time")
        assert km_bonus == r2(2.0 * B)

    def test_below_161km_no_credit(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", km=150.0, dow=1)
        result = compute_day(day, cfg, codes)
        assert amount_by_keyword(result, "Assoc Wrk Time") == 0.0


# ─── WOBOD (Cl. 140.4 + Cl. 140.7) ─────────────────────────────────────── PRD §5.6

class TestWobod:
    """WOBOD is computed at fortnight level (compute_fortnight pass 2), not per-day.
    compute_day emits a $0 WOBOD_PENDING sentinel; components are filled by the
    fortnight calculation with the weekday OT-shift counter applied."""

    def _wobod_result(self, dow, n_wobod=1):
        """Build a minimal fortnight with n_wobod WOBOD shifts."""
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * (14 - n_wobod)
        for _ in range(n_wobod):
            days.append(make_day(a_start="06:00", a_end="14:00", wobod=True, dow=dow))
        return compute_fortnight(_make_fn_request(days))

    def test_weekday_wobod_1_primary_150pct(self):
        """1st weekday WOBOD: Cl. 140.4(a) 150% (code 1100) + Cl. 140.7 50% loading (code 1059)."""
        result = self._wobod_result(dow=1)
        wobod_comps = [c for dr in result.days for c in dr.components]
        primary = next((c for c in wobod_comps if c.code == "1100"), None)
        loading = next((c for c in wobod_comps if c.code == "1059"), None)
        assert primary is not None, "Code 1100 (150% primary) not found"
        assert loading is not None, "Code 1059 (50% loading) not found"
        assert primary.amount == r2(8 * B * 1.5)
        assert loading.amount == r2(8 * B * 0.5)

    def test_sunday_wobod_250pct(self):
        """Sunday WOBOD: Cl. 140.4(d) 250% (code 1110) + 50% loading."""
        result = self._wobod_result(dow=0)
        wobod_comps = [c for dr in result.days for c in dr.components]
        primary = next((c for c in wobod_comps if c.code == "1110"), None)
        loading = next((c for c in wobod_comps if c.code == "1059"), None)
        assert primary is not None, "Code 1110 (250% primary) not found"
        assert loading is not None, "Code 1059 (50% loading) not found"
        assert primary.amount == r2(8 * B * 2.5)
        assert loading.amount == r2(8 * B * 0.5)

    def test_weekday_wobod_counter_3rd_uses_200pct(self):
        """3rd weekday WOBOD upgrades to 200% primary (Cl. 140.4(b), code 1110)."""
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 11
        for d in [1, 2, 3]:  # Mon, Tue, Wed — 3 weekday WOBODs
            days.append(make_day(a_start="06:00", a_end="14:00", wobod=True, dow=d))
        result = compute_fortnight(_make_fn_request(days))
        wobod_days = [dr for dr in result.days if dr.hours > 0]
        third = wobod_days[2]
        codes_found = {c.code for c in third.components}
        assert "1110" in codes_found, "3rd weekday WOBOD should use 200% (code 1110)"
        assert "1100" not in codes_found, "3rd weekday WOBOD must NOT use 150% (code 1100)"

    def test_no_4hr_minimum(self):
        """No 4-hr minimum on WOBOD — paid on actual hours only (v3.11 fix)."""
        # 3 hr WOBOD shift — should be paid exactly 3 hrs
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 13
        days.append(make_day(a_start="06:00", a_end="09:00", wobod=True, dow=1))
        result = compute_fortnight(_make_fn_request(days))
        wobod_day = next(dr for dr in result.days if dr.hours > 0)
        assert wobod_day.hours == 3.0, f"Expected 3h, got {wobod_day.hours}"
        primary = next(c for c in wobod_day.components if c.code == "1100")
        assert primary.amount == r2(3 * B * 1.5)


# ─── ADO pay (Cl. 120) ──────────────────────────────────────────────────── PRD §5.8

class TestAdoPay:
    """ADO per-day returns $0; the ±4h Adjustment (code 1462) is at fortnight level."""

    def test_ado_day_returns_zero_pay(self, cfg, codes):
        day = make_day(diag="ADO", a_start="", a_end="", dow=3, is_short=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == 0.0

    def test_ado_fortnight_adjustment_short(self):
        """Short fortnight: +4h adjustment (code 1462, positive amount)."""
        days = [make_day(diag="ADO", a_start="", a_end="", dow=1)] + \
               [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 13
        result = compute_fortnight(_make_fn_request(days))
        assert result.fortnight_type == "short"
        ado = next((c for c in result.fortnight_components if c.code == "1462"), None)
        assert ado is not None, "1462 ADO Adjustment not found"
        assert ado.amount == r2(4.0 * B)
        assert result.ado_payout == r2(4.0 * B)

    def test_ado_fortnight_adjustment_long(self):
        """Long fortnight (no ADO days): negative 4h adjustment."""
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 14
        result = compute_fortnight(_make_fn_request(days))
        assert result.fortnight_type == "long"
        ado = next((c for c in result.fortnight_components if c.code == "1462"), None)
        assert ado is not None
        assert ado.amount == r2(-4.0 * B)
        assert result.ado_payout == 0.0

    def test_was_ado_preserves_short_fortnight(self):
        """was_ado=True on a WOBOD day still makes the fortnight 'short' (v3.11 fix)."""
        # Day was rostered ADO but driver worked it as WOBOD
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 13
        wobod_day = DayState(
            date="2025-08-11", dow=1, diag="WOBOD",
            a_start="09:00", a_end="17:00", wobod=True, was_ado=True,
        )
        days.append(wobod_day)
        result = compute_fortnight(_make_fn_request(days))
        assert result.fortnight_type == "short", "was_ado should keep fortnight type short"


# ─── Lift-up / Layback (Cl. 131) ────────────────────────────────────────── PRD §5.7

class TestLiftupLayback:
    """v3.11: lift-up/layback are informational flags only.
    Pay is calculated from the effective window as a single total — no separate components."""

    def test_liftup_expands_effective_window(self, cfg, codes):
        """claim=Yes, started 30 min early: effective 7.5h window, all ordinary."""
        day = make_day(
            a_start="06:00", a_end="13:30",
            r_start="06:30", r_end="13:30",
            dow=1,
        )
        result = compute_day(day, cfg, codes)
        assert result.hours == 7.5
        assert result.total_pay == r2(7.5 * B)
        assert any("Lift-up" in f or "lift" in f.lower() for f in result.flags)

    def test_layback_extends_into_ot(self, cfg, codes):
        """claim=Yes, 2h layback: 10h effective window = 8h ordinary + 2h OT."""
        day = make_day(
            a_start="06:00", a_end="16:00",
            r_start="06:00", r_end="14:00",
            dow=1,
        )
        result = compute_day(day, cfg, codes)
        assert result.hours == 10.0
        assert result.total_pay == r2(r2(8 * B) + r2(2 * B * 1.5))

    def test_claim_no_uses_actual_only(self, cfg, codes):
        """claim=No: paid on actual times only, no scheduled-hours guarantee."""
        day = make_day(
            a_start="06:00", a_end="13:30",
            r_start="06:30", r_end="14:30",  # scheduled is 8h, actual is 7.5h
            dow=1,
            claim_liftup_layback=False,
        )
        result = compute_day(day, cfg, codes)
        assert result.hours == 7.5  # actual only, no guarantee

    def test_auto_suppress_shift_swap(self, cfg, codes):
        """<50% overlap → auto-suppressed; paid on actual 8h only (v3.11 fix)."""
        day = DayState(
            date="2025-08-11", dow=6, diag="3652",
            r_start="04:43", r_end="12:58",
            a_start="12:00", a_end="20:00",
            claim_liftup_layback=True,  # user wants claim, but auto-suppress overrides
        )
        result = compute_day(day, cfg, codes)
        assert result.hours == 8.0
        assert any("swap" in f.lower() or "auto" in f.lower() for f in result.flags)


# ─── Full fortnight ──────────────────────────────────────────────────────── PRD §FR-03

class TestComputeFortnight:
    def test_short_fortnight_detected_from_ado(self):
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 13
        days.append(make_day(diag="ADO", a_start="", a_end="", dow=5, is_short=True))
        assert compute_fortnight(_make_fn_request(days)).fortnight_type == "short"

    def test_long_fortnight_no_ado(self):
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 14
        assert compute_fortnight(_make_fn_request(days)).fortnight_type == "long"

    def test_payslip_variance_flagged(self):
        days = [make_day(a_start="06:00", a_end="14:00", dow=1)] * 10
        days += [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 4
        result = compute_fortnight(_make_fn_request(days, payslip_total=1.00))
        assert result.audit.payslip_variance is not None
        assert abs(result.audit.payslip_variance) > 0.10
        assert any("variance" in f.lower() for f in result.audit.flags)

    def test_pooled_ordinary_1001_sums_correctly(self):
        """Fortnight-level 1001 pools per-day ordinary amounts (sum-of-rounded)."""
        days = [make_day(a_start="06:00", a_end="14:00", dow=1)] * 5
        days += [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 9
        result = compute_fortnight(_make_fn_request(days))
        pooled = next(
            (c for c in result.fortnight_components if c.code == "1001" and c.date is None),
            None,
        )
        assert pooled is not None, "Pooled 1001 component not found"
        assert pooled.amount == 5 * r2(8.0 * B)
