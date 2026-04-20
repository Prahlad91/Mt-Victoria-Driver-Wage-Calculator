"""Unit tests for the EA 2025 calculation engine.
Every test maps to a specific PRD section and EA clause.
Run: cd backend && pytest tests/ -v
"""
import pytest
from models import RateConfig, PayrollCodes
from calculator import (
    compute_day, compute_fortnight, get_km_credit, round_hrs_ea,
    CalculateRequest,
)
from conftest import make_day

B = 49.81842  # EA 2025 base rate (Sch. 4A)


# ─── Helper ──────────────────────────────────────────────────────────────────

def r2(n: float) -> float:
    return round(n, 2)


def names(day_result) -> list[str]:
    return [c.name for c in day_result.components]


def amount(day_result, keyword: str) -> float:
    """Return the total amount of all components whose name contains keyword."""
    return r2(sum(c.amount for c in day_result.components if keyword.lower() in c.name.lower()))


# ─── EA Cl. 134.3(b) rounding ─────────────────────────────────────────────── PRD §5.4

class TestEARounding:
    def test_under_30_min_disregarded(self):
        assert round_hrs_ea(8.4) == 8   # 24 min fraction → disregarded

    def test_exactly_30_min_rounds_up(self):
        assert round_hrs_ea(8.5) == 9   # 30 min → round up

    def test_59_min_rounds_up(self):
        assert round_hrs_ea(7.983) == 8  # ~59 min → round up

    def test_whole_number_unchanged(self):
        assert round_hrs_ea(8.0) == 8


# ─── KM credit table (Cl. 146.4) ──────────────────────────────────────────── PRD §5.5

class TestKmCredit:
    def test_below_161_returns_none(self):
        assert get_km_credit(160) is None
        assert get_km_credit(0) is None

    def test_161_band(self):
        assert get_km_credit(161) == 5.0
        assert get_km_credit(192) == 5.0

    def test_257_band_double_shift(self):
        assert get_km_credit(257) == 8.0
        assert get_km_credit(289) == 8.0

    def test_290_band(self):
        assert get_km_credit(290) == 9.0

    def test_644_extension(self):
        # 644 + 16 km = +0.5 hr → 20.0
        assert get_km_credit(660) == 20.0
        # 644 + 32 km = +1.0 hr → 20.5
        assert get_km_credit(676) == 20.5


# ─── Ordinary weekday ─────────────────────────────────────────────────────── PRD §5.1

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


# ─── Overtime (Cl. 140.1) ─────────────────────────────────────────────────── PRD §5.2

class TestOvertime:
    def test_exactly_2hrs_ot_tier1(self, cfg, codes):
        """10 hrs total: 8 ordinary + 2 OT at 1.5x"""
        day = make_day(a_start="06:00", a_end="16:00", dow=1)
        result = compute_day(day, cfg, codes)
        expected = r2(8 * B + 2 * B * 1.5)
        assert result.total_pay == expected
        assert any("first 2" in n for n in names(result))
        assert not any("beyond 2" in n for n in names(result))

    def test_3hrs_ot_splits_at_2(self, cfg, codes):
        """11 hrs: 8 ordinary + 2 OT tier1 (1.5x) + 1 OT tier2 (2.0x)"""
        day = make_day(a_start="06:00", a_end="17:00", dow=1)
        result = compute_day(day, cfg, codes)
        expected = r2(8 * B + 2 * B * 1.5 + 1 * B * 2.0)
        assert result.total_pay == expected
        assert any("beyond 2" in n for n in names(result))


# ─── Shift penalties (Sch. 4B / Cl. 134.3) ───────────────────────────────── PRD §5.4

class TestShiftPenalties:
    def test_night_shift_penalty_applied(self, cfg, codes):
        """Sign-on 22:00 (night) — Item 7 penalty should apply."""
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=1)
        result = compute_day(day, cfg, codes)
        # Night penalty: roundHrsEA(8.0) = 8 hrs x $5.69
        pen = amount(result, "Night")
        assert pen == r2(8 * 5.69)

    def test_early_morning_penalty_applied(self, cfg, codes):
        """Sign-on 04:30 (early morning) — Item 8 penalty."""
        day = make_day(a_start="04:30", a_end="12:30", dow=2)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Early")
        assert pen == r2(8 * 4.84)

    def test_afternoon_penalty_applied(self, cfg, codes):
        """Sign-on 14:00, sign-off 22:30 (crosses 18:00) — Item 6 afternoon penalty."""
        day = make_day(a_start="14:00", a_end="22:30", dow=3)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Afternoon")
        assert pen > 0

    def test_no_penalty_on_saturday(self, cfg, codes):
        """Shift penalties NOT payable on Saturday (Cl. 134.3(a))."""
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=6)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Night")
        assert pen == 0.0

    def test_no_penalty_on_sunday(self, cfg, codes):
        """Shift penalties NOT payable on Sunday (Cl. 134.3(a))."""
        day = make_day(a_start="04:00", a_end="12:00", dow=0)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Early")
        assert pen == 0.0

    def test_no_penalty_on_ph(self, cfg, codes):
        """Shift penalties NOT payable on public holiday (Cl. 134.3(a))."""
        day = make_day(a_start="22:00", a_end="06:00", cm=True, dow=1, ph=True)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Night")
        assert pen == 0.0

    def test_ea_rounding_under_30min(self, cfg, codes):
        """7h 20min night shift: fraction is 20 min < 30 → 7 hrs penalty, not 8."""
        # 22:00 to 05:20 = 7h 20min
        day = make_day(a_start="22:00", a_end="05:20", cm=True, dow=1)
        result = compute_day(day, cfg, codes)
        pen = amount(result, "Night")
        assert pen == r2(7 * 5.69)  # 7 hrs, not 8


# ─── Weekend rates ────────────────────────────────────────────────────────── PRD §5.1

class TestWeekendRates:
    def test_saturday_ordinary(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=6)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 1.5)

    def test_sunday_ordinary(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=0)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 2.0)

    def test_saturday_ot_double_time(self, cfg, codes):
        """Saturday OT >8 hrs is double time (Sch. 4A)."""
        day = make_day(a_start="06:00", a_end="15:00", dow=6)  # 9 hrs
        result = compute_day(day, cfg, codes)
        expected = r2(8 * B * 1.5 + 1 * B * 2.0)
        assert result.total_pay == expected


# ─── Public holiday (Cl. 31) ──────────────────────────────────────────────── PRD §5.3

class TestPublicHoliday:
    def test_ph_weekday_rate(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=1, ph=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 1.5)

    def test_ph_weekend_rate(self, cfg, codes):
        day = make_day(a_start="06:00", a_end="14:00", dow=6, ph=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 2.5)


# ─── KM credit pay (Cl. 146.4) ───────────────────────────────────────────── PRD §5.5

class TestKmCreditPay:
    def test_290km_credits_9hrs_on_7hr_shift(self, cfg, codes):
        """7 hr actual shift + 290 km → 9 hrs credited → 2 hrs bonus at ordinary rate."""
        day = make_day(a_start="06:00", a_end="13:00", km=290.0, dow=1)
        result = compute_day(day, cfg, codes)
        km_bonus = amount(result, "KM credit")
        assert km_bonus == r2(2.0 * B)  # 2 bonus hrs at ordinary rate

    def test_below_161km_no_credit(self, cfg, codes):
        """< 161 km: actual time only, no KM credit component."""
        day = make_day(a_start="06:00", a_end="14:00", km=150.0, dow=1)
        result = compute_day(day, cfg, codes)
        km = amount(result, "KM credit")
        assert km == 0.0


# ─── WOBOD (Cl. 136) ──────────────────────────────────────────────────────── PRD §5.6

class TestWobod:
    def test_wobod_double_time(self, cfg, codes):
        """WOBOD: double time for hours worked."""
        day = make_day(a_start="06:00", a_end="14:00", wobod=True, dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B * 2.0)

    def test_wobod_minimum_4hrs(self, cfg, codes):
        """WOBOD: 3 hrs worked → paid for 4 hrs minimum."""
        day = make_day(a_start="06:00", a_end="09:00", wobod=True, dow=1)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(4 * B * 2.0)  # 4 hrs minimum


# ─── ADO pay (PRD §5.8 / FR-08) ─────────────────────────────────────────────

class TestAdoPay:
    def test_ado_paid_in_short_fortnight(self, cfg, codes):
        """Short fortnight: ADO day = 8 hrs ordinary rate."""
        day = make_day(diag="ADO", a_start="", a_end="", dow=3, is_short=True)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == r2(8 * B)
        assert result.hours == 8.0

    def test_ado_accruing_in_long_fortnight(self, cfg, codes):
        """Long fortnight: ADO day = $0, flagged as accruing."""
        day = make_day(diag="ADO", a_start="", a_end="", dow=3, is_short=False)
        result = compute_day(day, cfg, codes)
        assert result.total_pay == 0.0
        assert any("accruing" in f.lower() for f in result.flags)


# ─── Lift-up / Layback (Cl. 131 / Cl. 140.1) ─────────────────────────────── PRD §5.7

class TestLiftupLayback:
    def test_liftup_within_8hrs_is_ordinary(self, cfg, codes):
        """Started 30 min early; total shift 7.5 hrs → all ordinary rate."""
        # Rostered 06:30–13:30 (7 hrs). Actual 06:00–13:30 (7.5 hrs). Gap = 0.5 hrs.
        day = make_day(
            a_start="06:00", a_end="13:30",
            r_start="06:30", r_end="13:30",
            dow=1,
        )
        result = compute_day(day, cfg, codes)
        liftup = amount(result, "Lift-up")
        assert liftup == r2(0.5 * B)  # 0.5 hrs at ordinary 1x

    def test_layback_pushes_into_ot(self, cfg, codes):
        """Rostered 06:00–14:00. Actual 06:00–16:00 (10 hrs). Layback = 2 hrs OT."""
        day = make_day(
            a_start="06:00", a_end="16:00",
            r_start="06:00", r_end="14:00",
            dow=1,
        )
        result = compute_day(day, cfg, codes)
        layback = amount(result, "Layback")
        # 2 hrs layback all at OT rate (shift is already 8 hrs at rostered end)
        assert layback == r2(2 * B * 1.5)


# ─── Full fortnight computation ───────────────────────────────────────────── PRD §FR-03

class TestComputeFortnight:
    def _make_request(self, days, payslip_total=None):
        from models import CalculateRequest, RateConfig, PayrollCodes
        return CalculateRequest(
            fortnight_start="2025-08-10",
            roster_line=1,
            public_holidays=[],
            payslip_total=payslip_total,
            config=RateConfig(),
            codes=PayrollCodes(),
            days=days,
            unassoc_amt=0.0,
        )

    def test_short_fortnight_detected_from_ado(self, cfg, codes):
        """If any day is ADO, fortnight_type = 'short'."""
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 13
        days.append(make_day(diag="ADO", a_start="", a_end="", dow=5, is_short=True))
        req = self._make_request(days)
        result = compute_fortnight(req)
        assert result.fortnight_type == "short"

    def test_long_fortnight_no_ado(self, cfg, codes):
        """No ADO in 14 days → fortnight_type = 'long'."""
        days = [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 14
        req = self._make_request(days)
        result = compute_fortnight(req)
        assert result.fortnight_type == "long"

    def test_payslip_variance_flagged(self, cfg, codes):
        """Payslip total differs by >$0.10 → variance flagged in audit."""
        days = [make_day(a_start="06:00", a_end="14:00", dow=1)] * 10
        days += [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 4
        req = self._make_request(days, payslip_total=1.00)  # deliberately wrong
        result = compute_fortnight(req)
        assert result.audit.payslip_variance is not None
        assert abs(result.audit.payslip_variance) > 0.10
        assert any("variance" in f.lower() for f in result.audit.flags)

    def test_total_pay_matches_sum_of_days(self, cfg, codes):
        """Fortnight total_pay = sum of all day total_pay."""
        days = [
            make_day(a_start="06:00", a_end="14:00", dow=1),
            make_day(a_start="06:00", a_end="14:00", dow=2),
            make_day(a_start="06:00", a_end="16:00", dow=3),  # OT
            make_day(a_start="06:00", a_end="14:00", dow=6),  # Saturday
            make_day(diag="OFF", a_start="", a_end="", dow=0),
        ] + [make_day(diag="OFF", a_start="", a_end="", dow=0)] * 9
        req = self._make_request(days)
        result = compute_fortnight(req)
        expected = r2(sum(d.total_pay for d in result.days))
        assert result.total_pay == expected
