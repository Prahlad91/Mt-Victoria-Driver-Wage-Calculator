# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.6
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

Mt Victoria intercity shifts regularly accumulate 160–400+ km. Times and KMs come from the schedule file, not the master roster.

---

## 3. Users

**Mt Victoria intercity train driver** — uses the app on phone or desktop; not a developer.

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | 4-digit identifier for a shift (e.g. `3151`, `3651`). |
| **Schedule file** | Per-diagram file (weekday or weekend). Authoritative source for scheduled times and distance. |
| **Sign on** | "Sign on" line in schedule block. Scheduled start time. |
| **Time off duty** | "Time off duty" line in schedule block. Scheduled end time. |
| **Distance** | "Distance: NNN.NNN Km" line in schedule block. Source for KMs. |
| **Scheduled times** | Sign-on and sign-off for a day, looked up from the schedule file. |
| **Actual times** | User-entered start and end times reflecting what actually happened. |
| **Lift-up / Buildup** | Driver signs on **before** scheduled start. Hours between actual sign-on and scheduled sign-on. Paid at ordinary rate within the 8-hr daily limit and at OT rates beyond. |
| **Layback / Extend** | Driver signs off **after** scheduled end. Hours between scheduled sign-off and actual sign-off. Paid as per lift-up. |
| **Time source** | Tags every day with where its scheduled times came from: `schedule`, `master`, `builtin`, `manual`, or `none`. |
| **Manual diagram override** | User-entered diagram number replacing the roster-assigned diagram for a specific day. |
| **OT** | Overtime. 1.5× first 2 hrs beyond 8; 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Double time, minimum 4 hours (Cl. 136). |
| **RDO** | Roster Day Off. A scheduled rest day in the roster pattern. When taken as a leave entry, treated as **unpaid** — same pay treatment as LWOP. *(Added v3.6.)* |
| **KM credit** | Cl. 146.4 credited hours for intercity distance. |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A) — base $49.81842/hr; Sat 1.5×; Sun 2.0×
### 5.2 Overtime (Cl. 140.1) — 1.5× first 2 hrs beyond 8; 2.0× beyond
### 5.3 Public holidays (Cl. 31) — weekday 1.5×; weekend 2.5×
### 5.4 Shift penalties (Sch. 4B / Cl. 134.3) — afternoon $4.84/hr; night $5.69/hr; early $4.84/hr; additional $5.69 flat; not Sat/Sun/PH
### 5.5 KM credit (Cl. 146.4) — 26-band table; auto-filled from schedule's Distance field; excluded from OT
### 5.6 WOBOD (Cl. 136) — double time, min 4 hrs

### 5.7 Lift-up / Layback (Cl. 131 / Cl. 140.1) — clarified v3.6

Lift-up (driver started before scheduled start) and Layback (driver finished after scheduled end) are computed as the difference between the day's **scheduled** times and the **actual** times entered by the user.

**Lift-up gap** = scheduled start − actual start (only when actual start < scheduled start)
**Layback gap** = actual end − scheduled end (only when actual end > scheduled end)

For each gap, the calculator splits the hours into:
- **Ordinary-rate hours** — the portion of the gap that fits within the 8-hr daily ordinary limit (i.e. up to `max(0, 8 − (actual_hrs − gap))`)
- **OT-tier-1 hours** — first 2 hours beyond the 8-hr limit, paid at 1.5× (or Sat/Sun/PH multiplier)
- **OT-tier-2 hours** — beyond 2 OT hours, paid at 2.0× (or Sat/Sun/PH multiplier)

These components MUST appear as separate line items in both the **per-day live preview** and the **server-side full calculation**. They MUST be labelled "Lift-up / buildup" or "Layback / extend" and reference Cl. 131 / Cl. 140.1.

The frontend live preview (`calcPreview.ts`) and the backend calculator (`calculator.py`) MUST produce identical lift-up and layback components for the same input. *(Bug fix in v3.6: previously the frontend preview omitted lift-up/layback entirely, so users only saw ordinary time and shift penalty.)*

### 5.8 ADO pay — short fortnight = 8 hrs ordinary; long = accruing
### 5.9 Leave categories (updated v3.6)

| Code | Name | EA ref | Pay basis |
|------|------|--------|-----------|
| SL | Sick leave | Cl. 30.4 | Rostered hrs at ordinary rate |
| CL | Carer's leave | Cl. 30.7(b)(ix) | Rostered hrs at base rate |
| AL | Annual leave | Cl. 30.1/30.2 | 8 hrs + 20% loading (shiftworker) |
| PHNW | PH not worked | Cl. 31.7 | 8 hrs ordinary |
| PHW | PH worked | Cl. 31.5 | 150% loading + additional day |
| BL | Bereavement leave | Cl. 30.8(k)(iv) | Rostered hrs at base rate |
| JD | Jury duty | Cl. 30.8(g) | Rostered hrs ordinary |
| PD | Picnic day | Cl. 32.1 | 8 hrs ordinary |
| **RDO** | **Roster day off** *(new v3.6)* | **— (rostering)** | **$0 — unpaid (treat as regular RDO)** |
| LWOP | Leave without pay | — | $0 |

---

## 6. File Upload Requirements

*(Unchanged from v3.5)*

---

## 7. Functional Requirements

### FR-01: Fortnight Setup — unchanged
### FR-02: Daily Entry — unchanged from v3.4
### FR-03: Pay calculation — unchanged
### FR-04–FR-10: Unchanged

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
| 3.3 | April 2026 | KM auto-population triggers |
| 3.4 | April 2026 | Diagram # display, time source tracking, scheduled vs actual times |
| 3.5 | April 2026 | Schedule parser clarification: Time off duty = scheduled end. Parser hardened for 12/24-hour formats |
| 3.6 | April 2026 | (1) **Bug fix:** Frontend live preview now computes lift-up/layback components, matching the backend calculator. Previously the per-day preview omitted these entirely so the user only saw ordinary time + shift penalty. (2) **Added RDO (Roster Day Off) as a leave category** — unpaid, treated as regular RDO. (3) Frontend preview also now handles all leave types (previously only WOBOD/PH/Sat/Sun/weekday were rendered in preview). |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
