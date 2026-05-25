# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.33
**Date:** May 2026
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)
**Status:** Active — governs all development on this repository

> **Process rules:**
> 1. Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.
> 2. **The PRD must be readable as a complete standalone document.** When bumping versions, the previous version's content MUST be preserved verbatim — only changed sections may be edited. Placeholder text like *"unchanged from v3.X"* is never acceptable; if a section hasn't changed, copy the previous wording forward unchanged. The reader of any version of this PRD should be able to understand every requirement without consulting prior versions or git history.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a **full-stack web application** built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its purpose is to allow drivers to calculate their exact gross fortnightly pay — derived from their rostered line, their actual worked times, and all applicable Enterprise Agreement 2025 rules — so they can independently verify every line on their payslip without needing payroll or HR involvement.

From v3.0 the system uses a **React frontend + Python (FastAPI) backend** architecture. From v3.1, roster and schedule data is sourced from uploaded PDF/ZIP files rather than only from built-in hardcoded data.

---

## 2. Background and Problem Statement

### 2.1 The payslip verification problem

Sydney Trains drivers receive fortnightly payslips containing 10–25 line items across multiple pay codes. The calculation rules are complex:

- Ordinary hours are capped at 8 per day; beyond that, two tiers of OT apply
- Shift penalties (afternoon, night, early morning) are paid per worked hour, not per shift, with EA-mandated rounding (Cl. 134.3(b))
- Saturday, Sunday, and public holidays each have different rate multipliers
- Cross-midnight shifts may split across two calendar days with different rate rules
- KM credits for intercity services grant additional credited hours above actual worked hours under a 26-band table (Cl. 146.4)
- Lift-up, layback, and buildup (working before scheduled start or after scheduled end) must be paid at ordinary rate within the 8-hr limit and OT rate beyond it
- ADO days are paid as 8 hrs ordinary only in a short fortnight; in the alternating long fortnight, the ADO accrues without payout
- WOBOD (working on a book-off day): Cl. 140.4 primary rate (150% weekday, 200% Sat, 250% Sun, with weekday OT-shift counter) + Cl. 140.7 50% Train Crew loading on top; no 4-hour minimum

Without a calculation tool, drivers cannot easily verify their pay and underpayments go unchallenged.

### 2.2 EA 2025 context

The Sydney Trains and NSW TrainLink Enterprise Agreement 2025 was approved by the Fair Work Commission in August 2025. Key changes:

| Item | Detail |
|------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate (Sch. 4A) | $49.81842/hr (from 1 July 2025) |
| Effective from | 1 July 2025 |

### 2.3 Depot context

Mt Victoria is an intercity depot on the Blue Mountains line. Key characteristics:

- Long-distance shifts accumulate significant KMs (often 200–400+ km per shift)
- The KM credit system (Cl. 146.4) is heavily used and contributes substantially to pay
- Roster lines are fortnightly repeating patterns; lines 1–22 are permanent/fixed, lines 201–214 are standby/swinger lines whose diagram assignments change every fortnight
- The ADO system (19-day month) alternates short fortnights (ADO paid out) and long fortnights (ADO accruing)
- Drivers frequently work shift swaps — taking a different diagram than originally rostered — on **any day of the fortnight**, including regular weekdays, Saturdays, Sundays, and public holidays. The ability to override the rostered diagram for any day is therefore a core operational need.
- **Times and KMs come from the schedule file, not the master roster** — the master roster shows the assignment (which diagram on which day); the schedule file is the authoritative source for sign-on, sign-off and distance per diagram. Drivers may also override these values manually on any day if the schedule file is out of date.
- Drivers may also choose, on a per-day basis, whether to claim lift-up/layback/buildup pay — for example when there is an informal arrangement with a manager, or when the driver doesn't want the scheduled-hours guarantee applied.

---

## 3. Users

### Primary user
**Mt Victoria intercity train driver**
- Knows their roster line number and fortnight start date
- Understands EA terminology (diagram, ADO, WOBOD, layback, lift-up, KM credit)
- Frequently works shift swaps on any day type
- Uses the calculator after receiving a payslip to verify it, or to forecast pay mid-fortnight
- Not a developer
- Uses the app on phone or desktop browser at home or in the crew room

### Secondary users
- **Delegates / union reps** at Mt Victoria who assist drivers in disputes
- **Other depot drivers** who may adapt the roster data for their own depot

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | 4-digit identifier for a specific shift (e.g. `3151`, `3651`). Used interchangeably. Defines sign-on, sign-off, train services, and KM distance. |
| **Diagram name** | Full diagram label as it appears in the roster, e.g. `3151 SMB`, `3158 RK`. The 4-digit prefix is the diagram number; trailing tokens are crew location codes (SMB, RK, etc.). |
| **Fortnight** | 14-day pay period starting on a Sunday. |
| **Short fortnight** | Fortnight containing an ADO day — ADO paid out this period. |
| **Long fortnight** | Fortnight with no ADO — all shifts worked; ADO accrues. |
| **ADO** | Accrued Day Off. Under the 19-day month arrangement, drivers accumulate time building to one paid day off per 4-week cycle. |
| **Master Roster** | Annual roster document for lines 1–22. Published once a year. Defines which diagram (schedule number) each line works on each of the 14 days. Format: ZIP archive containing manifest.json + text + image layers, OR real PDF. |
| **Fortnight Roster** | Per-fortnight roster document for swinger lines 201–214. Published every fortnight. Same ZIP/PDF format as master roster (also accepted as a printed "Intercity Drivers Roster" PDF). Defines which diagram each swinger line works that fortnight, plus the crew member assigned to each line. |
| **Schedule file** | Per-diagram file (weekday or weekend). Authoritative source for sign-on, sign-off, total hours, and KM distance per diagram number. |
| **Sign on** | The "Sign on" line in the schedule block (e.g. `Sign on 1:51a MOUNT VICTORIA`). Authoritative source for **scheduled start time** (subject to manual user override per FR-02-B). |
| **Time off duty** | The "Time off duty" line in the schedule block (e.g. `Time off duty : 11:21a`). Authoritative source for **scheduled end time** (subject to manual user override per FR-02-B). |
| **Distance** | The `Distance: NNN.NNN Km` line in the schedule block. Authoritative source for **KMs** (subject to manual user override). |
| **Scheduled times** | Sign-on and sign-off for a day — looked up from the schedule file using the day's diagram number. Pre-populated on roster load and editable by the user. |
| **Actual times** | User-entered start and end times reflecting what actually happened. May differ from scheduled (lift-up, layback, late sign-off). Defaults to scheduled times on load; can be changed by user; can be re-synced via "Same as scheduled" button. |
| **Effective window** | The pay-calculation window when **Claim lift-up/layback = Yes**: from `min(scheduled_start, actual_start)` to `max(scheduled_end, actual_end)`. Total worked hours = effective_end − effective_start. See §5.7. |
| **Time source** | Tags every day with where its scheduled times came from: `schedule` (from uploaded schedule file), `master` (from master roster), `builtin` (from built-in fallback data), `manual` (user override or user-edited times), `none` (OFF/ADO). |
| **Manual diagram override** | User-entered diagram number that replaces the roster-assigned diagram for a specific day. Searches BOTH weekday and weekend schedules to find the diagram. Applies to **any day type**: regular workday, Saturday, Sunday, public holiday, OFF, or ADO. |
| **Claim lift-up/layback** | Per-day Yes/No setting (default **Yes**) that controls whether the pay calculation includes lift-up/layback/buildup. When **Yes**, total shift duration = `max(scheduled_end, actual_end) − min(scheduled_start, actual_start)` (effective window — guarantees scheduled hours plus any extension). When **No**, total shift duration = `actual_end − actual_start` (driver paid only for hours physically on duty). See §5.7 and FR-02-F. |
| **Swinger line** | Roster lines 201–214. Standby/flexible positions whose diagram assignments change each fortnight (sourced from the Fortnight Roster). |
| **OT** | Overtime. Hours beyond 8 in a single day. 1.5× first 2 hrs, 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Working on a rostered day off. Cl. 140.4 primary rate (150%/200%/250% by day type and weekday OT-shift counter) + Cl. 140.7 50% Train Crew loading. No 4-hour minimum. |
| **Lift-up / Buildup** | Driver signs on **before** scheduled start. The duration = `max(0, scheduled_start − actual_start)`. Treatment depends on the **Claim lift-up/layback** toggle — see §5.7. |
| **Layback / Extend** | Driver signs off **after** scheduled end. The duration = `max(0, actual_end − scheduled_end)`. Treatment depends on the **Claim lift-up/layback** toggle — see §5.7. |
| **KM credit** | Under Cl. 146.4, intercity drivers doing ≥161 km are credited more hours than actually worked (26-band table). Credited excess paid at ordinary rate, excluded from OT. KMs always come from the schedule file (subject to user override). |
| **Shift penalty** | Per-hour loading for afternoon, night, or early morning shifts. EA rounding: <30 min disregarded, 30–59 min = 1 hr. Not payable Sat/Sun/PH. **Always determined by actual sign-on time** (not the effective window), because the penalty class depends on when the driver physically signs on. |
| **Un-associated duties** | Duties not directly associated with train operations (road review, pilot prep, etc.) paid additionally for ≥161 km shifts (Cl. 146.4(d)). |
| **RDO** | Roster Day Off. A scheduled rest day in the roster pattern. When taken as a leave entry, treated as **unpaid** — same pay treatment as LWOP. |
| **Roster source indicator** | UI badge showing which data source was used: "Master roster", "Fortnight roster", or "Built-in data". |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A)
- Base rate: $49.81842/hr (configurable)
- First 8 hours of any shift at ordinary rate
- Weekend: Saturday 1.5×, Sunday 2.0×

### 5.2 Overtime (Cl. 78.3 — corrected v3.19)

**Source:** Sydney Trains and NSW TrainLink Enterprise Agreement 2025, Section 78, point **78.3** (Page 93):

> Employees who work in excess of 76 hours per fortnight will be paid at the rate of time and one half for excess hours worked. Overtime worked in excess of 8 hours in any one Shift will be paid at the rate of time and one half for the first 3 hours and double time thereafter.

**Daily OT (per-shift):**
- Hours 1–**3** beyond the 8-hr daily ordinary limit: **1.5×** (was incorrectly 1–2 in v3.18 and earlier)
- Hours beyond **3** hrs OT: **2.0×** (was incorrectly "beyond 2" in v3.18 and earlier)

**Fortnight OT (cumulative):**
- Hours in excess of 76 per fortnight: 1.5×
- Fortnightly threshold for short fortnight: 72h (Mt Victoria operational convention; not in Cl. 78.3 verbatim)
- Fortnightly threshold for long fortnight: 76h (verbatim from Cl. 78.3)

**Saturday OT >8 hrs:** 2.0× (separate provision; see Sat-OT clause)

The v3.19 fix changes the OT tier-1 boundary from 2.0 → **3.0** hours in both `backend/calculator.py` (`ot1h = r2_hrs(min(ot_h, 3.0))`) and `frontend/src/utils/calcPreview.ts` (`const ot1h = r2Hrs(Math.min(otH, 3))`). The canonical $7,336.55 regression for Line 8 (fortnight 2026-03-22) is unaffected because **no day in that fortnight had more than 2 hrs of daily OT** — the worst day (Mar 27) had exactly 2.0 hrs of OT, which sits inside the 1.5× tier under both the old and new boundaries. A new regression test exercising the 3-hr boundary (12-hr worked shift → 8 ord + 3 × 1.5× + 1 × 2.0×) was added to lock the rule in place.

### 5.3 Public holidays (Cl. 31)
- Weekday PH worked: 1.5×
- Weekend PH worked: 2.5×
- PH not worked: 8 hrs ordinary pay (Cl. 31.7)
- Shift penalties not payable on PH (Cl. 134.3(a))
- **PH worked — choose-your-treatment (clarified v3.20):** when a driver works on a PH the EA permits two settlement options, selectable via the day-row leave-category dropdown:
  - **`PHW` — PH worked (paid):** the standard treatment. Pays the 150% loading on rostered hours **plus** an additional 8-hr ordinary-rate day (Cl. 31.5(b)). Implemented as two line-items: `PHW — 150% loading` (`Cl. 31.5(a)`) + `PHW — additional day` (`Cl. 31.5(b)`).
  - **`PHWA` — PH worked and accrued (new v3.20):** the alternative treatment for drivers who want the loading paid this fortnight but want the additional 8-hr day **banked as a day off** to take later. Pays the 150% loading ONLY; the additional day is recorded as accrued via an audit-flag, not as a line-item this fortnight. Total pay = `r_hrs × base × 1.5`. The leave-category selector exposes "PH worked and accrued" alongside "PH worked" so the driver can elect at-time-of-entry.

### 5.4 Shift penalties (Sch. 4B / Cl. 134.3)
- Item 6 (Afternoon): $4.84/hr — payroll code **1485** (default set v3.18) — sign-on at or after 10:00 and before 18:00 (this guarantees the first 8h of ordinary time ends after 18:00); triggering is based on when ordinary time ends, NOT on actual sign-off
- Item 7 (Night): $5.69/hr — payroll code **1487** — commences at or between 18:00 and 03:59
- Item 8 (Early morning): $4.84/hr — payroll code **1483** — commences at or between 04:00 and 05:30
- Item 9 (Additional loading): $5.69 flat/shift — payroll code **1470** — sign on/off 01:01–03:59 Mon–Fri only
- Rounding (Cl. 134.3(b)): <30 min disregarded; 30–59 min = 1 hr
- Not payable Sat/Sun/PH (Cl. 134.3(a))
- **Penalty class is determined by the actual sign-on time, regardless of the Claim lift-up/layback setting** — the class depends on when the driver physically signs on, not the effective window.

### 5.5 KM credit system (Cl. 146.4)
26-band table from <161 km (actual time) up to 644+ km (+0.5 hr per 16 km). See Section 10.
- Credited excess hours paid at ordinary rate, NOT in OT computation (Cl. 146.4(b))
- KM distance auto-filled from uploaded schedule file's `Distance` field (and editable per FR-02-D)
- Cl. 157.1: greater-of rule (scheduled shift time vs km-credited hrs + un-associated time)
- The comparison is against **total worked hours** as defined by §5.7 (effective window when Claim lift-up/layback = Yes; actual times when No)

### 5.6 WOBOD (Cl. 140.4 + Cl. 140.7)

WOBOD applies when a driver works on a day that was rostered as OFF or ADO.

**Primary rate (Cl. 140.4) by day type:**
- Weekday (Mon–Fri): 150% for the 1st and 2nd weekday WOBOD shifts in the fortnight (code 1100); 200% for the 3rd and subsequent weekday WOBOD shifts (code 1110). The counter is fortnight-scoped; Sat/Sun WOBOD shifts do NOT increment it.
- Saturday: 200% (code 1110)
- Sunday: 250% (code 1110)

**Train Crew loading (Cl. 140.7):** +50% on top of the primary rate for all WOBOD shifts (code 1059).

**Combined effective rates:**
- Weekday WOBOD #1 and #2: 150% + 50% = 200% total
- Weekday WOBOD #3+: 200% + 50% = 250% total
- Saturday WOBOD: 200% + 50% = 250% total
- Sunday WOBOD: 250% + 50% = 300% total

**No 4-hour minimum.** The "Cl. 136 double-time min 4 hrs" rule referenced in v3.10 and earlier was hallucinated — no such rule exists in EA 2025 for WOBOD. Hours are paid on actual time worked only.

**No OT split, no shift penalties, no KM credit** on WOBOD shifts. The full WOBOD shift is paid at the applicable WOBOD rate regardless of duration.

### 5.7 Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1) — rewritten v3.10

Lift-up (driver started before scheduled start) and Layback (driver finished after scheduled end) are determined per-day by the **Claim lift-up/layback** toggle (FR-02-F).

**Auto-suppress rule (new v3.11):**

If the overlap between the scheduled window and the actual window is less than 50% of the shorter shift, the system treats the day as a **shift swap** and forces `claim_liftup_layback = False` regardless of the user's toggle setting. A warning chip is emitted in the DayRow UI and the flag is included in the results audit section. The user can still manually override the toggle to force `claim = Yes` if needed.

*Example:* Scheduled 04:43–12:58 (8.25h), Actual 12:00–20:00 (8h). Overlap = 0:58 / shorter shift 8h = 12% — auto-suppressed. Without this rule the effective window would be 04:43–20:00 = 15.28h, which is incorrect for a shift-swap situation where the driver simply worked a different shift.

**When `claim_liftup_layback = True` (default for every day, subject to auto-suppress):**

The pay calculation is based on the **effective window**:
- `effective_start = min(scheduled_start, actual_start)` (across both, with cross-midnight handled)
- `effective_end = max(scheduled_end, actual_end)` (across both, with cross-midnight handled)
- **Total worked hours = effective_end − effective_start**

This single duration is split into ordinary (≤ 8 hrs) and OT (> 8 hrs) per Cl. 140.1, and paid accordingly (with weekend/PH multipliers).

The lift-up duration (= `max(0, scheduled_start − actual_start)`) and layback duration (= `max(0, actual_end − scheduled_end)`) are emitted as **informational flags only** — they're already included in the effective window and are NOT separate pay components.

This rule guarantees the driver receives at least the scheduled shift duration even if they came late or finished early (per EA roster guarantee principle).

**When `claim_liftup_layback = False`:**

- `total_worked_hours = actual_end − actual_start` (no effective-window expansion)
- No scheduled-hours guarantee
- No lift-up/layback flags
- Driver paid strictly for time on duty between actual sign-on and actual sign-off

**In both cases:**
- Shift penalty class (afternoon/night/early per Sch. 4B) is determined by the **actual sign-on time**, not the effective start, because the penalty depends on when the driver physically signs on
- KM credit comparison is against the **total worked hours** as defined above

**Worked example (claim = Yes):**
- Scheduled: 09:00 to 17:00 (8 hrs)
- Actual: 08:30 to 17:30 (9 hrs — early start, late finish)
- Effective window: 08:30 to 17:30 = 9 hrs
- Pay: 8 hrs ordinary + 1 hr OT (1.5×) = 9.5 base-rate units
- Flags: "Lift-up: 30 min before scheduled start", "Layback: 30 min after scheduled end"

**Same example (claim = No):**
- Worked hours: 17:30 − 08:30 = 9 hrs (actual only, ignoring scheduled)
- Pay: 8 hrs ordinary + 1 hr OT = 9.5 base-rate units (same total in this case)
- No lift-up/layback flags

**Worked example showing scheduled-hours guarantee (claim = Yes):**
- Scheduled: 09:00 to 17:00 (8 hrs)
- Actual: 09:30 to 16:30 (7 hrs — driver came late, left early)
- Effective window: 09:00 to 17:00 = 8 hrs (scheduled guarantee)
- Pay: 8 hrs ordinary = 8 base-rate units

**Same example (claim = No):**
- Worked hours: 16:30 − 09:30 = 7 hrs (actual only)
- Pay: 7 hrs ordinary = 7 base-rate units (1 hr less)

**Important note on the pre-v3.10 implementation:** Versions v3.6 to v3.9 double-counted lift-up/layback by adding gap components on top of the actual_hrs computation that already included those minutes. v3.10's effective-window approach uses one window for hours computation, eliminating the double-count. The frontend live preview (`calcPreview.ts`) and the backend calculator (`calculator.py`) MUST both implement the new logic and produce identical components for the same input.

### 5.8 ADO pay
- Short fortnight: ADO = 8 hrs ordinary rate paid out (+4h Adjustment line, code 1462)
- Long fortnight: ADO accruing, applied as −4h Adjustment

A fortnight is **short** if ANY day in the original rostered line was an ADO, even if the driver subsequently overrode that day to WOBOD. The frontend tracks this via a `wasAdo: boolean` flag on each `DayState`, which is preserved across all override mutations (`loadLine`, `applyManualDiag`, `markWorkedOnOff`, `resetDay`). The `is_short_fortnight` flag is sent explicitly in the `/api/calculate` request body as the source of truth — the backend does not attempt to re-derive it from the day list.

### 5.9 Leave categories

| Code | Name | EA ref | Pay basis |
|------|------|--------|-----------|
| SL | Sick leave | Cl. 30.4 | `max(r_hrs, 8h)` at ordinary rate — no OT split (v3.30) |
| CL | Carer's leave | Cl. 30.7(b)(ix) | Rostered hrs at base rate |
| AL | Annual leave | Cl. 30.1/30.2 | 8 hrs + 20% loading (shiftworker) |
| PHNW | PH not worked | Cl. 31.7 | 8 hrs ordinary |
| PHW | PH worked | Cl. 31.5 | 150% loading + additional day |
| PHWA | PH worked and accrued (new v3.20) | Cl. 31.5(a) + (b) | 150% loading only; additional 8-hr day banked for future off-day |
| BL | Bereavement leave | Cl. 30.8(k)(iv) | Rostered hrs at base rate |
| JD | Jury duty | Cl. 30.8(g) | Rostered hrs ordinary |
| PD | Picnic day | Cl. 32.1 | 8 hrs ordinary |
| RDO | Roster day off | — (rostering) | $0 — unpaid (treat as regular RDO) |
| LWOP | Leave without pay | — | $0 |

### 5.10 Assoc / Un-assoc Payments Chart (Cl. 157.1(b) / Cl. 146.4) — new v3.12

The depot issues a physical "Associated & Un-associated Payments Chart" listing, per diagram number, how much extra time a driver is owed above their actual shift due to un-associated duties and distance credits. The chart is the authoritative pre-computed source; the calculator uses it directly when available.

**Chart columns per diagram:**
- **Un-assoc mins** — Time for duties not directly associated with train operations (road review, pilot preparation, etc.), per Cl. 146.4(d). Paid additionally for ≥161 km shifts.
- **Assoc Payment mins** — Associated payment time credited to the driver.
- **Assoc Calc mins** — Pre-computed total: `Un-assoc + Assoc Payment + Dist Pay` (in minutes). Dist Pay = distance credit from the KM table (§10); pre-computed by the depot and baked into the chart.
- **Build Up mins** — `max(0, Assoc Calc − Shift Length)` in minutes, pre-computed by the depot. When non-zero, this is the additional credited hours (code 1454, "Assoc Wrk Time (Mileage)") owed to the driver.

**Calculation rule — code 1454 build-up:**

```
build_up = max(0, Un-assoc + Assoc Payment + Distance Payment − Effective Shift Length)
```

Where **Effective Shift Length** = `max(r_hrs, effective_liftup_window_hrs)`.

The critical correction introduced in v3.12: when **lift-up/layback is claimed** and the effective window (from §5.7) already exceeds `r_hrs`, that extended window is used as the shift length. The build-up must not be paid on top of lift-up extra time already in the driver's pay — the driver is already receiving that time.

*Example:* Diagram 3155, scheduled 02:27–10:32 (8h05m), lift-up to 01:06–10:32 (effective window 9h26m). Assoc Calc = 8h30m. Effective shift = 9h26m > 8h30m → `max(0, 8.5 − 9.43) = 0`. No 1454 line. Without this correction the static Build Up of +25 min would be applied incorrectly, overpaying by $20.92.

**When the physical chart's Build Up column is non-zero AND lift-up has NOT extended the window:** the pre-computed chart value is used directly (bypassing the formula). This ensures cent-perfect matching with the payroll system's own pre-computed amounts.

**Diagrams with non-zero Build Up on the Oct-2025 depot chart:**

| Diagram | Build Up | Assoc Calc | Shift | Reason |
|---------|----------|------------|-------|--------|
| 3155 | +25 min | 8:30 | 8:05 | Assoc payment 0:30 + dist 8:00; shift shorter |
| 3160 | +51 min | 9:00 | 8:09 | Dist 9:00; shift shorter |
| 3161 | +70 min | 9:56 | 8:46 | Un-assoc 1:56 + dist 8:00; shift shorter |
| 3168 | +27 min | 9:00 | 8:33 | Dist 9:00; shift shorter |
| 3657 | +30 min | 8:30 | 8:00 | Un-assoc 0:30 + dist 8:00; shift shorter |
| 3660 | +30 min | 8:30 | 8:00 | Un-assoc 0:30 + dist 8:00; shift shorter |

**Saturday/Sunday rate:** The 1454 build-up is paid at `base_rate × 1.5` (Saturday) or `base_rate × 2.0` (Sunday), matching the ordinary-time multiplier for that day type.

---

## 6. File Upload Requirements

### 6.1 Roster and schedule file architecture

Three distinct roster/schedule documents exist, all in the same ZIP-based format (manifest.json + text layer + image layer per page) — and all also accepted as real PDFs:

| File | Update frequency | Purpose | Lines served |
|------|-----------------|---------|--------------|
| **Master Roster** | Annually | Maps lines 1–22 to diagram assignments for the 14-day window | 1–22 (and 201–214 as template) |
| **Fortnight Roster** | Each fortnight | Maps swinger lines 201–214 to their actual diagram assignments for that fortnight, plus per-line crew name | 201–214 |
| **Weekday Schedule** | Annually (or as needed) | Per-diagram detail for weekday diagrams (3151–3168): sign-on, sign-off, KMs, total hrs | All weekday diagrams |
| **Weekend Schedule** | Annually (or as needed) | Per-diagram detail for weekend diagrams (3651–3664): sign-on, sign-off, KMs, total hrs | All weekend diagrams |

### 6.2 Roster lookup rules (FR-R1)

**Lines 1–22 (permanent lines):**
1. Look up master roster → get diagram name for each of the 14 days
2. Look up weekday or weekend schedule (based on day-of-week) → get sign-on, sign-off, KMs
3. Display roster source badge: **"✓ Master roster"**
4. Fallback: if master roster not uploaded, use built-in `roster.json` data

**Lines 201–214 (swinger lines):**
1. Look up **fortnight roster** → get diagram name for each of the 14 days
2. Look up schedule file → get sign-on, sign-off, KMs
3. Display roster source badge: **"✓ Fortnight roster"**
4. **Fortnight roster is MANDATORY** for swinger lines (clarified v3.14) — the master roster does not carry swinger duty assignments, and the built-in `roster.json` fallback covers lines 1–22 only. If the user tries to load a 201–214 line before uploading the fortnight roster, `loadLine()` MUST return an error string and refuse to load; the SetupTab MUST surface that error as a red banner.
5. Always indicate which source was used; swinger line notice shown when entering 201+ line. The notice MUST turn red ("Fortnight Roster required") when the fortnight roster has not been uploaded.
6. **Crew member name** (new v3.14) — when the fortnight-roster PDF includes a crew-name column, the loaded crew member's name MUST be displayed in the Daily Entry toolbar so the user can confirm visually that the right line was loaded.

### 6.3 KM auto-fill (FR-R2)

When a weekday or weekend schedule is uploaded:
- Each diagram's KM distance is extracted (`Distance: NNN.NNN Km` from schedule text)
- When a roster line is loaded, KMs are automatically populated for each work day
- "✓ KMs auto-filled from schedule" indicator shown in the Setup tab

### 6.4 Master Roster upload (FR-U1)
- Endpoint: `POST /api/parse-master-roster`
- File format: ZIP archive (disguised as .pdf) containing `manifest.json` + `.txt` + `.jpeg` per page, OR real PDF
- Parser extracts for each roster line (1–22, 201–214): per-day diagram name, sign-on, sign-off, cross-midnight flag, rostered hours, fatigue units
- Uploaded once per year; replaces built-in roster data for lines 1–22

### 6.5 Fortnight Roster upload (FR-U2)
- Endpoint: `POST /api/parse-fortnight-roster`
- Accepts: the same ZIP/PDF formats as master roster **plus** the printed "Intercity Drivers Roster" PDF (the depot's published-each-fortnight document).
- Used exclusively for swinger lines 201–214 (which are mandatory-from-fortnight-roster per §6.2).
- Uploaded at the start of each fortnight.

#### 6.5.1 Roster-date detection (v3.14)

The parser MUST recognise both fortnight-date phrasings used by the various source documents:
- `Fortnight ending DD/MM/YYYY` (ZIP exports, app exports) → `fn_end` = parsed date; `fn_start = fn_end − 13 days`.
- `Fortnight commencing Weekday, DD Month YYYY` (printed Intercity Drivers Roster PDF) → `fn_start` = parsed date; `fn_end = fn_start + 13 days`.

#### 6.5.2 Printed-PDF table extraction (v3.14)

The depot's printed "Intercity Drivers Roster" PDF cannot be parsed by the text-regex approach used for ZIP exports because crew names sit between the line number and the day entries (so the regex `^<line#>\s+(?:OFF|ADO|HH:MM)` never matches). The parser MUST therefore fall back to **pdfplumber table extraction** (`page.find_tables` with `vertical_strategy='lines'` / `horizontal_strategy='lines'`) when the text-regex pass returns zero lines.

**Multi-row logical lines.** Each printed roster line occupies multiple pdfplumber rows — an **anchor row** whose `cells[1]` is the line number, followed by one or more **continuation rows** whose `cells[1]` is empty. The parser MUST group anchor + following continuation rows into a single logical line before extracting day cells.

**Four supported table layouts.** The parser MUST auto-detect both the table layout (main vs swinger) and the presence of a crew-name column:

| Layout | Cols | Day anchors (0-based) | O/T col |
|--------|------|----------------------|---------|
| Main + crew column | ~30–31 | `[3, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 26, 28]` | 30 |
| Main, no crew column | ~29–30 | `[2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 27]` | 29 |
| Swinger + crew column | ~20 | `[3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18]` | 19 |
| Swinger, no crew column | ~19 | `[2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17]` | 18 |

Detection rules:
- **Layout (main vs swinger):** `ncols ≤ 22` ⇒ swinger; otherwise main.
- **Crew column presence:** inspect `cells[2]` of the first anchor row in the table; if it contains a time-range or day keyword (`OFF`/`ADO`/`NTA`/`HOL`/`SBY`/`RDO`/`ALT`), there is no crew column and day 1 starts at `cells[2]`.

**Sub-columns.** Day anchors are not always consecutive — values between consecutive anchors carry split diagram/location tokens (e.g. `"3154"` in the anchor column, `"MQ/SMB"` in the next sub-column). The parser MUST concatenate `' '.join(parts)` across the sub-column range for each day before parsing.

**Cell parsing.** Each day cell may contain:
- Empty / `OFF` / `NTA` / `HOL` / `(AL …)` / `OFF(Off Roster)` → `RosterDayEntry(diag='OFF', r_start=None, r_end=None, r_hrs=0)`.
- `ADO` / `ADO(LSL …)` → `RosterDayEntry(diag='ADO', r_start=None, r_end=None, r_hrs=8.0)`.
- `HH:MM - HH:MM[L]\nDIAGRAM …` → `RosterDayEntry(diag=<DIAGRAM>, r_start=..., r_end=..., cm=(L flag), r_hrs=...)`.
- Cross-midnight indicated by `L` suffix on the end time, e.g. `19:00 - 03:00L`.
- Fatigue tokens (`F0`, `F24`, …) are stripped from the diagram name.

#### 6.5.3 Strikethrough handling (v3.14)

Some printed rosters show a crew member's days struck through to indicate they didn't show up for the duty (cf. user's example: line 207 with "Off Roster"-annotated cells). The parser MUST treat struck-through day cells as OFF.

**Detection (text-colour brightness).** For each cell, the parser averages the non-stroking colour of all glyph characters inside the cell bounding box. Cells whose average brightness is ≥ 0.35 (mid-grey or lighter, i.e. visibly faded vs solid black at 0.0) are considered struck.

**Day-column restriction (critical).** Strikethrough blanking MUST only be applied to **day columns** (`col_idx ≥ 3` with crew, or `≥ 2` without). The line-number column (col 1) and crew-name column (col 2) commonly use grey ink as **alternating-row styling** (every fourth row), which produced false positives that silently erased valid line numbers (lines 8, 18, 19, 205, 209, 212 in the depot's reference PDF). The fix is mandatory for any future strikethrough heuristic.

Vector-line-based strikethrough detection (looking for horizontal lines passing through cells) was attempted in development but produced false positives from the table grid itself (mid-row separator lines between continuation rows of a logical line fall geometrically inside adjacent cells). The text-colour approach is the chosen authoritative method.

#### 6.5.4 Crew-name extraction (v3.14)

When the table has a crew-name column (`has_crew_col = True`), the parser MUST extract the crew member's name from `col 2` of the **anchor row only** (continuation rows excluded) and return it via the new `ParsedRosterResponse.crew_names: dict[str, str]` field, keyed by line number string.

- Embedded newlines are collapsed to single spaces.
- Trailing date annotations like `" (AL 18/04/26)"` are stripped.
- Job-share lines that genuinely contain two crew names in the printed PDF (e.g. line 5: `"Fry (MQ), Lee-Anne / Ward (MQ), Ian"`) are preserved verbatim — the printed roster shows both.
- The `crew_names` field is `Optional`/defaulted-empty for backwards compatibility; master rosters and ZIP-format fortnight rosters leave it empty.

#### 6.5.5 First-occurrence-wins de-duplication

A line may appear on multiple pages of the printed PDF. The parser MUST use the **first occurrence** (page-order) for each line number and ignore subsequent re-occurrences.

### 6.6 Schedule upload (FR-U3) — weekday or weekend

- Endpoint: `POST /api/parse-schedule`
- Supports two file formats:
  - **ZIP-packaged** (Sydney Trains app export) — manifest.json + per-page text files. Text already comes pre-organised per diagram block.
  - **Real PDF** (e.g. `MTVICDRWD191025_1_weekday.pdf`) — uses pdfplumber for text extraction.
- Weekday vs weekend auto-detected from filename (DRWD = weekday, DRWE = weekend).

#### 6.6.1 Two-column page layout (real PDF)

The Sydney Trains schedule PDF is a **two-column layout** — each page contains TWO independent diagram blocks side by side (one in the left half, one in the right half). The default `pdfplumber.extract_text()` reads text in visual scan order (left-to-right, top-to-bottom), which **interleaves both columns line by line** and produces output like:

```
No. 3153 Tuesday-Friday No. 3154 Monday
Sign on 1:05a MOUNT VICTORIA Sign on 1:51a MOUNT VICTORIA
```

This makes diagram boundaries impossible to recover via regex and causes the parser to:
- Extract `Time off duty` from the wrong column (e.g. picking up 3155's `10:32a` for 3154 instead of 3154's correct `11:21a`)
- Miss roughly half the diagrams entirely (only one diagram per page detected)

**The schedule parser MUST**:
1. For each page of a real PDF, detect column boundary at `page.width / 2`
2. Crop the page into LEFT half and RIGHT half using `page.crop()`
3. Extract text from each half separately via `extract_text()`
4. Concatenate as `left_text + '\n' + right_text + '\n'` per page before running diagram-block regex

This restores the natural reading order: left column's diagram fully extracted before right column starts. Pages with single-column content (e.g. page 1 with three vertically-stacked diagrams) still work because cropping the page in half doesn't lose any text — both halves are extracted and concatenated.

#### 6.6.2 Diagram block detection

- A diagram block is identified by the pattern `No. NNNN <day-type>` where:
  - `NNNN` is **3 or 4 digits** (avoids matching text like "No. 2 of 5 cars" or page numbers)
  - The pattern occurs at the **start of a line** (after a newline)
- The next `No. NNNN` at line-start ends the current block

#### 6.6.3 Label and time format support

- Labels `Sign on` and `Time off duty` matched **case-insensitively** with **flexible internal whitespace** (handles `Sign on`, `Signon`, `Sign-on`, `Sign  on`)
- Time formats supported:
  - 12-hour with am/pm marker: `9:18a`, `12:51a`, `5:30 pm`, `12:00PM`
  - 12-hour with am/pm spelled out: `9:18 am`, `5:30 PM`
  - 24-hour: `09:18`, `17:30`
  - Optional spaces around the colon, optional space before/after the am/pm marker

#### 6.6.4 Per-diagram extraction

- **Sign on** → `sign_on` (scheduled start)
- **Time off duty** → `sign_off` (scheduled end)
- **Total shift** → `r_hrs`
- **Distance** → `km`
- **Cross-midnight** → derived (sign-off earlier than sign-on)

#### 6.6.5 Warnings

- If `sign_on` or `sign_off` cannot be extracted for a diagram, the parser MUST emit a warning listing the failed diagram numbers (de-duplicated), so the user can diagnose the issue.

### 6.7 Payslip upload (FR-U4)
- Endpoint: `POST /api/parse-payslip`
- Supports: `NSW_Payslip.xlsx`, `Sydney_Crew_Payslip.xlsx`, PDF payslips
- Extracts: payroll code, description, hours, rate, amount per line item
- Total gross displayed alongside calculated results for variance comparison

### 6.8 Legacy fortnight roster PDF (FR-U5)
- Endpoint: `POST /api/parse-roster` (legacy)
- Older table-based PDF format — extracts sign-on/sign-off only
- Used to pre-fill actual times in Daily Entry

### 6.9 File validation (FR-U6)
- File type: any (ZIP-based roster files have .pdf extension — no content-type restriction)
- File size: 10 MB maximum
- Rejected files return a clear error message

### 6.10 Cache invalidation on parser changes (introduced v3.10, extended v3.16)

When any parser (schedule, master roster, fortnight roster) changes in a way that affects the structure or correctness of cached data, the frontend MUST invalidate the corresponding stale `localStorage` cache so the user is forced to re-upload and get fresh data.

The frontend stores a `mvwc_cache_version` key in localStorage. On app load, if the stored version differs from the current code's `CACHE_SCHEMA_VERSION` constant, the app MUST clear the affected cache keys, then update the version key. The invalidation block lives at the top of `frontend/src/context/FortnightContext.tsx` and runs at module load (before any React state initialisation), so the subsequent `useState(() => restoreCached(...))` initialisers see the cleared state.

**Mandatory invalidation rule (clarified v3.16):** when bumping `CACHE_SCHEMA_VERSION` for a parser change, the invalidation block MUST clear **every** cache key whose contents are derived from the affected parser's output. The current keys are:

| Key constant | localStorage key | Cleared when |
|--------------|------------------|--------------|
| `LS_WD` | `mvwc_weekday_schedule` | Weekday-schedule parser changes |
| `LS_WE` | `mvwc_weekend_schedule` | Weekend-schedule parser changes |
| `LS_MR` | `mvwc_master_roster` | Master-roster parser changes |
| `LS_FR` | `mvwc_fn_roster` | Fortnight-roster parser changes |
| `LS_AC` | `mvwc_assoc_chart` | Assoc/un-assoc chart parser changes |

v3.10 introduced the mechanism (initially clearing `LS_WD` + `LS_WE` only after the v3.8 column-aware schedule parser fix). v3.16 extended it to also clear `LS_MR` and `LS_FR` after the v3.14 roster-anchor / strikethrough / crew-name parser changes — a v3.14/v3.15 user with a stale pre-fix fortnight roster in `LS_FR` was still seeing the shifted-day output because the roster cache had never been invalidated.

### 6.11 Assoc / Un-assoc Payments Chart upload (FR-U7) — new v3.12

- Displayed as a card in the Setup tab below the schedule uploads.
- Built-in default chart data (Oct 2025 depot chart) is baked into `FortnightContext.tsx` as `DEFAULT_ASSOC_CHART`. Covers all 32 Mt Victoria diagrams (zeros for diagrams not on the chart). Persists to localStorage under `mvwc_assoc_chart`.
- User can upload an updated chart whenever the depot issues a new version.

**Accepted formats:**
- **CSV** (most reliable) — 5 columns: `diagram, un_assoc_mins, assoc_payment_mins, assoc_calc_mins, build_up_mins`. First 3 columns mandatory; columns 4–5 optional (if absent, `assocCalcMins` and `buildUpMins` are left undefined and the formula is used).
- **PDF** — server-side pdfplumber parse; endpoint `POST /api/parse-assoc-chart`.
- **Image** (.png / .jpg / .webp / .tiff) — client-side Tesseract.js OCR (no server dependency). Canvas pre-processing applied: greyscale 100% + contrast 160% + 2× scale if width < 2000px. PSM 6 (uniform block) for table accuracy.

**UI:**
- Table shows all 32 diagrams grouped by Weekday (3151–3168) and Weekend (3651–3664) sections.
- 7 columns: Diagram | Un-assoc mins | Un-assoc hrs | Assoc payment mins | Assoc payment hrs | Assoc Calc mins | Build Up mins.
- Rows with non-zero values highlighted blue; Build Up > 0 highlighted green (bold).
- **⬇ Download CSV template** button — pre-filled with current built-in defaults, 5 columns.
- **↩ Reset to built-in defaults** button — shown when custom chart is loaded.
- Uploaded chart persists across page refreshes via localStorage. Users with a custom chart must click Reset to pick up new built-in defaults after a code update.

**How the chart data flows into the calculation:**
1. On `POST /api/calculate`, `FortnightContext.tsx` enriches each `DayState` with three extra fields: `unAssocHrs`, `assocPaymentHrs`, `assocBuildUpHrs` — derived from the chart entry for that day's `diagNum`.
2. The backend `calculator.py` uses these to compute the 1454 build-up per §5.10.
3. The client-side preview (`calcPreview.ts`) mirrors the same logic for immediate feedback.

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
- User selects roster line number (1–22 or 201–214)
- User sets fortnight start date (snapped to Sunday)
- Auto-detect short vs long fortnight
- Public holiday dates entry
- Payslip total for variance audit
- **Step 1 (upload, do before loading line):**
  - Master Roster upload card
  - Fortnight Roster upload card
  - Weekday Schedule upload card
  - Weekend Schedule upload card
- **Step 2 (load line):**
  - Swinger line notice (201+) showing which roster will be used. When the fortnight roster has NOT been uploaded, the notice MUST display in red ("Fortnight Roster required — upload it in Step 1 before loading this line") per §6.2 (clarified v3.14).
  - Lines 1–22 notice showing master roster will be used
  - Roster source badge after loading
  - KMs auto-fill indicator if schedule is uploaded
  - **Pre-load validation (v3.14):** clicking **Load roster line** for a 201–214 line without the fortnight roster MUST refuse to load and surface a red error banner. `loadLine()` returns an error string in this case (signature: `(line, start, phs, psTotal) => string | null`).
- Legacy: Payslip upload card + legacy fortnight roster PDF card

### FR-02: Daily Entry

#### FR-02-A: Per-day display

Each day row in the Daily Entry tab MUST display:

1. **Date and day name** (e.g. "Monday 11 Aug")
2. **Diagram number** — prominently shown, e.g. `3151` (parsed from the master roster's diagram name for that day). Shows `—` for OFF/ADO days and for **named non-numeric duties** (SBY, AMV01, MSBYD3, DSP, training codes, etc.) where the roster does not assign a 4-digit diagram.
3. **Diagram name** — the full label as in the roster, e.g. `3151 SMB`. For named non-numeric duties this is the duty code itself (e.g. `SBY`). **Named-duty preservation rule (v3.15):** when the roster's diag is non-numeric and not `OFF`/`ADO`, `loadLine()` MUST NOT silently re-map the day to a 4-digit diagram via time-range matching against the schedule — even if a real diagram happens to share the same sign-on/sign-off times. The roster is the authoritative source for the duty type. (Time matching via `findByTimes()` is still used as a fallback for *numeric* roster diags whose 4-digit number couldn't be cleanly extracted.)
4. **Time source indicator** — a coloured badge showing which source was used for the scheduled times:
   - `✓ Schedule` (green) — times came from uploaded weekday/weekend schedule
   - `ⓘ Fortnight roster` (amber, new in v3.17) — schedule didn't have this diagram and the line was loaded from the **fortnight roster** (swinger lines 201–214); fell back to fortnight-roster's own time fields
   - `ⓘ Master roster` (amber) — schedule didn't have this diagram and the line was loaded from the **master roster** (permanent lines 1–22); fell back to master-roster's own time fields
   - `ⓘ Built-in` (amber) — no master roster uploaded, fell back to built-in roster.json
   - `✏ Manual` (purple) — user manually overrode the diagram OR manually edited the scheduled times
   - `—` (grey) — OFF/ADO with no diagram

   **Source-attribution rule (clarified v3.17):** the `master` vs `fortnight` distinction MUST track the actual roster file the entry came from (i.e. `rosterSource` set by `loadLine()`). Prior to v3.17 every roster-derived time fell back to the literal label "Master roster" regardless of whether the source was actually the fortnight roster, which was misleading for swinger lines where the fortnight roster is the authoritative document.
5. **KM distance** — auto-populated from schedule file's `Distance: NNN.NNN Km` field for the day's diagram number. **Editable by user** at any time.

#### FR-02-B: Scheduled vs Actual times

Each work day row has TWO time-input sections, both always visible:

**Scheduled times (editable — updated v3.10):**
- Label: "Scheduled start" / "Scheduled end"
- Source priority: uploaded schedule file (by diagram number) → master roster → built-in fallback. The source determines the initial pre-populated value and the source badge.
- **The fields are EDITABLE.** The user CAN override the auto-populated values at any time — for example if the schedule file is wrong, if a diagram has been temporarily re-timed, or if the user wants to enter custom scheduled values.
- When the user edits a scheduled time directly, the time-source badge updates to `✏ Manual` to indicate the value is no longer authoritative-from-schedule.
- Manual edits are preserved on subsequent re-renders of the same session; they only get overwritten if the user re-loads the line, applies a manual diagram override, or clicks "Reset" on a previously-overridden day.

**Actual times (user-editable inputs):**
- Label: "Actual start" / "Actual end"
- **Pre-filled with scheduled times on load** (so most days require no input). This applies on every load path: `loadLine()`, `applyManualDiag()`, `markWorkedOnOff()`, and post-`loadLine` re-application when a schedule file is uploaded after the line was loaded (Trigger 3 per FR-02-D). The pre-fill is **mandatory** (clarified v3.14): the user opens Daily Entry and sees scheduled = actual on every day; they only edit actuals when they ran lift-up/layback/late-finish/etc.
- User can override at any time to record actual start/end (lift-up, layback, late sign-off)
- A **"Same as scheduled"** button next to the actual-time inputs copies scheduled → actual in one click (used to re-sync if user edited and wants to revert)

**The pay calculator uses the times per §5.7 and FR-02-F**:
- If `Claim lift-up/layback = Yes` (default): effective window = min(scheduled, actual) start to max(scheduled, actual) end
- If `Claim lift-up/layback = No`: actual times only

#### FR-02-C: Manual diagram override (all day types)

A **manual diagram override** field is always available in the expanded day row, on **every day type** (workday, Saturday, Sunday, PH, OFF, ADO).

When the user enters a diagram number (e.g. `3158`, `3651`, `SBY`) and clicks "Load ↗":

1. The system searches **both** the weekday schedule and the weekend schedule for that diagram number (regardless of the day's day-of-week). This handles weekday diagrams worked on weekends and vice versa.
2. If found in either schedule: scheduled start, scheduled end, KM, and rostered hours are populated from the schedule entry. Time source becomes `manual`.
3. If not found in either schedule: falls back to built-in `ROSTER` data for times. KM = 0.
4. The diagram name in the day row updates to show the new diagram with a `[manual]` suffix and a purple `✏ Manual` badge.
5. Actual times are also populated from scheduled times (user can re-edit).
6. A **reset button** is always shown when an override is active — clicking it restores the original roster-assigned diagram for that day. The original is preserved in `_origDiag` and shown in the reset banner.

**Day-type-specific behaviour after override:**

| Day type | Default state | After manual override |
|----------|--------------|----------------------|
| Regular workday | Rostered times pre-filled | Override times replace rostered times |
| Saturday | Rostered times pre-filled | Override times replace; day still rated at Saturday rate |
| Sunday | Rostered times pre-filled | Override times replace; day still rated at Sunday rate |
| Public holiday | Rostered times pre-filled | Override times replace; day still rated at PH rate |
| OFF | No times — shows diagram picker | Override loads times from schedule |
| ADO | No times — shows diagram picker | Override loads times from schedule |

**Calculation after override:** All EA rate rules (Sat 1.5×, Sun 2.0×, PH 1.5×/2.5×, shift penalties, KM credits) continue to apply based on the actual **day of week / PH status**, not the diagram number. Swapping to a different diagram never changes the day's rate class.

#### FR-02-D: KM auto-population

KMs MUST be auto-populated from the schedule file's `Distance` field via three triggers:

- **Trigger 1 — On roster load:** For each day, look up the diagram in the schedule and set KM
- **Trigger 2 — On manual diagram override:** Look up the override diagram in BOTH schedules and set KM
- **Trigger 3 — On schedule upload after roster is already loaded:** A `useEffect` runs and re-applies KMs **and scheduled times** to all existing work days that haven't been manually overridden

**The KM field is editable** — the user can adjust the value at any time, and the manual value is preserved (until a re-load or manual diagram override).

#### FR-02-E: Other daily entry controls
- Actual start / end time inputs (covered in FR-02-B)
- Scheduled start / end / KMs fields (now editable per FR-02-B and FR-02-D)
- WOBOD toggle
- Cross-midnight toggle
- Claim lift-up/layback toggle (FR-02-F, new in v3.10)
- "Use rostered" / "Same as scheduled" button (copies scheduled times to actual fields)
- Leave type selector
- Live pay preview per day (must compute hours per §5.7)

#### FR-02-F: Claim lift-up/layback toggle (new in v3.10)

Each day row has a Yes/No selector labelled **"Claim lift-up/layback?"** with the following behaviour:

- **Default value: Yes** — set automatically for every day when:
  - A roster line is loaded (`loadLine()`)
  - The user manually overrides a diagram (`applyManualDiag()`)
  - The user marks an OFF/ADO day as worked (`markWorkedOnOff()`)
  - A day is reset (`resetDay()`)
- **When set to Yes:** the pay calculation uses the effective window per §5.7. The driver is paid for at least the scheduled duration plus any extension before/after.
- **When set to No:** the pay calculation uses only the actual times (`actual_end − actual_start`). No lift-up/layback components or flags. The driver is paid only for time physically on duty between actual sign-on and sign-off.
- The toggle is positioned in the day body alongside the WOBOD and Cross-midnight selects.
- The selected value drives both the live preview (`calcPreview.ts`) and the server-side calculation (`calculator.py`).
- The toggle has no effect on OFF days, ADO days, leave days, or WOBOD days (those follow their own pay rules).

This toggle exists to support edge cases such as: driver doesn't want to claim layback (e.g. social agreement with manager), informal lift-up not on the timesheet, or any situation where the driver wants to compute pay strictly from sign-on/sign-off times.

### FR-03: Pay calculation
- `POST /api/calculate` — server-side EA 2025 engine (authoritative)
- Client-side preview (`calcPreview.ts`) for immediate feedback while typing — must produce identical output to backend for the same input
- Hours basis driven by `Claim lift-up/layback` toggle per §5.7
- Shift penalty class determined by actual sign-on time
- KM credits calculated from the km field (auto-filled or manual)

### FR-04: Results
- Summary metric cards: gross pay, actual hours, OT hours, ADO payout
- 14-day breakdown table
- Component totals table with payroll codes
- Payslip comparison (if payslip uploaded)
- Export PDF and CSV
- Audit section: flags, variance, OT alerts, KM notes

### FR-05: Configuration
- All pay rates configurable with EA references
- All payroll codes configurable
- Un-associated duties amount and code
- Config saved to localStorage

### FR-06: KM table reference
- Full Cl. 146.4 reference table available as its own tab

### FR-07: Reset and toggling
- Diagram picker always has a reset path
- No irrecoverable locked state
- Reset path always available for manual overrides on any day type

### FR-08: ADO handling
- Short/long auto-detect from roster data
- Short: ADO paid; Long: ADO accruing

### FR-09: Lift-up / Layback / Buildup
- Per-day toggle (FR-02-F) controls whether claimed
- When claimed: effective window calc per §5.7 (no separate component lines, included in base hours)
- Informational flags emitted showing the lift-up and layback durations
- Components appear in BOTH live preview and server calculation

### FR-10: Cross-midnight shifts
- Auto-detected from schedule data (cm flag) or manual override
- Next-day rules applied to post-midnight hours

---

## 8. Non-Functional Requirements

### NFR-01: Architecture
- React (Vite) frontend, FastAPI (Python 3.11) backend
- Single-repo monorepo: `frontend/` and `backend/` directories
- Deployed: Vercel (frontend) + Render free tier (backend)
- `/legacy` route serves the original `index.html` calculator as fallback
- Frontend operates in "offline mode" (client-side preview) when backend is unavailable

### NFR-02: Performance
- API response for `/api/calculate` < 200ms (warm)
- Render free tier cold start: ~30s accepted (personal use)
- Schedule/roster ZIP parsing < 3 seconds

### NFR-03: Browser compatibility
- Chrome, Firefox, Safari (desktop and mobile)
- Mobile-responsive (breakpoint at 768px)

### NFR-04: Data persistence
- Config saved to localStorage
- No long-term user data storage (no accounts, no database)
- Uploaded files processed in-memory only; not stored server-side
- Cached parser output (rosters, schedules) versioned via `mvwc_cache_version` key — incompatible caches are auto-cleared on app load (§6.10)

### NFR-05: Accuracy
- All amounts rounded to 2 decimal places
- EA rounding rules applied exactly (Cl. 134.3(b))
- KM credit table exact per EA 2025
- The frontend live preview and the backend calculation MUST produce identical output for the same input (per §5.7)
- **Hours rounded to 2dp BEFORE multiplying by rate** — `amount = round(hours, 2) × rate`, NOT `round(hours × rate, 2)`. This matches the payroll system exactly (v3.11 fix).
- **Pooled 1001 Ordinary line uses sum-of-rounded-per-day amounts**, NOT `total_hours × rate`. For example, 8 days × 8h at $49.81842/h: per-day amount = `round(8.00, 2) × 49.81842 = $398.55` (rounded to cent), fortnight total = 8 × $398.55 = $3,188.40. Computing 64h × $49.81842 = $3,188.38 is wrong by 2 cents.

### NFR-06: Security
- CORS: `allow_origins=["*"]` (personal tool, no sensitive data)
- No user authentication required

### NFR-07: Maintainability
- All EA clause references visible in UI
- Pay rates configurable without code changes (config.yaml)
- Roster data in `backend/data/roster.json` (built-in fallback)
- ZIP-based roster/schedule files replace built-in data when uploaded
- PRD updated before any implementation change
- PRD must be readable as a complete standalone document — no "unchanged from..." placeholders (see Process rule 2 at top)

### NFR-08: Auditability
- Every pay component shows: name, EA ref, payroll code, hours, rate, amount
- Roster source always indicated in UI (Master / Fortnight / Built-in)

### NFR-09: Accessibility (introduced v3.13)
- The UI must meet **WCAG 2.1 Level AA** conformance
- All interactive elements must be keyboard-operable (Tab to focus, Enter/Space to activate)
- All meaningful interactive elements must carry an appropriate ARIA role and state attribute (`aria-label`, `aria-pressed`, `aria-selected`, `aria-expanded`)
- Focus must be visible at all times (`focus-visible` ring, 2px solid accent colour)
- Colour is never the sole means of conveying information (badges also include text labels)
- Alerts (`role="alert"`) and status updates (`role="status"`) must be announced to screen readers
- Motion animations must be disabled when `prefers-reduced-motion: reduce` is set

---

## 9. Data Model

### 9.1 Day state (frontend)

```ts
interface DayState {
  date: string;              // YYYY-MM-DD
  dow: number;               // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;              // Full diagram name as displayed: '3151 SMB' | 'OFF' | 'ADO' | '3651 [manual]'
  diagNum: string | null;    // Parsed 4-digit diagram number, e.g. '3151'; null for OFF/ADO/SBY
  _origDiag?: string;        // Original diagram name before any manual override
  _origDiagNum?: string | null;  // Original diagNum before override

  // Scheduled times (editable as of v3.10)
  rStart: string | null;     // Scheduled start HH:MM (label: "Scheduled start") — editable
  rEnd: string | null;       // Scheduled end HH:MM (label: "Scheduled end") — editable
  cm: boolean;
  rHrs: number;              // Scheduled hours (derived from schedule file's Total shift)

  // Actual times (user-editable; pre-filled from scheduled on load)
  aStart: string;            // Actual start HH:MM
  aEnd: string;              // Actual end HH:MM

  // Source tracking
  timeSource: 'schedule' | 'master' | 'builtin' | 'manual' | 'none';

  // Distance (editable, auto-filled from schedule's Distance field)
  km: number;

  // Per-day pay-calc toggles (added v3.10)
  claimLiftupLayback: boolean;  // default true; controls effective-window vs actual-only pay calc (§5.7)

  // ADO tracking (added v3.11)
  wasAdo: boolean;              // true if this day was originally a rostered ADO (preserved across WOBOD overrides)

  // Assoc/Un-assoc chart values (added v3.12) — populated from chart before POST /api/calculate
  unAssocHrs?: number;          // Un-associated duties hours from depot chart (Cl. 146.4(d))
  assocPaymentHrs?: number;     // Associated payment hours from depot chart
  assocBuildUpHrs?: number;     // Pre-computed build-up hours from chart's "Build Up" column.
                                // When > 0 AND lift-up hasn't extended the window, used directly
                                // by the backend instead of re-deriving from the formula (§5.10).

  // Other
  wobod: boolean;
  leaveCat: string;          // 'none' | 'SL' | 'CL' | 'AL' | 'PHNW' | 'PHW' | 'BL' | 'JD' | 'PD' | 'RDO' | 'LWOP'
  manualDiag: string | null; // Set when user has applied a manual diagram override
  manualDiagInput: string;   // Current value of the diagram input field
  workedOnOff: boolean;      // True when user chose "Worked (no diagram)" on an OFF/ADO day
  isShortFortnight: boolean; // Sent to backend as is_short_fortnight (source of truth for ADO type)
}
```

**Key rule:** `_origDiag` is set whenever a manual override is applied (whether the day was originally a workday, Saturday, Sunday, PH, OFF, or ADO). Resetting always restores to `_origDiag`. The `claimLiftupLayback` field defaults to `true` for every day (set by `loadLine`, `applyManualDiag`, `markWorkedOnOff`, `resetDay`).

### 9.2 Backend `DayState` model

```python
class DayState(BaseModel):
    model_config = ConfigDict(extra='ignore')

    date: str
    dow: int
    ph: bool = False
    diag: str
    diag_num: Optional[str] = None
    time_source: str = "none"
    r_start: Optional[str] = None
    r_end: Optional[str] = None
    cm: bool = False
    r_hrs: float = 0.0
    a_start: str = ""
    a_end: str = ""
    wobod: bool = False
    km: float = 0.0
    leave_cat: str = "none"
    is_short_fortnight: bool = False
    was_ado: bool = False               # NEW v3.11 — preserved across WOBOD overrides (§5.8)
    claim_liftup_layback: bool = True   # NEW v3.10 — see §5.7 / FR-02-F
    # NEW v3.12 — assoc/un-assoc chart values (populated by frontend, §5.10 / §6.11)
    un_assoc_hrs: float = 0.0           # Un-associated duties hours
    assoc_payment_hrs: float = 0.0     # Associated payment hours
    assoc_build_up_hrs: float = 0.0    # Pre-computed build-up from chart "Build Up" column.
                                       # When > 0 and no lift-up extension, used directly.
```

The `claim_liftup_layback` field defaults to `True` so older clients (without this field in their payload) continue to get the effective-window calculation. The `was_ado` field is informational — the backend uses `is_short_fortnight` from the request body as the authoritative source for ADO type. The three assoc fields default to 0 so the calculation falls back to the formula when the chart is not available.

### 9.3 API request — `POST /api/calculate`
```json
{
  "fortnight_start": "2025-08-10",
  "roster_line": 7,
  "public_holidays": ["2025-08-11"],
  "is_short_fortnight": true,
  "payslip_total": 4250.00,
  "config": { "base_rate": 49.81842, "...": "..." },
  "codes": { "base": "ORD", "...": "..." },
  "days": [ "...DayState[]" ],
  "unassoc_amt": 0.0
}
```

### 9.4 API response — `POST /api/parse-master-roster` and `POST /api/parse-fortnight-roster`
```json
{
  "source_file": "Mt_Victoria_Drivers_Master.pdf",
  "line_type": "master",
  "fn_start": "2025-08-10",
  "fn_end": "2025-08-23",
  "lines": {
    "1": [
      { "diag": "OFF",       "r_start": null,    "r_end": null,    "cm": false, "r_hrs": 0.0 },
      { "diag": "3151 SMB",  "r_start": "00:51", "r_end": "09:18", "cm": false, "r_hrs": 8.45 }
    ],
    "209": [
      { "diag": "OFF",       "r_start": null,    "r_end": null,    "cm": false, "r_hrs": 0.0 },
      { "diag": "3160 MQ",   "r_start": "09:32", "r_end": "17:41", "cm": false, "r_hrs": 8.15 }
    ]
  },
  "crew_names": {
    "209": "Saharan, Ravi",
    "210": "Carrick-Allan (A/DT)(MQ), Gavin"
  },
  "warnings": []
}
```

The `crew_names` field (new v3.14) is keyed by line-number string and populated only when the source document is a printed fortnight roster with a crew-name column. Master rosters and ZIP-format roster exports return an empty object. The field is optional on the wire for backwards-compatibility; older clients ignore it.

### 9.5 API response — `POST /api/parse-schedule`
```json
{
  "source_file": "MTVICDRWD191025_1_weekday.pdf",
  "schedule_type": "weekday",
  "diagrams": {
    "3151": {
      "diag_num": "3151",
      "day_type": "weekday",
      "sign_on": "00:51",
      "sign_off": "09:18",
      "r_hrs": 8.45,
      "km": 254.109,
      "cm": false
    },
    "3154": {
      "diag_num": "3154",
      "day_type": "weekday",
      "sign_on": "01:51",
      "sign_off": "11:21",
      "r_hrs": 9.50,
      "km": 254.109,
      "cm": false
    }
  },
  "warnings": []
}
```

### 9.6 API response — `POST /api/parse-payslip`
```json
{
  "source_file": "NSW_Payslip.xlsx",
  "format": "nsw_payslip",
  "period_start": "2025-08-10",
  "period_end": "2025-08-23",
  "total_gross": 4250.00,
  "line_items": [
    { "code": "ORD", "description": "Ordinary time", "hours": 72.0, "rate": 49.82, "amount": 3587.04 }
  ]
}
```

### 9.7 Roster ZIP file format (internal)
```
my_roster.pdf  (ZIP archive)
├── manifest.json           → { "num_pages": 2, "pages": [...] }
├── 1.txt                   → text layer of page 1 (roster data)
├── 1.jpeg                  → image layer of page 1
├── 2.txt
└── 2.jpeg
```

Parsed roster text format per day entry:
- `OFF` or `ADO` — single token, no times
- `HH:MM - HH:MM[L]  HH:MMW  DIAGRAM_NAME  F\d+` — where `L` = cross-midnight, `W` = working hours, `F\d+` = fatigue units (consumed by parser, not stored)

### 9.8 Built-in roster.json (fallback)
```json
{
  "1": [
    ["00:51", "09:18", false, 8.45, "3151 SMB"],
    [null, null, false, 0, "OFF"]
  ]
}
```
Used only when no master/fortnight roster has been uploaded.

---

## 10. KM Credit Table (Cl. 146.4)

| KM band | Credited hrs | | KM band | Credited hrs |
|---------|-------------|---|---------|-------------|
| <161 | Actual time | | 499–515 | 15.5 |
| 161–193 | 5.0 | | 515–531 | 16.0 |
| 193–225 | 6.0 | | 531–547 | 16.5 |
| 225–257 | 7.0 | | 547–563 | 17.0 |
| 257–290 | 8.0 | | 563–579 | 17.5 |
| 290–322 | 9.0 | | 579–595 | 18.0 |
| 322–338 | 10.0 | | 595–612 | 18.5 |
| 338–354 | 10.5 | | 612–628 | 19.0 |
| 354–370 | 11.0 | | 628–644 | 19.5 |
| 370–386 | 11.5 | | 644+ | +0.5 per 16 km |
| 386–402 | 12.0 | | | |
| 402–418 | 12.5 | | | |
| 418–435 | 13.0 | | | |
| 435–451 | 13.5 | | | |
| 451–467 | 14.0 | | | |
| 467–483 | 14.5 | | | |
| 483–499 | 15.0 | | | |

---

## 11. Roster Lines — Mt Victoria

### 11.1 Permanent lines (1–22)
- Fixed patterns; do not change fortnight to fortnight
- Data source priority: **uploaded master roster → built-in roster.json**
- Each line: 14 entries (one per day, Sunday–Saturday–Sunday)
- Diagram assignments come from master roster; timing detail from schedule files

### 11.2 Swinger lines (201–214)
- Flexible standby positions; crew member assigned to each swinger line is published in the per-fortnight roster (see §6.5.4).
- **Diagram assignments change every fortnight** (sourced from fortnight roster)
- **Data source is the fortnight roster only** (v3.14): fortnight roster is mandatory per §6.2; the prior "fortnight → master → built-in" fallback chain is removed because the master roster does not carry swinger duty assignments and the built-in fallback covers lines 1–22 only.
- Always show swinger line notice in Setup tab when line 201+ is entered. The notice MUST turn red when the fortnight roster has not been uploaded (per §13.2).

### 11.3 Diagram numbering convention
| Range | Day type | Schedule file |
|-------|----------|---------------|
| 3151–3168 | Weekday | Weekday schedule (DRWD) |
| 3651–3664 | Weekend (Sat/Sun) | Weekend schedule (DRWE) |
| SBY | Standby | No schedule entry (0 KMs) |

---

## 12. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/api/roster` | Return built-in roster.json |
| `GET`  | `/api/config` | Return EA 2025 rate config |
| `POST` | `/api/calculate` | Full fortnight calculation |
| `POST` | `/api/parse-master-roster` | Parse annual master roster ZIP/PDF |
| `POST` | `/api/parse-fortnight-roster` | Parse per-fortnight swinger roster ZIP/PDF |
| `POST` | `/api/parse-schedule` | Parse weekday or weekend schedule ZIP/PDF (auto-detected). Real PDFs use 2-column extraction (§6.6.1). |
| `POST` | `/api/parse-roster` | Legacy: parse fortnight roster PDF (table format) |
| `POST` | `/api/parse-payslip` | Parse NSW or Sydney Crew payslip XLSX/PDF |
| `POST` | `/api/parse-assoc-chart` | Parse Assoc/Un-assoc Payments Chart PDF (§6.11 / §5.10) |
| `POST` | `/api/export/pdf` | Export results as PDF |
| `POST` | `/api/export/csv` | Export results as CSV |

---

## 13. UI Design Specification

### 13.1 Layout and Design Language

React SPA with 5 tabs: **Setup**, **Daily Entry**, **Results**, **Rates & Codes**, **KM Table**.
Legacy `index.html` served at `/legacy` as fallback.
Responsive: single-column mobile (<768px), multi-column desktop.

**Apple HIG design language (introduced v3.13):**

The application follows Apple Human Interface Guidelines. The design is minimal, clean, and sophisticated — no gradients, no decorative shadows, typography-led hierarchy.

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | `#f5f5f7` | Page background (Apple's exact gray) |
| Surface | `#ffffff` | Card backgrounds |
| Accent | `#0071e3` | Primary action colour (Apple blue) |
| Border | `rgba(0,0,0,0.08)` | Hairline borders on cards |
| Font | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif` | All text |
| Radius | `12px` (cards), `8px` (inputs, chips) | Rounded corners |
| Shadow | `0 1px 3px rgba(0,0,0,0.06)` | Minimal card lift |

**Page structure (sticky layers):**

1. **App header** (`position: sticky; top: 0; z-index: 200`) — frosted glass effect (`backdrop-filter: saturate(180%) blur(20px); background: rgba(255,255,255,0.72)`). Contains: 🚂 logo mark, title "Mt Victoria Calculator", subtitle "Sydney Trains · EA 2025", and right-side metadata badges (Short/Long fortnight indicator, roster line number, EA version, Legacy link).
2. **Tab bar** (`position: sticky; top: 52px; z-index: 100`) — white background with hairline bottom border. Tab buttons use an underline indicator (2px accent-coloured line under the active tab) rather than pills or backgrounds. A dot indicator on the Results tab label appears when a calculation result is available.
3. **Main content** — `max-width: 900px` centred column with `16px` horizontal padding.

**Accessibility (WCAG 2.1 AA — introduced v3.13):**

- All interactive elements have `aria-label`, `aria-pressed`, `aria-selected`, or `aria-expanded` as appropriate
- Day rows: `role="listitem"`, keyboard-navigable with Enter/Space to expand/collapse
- Tab buttons: `role="tab"` with `aria-selected`
- Match banner: `role="status"` (OK) or `role="alert"` (variance warning)
- Toggle group buttons: `aria-pressed` reflects current state
- `focus-visible` ring on all focusable elements (`:focus-visible { outline: 2px solid var(--accent); }`)
- `prefers-reduced-motion` media query suppresses transitions when set

### 13.2 Setup tab

Cards use a **card-header / card-body** structure. Each card has a step-indicator circle on the left of its heading:
- **Step 1** header: green filled circle with ✓ (always complete)
- **Step 2** header: blue filled circle with "2"
- **Step 3** header: gray outlined circle with "3" (pending until line loaded)

**Step 1 — Upload rosters & schedules** (do before loading a line)
- Upload card: **Master Roster** (annual, lines 1–22) — `Mt_Victoria_Drivers_Master.pdf`
- Upload card: **Fortnight Roster** (swinger lines 201–214) — upload each fortnight. Accepts ZIP exports AND the depot's printed "Intercity Drivers Roster" PDF (parser supports both per §6.5).
- Upload card: **Weekday Schedule** — diagrams 3151–3168, auto-fills KMs + times
- Upload card: **Weekend Schedule** — diagrams 3651–3664, auto-fills KMs + times

**Step 2 — Load roster line**
- Roster line input (1–22 or 201–214)
- Swinger line info banner (when 201+ entered): shows which roster will be used. **Banner colour is red ("Fortnight Roster required — upload it in Step 1 before loading this line") when the fortnight roster has NOT been uploaded** (v3.14); green/blue ("Duty assignments loaded from the Fortnight Roster") once it has.
- Lines 1–22 info banner: shows master roster will be used
- Fortnight start date
- **Public holidays (multi-date picker — v3.13):** An `<input type="date">` field with an **"+ Add"** button. Each added date appears as a removable amber chip showing `📆 Fri 3 Apr 2026 ×`. Clicking the × removes that date. The full list of PH dates is stored as a `string[]` array and sent as `public_holidays` in the API request. This replaces the old comma-separated text input, which only picked up the first PH date when multiple were entered (multi-PH bug fixed v3.13).
- Payslip total input (for variance audit)
- **Load roster line** button
- After loading: roster source badge + KM auto-fill indicator + date chips showing fortnight dates

**Step 3 — Assoc/Un-assoc chart, payslip and legacy uploads**
- **Assoc / Un-assoc Payments Chart card** (new v3.12) — upload updated depot chart (CSV / PDF / image); 7-column table shows all 32 diagrams; Build Up column highlighted green; CSV template download (§6.11)
- Payslip upload card (for comparison)
- Legacy fortnight roster PDF card (for sign-on/sign-off pre-fill)

### 13.3 Daily Entry tab

**Tab toolbar (above the 14-day list):**
- **Calculate fortnight** button (primary action).
- **Apply uploaded roster** button (visible when a roster upload is pending application).
- **Line badge** — `Line N` showing the currently loaded roster line.
- **Crew member badge (v3.14)** — `👤 <Crew Name>` displayed alongside the line badge when the loaded line came from a fortnight roster upload that included a crew-name column. Sourced from `ParsedRosterData.crew_names[line]` (§9.4); only set when `rosterSource === 'fortnight'`. Provides visual confirmation that the right line was loaded. Hidden when no crew name is available (master-roster lines, built-in fallback).
- **Fortnight date range** chip (e.g. `2026-04-05 – 2026-04-18`).
- **Fortnight-type badge** — `⚡ SHORT` (amber) or `📋 LONG` (accent).

Each day row has two sections: **header** (always visible) and **body** (expanded on click).

**Header (always visible):**
- Date and day name
- Day-type pill (coloured badge: green "Work", amber "ADO", purple "WOBOD", gray "OFF", etc.)
- Diagram number badge (e.g. `3151`) — large, prominent (purple if manual override active)
- Time-source badge (`✓ Schedule` / `ⓘ Master roster` / `ⓘ Built-in` / `✏ Manual` / `—`)
- **Auto-suppress chip** — shown in the collapsed header when the system has automatically suppressed the lift-up/layback claim due to < 50% overlap (§5.7). Amber chip: "⚑ Auto-suppress: only N% overlap". Alerts the driver that their lift-up/layback was not counted.
- Times and KM summary (condensed)
- Live pay summary (green, right-aligned)
- Chevron expand/collapse

**Body — Times layout (two-column grid, v3.13):**

The times block uses a `1fr 1px 1fr` CSS grid: **Scheduled** column on the left, a hairline vertical divider, **Actual** column on the right. Each column shows:
- Column heading ("Scheduled" / "Actual") in small caps
- Start time input (label "Sign on")
- End time input (label "Sign off")

Scheduled inputs are editable (§FR-02-B). Actual inputs pre-fill from scheduled on load (§FR-02-B). A **"↺ Same as scheduled"** button below the actual column copies scheduled → actual in one click.

**Body — Manual diagram override (available on ALL day types):**
- Label: "Override diagram / schedule no." with hint "e.g. 3158, 3651, SBY"
- Text input for diagram number
- **Load diagram ↗** button — looks up schedule and pre-fills times + KMs
- When override is active: purple `✏ Manual` badge in header + reset banner showing original diagram name and a **Reset** button

**Body — Controls row (iOS-style toggle groups, v3.13):**

Per-day toggles use a segmented **toggle group** component — two adjacent buttons ("Yes" / "No") where the active option is filled with the accent colour. This replaces `<select>` dropdowns. Toggles provided:
- **KMs** — numeric input (auto-filled from schedule; editable)
- **Lift-up / layback?** (Yes / No, default Yes) — see FR-02-F
- **WOBOD?** (Yes / No)
- **Cross-midnight?** (Yes / No)

Leave type is a `<select>` dropdown (unchanged).

**Body — Live pay preview:**
- Shows payroll code chips (colour-coded per §13.4) alongside line amounts
- Heading: "LIVE PAY PREVIEW"
- Note: per-day preview is approximate for weekday WOBOD (cannot know fortnight-level OT-shift counter); server result is authoritative

**Body — OFF/ADO state (no override applied):**
- Informational text ("Day off — no pay unless worked")
- Diagram override input (same as above)
- "Worked (no diagram)" button as alternative

### 13.4 Results tab

**Match / variance banner (v3.13):**

A full-width banner appears at the top of the Results tab whenever a calculation has been performed:

- **Payslip match** (variance ≤ $0.10): green left-border accent, ✓ icon, title "Payslip matches — $X,XXX.XX (variance $0.0X)", subtitle with version/line/date/fortnight-type, Export PDF and Export CSV buttons inline. `role="status"`.
- **Variance warning** (variance > $0.10): amber left-border accent, ⚠ icon, title "Variance $X.XX — calculated $X,XXX.XX (possible underpayment/overpayment)". `role="alert"`.
- **No payslip total entered**: no banner; Export PDF and Export CSV buttons shown as standalone buttons above the metric cards.

**Metric cards:**

Four white cards in a 2×2 grid (1×4 on wide screens) showing:
1. **Total gross earnings** — amount in green
2. **Ordinary hours** — pooled 1001 hours; secondary line shows fortnightly OT hours if > 0
3. **Overtime hours** — total OT hours for the fortnight
4. **ADO payout** (short fortnight) or **Fortnight type** (long fortnight)

**Payslip-format breakdown table:**

Columns: Date | Code | Description | EA ref | Units | Rate | Amount

The **Code** column shows a coloured chip per payroll code:

| Codes | Chip style |
|-------|-----------|
| 1001, 1026 | Blue background / blue text (accent) |
| 1462 | Green background / green text |
| 1470, 1010, 5042 | Amber background / amber text |
| 1487, 1485, 1483 | Purple background / purple text |
| 1059, 1100, 1110 | Pink background / pink text |
| 1454 | Sky-blue background / sky-blue text |
| 1064 | Yellow background / dark yellow text |

**Per-day detail section:**

Collapsible per-day tables below the payslip breakdown, showing each day's pay components with the same coloured code chips. Audit flags appear below each day as chips (amber for warnings/alerts, gray for informational).

**Audit flags section:**

Aggregated list of all audit flags across the fortnight, coloured amber for ALERT/⚠ flags.

**Export buttons:** PDF and CSV, shown inline in the match banner or as standalone buttons when no payslip total is entered.

### 13.5 Rates & Codes tab
- Editable form for all rates in `RateConfig`: base rate, OT multipliers, weekend, PH, shift penalties, additional loading, WOBOD
- Editable form for all payroll codes: base, OT1, OT2, sat, sun, sat_ot, ph_wkd, ph_wke, afternoon, night, early, add_load, wobod, liftup, ado, unassoc
- "Reset to EA 2025 defaults" button
- All edits saved to localStorage

### 13.6 KM Table tab
- Renders the full Cl. 146.4 KM credit table from §10
- Read-only reference

---

## 14. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) | Out of scope |
| Superannuation | Out of scope |
| Tax / net pay | Out of scope — gross pay only |
| Multi-driver / depot-wide use | Out of scope for v3 |
| Leave accrual balances | Out of scope |
| Other depots' roster lines | Out of scope — Mt Victoria only |
| Per-day-of-week diagram variants (e.g. 3153 Monday vs 3153 Tuesday) | First occurrence used for KM lookup; typically same distance |

---

## 15. Future Enhancements (Backlog)

- Save and compare multiple fortnights (history view)
- Support for other Sydney Trains depots
- Mobile PWA wrapper (offline, home screen install)
- Automated EA update when new rates are published
- Per-day-of-week diagram lookup (currently uses first occurrence per diagram number)
- Improved OCR for non-standard roster formats

---

## 16. Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | March 2026 | Initial single-file calculator, all 32 roster lines, basic EA rules |
| 1.1 | March 2026 | Lift-up/layback/buildup, ADO pay, manual diagram entry, reset toggle |
| 2.0 | April 2026 | Full PRD written; redesigned UI; leave categories; payslip audit |
| 3.0 | April 2026 | Architecture change: React frontend + FastAPI backend; file upload requirements; PRD-first process rule |
| 3.1 | April 2026 | Roster architecture: master roster (lines 1–22, annual), fortnight roster (lines 201–210, per-fortnight), weekday/weekend schedule files (KM auto-fill). New API endpoints. Swinger line rules. Roster source indicator. ZIP file format documented. |
| 3.2 | April 2026 | Manual diagram override extended to all day types (workday, Saturday, Sunday, PH, OFF, ADO). Override looks up schedule for times + KMs. Purple badge + reset banner on all overridden days. |
| 3.3 | April 2026 | KM auto-population from schedule: Trigger 1 (roster load), Trigger 2 (diagram override), Trigger 3 (schedule uploaded after roster loaded). KM field editable. "✓ KMs auto-filled" badge in Daily Entry toolbar. |
| 3.4 | April 2026 | (1) Per-day diagram number display. (2) Times sourced from schedule (not master roster); explicit `timeSource` field with badges (✓ Schedule / ⓘ Master / ⓘ Built-in / ✏ Manual). (3) Manual diagram override searches BOTH weekday and weekend schedules. (4) Separated Scheduled (read-only) vs Actual (editable) time fields with "Same as scheduled" sync button. (5) KM auto-population fixed in all triggers; Trigger 3 also re-applies times from late schedule uploads. |
| 3.5 | April 2026 | Schedule parser clarification: "Time off duty" is the explicit authoritative source for scheduled end time; "Sign on" for scheduled start time; "Distance" for KMs. Parser hardened to handle 12-hour (am/pm), 24-hour, and spaced time formats. Warnings emitted when a field cannot be extracted, listing the diagram number. |
| 3.6 | April 2026 | (1) **Bug fix:** Frontend live preview now computes lift-up/layback components, matching the backend calculator. Previously the per-day preview omitted these entirely so the user only saw ordinary time + shift penalty. (2) **Added RDO (Roster Day Off) as a leave category** — unpaid, treated as regular RDO. (3) Frontend preview also now handles all leave types (previously only WOBOD/PH/Sat/Sun/weekday were rendered in preview). |
| 3.7 | April 2026 | **Bug fix:** Schedule diagram-block detection hardened — requires 3-4 digit numbers and line-start anchoring (previously `\d+` matched arbitrary text like "No. 2 of 5", which truncated real blocks and caused spurious extraction failures). Label matching is now case-insensitive and tolerates internal whitespace/hyphen variations (Sign on, Signon, Sign-on). |
| 3.8 | April 2026 | **Critical bug fix:** Schedule PDFs are a TWO-COLUMN layout. Default pdfplumber `extract_text()` interleaved both columns line-by-line, causing the parser to (a) miss ~half the diagrams entirely (3155, 3158, 3160, 3162, 3164, 3168 etc.) and (b) pull `Time off duty` from the wrong column (e.g. reporting 10:32 instead of 11:21 for diagram 3154 — picking up 3155's value because the columns were jumbled). Now crops each PDF page at `page.width/2` into LEFT and RIGHT halves, extracts each separately, and concatenates with newlines. Verified locally against the user's actual MTVICDRWD191025 and MTVICDRWE191025 PDFs: 18/18 weekday + 14/14 weekend diagrams extracted, 0 failures, 3154 correctly returns Sign on 01:51 and Time off duty 11:21. |
| 3.9 | April 2026 | **Documentation restoration.** Earlier versions (v3.2 onward) progressively replaced section content with placeholder text like *"unchanged from v3.X"*, leaving the PRD unreadable as a standalone document. v3.9 restores every section to its full content. **Process rule 2 added** at the top: when bumping versions, content must be preserved verbatim and only changed sections may be edited. NFR-07 also updated to reference this rule. No functional code changes in this version. |
| 3.10 | April 2026 | (1) **NEW per-day toggle** — `Claim lift-up/layback?` (default Yes) per FR-02-F. When Yes, pay calc uses the **effective window** (`min(scheduled_start, actual_start)` to `max(scheduled_end, actual_end)`); when No, uses actual times only with no lift-up/layback. See §5.7 worked examples. (2) **Scheduled times now editable** — the Scheduled start and Scheduled end inputs are no longer read-only; user can override (FR-02-B updated). KM field continues to be editable (FR-02-D). (3) **§5.7 rewritten** to use the effective-window model. This fixes a long-standing **double-counting bug** in v3.6–v3.9 where lift-up/layback gap components were added on top of `actual_hrs` that already included those minutes — e.g. a 9-hr actual against an 8-hr scheduled was over-paid as 10.25 base-rate units instead of the correct 9.5. (4) **Stale schedule cache invalidation** (§6.10) — frontend stores a `mvwc_cache_version` key; v3.10 clears `mvwc_weekday_schedule` and `mvwc_weekend_schedule` from localStorage on first load to force users to re-upload schedules with the v3.8 column-aware parser, resolving the user-visible bug where Daily Entry was displaying master-roster times because the cached schedule was missing diagrams. (5) Lift-up/layback are now emitted as **informational flags only** (no separate pay components), since they're already part of the effective-window total. (6) Shift penalty class continues to be determined by **actual sign-on time** regardless of the toggle, because the penalty depends on when the driver physically signs on. |
| 3.11 | April 2026 | **Six backend accuracy fixes, all verified against the canonical Line 8 payslip (2026-03-22, $7,336.55 to the cent).** (1) **WOBOD rule corrected** (§5.6) — replaced the hallucinated "Cl. 136 double-time min 4 hrs" rule with the correct Cl. 140.4 primary rate (150%/200%/250% by day type, weekday OT-shift counter) + Cl. 140.7 50% Train Crew loading. No 4-hour minimum. Weekday counter is fortnight-scoped; Sat/Sun WOBOD do not increment it. (2) **Afternoon penalty fix** (§5.4) — trigger condition tightened to `10:00 ≤ sign-on < 18:00`, which guarantees ordinary time ends after 18:00. Previously used `actual_sign_off > 18:00` which over-triggered on late-finishing day shifts. (3) **Hours rounding fix** (NFR-05) — `amount = round(hours, 2) × rate` (round hours first, then multiply). Previously rounded the product, which diverged from the payroll system by up to 3 cents per line. (4) **Pooled 1001 line uses sum-of-rounded-per-day** (NFR-05) — e.g. 8 × round($398.547, 2) = $3,188.40, not 64h × $49.81842 = $3,188.38. (5) **Auto-suppress shift-swap** (§5.7) — if the scheduled/actual overlap is < 50% of the shorter shift, `claim_liftup_layback` is forced to `False` with a warning flag. Prevents the effective-window from spanning two non-overlapping shifts (e.g. Mar 28: sched 04:43–12:58, actual 12:00–20:00, 12% overlap → auto-suppressed). (6) **Short-fortnight tracking via `wasAdo`** (§5.8) — `wasAdo: boolean` added to `DayState`; preserved across all override mutations. `is_short_fortnight` sent explicitly in the `/api/calculate` request body; backend uses it as source of truth so converting a rostered ADO to WOBOD does not flip the fortnight type. (7) **Pydantic camelCase bug fixed** — `CamelModel` base with `alias_generator=to_camel` + `populate_by_name=True` added to all backend input models; previously every camelCase field from the frontend was silently dropped and all calculations returned $0. |
| 3.12 | May 2026 | **Assoc / Un-assoc Payments Chart integration (§5.10, §6.11).** (1) **New depot chart data model** — `AssocChartEntry` stores `unAssocMins`, `assocPaymentMins`, `assocCalcMins` (pre-computed total), and `buildUpMins` (pre-computed build-up from physical chart's "Build Up" column) per diagram. Built-in defaults for all 32 Mt Victoria diagrams baked in from the Oct 2025 depot chart. (2) **Six diagrams have non-zero build-up from the physical chart:** 3155 (+25 min), 3160 (+51 min), 3161 (+70 min), 3168 (+27 min), 3657 (+30 min), 3660 (+30 min). When the chart's Build Up column is non-zero, that value is sent to the backend as `assocBuildUpHrs` and used directly (bypasses formula) for cent-perfect payroll matching. (3) **Lift-up interaction fix** — when lift-up/layback is claimed AND the effective window exceeds `r_hrs`, the effective window is used as the shift length for the 1454 formula. This prevents double-paying build-up on top of lift-up extra time (e.g. diagram 3155 with lift-up: effective window 9h26m > assoc calc 8h30m → build-up = 0; without this fix the app over-paid by $20.92). (4) **Setup tab chart card** — shows all 32 diagrams in a 7-column table (Diagram, Un-assoc mins/hrs, Assoc payment mins/hrs, Assoc Calc mins, Build Up mins); Build Up values highlighted green. CSV upload/download with 5-column format; PDF and image (Tesseract.js client-side OCR) also accepted. (5) **Backend Render deployment** switched to Docker (`env: docker`, `Dockerfile` with `apt-get install tesseract-ocr`) for reliable server-side image OCR. Client-side Tesseract.js also added as fallback for image uploads when backend OCR is unavailable. (6) **CSV template** updated to 5 columns including `assoc_calc_mins` and `build_up_mins`. |
| 3.33 | May 2026 | **Admin "Drivers" tab — allowlist management UI (v3.33).** Wraps up the v3.31–v3.32 auth rollout with a dedicated admin-only tab for managing the employee-ID allowlist.  New tab `Drivers` appears in the navigation only when admin is signed in (added to `ALL_TABS` + `ADMIN_ONLY_TABS` per v3.29 conventions).  Three card sections inside the tab: (1) **Add driver** — single 8-digit input + optional label field + Add button; surfaces 200/400/duplicate states inline. (2) **Allowlisted drivers table** — columns: Employee ID, Label, Created, Last login, Status (Active / 🔒 Locked until …), Failed attempts, Actions (🔓 Unlock when locked, 🗑️ Remove); fetches from `GET /api/admin/employees`, refreshes after each mutation. (3) **Recent activity** drill-down — click any row to expand and load the last 25 login attempts via `GET /api/admin/audit?employee_id=…`, showing timestamp / IP / user-agent / result with colour-coded result chips. All four backend endpoints from v3.31 are now consumed (list / add / remove / unlock + audit).  No new backend changes. PRD §6.13 (new) documents the tab's data flow.  Frontend build clean; 58 backend tests still pass. |
| 3.32 | May 2026 | **Frontend login screen + JWT plumbing + idle timeout (v3.32 driver-auth UI).** Builds on v3.31 backend. (1) **LoginScreen** (`frontend/src/components/LoginScreen.tsx`) — Apple-inspired centered-card layout, single 8-digit employee-ID input, primary submit button, inline error display for `400 invalid format` / `401 invalid ID` / `423 locked` / `429 rate limited`, secondary "Admin sign in →" link that opens the existing admin-password modal.  Branding: "Driver Wage Calculator" matches the in-app header. (2) **JWT plumbing in `FortnightContext`** — new `authJwt` state (localStorage `mvwc_auth_jwt`) + `authUser` (decoded JWT claims) + `signIn(jwt)` / `signOut()` actions.  `fetch()` calls now attach `Authorization: Bearer ${authJwt}` automatically when the token is present; on 401, the JWT is cleared and the user is bounced to LoginScreen. (3) **App.tsx routing** — if neither `authJwt` (valid + unexpired) nor `adminPassword` is set, render `<LoginScreen />`; else render the existing app. Admin signing in via the password bypasses driver login (their pill still works). (4) **30-min idle timeout** — new `useIdleTimeout(durationMs, onIdle, enabled)` hook listens to `mousemove` / `keydown` / `touchstart` / `click` on `window`; resets the timer on each event; calls `signOut()` after 30 minutes of inactivity.  Soft warning at 28 min (modal "you'll be signed out in 2 min — stay?") deferred to a follow-up. (5) **Sign-out UI** — header gains a `👤 <employee-id> ▾` pill (when authed as driver) with a dropdown containing "Sign out".  Admin pill (`🔐 / 👤 Admin`) is unchanged. (6) **Backend `/api/calculate` now requires JWT** — `Depends(get_current_user)` added to the route; returns 401 if no Bearer token.  The other driver endpoints (`/api/upload-fortnight-roster`, `/api/fortnight-roster/current`, `/api/export/*`) get the same gate in a future commit; for v3.32 only `/api/calculate` is hard-gated so the migration path is gradual.  Public-read GETs of admin-published artifacts (`/api/roster/current`, `/api/schedule/current`, `/api/chart/current`) remain public — no PII, just published reference data. |
| 3.31 | May 2026 | **Employee-ID login + admin allowlist + audit log (v3.31 backend foundation).** Adds real driver-level authentication: the app now requires every driver to log in with their 8-digit employee ID before seeing the calculator. **DB schema** — new `allowed_employees` table (employee_id varchar(8) unique with CHECK `^[0-9]{8}$`, label, created_by, created_at, locked_until, failed_attempts, last_failed_at, last_login_at) + `login_audit` table (employee_id, ip_address, user_agent, result, attempted_at) for the audit trail. **JWT** — `backend/auth.py` with `issue_jwt(employee_id, role) → 7-day HS256 token` and `verify_jwt(token) → claims`, signed with `JWT_SECRET` env var.  `PyJWT==2.9.0` added to `requirements.txt`. **Endpoints** — `POST /api/auth/login` (validates 8-digit format, IP rate-limit, allowlist check, per-ID lockout check, issues JWT); `GET /api/auth/me` (returns current user from JWT); admin allowlist CRUD: `GET /api/admin/employees` (list with summary), `POST /api/admin/employees` (add), `DELETE /api/admin/employees/{id}` (remove), `POST /api/admin/employees/{id}/unlock` (clear lockout); `GET /api/admin/audit?employee_id=...` (audit log viewer). **Rate-limit policy**: 5 failed attempts per IP per hour → HTTP 429. **Lockout policy**: 10 failed attempts on a specific employee ID within 24h → account locked 24h, admin must unlock via `/api/admin/employees/{id}/unlock`. **Audit retention**: opportunistic 1%-probability `DELETE FROM login_audit WHERE attempted_at < NOW() - INTERVAL '30 days'` on each login attempt, dispatched as `asyncio.create_task` so the response is not delayed; no external scheduler needed. **Admin password path** unchanged from v3.28 — admin still uses `ADMIN_PASSWORD` via the 🔐 Admin pill, and that mechanism gates the new allowlist-management endpoints too. Frontend wiring (LoginScreen + JWT plumbing) and the admin Drivers-tab UI follow in v3.32 + v3.33. **Honest scope note**: per the user's spec, sharing the ID with a friend is treated as an acceptable risk; the system does NOT enforce single active session or device binding. Sharing-resistance options flagged for future work: SMS-OTP at first login, single-session JWT enforcement (cheapest first add), watermarked PDF exports. |
| 3.30 | May 2026 | **(1) Driver-view Daily Entry hides per-day pay calculations; (2) Sick Leave pays `max(r_hrs, 8h)` at ordinary rate.** Two changes: **(1) Daily Entry pay-preview gating** — for non-admin drivers, both the collapsed-row `$X.XX` summary chip and the expanded-row "Live pay preview" table are hidden in `DayRow.tsx` so the Daily Entry tab is a pure data-entry surface; pay calculations remain visible in the Results tab where they belong. Hours and the day-type / source badges still show because they're data-entry information, not pay output. Admin view unchanged. Gate signal: `ctx.adminPassword !== null`. **(2) Sick Leave calculation rule clarified** (§5.9) — pre-v3.30 the SL leave-category paid exactly `r_hrs × base_rate` (rostered hours at ordinary rate), which under-paid drivers on short scheduled shifts (<8 h) and was sometimes confused with a non-existent "8 ordinary + rest at OT" split.  v3.30 changes to `max(r_hrs, 8.0) × base_rate`: shifts of 8 h or less are paid at the 8-hour minimum; shifts longer than 8 h are paid for the entire scheduled duration at the ordinary rate — **no OT split for sick days**. Applied in both `backend/calculator.py::_compute_leave` and the mirrored `frontend/src/utils/calcPreview.ts::previewLeave`. PRD §5.9 table updated. No backend test impact (canonical $7,336.55 fortnight has no SL day); 57 backend tests still pass. |
| 3.29 | May 2026 | **Role-based UI gating: driver view vs admin view.** End-user drivers (non-admin) now see a minimal task-focused interface; admins (those signed in via the 🔐 Admin pill) continue to see the full UI from v3.28. Two pieces: (1) **Tab visibility** — non-admin sees only `Setup`, `Daily Entry`, `Results`; the `Rates & Codes` and `KM Table` tabs are filtered out of the `TABS` array. If a previously-admin user signs out while on a hidden tab, App.tsx auto-redirects to Setup. (2) **SetupTab content gating** — non-admin sees: (a) `Step 1: Files provided by admin` informational card listing the admin-uploaded master roster + weekday/weekend schedule with a 🌐 from-server badge and an upload date (no upload UI on these); (b) `Step 1b: Upload your fortnight roster` card — the existing user-driven fortnight roster upload, unchanged; (c) `Step 2: Load roster line` — unchanged; the assoc/un-assoc chart card, the legacy payslip upload card, and the Cl. 134 penalty-rules reference table are all hidden. Admin path retains all current cards/sections. Gate signal: `ctx.adminPassword !== null` is the single source of truth — purely client-side hiding. **Security note**: hidden tabs are a UX convenience, not a security boundary. The Rates & Codes / KM Table tabs render purely client-side data; a determined non-admin could open dev-tools and access the same. The real boundary remains the admin-token gate on admin write endpoints (server-side, not bypassable). For commercial B2C rollout (per the user's choice), the next PR adds proper auth and turns these UI restrictions into hard server-enforced gates where required. |
| 3.28 | May 2026 | **Admin-secret rename: `ADMIN_TOKEN` → `ADMIN_PASSWORD`.** The pre-v3.28 stopgap used a 64-char-hex-string "token" as the admin secret (`openssl rand -hex 32`). v3.28 renames the concept to "password" so the admin can pick a human-memorable value — the entropy trade-off is acceptable for a small private-app deployment, and the user mental model now matches the UI label. **Backwards-compatible** to survive ordered Vercel + Render deploys: backend `_require_admin` checks both `ADMIN_PASSWORD` and the legacy `ADMIN_TOKEN` env vars, and accepts both `X-Admin-Password` and `X-Admin-Token` HTTP headers (preferring the new name when both are present). Frontend renamed `adminToken` → `adminPassword`, sessionStorage key `mvwc_admin_token` → `mvwc_admin_password`, modal labels updated from "Admin token" / "paste admin token" to "Admin password" / "paste admin password". README §4.3 updated with the new env-var name and a recommendation: 12+ characters, mixed-case + digits + symbols, not reused from another account; rate-limiting recommendation flagged for a future commit since human-memorable passwords are guessable in a way that hex tokens aren't. **No data migration** required — the secret value itself can be reset to anything once the new env var is in place. Admins currently signed in will be signed out (sessionStorage key changes), so they re-enter the password on next page load. |
| 3.27 | May 2026 | **Wrap-up of the v3.22 / v3.23 / v3.26 persistence story — docs + "🌐 from server" badge.** Two follow-ups to v3.26: (1) **`README.md` Step 4 — Persistence + admin auth setup**: walks through installing Neon from the Vercel Marketplace, copying `DATABASE_URL` into Render, generating + setting `ADMIN_TOKEN` on both platforms, post-deploy verification via curl, first-time admin sign-in in the deployed app, and token rotation. Now anyone forking the repo can stand up the full persistence stack from the README alone. (2) **"🌐 from server" badge** — `SimpleUploadState<T>` gains a `fromServer?: boolean` field set by the v3.26 server-bootstrap useEffect.  `UploadCard` renders an accent-coloured chip "🌐 from server · click to replace" when this is set, so users can tell at a glance whether an upload card's content came from the shared server store, their own localStorage cache, or a fresh upload.  Mutually exclusive with the existing "cached" chip; `fromServer` takes precedence.  Deferred from this commit: the v3.22 integration test for admin upload → user read round-trip (would need a fixture DB and CI we don't yet have — the manual curl probes documented in README §4.4 cover the same ground for now).  57 backend tests still pass; frontend build clean. |
| 3.26 | May 2026 | **Frontend wiring for v3.22 / v3.23 — session-id generation, admin sign-in UI, server-side bootstrap, rerouted uploads.** Implements what the v3.22 and v3.23 entries promised "land in the next commit". (1) **Browser session id** — `getSessionId()` generates a v4 UUID once per browser on first call and persists it in localStorage as `mvwc_session_id`; attached as `X-Session-Id` header on every fortnight-roster request (per v3.23). (2) **Admin sign-in** — a small `🔐 Admin` pill in the app header opens a modal that accepts the `ADMIN_TOKEN` value; the token is stored in `sessionStorage` (cleared when the browser tab closes — not persisted to disk), and attached as `X-Admin-Token` on admin-write requests. Pill turns into `👤 Admin` with a sign-out option once signed in. (3) **Reroute uploads** — `makeZipUploader` refactored to accept per-endpoint config (URL, headers, scope). Master roster → `POST /api/admin/upload-roster` (admin); weekday/weekend schedule → `POST /api/admin/upload-schedule?type=...` (admin); chart → `POST /api/admin/upload-chart` (admin); fortnight roster → `POST /api/upload-fortnight-roster` (user, session-id-scoped). The old `/api/parse-*` endpoints remain for one-off audit parsing (e.g. payslip) but are no longer the production path. (4) **Server bootstrap** — on app mount, `FortnightContext` fetches `GET /api/roster/current`, `GET /api/schedule/current?type=weekday|weekend`, `GET /api/chart/current`, and (with session id) `GET /api/fortnight-roster/current`; any 200 result populates the corresponding upload state with a `🌐 From server` badge so the user knows the data came from the shared store, not their local cache.  404 responses are silently ignored — frontend falls back to localStorage / built-in defaults as before. (5) **Admin-only upload cards** show a `🔒 Sign in as admin to upload` overlay when no admin token is present; the fortnight-roster card is always accessible. No backend changes — purely the frontend half of the persistence story shipped in v3.22 + v3.23. |
| 3.25 | May 2026 | **Chart upload — orientation auto-detection, image-PDF support, all-4-columns + honest OCR limitations.** Driven by the two real-world chart files in `docs/` (Apr-2026 = `111616112.pdf`, a 90°-rotated scanned image-only PDF; Oct-2025 = `WhatsApp Image …PM.jpeg`, a phone photo correctly oriented). Pre-v3.25 the parser **crashed silently** on the rotated PDF (no text layer → "no diagrams found") and threw away two of the four chart columns even on a perfect parse. Fixes in `backend/parsers.py`: (a) `_auto_rotate(image)` calls Tesseract OSD to detect orientation and rotate to upright — verified working on both reference files. (b) `_render_pdf_pages()` renders image-only PDFs to PIL Images via pdfplumber `to_image()`, used as fallback when text extraction returns no diagrams. (c) `_DIAG_RE` widened from `3151-3168` / `3651-3664` to `3151-3199` / `3601-3699` so newer diagrams (`3169`, `3171`, etc.) are recognised. (d) `_parse_chart_text` rewritten as a positional + sum-check heuristic that extracts all four fields (`unAssocMins`, `assocPaymentMins`, `assocCalcMins`, `buildUpMins`); rows that fail the `un_assoc + assoc_pay + dist_pay = assoc_calc` math-check are skipped with a warning rather than stored with bad values. (e) Fuzzy diagram-number recovery (`_normalise_diag_token`) maps common Tesseract digit confusions (`i`/`l`/`|` → `1`, `S` → `5`, `O` → `0`, etc.). (f) `_parse_csv_text` now reads all five CSV columns (`diagram, un_assoc_mins, assoc_payment_mins, assoc_calc_mins, build_up_mins`) so the existing CSV template + hand-entry workflow yields the full schema. Frontend `SetupTab.tsx` updated to forward all 4 fields from the backend response (was previously dropping `assocCalcMins` + `buildUpMins` on the CSV bridge into `loadAssocChartCsv`). **Honest limitation flagged in the warning UX**: Tesseract OCR on phone-photographed and rotated-scanned charts is *unreliable* for column-aligned data — empirically the v3.25 parser extracts only 1–3 confidently-validated rows out of the ~23-row chart for both reference files (the remaining rows fail the sum-check). When `rows_with_data < 5`, the parser now returns a clear warning recommending the user fall back to the CSV template (which is reliable). The admin who hand-transcribed `DEFAULT_ASSOC_CHART` in v3.24 against the visual chart remains the **reliable** baked-in path. **What v3.25 does and doesn't promise**: it eliminates the silent-fail on rotated image-only PDFs, supports all 4 columns end-to-end, and validates rows via the chart's own math equation; it does not solve the fundamental limit of Tesseract OCR on noisy chart photos. |
| 3.24 | May 2026 | **`DEFAULT_ASSOC_CHART` updated to 19-04-26 depot chart** (`docs/111616112.pdf`). The previously baked-in Oct-2025 chart values are replaced with the values from the newer chart the user supplied this session. Source PDF was a 50-page-rotated scanned image — extracted, rotated 90° CCW, OCR'd via Tesseract, then visually verified row-by-row before transcription. **Diagrams added** (new in the 19-04-26 chart): 3151, 3156, 3158, 3162, 3167, 3169, 3171 (weekday); 3651, 3652, 3658, 3659, 3661, 3662, 3664 (weekend). **Diagrams removed** (no longer listed on the chart): 3154, 3159, 3160, 3164, 3653 — these now use the default zero values (no un-assoc / no assoc-pay / no build-up). **Diagrams with materially changed values**: 3155 (loses 25 min build-up, un-assoc 0 → 50 min), 3161 (was un-assoc 116, build-up 70; now 0 / build-up 51), 3165 (was assocCalc 371 / un-assoc 71; now 480 / 0), 3168 (build-up 27 → 7), 3657 (build-up 30 → 81), 3660 (radical change: un-assoc 30 → 217, build-up 30 → 238 — this diagram now has a very large build-up). All 23 entries verified against the visual chart. Canonical $7,336.55 regression for Line 8 / 22-Mar-2026 fortnight is **unaffected** because (a) the backend `compute_fortnight` test passes per-day chart values as zero-defaults (PAYLOAD doesn't include `unAssocHrs`/`assocPaymentHrs`/`assocBuildUpHrs`), so the chart in `DEFAULT_ASSOC_CHART` doesn't influence the test, and (b) each chart delta I traced for the canonical fortnight's diagrams lands in a build-up = 0 result either way. `CACHE_SCHEMA_VERSION` bumped to invalidate any user's localStorage copy of the old chart so they pick up the new built-in. 57 backend tests still pass. |
| 3.23 | May 2026 | **Access model split: admin-globally-published artifacts vs per-user fortnight roster.** Clarifies the v3.22 persistence work after a real-usage discussion: the master roster, weekday schedule, weekend schedule, and assoc/un-assoc chart are published **once globally by an admin** every few months and read by everyone (admin-write, public-read). The **fortnight roster** is fundamentally different — it changes every 14 days and is uploaded **individually by each driver** when they sit down to calculate their pay. New endpoint split: `POST /api/upload-fortnight-roster` (no admin token; requires `X-Session-Id` header containing a UUID generated once per browser on first load and persisted in localStorage), `GET /api/fortnight-roster/current` (requires `X-Session-Id`, returns that browser's most recently uploaded roster). The existing `/api/admin/upload-roster` admin endpoint and `/api/roster/current` read endpoint now only accept `type=master` (the `?type=fortnight` variant from v3.22 is removed before any users depended on it). Storage layer `db.save_artifact` / `db.get_latest_artifact` extended with `uploaded_by` filter so per-row scoping by uploader works without schema changes. Each new upload still replaces the prior via `active=false` soft-delete, scoped to that uploader for the fortnight case. Session-id format validated as UUID-like (32+ chars, alphanumeric+`-`) to keep junk values out of the `uploaded_by` column. Frontend session-id generation + header attachment land in the next commit. |
| 3.22 | May 2026 | **Server-side persistence for parsed artifacts — removes the parse-blocking bottleneck.** Driven by the v3.21 load-test finding that a single PDF parse on Render free tier takes **~3 min 39 s** during which the entire backend is unresponsive. **Architecture change**: parsed `ParsedRosterResponse`, `ParsedScheduleResponse`, `ParsedAssocChartResponse` payloads now persist to Postgres (Neon free tier, accessed via `DATABASE_URL`). New schema `parsed_artifact` (id, kind, source_file, uploaded_at, uploaded_by, payload JSONB, active boolean). New admin endpoints `POST /api/admin/upload-roster`, `POST /api/admin/upload-schedule`, `POST /api/admin/upload-chart` accept the same multipart form-data as the existing parse endpoints, run the parse, and persist the result. New user endpoints `GET /api/roster/current?type=master\|fortnight`, `GET /api/schedule/current?type=weekday\|weekend`, `GET /api/chart/current` read the latest active payload (DB query ~50 ms). Frontend `FortnightContext` bootstraps from these server endpoints on mount; localStorage retained as offline-fallback cache. **Result**: drivers never trigger parses — only the admin does, once per fortnight, and that 3:39 wait now affects one person not all of them. Web worker stays responsive throughout. **Auth stopgap** (proper JWT in a follow-up PR): admin endpoints gated by an `X-Admin-Token` HTTP header matched against the `ADMIN_TOKEN` env var; user endpoints are public-read. Required infrastructure changes: (1) install Neon from Vercel Marketplace, (2) copy `DATABASE_URL` into Render env vars, (3) set `ADMIN_TOKEN` env var on both Render and Vercel (e.g. `openssl rand -hex 32`). Documented in §6.12 + README. |
| 3.21 | May 2026 | **Cosmetic: card inner-padding fix across Rates, KM, Setup tabs.** The `.card` class in `globals.css` has no inherent inner padding — the established convention (used by SetupTab Steps 1–3) is to nest content inside a `.card-header` + `.card-body` pair. Several cards across the app were "naked" (content placed directly inside `.card` with no inner wrapper), so the inputs/tables inside them bled to the card border with zero gutter, and on narrow viewports the `.g3`-collapsed single-column inputs visibly touched the screen edge. v3.21 wraps the content of six naked cards in `.card-body`: RatesTab × 3 (`Pay rates`, `Payroll codes`, `Un-associated duties`), KmTableTab × 1, SetupTab × 2 (`Shift Penalty Rules` reference card, `Assoc / Un-assoc Payments Chart`). No CSS changes; uses the existing `.card-body { padding: 20px }` rule. ResultsTab cards (which use inline padding or fake-header inline-styled inner divs) are intentionally left alone — they already render correctly. Pure cosmetic; no behaviour or calculator changes; build passes; 57 backend tests still pass. |
| 3.20 | May 2026 | **(1) Rates & Codes UI labels updated to reflect the v3.19 Cl. 78.3 fix.** `frontend/src/components/RatesTab.tsx` still showed "OT tier 1 multiplier (first 2 hrs) Cl. 140.1" and the chip caption "OT first 2 hrs" — even though v3.19 changed the underlying calculator boundary to 3 hours and the clause cite to Cl. 78.3. Updated three label strings: `'OT tier 1 multiplier (first 2 hrs)' → 'OT tier 1 multiplier (first 3 hrs)'`, `'OT tier 2 multiplier (beyond 2 hrs)' → 'OT tier 2 multiplier (beyond 3 hrs)'`, `'OT first 2 hrs' → 'OT first 3 hrs'`; EA cites `'Cl. 140.1' → 'Cl. 78.3'`. **(2) New `PHWA` leave category — "PH worked and accrued"** (§5.3, §5.9). For drivers who work on a public holiday but want the additional 8-hr ordinary day **banked as a day off later** rather than paid this fortnight. Pays only the 150% loading on rostered hours (`r_hrs × base × 1.5`); the additional day is recorded as a flag (`"PHW (accrued): 150% loading paid; additional 8-hr day accrues for future use (Cl. 31.5(b))."`) and NOT emitted as a line-item. Selectable from the leave-category dropdown alongside the existing `PHW` (paid both) option. New `LEAVE_CATS` entry in `frontend/src/utils/eaRules.ts`; new branch in `backend/calculator.py::_compute_leave` mirrored in `frontend/src/utils/calcPreview.ts::previewLeave`. New backend regression test `test_phwa_loading_only` exercises the case (8-hr PHW shift: `8 × base × 1.5 = $597.82`, no additional-day line). No impact to existing `PHW` or `PHNW` paths; 56 backend tests pass (was 55, +1 new). |
| 3.19 | May 2026 | **OT tier-1 boundary corrected: first 3 hrs at 1.5× (was 2 hrs), and clause cite changed from Cl. 140.1 → Cl. 78.3.** The user shared the verbatim text of Cl. 78.3 (Page 93 of the EA 2025): _"Overtime worked in excess of 8 hours in any one Shift will be paid at the rate of time and one half for the first **3** hours and double time thereafter."_ The codebase, inherited from the v3.0 scaffold, was hard-coding the boundary as **2** hours in two places — `backend/calculator.py:321` (`ot1h = r2_hrs(min(ot_h, 2.0))`) and `frontend/src/utils/calcPreview.ts:193` (`Math.min(otH, 2)`). Both changed to 3. Audit-flag messages and the `config.yaml` comment that cited "Cl. 140.1" updated to cite "Cl. 78.3" (the sub-clause references for the Sched OT 150% / 200% line-items at `Cl. 140.2(a)`/`(b)`/`(d)` are left unchanged because the user only quoted Cl. 78.3 — those payslip-line-item cross-references may or may not need their own review). The canonical $7,336.55 regression for Line 8 (2026-03-22 fortnight) is unaffected: the worst-OT day (Mar 27) had exactly 2.0 hrs of OT, sitting inside the 1.5× tier under both the old and new boundaries. Pre-fix impact for a driver working >2 but ≤3 hrs of daily OT (e.g. an 11-hr shift): the calculator over-credited the 3rd OT hour at 2.0× when the EA says 1.5× — i.e. the calculator predicted ~$24.91 more than the payslip would actually show, and the variance-audit banner would have falsely flagged a phantom underpayment. New regression test `backend/tests/test_ot_tier_boundary.py` exercises a 12-hr-worked weekday (8 ord + 3 × 1.5× + 1 × 2.0×) to lock the corrected boundary in place. PRD §5.2 rewritten with the verbatim Cl. 78.3 quote. |
| 3.18 | May 2026 | **Afternoon shift payroll code default set to `1485`.** Prior to v3.18, `PayrollCodes.afternoon` defaulted to the empty string `''` — the Results tab therefore emitted an "Afternoon Shift Dvrs/Grds" line with the correct dollar amount but no payroll-code chip. The blank was a placeholder pending real-payslip confirmation; none of the canonical reference payslips had ever triggered the afternoon-penalty condition (Cl. 134.1(a): ordinary time commences before and concludes after 18:00). v3.18 bakes in the standard Sydney Trains payroll code `1485` — Item 6 Sch.4B Afternoon Shift Drvs/Grds — which is the obvious slot in the `1483` / `1485` / `1487` morning / afternoon / night family (codes `1483` and `1487` are already defaults). Users can still override via the Rates & Codes tab. §5.4 updated with the explicit code mapping for all four shift-penalty items (1485 afternoon, 1487 night, 1483 early morning, 1470 additional loading); §13.4 colour-chip table updated so `1485` joins `1483` / `1487` in the purple penalty group. Backend `PayrollCodes.afternoon: str = '1485'` (one-line change in `backend/models.py`); 54 backend tests still pass with no dollar-amount changes. |
| 3.17 | May 2026 | **`Fortnight roster` time-source badge added.** `TimeSource` union widened from `'schedule' \| 'master' \| 'builtin' \| 'manual' \| 'none'` to also include `'fortnight'`. `loadLine()` now sets `timeSource = source` (instead of the literal `'master'`) when falling back to the roster's own `r_start`/`r_end` fields — so swinger lines 201–214 that came from the fortnight roster correctly show **ⓘ Fortnight roster** (amber chip), and permanent lines 1–22 that came from the master roster continue to show **ⓘ Master roster**. The previous behaviour relabelled every roster-driven time as "Master roster" regardless of the actual source file. DayRow `sourceBadge()` handler adds the new case with tooltip "Diagram not in uploaded schedule — using fortnight-roster times". The inline note below the times block (`⚠ Schedule didn't have diagram # …`) now reads "fortnight roster" for the fortnight case. FR-02-A updated. No backend / calculator changes. |
| 3.16 | May 2026 | **Cache invalidation reach extended to roster uploads.** The v3.14 / v3.15 fixes shipped without effect for any user whose fortnight roster was already cached in localStorage from a pre-v3.14 parser run — the buggy pre-fix `ParsedRosterData` (with shifted day cells: Wed showing Fri's content, etc.) was being re-hydrated from `LS_FR` and fed straight into `loadLine`, so the new named-duty preservation rule still saw `diag = "3160 MQ"` for the Wed slot of line 209 and correctly mapped it to schedule diagram 3160 — i.e. the symptom looked exactly like v3.15 had no effect. Root cause: the cache-invalidation block at the top of `FortnightContext.tsx` only cleared `LS_WD` (weekday schedule) and `LS_WE` (weekend schedule); it did not touch `LS_FR` (fortnight roster) or `LS_MR` (master roster). Fix: bump `CACHE_SCHEMA_VERSION` to `'3.15'` and add `removeItem(LS_FR)` / `removeItem(LS_MR)` to the invalidation block so cached roster data parsed by the old anchors is dropped on first page-load after upgrade. The user must re-upload the fortnight roster (and master roster, if used) once after the upgrade; the Setup tab's existing upload cards handle this. Code change is one file (`FortnightContext.tsx`), no calculator/test impact, 54 backend tests still pass. NFR/general principle clarified: **any change to `ParsedRosterData` shape OR to the roster parser's behaviour MUST bump `CACHE_SCHEMA_VERSION` AND extend the cache-invalidation block to clear `LS_FR`/`LS_MR` (whichever roster type the parser change affects).** |
| 3.15 | May 2026 | **Named-duty diagram preservation in `loadLine`.** When the roster cell explicitly names a non-numeric duty (`SBY`, `AMV01`, `MSBYD3`, `DSP`, training course codes, etc.), `FortnightContext.loadLine()` no longer attempts to recover a 4-digit diagram via `findByTimes()` matching on `entry.r_start`/`entry.r_end`. Previously, a fortnight cell saying `SBY 12:00-20:00` was silently re-mapped to `3163` (the regular weekday diagram whose schedule happens to share those times), producing a misleading "✓ Schedule" badge and a wrong diagram label. With this fix the roster is treated as authoritative for the duty type: a `SBY` day stays `SBY` with an `ⓘ Master roster` (or fortnight-roster) badge and times taken from the roster's own `r_start`/`r_end`. Numeric diagrams (e.g. `3160 MQ`) continue to use `findByTimes()` as a fallback for cases where `findByDow()` doesn't return a match. Fix applied to both the roster-driven branch and the built-in-roster branch of `loadLine()`. FR-02-A clarified accordingly. Pay-calculation behaviour unchanged — pay for an `SBY 12:00–20:00` weekday day was already identical to a `3163 12:00–20:00` weekday day (same hours × ordinary rate, no KM credit for `SBY`), so no calculator/test changes required. |
| 3.14 | May 2026 | **Printed fortnight-roster parser + swinger UX + crew-name display.** (1) **Real "Intercity Drivers Roster" PDF support** (§6.5.2) — pdfplumber `find_tables()` fallback when text-regex returns zero lines. Auto-detects four table layouts: main with-crew (~31 cols, anchors `[3,4,5,7,9,11,13,15,17,19,21,23,26,28]`), main no-crew (shifted left by 1), swinger with-crew (~20 cols, **consecutive** anchors `[3,4,5,6,7,8,10,11,12,13,14,15,17,18]` with sub-col separators at col 9 and col 16), swinger no-crew. Detection rules: `ncols ≤ 22` ⇒ swinger; `cells[2]` of first anchor row containing a time-range or day keyword ⇒ no crew column. **Multi-row logical-line grouping** (anchor row + continuation rows whose `cells[1]` is empty). Real-PDF verification: 36/36 lines parsed, 0 warnings; line 209 (Saharan, Ravi) correctly shows Tue 7 Apr = SBY 12:00–20:00, Fri 10 Apr = 3160 MQ 09:32–17:41, Sun 12 Apr = AMV01 11:58–21:25. (2) **Text-colour strikethrough handling** (§6.5.3) — cells whose average non-stroking colour brightness ≥ 0.35 are treated as struck through and parsed as OFF. **Day-column restriction is mandatory:** col 0 (spacer), col 1 (line#) and col 2 (crew name) MUST never be blanked — those columns use grey ink for alternating-row styling in some PDFs and were silently erasing lines 8, 18, 19, 205, 209, 212. (3) **"Fortnight commencing" date parsing** (§6.5.1) — added alongside the existing "Fortnight ending" recognition so printed-PDF date headers parse correctly. (4) **Lines 201–214** — swinger range extended from 201–210 to 201–214 across §2.3, §4, §6.1, §6.2, §6.4, §6.5, §11.2, §13.2, FR-01. SetupTab input `max="214"`. (5) **Fortnight roster is MANDATORY for swinger lines** (§6.2, §11.2, FR-01) — master-roster and built-in fallback chains removed for 201–214; `loadLine()` returns an error string when the user attempts to load a 201–214 line without the fortnight roster (signature changed to `(line, start, phs, psTotal) => string \| null`). SetupTab surfaces it as a red banner; the swinger-info chip turns red until the roster is uploaded. (6) **Crew-name extraction & display** — `ParsedRosterResponse` gains `crew_names: dict[str, str]` (§9.4); populated from `col 2` of the **anchor row only** (continuation rows excluded to avoid bleed). Frontend `FortnightContext` exposes `loadedCrewName: string \| null`, set only when `rosterSource === 'fortnight'`. Daily Entry toolbar shows `👤 <Crew Name>` next to the line badge (§13.3) so the user can visually confirm the right line was loaded. (7) **Actual times auto-pre-filled from scheduled on every load path** (FR-02-B) — `loadLine`/`applyManualDiag`/`markWorkedOnOff` all set `aStart = rStart, aEnd = rEnd`; most days require no further input. (8) **"Fill all rostered" toolbar button removed** from DailyEntryTab — redundant now that actuals pre-fill automatically on load. (9) **Cache schema bumped to 3.12** to invalidate any cached `ParsedRosterData` lacking the new `crew_names` field. No EA-rule or calculator changes. |
| 3.13 | May 2026 | **Apple HIG redesign + accessibility + multi-PH bug fix.** (1) **Complete UI redesign** (§13.1–13.4) following Apple Human Interface Guidelines — `#f5f5f7` canvas, `#0071e3` accent, SF Pro font stack, frosted-glass sticky header (`backdrop-filter: saturate(180%) blur(20px)`), underline tab indicator (no pills), white card surfaces with hairline borders and minimal `1px` shadow, no gradients anywhere. (2) **App header restructured** — sticky frosted header (52px) above sticky tab bar (40px); header shows 🚂 logo mark, title/subtitle, fortnight-type badge, roster line badge, EA version badge. (3) **Setup tab** — cards now use card-header / card-body structure with numbered step circles (green ✓ / blue 2 / gray 3). (4) **Multi-PH bug fix** — public holiday input replaced: old comma-separated text input only picked up the first PH date when multiple were entered. New design uses `<input type="date">` + "Add" button to push dates into a `string[]` array; each PH appears as a removable amber chip showing `📆 Fri 3 Apr 2026 ×`. All PH dates are correctly sent to the API. (5) **Daily Entry — iOS toggle groups** — `<select>` dropdowns for Lift-up/layback, WOBOD, and Cross-midnight replaced with segmented toggle-group components (adjacent Yes/No buttons, active state filled with accent colour). ARIA `aria-pressed` on each button. (6) **Daily Entry — two-column times layout** — scheduled and actual times displayed side-by-side in a `1fr 1px 1fr` CSS grid with a hairline vertical divider. (7) **Auto-suppress chip in collapsed header** — when the system suppresses a lift-up/layback claim due to < 50% shift overlap (§5.7), an amber chip is visible in the collapsed day-row header so the driver is immediately alerted without needing to expand the row. (8) **Results tab — match/variance banner** — replaces the former inline variance text; full-width banner with green (match) or amber (variance) left-border accent; Export buttons are inlined in the banner. `role="status"` / `role="alert"` for screen-reader announcements. (9) **Results tab — metric cards** — four white cards in a responsive grid (total gross, ordinary hours, OT hours, ADO payout/fortnight type). (10) **Results tab — coloured code chips** — each payroll code in the payslip-format breakdown table is rendered as a colour-coded chip (blue 1001/1026, green 1462, amber 1470/1010/5042, purple 1487/1483, pink 1059/1100/1110, sky 1454, yellow 1064). (11) **WCAG 2.1 AA accessibility** (NFR-09) — `aria-label`, `aria-pressed`, `aria-selected`, `aria-expanded` on all interactive elements; `role="list"/"listitem"/"tab"` on structural elements; `tabIndex={0}` + keyboard Enter/Space on day rows; `focus-visible` ring; `prefers-reduced-motion` support. No code changes to backend. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
