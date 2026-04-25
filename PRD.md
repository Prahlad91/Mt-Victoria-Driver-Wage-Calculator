# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.7
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

Drivers receive payslips with 10–25 line items across complex pay codes. Without a tool, underpayments go unchallenged.

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

*(Unchanged from v3.6 — see prior version for full glossary)*

---

## 5. EA 2025 Rules Applied

*(Unchanged from v3.6)*

---

## 6. File Upload Requirements

### 6.1–6.5 — Unchanged from v3.1

### 6.6 Schedule upload (FR-U3) — weekday or weekend (clarified v3.7)

- Endpoint: `POST /api/parse-schedule`
- ZIP-based file (or PDF); weekday vs weekend auto-detected from filename
- **Diagram block detection (hardened v3.7):**
  - A diagram block is identified by the pattern `No. NNNN <day-type>` where `NNNN` is a **3-or-4-digit** diagram number AND the pattern occurs **at the start of a line** (after a newline). Earlier versions matched any `\d+` after `No.`, which falsely matched text like "No. 2 of 5 cars" or page numbers, causing real diagram blocks to be truncated and their `Sign on` / `Time off duty` extraction to fail.
  - The next "No. NNNN" pattern at line-start marks the end of the current block.
- **Label matching is flexible (clarified v3.7):**
  - Labels `Sign on` and `Time off duty` are matched case-insensitively
  - Internal whitespace within the label is flexible (handles `Sign on`, `Signon`, `Sign-on`, `Sign  on`)
  - Hyphens between words are tolerated
- Per diagram, the parser extracts:
  - **Sign on** → `sign_on` (scheduled start)
  - **Time off duty** → `sign_off` (scheduled end)
  - **Total shift** → `r_hrs`
  - **Distance** → `km`
  - **Cross-midnight** → derived
- The parser MUST handle multiple time formats:
  - 12-hour with am/pm marker: `9:18a`, `12:51a`, `5:30 pm`, `12:00PM`
  - 12-hour with am/pm spelled out: `9:18 am`, `5:30 PM`
  - 24-hour: `09:18`, `17:30`
  - Optional spaces around the colon, optional space before/after the am/pm marker
- If the parser cannot extract sign-on or sign-off for a diagram, it MUST emit a warning in the response listing the diagram number and the field that failed

### 6.7–6.9 — Unchanged from v3.1

---

## 7. Functional Requirements
*(Unchanged from v3.6)*

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
| 3.5 | April 2026 | Schedule parser clarification: Time off duty = scheduled end. Multi-format times |
| 3.6 | April 2026 | Lift-up/layback in frontend preview; RDO leave; leave handling in preview |
| 3.7 | April 2026 | **Bug fix:** Schedule diagram-block detection hardened — requires 3-4 digit numbers and line-start anchoring (previously `\d+` matched arbitrary text like "No. 2 of 5", which truncated real blocks and caused spurious extraction failures for valid diagrams like 3651, 3876). Label matching is now case-insensitive and tolerates internal whitespace/hyphen variations (`Sign on`, `Signon`, `Sign-on`). |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
