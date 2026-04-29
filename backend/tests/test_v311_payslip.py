"""Regression test — Line 8 canonical payslip, fortnight 2026-03-22.

$7,336.55 verified against Prahlad's real payslip (26 Apr 2026).
Any divergence from this total signals a calculation regression.

See CLAUDE.md §"The canonical $7,336.55 test fortnight" for full fixture details.
"""
import pytest
from fastapi.testclient import TestClient
from models import CalculateRequest
from calculator import compute_fortnight
from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Canonical payload — camelCase so it mirrors what the frontend sends.
# Verified line by line against the real payslip.
# ---------------------------------------------------------------------------
PAYLOAD = {
    "fortnightStart": "2026-03-22",
    "rosterLine": 8,
    "publicHolidays": ["2026-04-03", "2026-04-04"],
    "isShortFortnight": True,  # Mar 30 was rostered ADO
    "days": [
        # --- Week 1 ---
        # Mar 22 Sun — OFF
        {"date": "2026-03-22", "dow": 0, "diag": "OFF",  "aStart": "", "aEnd": ""},
        # Mar 23 Mon — OFF
        {"date": "2026-03-23", "dow": 1, "diag": "OFF",  "aStart": "", "aEnd": ""},
        # Mar 24 Tue — 3154, night shift (sign-on 03:20 < 04:00), claim=Yes
        # Effective window: min(01:51, 03:20)=01:51 → max(11:21, 11:20)=11:21 = 9.5h
        {"date": "2026-03-24", "dow": 2, "diag": "3154",
         "rStart": "01:51", "rEnd": "11:21", "aStart": "03:20", "aEnd": "11:20",
         "km": 254.109, "claimLiftupLayback": True},
        # Mar 25 Wed — 3155, night + lift-up (actual earlier than scheduled), claim=Yes
        # Effective window: min(02:27, 01:06)=01:06 → max(10:32, 09:06)=10:32 = 9.43h
        {"date": "2026-03-25", "dow": 3, "diag": "3155",
         "rStart": "02:27", "rEnd": "10:32", "aStart": "01:06", "aEnd": "09:06",
         "km": 254.109, "claimLiftupLayback": True},
        # Mar 26 Thu — 3157, early morning (sign-on 04:41), claim=Yes
        # Effective window: min(03:11, 04:41)=03:11 → max(12:41, 12:42)=12:42 = 9.52h
        {"date": "2026-03-26", "dow": 4, "diag": "3157",
         "rStart": "03:11", "rEnd": "12:41", "aStart": "04:41", "aEnd": "12:42",
         "km": 127.489, "claimLiftupLayback": True},
        # Mar 27 Fri — 3156, early morning (sign-on 04:20), claim=Yes
        # Effective window: min(02:42, 04:20)=02:42 → max(11:41, 12:42)=12:42 = 10.0h
        {"date": "2026-03-27", "dow": 5, "diag": "3156",
         "rStart": "02:42", "rEnd": "11:41", "aStart": "04:20", "aEnd": "12:42",
         "km": 127.489, "claimLiftupLayback": True},
        # Mar 28 Sat — 3652, 12% overlap → auto-suppressed shift swap
        # Paid on actual 8h only (not effective window 04:43→20:00)
        {"date": "2026-03-28", "dow": 6, "diag": "3652",
         "rStart": "04:43", "rEnd": "12:58", "aStart": "12:00", "aEnd": "20:00",
         "km": 254.109, "claimLiftupLayback": True},
        # --- Week 2 ---
        # Mar 29 Sun — WOBOD (Sun 250% + 50% = 300% combined)
        {"date": "2026-03-29", "dow": 0, "diag": "WOBOD",
         "aStart": "13:30", "aEnd": "21:30", "km": 0, "wobod": True},
        # Mar 30 Mon — WOBOD (was rostered ADO, worked as WOBOD; weekday WOBOD #1 = 150%+50%)
        {"date": "2026-03-30", "dow": 1, "diag": "WOBOD",
         "aStart": "09:13", "aEnd": "18:08", "km": 0, "wobod": True, "wasAdo": True},
        # Mar 31 Tue — 3151 (manual), claim=No (no afternoon penalty: sign-on 09:13 < 10:00)
        {"date": "2026-03-31", "dow": 2, "diag": "3151",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 254.109, "claimLiftupLayback": False},
        # Apr 1 Wed — 3152 (manual), claim=No
        {"date": "2026-04-01", "dow": 3, "diag": "3152",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 0, "claimLiftupLayback": False},
        # Apr 2 Thu — 3153 (manual), claim=No, km=181.954 (credited 5h < worked 8.92h → no bonus)
        {"date": "2026-04-02", "dow": 4, "diag": "3153",
         "rStart": "09:13", "rEnd": "18:08", "aStart": "09:13", "aEnd": "18:08",
         "km": 181.954, "claimLiftupLayback": False},
        # Apr 3 Fri — Good Friday PHNW (code 5042)
        {"date": "2026-04-03", "dow": 5, "diag": "PHNW",
         "ph": True, "leaveCat": "PHNW", "aStart": "", "aEnd": ""},
        # Apr 4 Sat — Easter Saturday PHNW (code 1010)
        {"date": "2026-04-04", "dow": 6, "diag": "PHNW",
         "ph": True, "leaveCat": "PHNW", "aStart": "", "aEnd": ""},
    ],
}


@pytest.fixture(scope="module")
def result():
    return compute_fortnight(CalculateRequest.model_validate(PAYLOAD))


# ─── Core total ──────────────────────────────────────────────────────────────

def test_total_pay(result):
    """The canonical payslip total must be $7,336.55 to the cent."""
    assert result.total_pay == 7336.55, f"Expected $7,336.55 but got ${result.total_pay}"


def test_fortnight_type_short(result):
    assert result.fortnight_type == "short"


# ─── Pooled ordinary (1001) ──────────────────────────────────────────────────

def test_pooled_ordinary_1001(result):
    """8 days × 8.00h × $49.81842 using sum-of-rounded-per-day = $3,188.40 (not 64h × rate)."""
    pooled = next(
        (c for c in result.fortnight_components if c.code == "1001" and c.date is None),
        None,
    )
    assert pooled is not None, "Pooled 1001 line not found"
    assert pooled.amount == 3188.40, f"Expected $3,188.40, got ${pooled.amount}"


# ─── ADO adjustment (1462) ───────────────────────────────────────────────────

def test_ado_adjustment_1462(result):
    """+4.00h × $49.81842 = $199.27 (short fortnight payout)."""
    ado = next((c for c in result.fortnight_components if c.code == "1462"), None)
    assert ado is not None, "1462 ADO Adjustment not found"
    assert ado.amount == 199.27, f"Expected $199.27, got ${ado.amount}"
    assert result.ado_payout == 199.27


# ─── Sun WOBOD (Mar 29) ──────────────────────────────────────────────────────

def test_sun_wobod_mar29(result):
    """8h Sun WOBOD: 1110 primary 250% = $996.37, 1059 loading 50% = $199.27."""
    mar29 = next(dr for dr in result.days if dr.date == "2026-03-29")
    primary = next((c for c in mar29.components if c.code == "1110"), None)
    loading = next((c for c in mar29.components if c.code == "1059"), None)
    assert primary is not None, "Mar 29 1110 (250% Sun WOBOD) not found"
    assert loading is not None, "Mar 29 1059 (50% loading) not found"
    assert primary.amount == 996.37, f"Sun WOBOD 250%: expected $996.37, got ${primary.amount}"
    assert loading.amount == 199.27, f"WOBOD loading 50%: expected $199.27, got ${loading.amount}"


# ─── Weekday WOBOD (Mar 30) ──────────────────────────────────────────────────

def test_weekday_wobod_mar30(result):
    """8.92h weekday WOBOD #1: 1100 primary 150%, 1059 loading 50%."""
    mar30 = next(dr for dr in result.days if dr.date == "2026-03-30")
    primary = next((c for c in mar30.components if c.code == "1100"), None)
    loading = next((c for c in mar30.components if c.code == "1059"), None)
    assert primary is not None, "Mar 30 1100 (150% weekday WOBOD #1) not found"
    assert loading is not None, "Mar 30 1059 (50% loading) not found"


# ─── Mar 28 auto-suppress ────────────────────────────────────────────────────

def test_mar28_auto_suppressed(result):
    """Mar 28: 12% overlap → auto-suppress; paid on actual 8h, not effective window."""
    mar28 = next(dr for dr in result.days if dr.date == "2026-03-28")
    assert mar28.hours == 8.0, f"Expected 8.0h actual, got {mar28.hours}"
    assert any(
        "swap" in f.lower() or "auto" in f.lower() for f in mar28.flags
    ), f"Expected auto-suppress flag; got: {mar28.flags}"


# ─── No afternoon penalty on sign-on 09:13 ───────────────────────────────────

def test_no_afternoon_penalty_mar31_apr1_apr2(result):
    """Mar 31/Apr 1/Apr 2 sign-on 09:13 < 10:00 → ordinary ends 17:13 < 18:00 → no penalty."""
    for date in ("2026-03-31", "2026-04-01", "2026-04-02"):
        dr = next(dr for dr in result.days if dr.date == date)
        pen_codes = {c.code for c in dr.components}
        assert pen_codes.isdisjoint({"", "1470"}), (
            f"{date}: afternoon/special loading should not appear when sign-on is 09:13"
        )
        # Specifically: no component with 'Afternoon' in the name
        assert not any("Afternoon" in c.name for c in dr.components), (
            f"{date} should have no afternoon penalty (sign-on 09:13 < 10:00)"
        )


# ─── HTTP integration smoke test ─────────────────────────────────────────────

def test_api_endpoint_returns_correct_total():
    """POST /api/calculate with canonical payload returns $7,336.55."""
    resp = client.post("/api/calculate", json=PAYLOAD)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Handle both camelCase (FastAPI default) and snake_case
    total = body.get("totalPay") or body.get("total_pay")
    assert total == 7336.55, f"API returned ${total}, expected $7,336.55"
