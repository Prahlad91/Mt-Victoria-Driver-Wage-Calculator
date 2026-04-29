"""Shared pytest fixtures for the Mt Victoria Wage Calculator tests."""
import pytest
from models import RateConfig, PayrollCodes
from helpers import make_day  # noqa: F401 — re-exported for test files that want fixture injection


@pytest.fixture
def cfg():
    """Default EA 2025 rate config."""
    return RateConfig()


@pytest.fixture
def codes():
    """Default payroll codes."""
    return PayrollCodes()


@pytest.fixture
def weekday_8h():
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=1)


@pytest.fixture
def weekday_10h():
    return make_day(a_start="06:00", a_end="16:00", r_start="06:00", r_end="14:00", dow=2)


@pytest.fixture
def night_shift_8h():
    return make_day(a_start="22:00", a_end="06:00", r_start="22:00", r_end="06:00", dow=1, cm=True)


@pytest.fixture
def saturday_8h():
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=6)


@pytest.fixture
def sunday_8h():
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=0)


@pytest.fixture
def ph_weekday_8h():
    return make_day(a_start="06:00", a_end="14:00", r_start="06:00", r_end="14:00", dow=1, ph=True)
