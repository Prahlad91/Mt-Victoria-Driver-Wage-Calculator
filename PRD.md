# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.3  
**Date:** April 2026  
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)  
**Status:** Active — governs all development on this repository

> **Process rule:** Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a **full-stack web application** built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its purpose is to allow drivers to calculate their exact gross fortnightly pay and independently verify every line on their payslip.

---

## 2. Background and Problem Statement

### 2.1 The payslip verification problem

Sydney Trains drivers receive fortnightly payslips containing 10–25 line items. The calculation rules are complex (OT tiers, shift penalties, KM credits, ADO, WOBOD, lift-up/layback). Without a tool, underpayments go unchallenged.

### 2.2 The 2025 EA context

| Item | Detail |
|------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate (Sch. 4A) | $49.81842/hr (from 1 July 2025) |

### 2.3 Depot context

Mt Victoria is an intercity depot on the Blue Mountains line. Intercity shifts regularly accumulate 160–400+ km, making the Cl. 146.4 KM credit system a substantial part of pay. KM values must be accurate for correct pay calculation.

---

## 3. Users

### Primary user
**Mt Victoria intercity train driver** — uses app on phone or desktop; not a developer.

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | Unique identifier for a specific shift. Defines sign-on, sign-off, train services, and KM distance. |
| **KM auto-fill** | Automatic population of the KM field for each work day from the uploaded weekday or weekend schedule file. Triggered on roster load AND on manual diagram override. |
| **Manual diagram override** | User-entered diagram number replacing the roster-assigned diagram for a specific day. Available on any day type. |
| **Master Roster** | Annual roster document for lines 1–22. |
| **Fortnight Roster** | Per-fortnight roster document for swinger lines 201–210. |
| **Schedule file** | Weekday or weekend schedule document with per-diagram timing and KM data. |
| **Swinger line** | Roster lines 201–210. |
| **OT** | Overtime. 1.5× first 2 hrs beyond 8; 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Double time, minimum 4 hours (Cl. 136). |
| **KM credit** | Cl. 146.4 credited hours for intercity distance. Excluded from OT threshold. |
| **Roster source indicator** | UI badge: "Master roster", "Fortnight roster", or "Built-in data". |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A) — base $49.81842/hr; Sat 1.5×; Sun 2.0×
### 5.2 Overtime (Cl. 140.1) — 1.5× first 2 hrs beyond 8; 2.0× beyond; Sat OT 2.0×
### 5.3 Public holidays (Cl. 31) — weekday 1.5×; weekend 2.5×; not worked = 8 hrs ordinary
### 5.4 Shift penalties (Sch. 4B / Cl. 134.3) — afternoon $4.84/hr; night $5.69/hr; early $4.84/hr; additional $5.69/shift flat; not payable Sat/Sun/PH
### 5.5 KM credit (Cl. 146.4) — 26-band table; **KMs auto-filled from schedule on load and on diagram override**; excluded from OT
### 5.6 WOBOD (Cl. 136) — double time, min 4 hrs
### 5.7 Lift-up / Layback (Cl. 131 / Cl. 140.1) — ordinary ≤8 hrs total; OT beyond
### 5.8 ADO pay — short fortnight = 8 hrs ordinary; long = accruing
### 5.9 Leave categories — SL, CL, AL, PHNW, PHW, BL, JD, PD, LWOP

---

## 6. File Upload Requirements

*(Unchanged from v3.1 — see §6.1–6.9)*

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
*(Unchanged from v3.1)*

### FR-02: Daily Entry (updated v3.3)

#### FR-02-KM: KM auto-population from schedule (new in v3.3)

KM values must be automatically populated from the uploaded schedule wherever possible, so the user never has to look up or manually enter KMs for standard diagrams.

**Trigger 1 — On roster load:**
When the user clicks "Load roster line", the system iterates all 14 days. For each work day (not OFF/ADO), the diagram number is looked up in the uploaded weekday or weekend schedule (based on day-of-week). If found, the `km` field is set from `DiagramInfo.km`. This happens in `FortnightContext.loadLine()`.

**Trigger 2 — On manual diagram override:**
When the user enters a diagram number and clicks "Load ↗", the system looks up that diagram in the uploaded schedule and sets the `km` field along with sign-on, sign-off, and rostered hours. This happens in `FortnightContext.applyManualDiag()`.

**Trigger 3 — On schedule upload after roster is already loaded:**
When the user uploads a schedule file *after* a roster line has already been loaded (i.e., days[] is not empty), the system re-applies KM values to all existing work days by re-running the schedule lookup over the current days array.

**Display:**
- The KM field in each day row is editable — user can always override an auto-filled value
- The header of the Daily Entry tab shows "✓ KMs auto-filled from schedule" when at least one schedule is uploaded
- KM field shows `0` for SBY (standby) diagrams and OFF/ADO days

**Lookup logic:**
- Extract the diagram number from the diagram name (e.g. `"3158 RK"` → `"3158"`, `"SBY"` → `"SBY"`)
- For day-of-week 1–5 (Mon–Fri): look up weekday schedule; for 0 (Sun) or 6 (Sat): look up weekend schedule
- If diagram not found in schedule (e.g. SBY, or schedule not uploaded): km = 0, no error shown
- KM value is stored as a float (e.g. `254.109`)

#### FR-02-DIAG: Manual diagram override (unchanged from v3.2)

Available on all day types. On "Load ↗", triggers KM auto-fill (Trigger 2 above) in addition to time pre-fill.

#### Other daily entry controls (unchanged from v3.2)
- Actual start / end time inputs
- KMs field (auto-filled or manually editable)
- WOBOD, cross-midnight, Use rostered, leave type

### FR-03–FR-10: Unchanged

---

## 8. Non-Functional Requirements

*(Unchanged from v3.1)*

---

## 9. Data Model

### 9.1 Day state (frontend) — unchanged from v3.2

```ts
interface DayState {
  // ...
  km: number;  // KM distance — auto-filled from schedule (Triggers 1/2/3) or manually set
  // ...
}
```

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

### 13.2 Setup tab — unchanged from v3.1
### 13.3 Daily Entry tab (updated v3.3)

- Toolbar shows "✓ KMs auto-filled" badge when weekday or weekend schedule is uploaded
- Each work day row: KM field pre-populated from schedule on load; editable by user
- Manual diagram override: also auto-fills KM from schedule when diagram is found

### 13.1, 13.4–13.6 — Unchanged

---

## 14. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) | Out of scope |
| Superannuation / tax / net pay | Out of scope |
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
| 3.1 | April 2026 | Roster architecture: master/fortnight/schedule files; swinger line rules; KM auto-fill on load; ZIP format |
| 3.2 | April 2026 | Manual diagram override on all day types; purple badge; reset banner on all overridden days |
| 3.3 | April 2026 | KM auto-population from schedule: Trigger 1 (roster load), Trigger 2 (diagram override), Trigger 3 (schedule uploaded after roster loaded). KM field editable. "✓ KMs auto-filled" badge in Daily Entry toolbar. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
