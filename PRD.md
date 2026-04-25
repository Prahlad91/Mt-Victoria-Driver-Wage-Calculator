# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.4
**Date:** April 2026
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)
**Status:** Active — governs all development on this repository

> **Process rule:** Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a full-stack web application for intercity train drivers based at the Mt Victoria depot under Sydney Trains. It calculates exact gross fortnightly pay derived from the rostered line, the actual worked times, and all applicable Enterprise Agreement 2025 rules.

---

## 2. Background and Problem Statement

### 2.1 The payslip verification problem

Drivers receive payslips with 10–25 line items across complex pay codes (OT, shift penalties, KM credits, ADO, WOBOD, lift-up/layback). Without a tool, underpayments go unchallenged.

### 2.2 EA 2025 context

| Item | Detail |
|------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate (Sch. 4A) | $49.81842/hr (from 1 July 2025) |

### 2.3 Depot context

Mt Victoria intercity shifts regularly accumulate 160–400+ km, making the Cl. 146.4 KM credit substantial. **Times and KMs must come from the schedule file, not the master roster** — the master roster shows the assignment (which diagram on which day), the schedule file is the authoritative source for sign-on, sign-off and distance per diagram. Drivers also frequently swap shifts and need to override the diagram on any day type.

---

## 3. Users

**Mt Victoria intercity train driver** — uses the app on phone or desktop; not a developer.

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | 4-digit identifier for a shift (e.g. `3151`, `3651`). Defines sign-on, sign-off, train services and KM distance. |
| **Diagram name** | Full diagram label as it appears in the roster, e.g. `3151 SMB`, `3158 RK`. The 4-digit prefix is the diagram number; trailing tokens are crew location codes (SMB, RK, etc.). |
| **Master Roster** | Annual roster document. For each line and each day, lists the diagram number assigned. Also contains backup times. Lines 1–22. |
| **Fortnight Roster** | Per-fortnight roster for swinger lines 201–210. |
| **Schedule file** | Per-diagram file (weekday or weekend). Authoritative source for sign-on, sign-off, total hours, KM distance per diagram number. |
| **Scheduled times** | Sign-on and sign-off for a day — looked up from the schedule file using the day's diagram number. Pre-populated on roster load; never changes after that unless the user applies a manual diagram override. |
| **Actual times** | User-entered start and end times reflecting what actually happened. May differ from scheduled (lift-up, layback, late sign-off). Defaults to scheduled times on load; can be changed by user; can be re-synced via "Same as scheduled" button. |
| **Time source** | Tags every day with where its scheduled times came from: `schedule` (from uploaded schedule file), `master` (from master roster), `builtin` (from built-in fallback data), `manual` (user override), `none` (OFF/ADO). |
| **Manual diagram override** | User-entered diagram number replacing the roster-assigned diagram for a specific day. Searches BOTH weekday and weekend schedules to find the diagram. Applies to any day type. |
| **OT** | Overtime. 1.5× first 2 hrs beyond 8; 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Double time, minimum 4 hours (Cl. 136). |
| **KM credit** | Cl. 146.4 credited hours for intercity distance. KMs always come from the schedule file. |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A) — base $49.81842/hr; Sat 1.5×; Sun 2.0×
### 5.2 Overtime (Cl. 140.1) — 1.5× first 2 hrs beyond 8; 2.0× beyond
### 5.3 Public holidays (Cl. 31) — weekday 1.5×; weekend 2.5×
### 5.4 Shift penalties (Sch. 4B / Cl. 134.3) — afternoon $4.84/hr; night $5.69/hr; early $4.84/hr; additional $5.69 flat; not Sat/Sun/PH
### 5.5 KM credit (Cl. 146.4) — 26-band table; auto-filled from schedule; excluded from OT
### 5.6 WOBOD (Cl. 136) — double time, min 4 hrs
### 5.7 Lift-up / Layback (Cl. 131 / Cl. 140.1) — ordinary ≤8 hrs total; OT beyond. **Calculated from the difference between scheduled times and actual times.**
### 5.8 ADO pay — short fortnight = 8 hrs ordinary; long = accruing
### 5.9 Leave categories — SL, CL, AL, PHNW, PHW, BL, JD, PD, LWOP

---

## 6. File Upload Requirements

*(Unchanged from v3.1 — see §6.1–6.9)*

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
*(Unchanged from v3.1)*

### FR-02: Daily Entry (rewritten v3.4)

#### FR-02-A: Per-day display

Each day row in the Daily Entry tab MUST display:

1. **Date and day name** (e.g. "Monday 11 Aug")
2. **Diagram number** — prominently shown, e.g. `3151` (parsed from the master roster's diagram name for that day). Shows `—` for OFF/ADO days.
3. **Diagram name** — the full label as in the roster, e.g. `3151 SMB`
4. **Time source indicator** — a coloured badge showing which source was used for the scheduled times:
   - `✓ Schedule` (green) — times came from uploaded weekday/weekend schedule
   - `ⓘ Master roster` (amber) — schedule didn't have this diagram, fell back to master roster's own time fields
   - `ⓘ Built-in` (amber) — no master roster uploaded, fell back to built-in roster.json
   - `✏ Manual` (purple) — user manually overrode the diagram
   - `—` (grey) — OFF/ADO with no diagram
5. **KM distance** — auto-populated from schedule file's `Distance: NNN.NNN Km` field for the day's diagram number. Editable by user.

#### FR-02-B: Scheduled vs Actual times (new in v3.4)

Each work day row has TWO time-input sections, both always visible:

**Scheduled times (read-only display):**
- Label: "Scheduled start" / "Scheduled end"
- Source: looked up from schedule file using the diagram number; falls back to master roster if not found
- Read-only — cannot be edited by user (but updates if a manual diagram override is applied)
- Shown alongside the time-source indicator

**Actual times (user-editable inputs):**
- Label: "Actual start" / "Actual end"
- Pre-filled with scheduled times on load (so most days require no input)
- User can override at any time to record actual start/end (lift-up, layback, late sign-off)
- A **"Same as scheduled"** button next to the actual-time inputs copies scheduled → actual in one click (used to re-sync if user edited and wants to revert)

The pay calculator uses **actual times** for hours-worked computation. The difference between scheduled and actual drives lift-up/layback computation.

#### FR-02-C: Manual diagram override (updated v3.4)

When a user enters a diagram number (e.g. `3158`, `3651`, `SBY`) in the override input and clicks "Load ↗":

1. The system searches **both** the weekday schedule and the weekend schedule for that diagram number (regardless of the day's day-of-week). This handles weekday diagrams worked on weekends and vice versa.
2. If found in either schedule: scheduled start, scheduled end, KM, and rostered hours are populated from the schedule entry. Time source becomes `manual`.
3. If not found in either schedule: falls back to built-in `ROSTER` data for times. KM = 0.
4. The diagram name in the day row updates to show the new diagram with a `[manual]` suffix and a purple `✏ Manual` badge.
5. Actual times are also populated from scheduled times (user can re-edit).
6. A reset banner appears with a button to revert to the original roster-assigned diagram.

#### FR-02-D: KM auto-population (clarified v3.4)

KMs MUST be auto-populated from the schedule file's `Distance` field:

- **Trigger 1 — On roster load:** For each day, look up the diagram in the schedule and set KM
- **Trigger 2 — On manual diagram override:** Look up the override diagram in BOTH schedules and set KM
- **Trigger 3 — On schedule upload after roster is already loaded:** A `useEffect` runs and re-applies KMs **and scheduled times** to all existing work days that haven't been manually overridden

The KM field remains editable for manual adjustment.

#### FR-02-E: Other daily entry controls (unchanged)
- WOBOD toggle, cross-midnight toggle, leave type selector
- Live pay preview per day

### FR-03: Pay calculation — `POST /api/calculate` — uses **actual** times for worked hours; difference vs scheduled drives lift-up/layback
### FR-04–FR-10: Unchanged from v3.2/3.3

---

## 8. Non-Functional Requirements

*(Unchanged from v3.1)*

---

## 9. Data Model

### 9.1 Day state (frontend) — updated v3.4

```ts
interface DayState {
  date: string;              // YYYY-MM-DD
  dow: number;               // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;              // Full diagram name as displayed: '3151 SMB' | 'OFF' | 'ADO' | '3651 [manual]'
  diagNum: string | null;    // NEW v3.4: parsed 4-digit diagram number, e.g. '3151'; null for OFF/ADO/SBY
  _origDiag?: string;        // Original diagram name before any manual override
  _origDiagNum?: string | null;  // NEW v3.4: original diagNum before override

  // Scheduled times (read-only after load; updated by manual override)
  rStart: string | null;     // Scheduled start HH:MM (label: "Scheduled start")
  rEnd: string | null;       // Scheduled end HH:MM (label: "Scheduled end")
  cm: boolean;
  rHrs: number;              // Scheduled hours

  // Actual times (user-editable; pre-filled from scheduled on load)
  aStart: string;            // Actual start HH:MM
  aEnd: string;              // Actual end HH:MM

  // Source tracking (NEW v3.4)
  timeSource: 'schedule' | 'master' | 'builtin' | 'manual' | 'none';

  // Distance
  km: number;                // KM distance — from schedule's Distance field; editable

  // Other
  wobod: boolean;
  leaveCat: string;
  manualDiag: string | null;
  manualDiagInput: string;
  workedOnOff: boolean;
  isShortFortnight: boolean;
}
```

### 9.2 Backend `DayState` model — updated v3.4

```python
class DayState(BaseModel):
    date: str
    dow: int
    ph: bool = False
    diag: str
    diag_num: Optional[str] = None     # NEW v3.4
    time_source: str = "none"          # NEW v3.4
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
```

### 9.3–9.8 — Unchanged from v3.1

---

## 10. KM Credit Table (Cl. 146.4)
*(Unchanged from v3.1)*

## 11. Roster Lines — Mt Victoria
*(Unchanged from v3.1)*

## 12. API Endpoints
*(Unchanged from v3.1)*

---

## 13. UI Design Specification

### 13.3 Daily Entry tab (rewritten v3.4)

**Header (always visible):**
- Date and day name
- Diagram number badge (e.g. `3151`) — large, prominent
- Diagram name (smaller, secondary)
- Time-source badge (✓ Schedule / ⓘ Master / ⓘ Built-in / ✏ Manual)
- Live pay summary
- Chevron expand/collapse

**Body — Scheduled times block (read-only):**
- Two columns: "Scheduled start" | "Scheduled end"
- Read-only display (greyed out)
- Source label below: "Loaded from weekday schedule (3151)" or similar

**Body — Actual times block (editable):**
- Two columns: "Actual start" | "Actual end"
- `<input type="time">` fields, fully editable
- "↺ Same as scheduled" button — copies scheduled → actual

**Body — Other controls:**
- KMs (editable, auto-filled)
- WOBOD, Cross-midnight selects
- Leave type
- "Override diagram" input + "Load ↗" button
- Reset banner if override active

**Body — Live preview:**
- Pay breakdown table per component

### 13.1, 13.2, 13.4–13.6 — Unchanged

---

## 14. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) | Out of scope |
| Superannuation / tax / net pay | Out of scope |
| Multi-driver use | Out of scope |
| Leave accrual balances | Out of scope |
| Other depots | Out of scope |
| Per-day-of-week diagram variants | First occurrence used |

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
| 2.0 | April 2026 | Full PRD; redesigned UI; leave categories; payslip audit |
| 3.0 | April 2026 | React frontend + FastAPI backend; file upload requirements; PRD-first process rule |
| 3.1 | April 2026 | Master/fortnight/schedule files; swinger line rules; KM auto-fill on load; ZIP format |
| 3.2 | April 2026 | Manual diagram override on all day types |
| 3.3 | April 2026 | KM auto-population triggers (load, override, late schedule upload) |
| 3.4 | April 2026 | (1) Per-day diagram number display. (2) Times sourced from schedule (not master roster); explicit `timeSource` field with badges (✓ Schedule / ⓘ Master / ⓘ Built-in / ✏ Manual). (3) Manual diagram override searches BOTH weekday and weekend schedules. (4) Separated **Scheduled** (read-only) vs **Actual** (editable) time fields with "Same as scheduled" sync button. (5) KM auto-population fixed in all triggers; Trigger 3 also re-applies times from late schedule uploads. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
