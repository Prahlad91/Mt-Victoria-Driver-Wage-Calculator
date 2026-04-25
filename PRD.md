# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.5
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

Mt Victoria intercity shifts regularly accumulate 160–400+ km. Times and KMs must come from the schedule file, not the master roster — the master roster shows the assignment (which diagram on which day), the schedule file is the authoritative source for sign-on, sign-off and distance per diagram.

---

## 3. Users

**Mt Victoria intercity train driver** — uses the app on phone or desktop; not a developer.

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | 4-digit identifier for a shift (e.g. `3151`, `3651`). |
| **Schedule file** | Per-diagram file (weekday or weekend). Authoritative source for scheduled times and distance. |
| **Sign on** | The "Sign on" line in the schedule block. Authoritative source for **scheduled start time**. |
| **Time off duty** | The "Time off duty" line in the schedule block. Authoritative source for **scheduled end time**. *(Made explicit in v3.5)* |
| **Distance** | The `Distance: NNN.NNN Km` line in the schedule block. Authoritative source for **KMs**. |
| **Scheduled times** | Sign-on and sign-off for a day — looked up from the schedule file using the day's diagram number. |
| **Actual times** | User-entered start and end times reflecting what actually happened. |
| **Time source** | Tags every day with where its scheduled times came from: `schedule`, `master`, `builtin`, `manual`, or `none`. |
| **Manual diagram override** | User-entered diagram number replacing the roster-assigned diagram for a specific day. Searches BOTH weekday and weekend schedules. |
| **OT** | Overtime. 1.5× first 2 hrs beyond 8; 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Double time, minimum 4 hours (Cl. 136). |
| **KM credit** | Cl. 146.4 credited hours for intercity distance. |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A) — base $49.81842/hr; Sat 1.5×; Sun 2.0×
### 5.2 Overtime (Cl. 140.1) — 1.5× first 2 hrs beyond 8; 2.0× beyond
### 5.3 Public holidays (Cl. 31) — weekday 1.5×; weekend 2.5×
### 5.4 Shift penalties (Sch. 4B / Cl. 134.3) — afternoon $4.84/hr; night $5.69/hr; early $4.84/hr; additional $5.69 flat; not Sat/Sun/PH
### 5.5 KM credit (Cl. 146.4) — 26-band table; auto-filled from schedule's Distance field; excluded from OT
### 5.6 WOBOD (Cl. 136) — double time, min 4 hrs
### 5.7 Lift-up / Layback (Cl. 131 / Cl. 140.1) — calculated from difference between scheduled and actual times
### 5.8 ADO pay — short fortnight = 8 hrs ordinary; long = accruing
### 5.9 Leave categories — SL, CL, AL, PHNW, PHW, BL, JD, PD, LWOP

---

## 6. File Upload Requirements

### 6.1–6.5 — Unchanged from v3.1

### 6.6 Schedule upload (FR-U3) — weekday or weekend (clarified v3.5)

- Endpoint: `POST /api/parse-schedule`
- ZIP-based file (or PDF); weekday vs weekend auto-detected from filename (DRWD = weekday, DRWE = weekend)
- Each diagram block in the schedule starts with `No. NNNN <day-type>` and ends before the next `No. NNNN`
- Per diagram, the parser extracts:
  - **Sign on** — from the line `Sign on HH:MMa <location>` → becomes `sign_on` (scheduled start)
  - **Time off duty** — from the line `Time off duty : HH:MMa` → becomes `sign_off` (**scheduled end**)
  - **Total shift** — from the line `Total shift : H:MM` → becomes `r_hrs`
  - **Distance** — from the line `Distance: NNN.NNN Km` → becomes `km`
  - **Cross-midnight** — derived from sign-off being earlier than sign-on
- The parser MUST handle multiple time formats:
  - 12-hour with am/pm marker: `9:18a`, `12:51a`, `5:30 pm`, `12:00PM`
  - 12-hour with am/pm spelled out: `9:18 am`, `5:30 PM`
  - 24-hour: `09:18`, `17:30`
  - Optional spaces around the colon, optional space before/after the am/pm marker
- If the parser cannot extract sign-on or sign-off for a diagram, it MUST emit a warning in the response listing the diagram number and the field that failed, so the user can diagnose the issue

### 6.7–6.9 — Unchanged from v3.1

---

## 7. Functional Requirements

### FR-01: Fortnight Setup — unchanged
### FR-02: Daily Entry — unchanged from v3.4
### FR-03–FR-10: Unchanged

---

## 8. Non-Functional Requirements
*(Unchanged from v3.1)*

## 9. Data Model
*(Unchanged from v3.4)*

## 10. KM Credit Table (Cl. 146.4)
*(Unchanged from v3.1)*

## 11. Roster Lines — Mt Victoria
*(Unchanged from v3.1)*

## 12. API Endpoints
*(Unchanged from v3.1)*

## 13. UI Design Specification
*(Unchanged from v3.4)*

## 14. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) | Out of scope |
| Superannuation / tax / net pay | Out of scope |
| Multi-driver use | Out of scope |
| Leave accrual balances | Out of scope |
| Other depots | Out of scope |
| Per-day-of-week diagram variants | First occurrence used |

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
| 1.0 | March 2026 | Initial single-file calculator |
| 1.1 | March 2026 | Lift-up/layback/buildup, ADO pay, manual diagram entry |
| 2.0 | April 2026 | Full PRD; redesigned UI; leave categories; payslip audit |
| 3.0 | April 2026 | React frontend + FastAPI backend |
| 3.1 | April 2026 | Master/fortnight/schedule files; swinger lines; KM auto-fill |
| 3.2 | April 2026 | Manual diagram override on all day types |
| 3.3 | April 2026 | KM auto-population triggers (load, override, late schedule upload) |
| 3.4 | April 2026 | Diagram # display, time source tracking, scheduled vs actual times, both-schedule manual lookup |
| 3.5 | April 2026 | Schedule parser clarification: **"Time off duty" is the explicit authoritative source for scheduled end time**; **"Sign on" for scheduled start time**; **"Distance" for KMs**. Parser hardened to handle 12-hour (am/pm), 24-hour, and spaced time formats. Warnings emitted when a field cannot be extracted, listing the diagram number. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
