"""Shared test helpers for the Mt Victoria Wage Calculator backend tests."""
from models import DayState


def make_day(
    diag="3158 RK",
    a_start="06:00",
    a_end="14:00",
    r_start="06:00",
    r_end="14:00",
    dow=1,
    ph=False,
    cm=False,
    wobod=False,
    km=0.0,
    leave_cat="none",
    is_short=True,
    r_hrs=8.0,
    claim_liftup_layback=True,
) -> DayState:
    """Factory for test DayState objects. Defaults to an 8-hr weekday shift."""
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
        claim_liftup_layback=claim_liftup_layback,
    )
