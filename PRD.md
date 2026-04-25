# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.2  
**Date:** April 2026  
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)  
**Status:** Active — governs all development on this repository

> **Process rule:** Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a **full-stack web application** built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its purpose is to allow drivers to calculate their exact gross fortnightly pay — derived from their rostered line, their actual worked times, and all applicable Enterprise Agreement 2025 rules — so they can independently verify every line on their payslip without needing payroll or HR involvement.

---

## 2. Background and Problem Statement

### 2.1 The payslip verification problem

Sydney Trains drivers receive fortnightly payslips containing 10–25 line items across multiple pay codes. The calculation rules are complex:

- Ordinary hours are capped at 8 per day; beyond that, two tiers of OT apply
- Shift penalties (afternoon, night, early morning) are paid per worked hour, not per shift, with EA-mandated rounding (Cl. 134.3(b))
- Saturday, Sunday, and public holidays each have different rate multipliers
- Cross-midnight shifts may split across two calendar days with different rate rules
- KM credits for intercity services grant additional credited hours above actual worked hours under a 26-band table (Cl. 146.4)
- Lift-up, layback, and buildup must be paid at ordinary rate within the 8-hr limit and OT rate beyond it
- ADO days are paid as 8 hrs ordinary only in a short fortnight; in a long fortnight the ADO accrues without payout
- WOBOD (working on a book-off day) is double time with a 4-hour minimum (Cl. 136)

### 2.2 The 2025 EA context

| Item | Detail |
|------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate (Sch. 4A) | $49.81842/hr (from 1 July 2025) |

### 2.3 Depot context

Mt Victoria is an intercity depot on the Blue Mountains line. Drivers frequently work shift swaps — taking a different diagram than originally rostered — on **any day of the fortnight**, including regular weekdays, Saturdays, Sundays, and public holidays. The ability to override the rostered diagram for any day is therefore a core operational need.

---

## 3. Users

### Primary user
**Mt Victoria intercity train driver**
- Knows their roster line number and fortnight start date
- Understands EA terminology (diagram, ADO, WOBOD, layback, lift-up, KM credit)
- Frequently works shift swaps on any day type
- Not a developer; uses the app on phone or desktop

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | Unique identifier for a specific shift. Defines sign-on, sign-off, train services, and KM distance. |
| **Fortnight** | 14-day pay period starting on a Sunday. |
| **Short fortnight** | Fortnight containing an ADO day — ADO paid out this period. |
| **Long fortnight** | Fortnight with no ADO — all shifts worked; ADO accrues. |
| **ADO** | Accrued Day Off. Under the 19-day month arrangement. |
| **Manual diagram override** | User-entered diagram number that replaces the roster-assigned diagram for a specific day. Applies to **any day type**: regular workday, Saturday, Sunday, public holiday, OFF, or ADO. |
| **Master Roster** | Annual roster document for lines 1–22. |
| **Fortnight Roster** | Per-fortnight roster document for swinger lines 201–210. |
| **Schedule file** | Weekday or weekend schedule document with per-diagram timing and KM data. |
| **Swinger line** | Roster lines 201–210. |
| **OT** | Overtime. |
| **WOBOD** | Work on Book-Off Day. Double time, minimum 4 hours (Cl. 136). |
| **Lift-up / Buildup** | Driver signs on before rostered start. |
| **Layback / Extend** | Driver signs off after rostered end. |
| **KM credit** | Cl. 146.4 credited hours for intercity distance. |
| **Roster source indicator** | UI badge: "Master roster", "Fortnight roster", or "Built-in data". |

---

## 5. EA 2025 Rules Applied

*(Unchanged from v3.1 — see full clause references in previous version)*

### 5.1 Ordinary time (Sch. 4A) — base $49.81842/hr; Sat 1.5×; Sun 2.0×
### 5.2 Overtime (Cl. 140.1) — 1.5× first 2 hrs beyond 8; 2.0× beyond; Sat OT 2.0×
### 5.3 Public holidays (Cl. 31) — weekday 1.5×; weekend 2.5×; not worked = 8 hrs ordinary
### 5.4 Shift penalties (Sch. 4B / Cl. 134.3) — afternoon $4.84/hr; night $5.69/hr; early $4.84/hr; additional $5.69/shift flat; not payable Sat/Sun/PH
### 5.5 KM credit (Cl. 146.4) — 26-band table; auto-filled from schedule; excluded from OT
### 5.6 WOBOD (Cl. 136) — double time, min 4 hrs
### 5.7 Lift-up / Layback (Cl. 131 / Cl. 140.1) — ordinary ≤8 hrs total; OT beyond
### 5.8 ADO pay — short fortnight = 8 hrs ordinary; long = accruing
### 5.9 Leave categories — SL, CL, AL, PHNW, PHW, BL, JD, PD, LWOP

---

## 6. File Upload Requirements

*(Unchanged from v3.1)*

### 6.1–6.9 — See v3.1 for full details on master roster, fortnight roster, schedule, payslip, and legacy uploads.

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
*(Unchanged from v3.1)*

### FR-02: Daily Entry (updated v3.2)

Each of the 14 day rows supports the following:

**For all day types (workday, Saturday, Sunday, PH, OFF, ADO):**
- A **manual diagram override** field is always available in the expanded day row
- User enters a diagram number (e.g. `3158`, `3651`, `SBY`) in the input field
- On clicking **Load diagram ↗**, the app looks up the diagram in uploaded schedule files and pre-fills: sign-on, sign-off, KMs, cross-midnight, and rostered hours
- If the schedule is not uploaded or the diagram is not found in it, the times fields remain blank for manual entry
- A **purple "manual" badge** appears on the day row header when an override is active
- A **reset button** is always shown when an override is active — clicking it restores the original roster-assigned diagram for that day
- The original rostered diagram is preserved in `_origDiag` and shown in the reset banner

**Day-type-specific behaviour:**

| Day type | Default state | After manual override |
|----------|--------------|----------------------|
| Regular workday | Rostered times pre-filled | Override times replace rostered times |
| Saturday | Rostered times pre-filled | Override times replace; day still rated at Saturday rate |
| Sunday | Rostered times pre-filled | Override times replace; day still rated at Sunday rate |
| Public holiday | Rostered times pre-filled | Override times replace; day still rated at PH rate |
| OFF | No times — shows diagram picker | Override loads times from schedule |
| ADO | No times — shows diagram picker | Override loads times from schedule |

**Calculation after override:** All EA rate rules (Sat 1.5×, Sun 2.0×, PH 1.5×/2.5×, shift penalties, KM credits) continue to apply based on the actual **day of week / PH status**, not the diagram number. Swapping to a different diagram never changes the day's rate class.

**Other daily entry controls (unchanged):**
- Actual start / end time inputs
- KMs field (auto-filled from schedule or manual)
- WOBOD toggle
- Cross-midnight toggle
- "Use rostered" button (copies rostered times to actual fields)
- Leave type selector

### FR-03: Pay calculation — `POST /api/calculate` — unchanged
### FR-04: Results — unchanged
### FR-05: Configuration — unchanged
### FR-06: KM table reference — unchanged
### FR-07: Reset and toggling — unchanged; reset path always available for manual overrides on any day type
### FR-08: ADO handling — unchanged
### FR-09: Lift-up / Layback / Buildup — unchanged
### FR-10: Cross-midnight shifts — unchanged

---

## 8. Non-Functional Requirements

*(Unchanged from v3.1)*

---

## 9. Data Model

### 9.1 Day state (frontend) — updated v3.2

```ts
interface DayState {
  date: string;              // YYYY-MM-DD
  dow: number;               // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;              // current diagram: '3158 RK' | 'OFF' | 'ADO' | '3651 [manual]'
  _origDiag?: string;        // original roster diagram before any manual override
  rStart: string | null;     // rostered start HH:MM (from roster or schedule)
  rEnd: string | null;       // rostered end HH:MM
  cm: boolean;               // cross-midnight
  rHrs: number;              // rostered hours
  aStart: string;            // actual start HH:MM (user-entered)
  aEnd: string;              // actual end HH:MM
  wobod: boolean;
  km: number;                // KM distance (auto-filled from schedule or manual)
  leaveCat: string;
  manualDiag: string | null; // set when user has applied a manual diagram override
  manualDiagInput: string;   // current value of the diagram input field
  workedOnOff: boolean;      // true when user chose "Worked (no diagram)" on an OFF/ADO day
  isShortFortnight: boolean;
}
```

**Key rule:** `_origDiag` is set whenever a manual override is applied (whether the day was originally a workday, Saturday, Sunday, PH, OFF, or ADO). Resetting always restores to `_origDiag`.

### 9.2–9.8 — Unchanged from v3.1

---

## 10. KM Credit Table (Cl. 146.4)

*(Unchanged from v3.1)*

---

## 11. Roster Lines — Mt Victoria

*(Unchanged from v3.1)*

---

## 12. API Endpoints

*(Unchanged from v3.1)*

---

## 13. UI Design Specification

### 13.1 Layout — unchanged
### 13.2 Setup tab — unchanged from v3.1

### 13.3 Daily Entry tab (updated v3.2)

Each day row has two sections: **header** (always visible) and **body** (expanded on click).

**Header:**
- Date and day name
- Current diagram badge (purple if manual override active)
- Rostered time summary
- Live pay preview
- Chevron expand/collapse

**Body — manual diagram override (available on ALL day types):**
- Label: "Override diagram / schedule no." with hint "e.g. 3158, 3651, SBY"
- Text input for diagram number
- **Load diagram ↗** button — looks up schedule and pre-fills times + KMs
- When override is active: purple "manual" badge in header + reset banner showing original diagram name and a **Reset** button

**Body — work inputs (shown when diagram is a work shift):**
- Actual sign-on time
- Actual sign-off time
- KMs (auto-filled or manual)
- WOBOD toggle
- Cross-midnight toggle
- "Use rostered" button
- Leave type selector
- Live pay breakdown table

**Body — OFF/ADO state (no override applied):**
- Informational text ("Day off — no pay unless worked")
- Diagram override input (same as above)
- "Worked (no diagram)" button as alternative

### 13.4–13.6 — Unchanged

---

## 14. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) | Out of scope |
| Superannuation | Out of scope |
| Tax / net pay | Out of scope |
| Multi-driver use | Out of scope |
| Leave accrual balances | Out of scope |
| Other depots | Out of scope |
| Per-day-of-week diagram variants | First occurrence used; typically same distance |

---

## 15. Future Enhancements (Backlog)

- Save and compare multiple fortnights
- Support for other Sydney Trains depots
- Mobile PWA wrapper
- Automated EA rate updates
- Per-day-of-week diagram lookup

---

## 16. Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | March 2026 | Initial single-file calculator, all 32 roster lines, basic EA rules |
| 1.1 | March 2026 | Lift-up/layback/buildup, ADO pay, manual diagram entry, reset toggle |
| 2.0 | April 2026 | Full PRD written; redesigned UI; leave categories; payslip audit |
| 3.0 | April 2026 | React frontend + FastAPI backend; file upload requirements; PRD-first process rule |
| 3.1 | April 2026 | Roster architecture: master/fortnight/schedule files; swinger line rules; KM auto-fill; ZIP format |
| 3.2 | April 2026 | Manual diagram override extended to all day types (workday, Saturday, Sunday, PH, OFF, ADO). Override looks up schedule for times + KMs. Purple badge + reset banner on all overridden days. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
