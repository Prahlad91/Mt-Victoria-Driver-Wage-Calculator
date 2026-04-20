"""Shared pytest fixtures for the Mt Victoria Wage Calculator tests.
PRD ref: Solution Design Section 9 (Testing Strategy)
"""
import pytest
from models import DayState, RateConfig, PayrollCodes


@pytest.fixture
def cfg():
    """Default EA 2025 rate config. PRD §5.1-5.7"""
    return RateConfig()


@pytest.fixture
def codes():
    """Blank payroll codes (not needed for calculation accuracy tests)."""
    return PayrollCodes()


def make_day(
    diag="3158 RK",
    a_start="06:00",
    a_end="14:00",
    r_start="06:00",
    r_end="14:00",
    dow=1,          # Monday
    ph=False,
    cm=False,
    wobod=False,
    km=0.0,
    leave_cat="none",
    is_short=True,
    r_hrs=8.0,
) -> DayState:
    """Factory for test DayState objects."""
    return DayState(
        date="2025-08-11",
        dow=dow,
        ph=ph,
        diag=diag,
        r_start=r_start,
        r_end=r_end,
        cm=cm,
        r_hrs=r_hrs,
        a_start=a_start,
        a_end=a_end,
        wobod=wobod,
        km=km,
        leave_cat=leave_cat,
        is_short_fortnight=is_short,
    )


@pytest.fixture
def weekday_8h(cfg, codes):
    """Plain weekday shift, exactly 8 hrs. No OT, no penalty."""
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=1)


@pytest.fixture
def weekday_10h(cfg, codes):
    """Weekday shift 10 hrs — 8 ordinary + 2 OT (tier 1 only)."""
    return make_day(a_start="06:00", a_end="16:00", r_start="06:00", r_end="14:00", dow=2)


@pytest.fixture
def night_shift_8h(cfg, codes):
    """Night shift: sign-on 22:00 Mon, sign-off 06:00 Tue (cross-midnight, 8 hrs)."""
    return make_day(a_start="22:00", a_end="06:00", r_start="22:00", r_end="06:00", dow=1, cm=True)


@pytest.fixture
def saturday_8h(cfg, codes):
    """Saturday 8 hrs — 1.5x rate, no shift penalty."""
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=6)


@pytest.fixture
def sunday_8h(cfg, codes):
    """Sunday 8 hrs — 2.0x rate, no shift penalty."""
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=0)


@pytest.fixture
def ph_weekday_8h(cfg, codes):
    """Public holiday weekday 8 hrs — 1.5x, no shift penalty."""
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=1, ph=True)
