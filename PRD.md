# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.8
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

### 6.6 Schedule upload (FR-U3) — weekday or weekend (clarified v3.8)

- Endpoint: `POST /api/parse-schedule`
- Supports two file formats:
  - **ZIP-packaged** (Sydney Trains app export) — manifest.json + per-page text files. Text already comes pre-organised per diagram block.
  - **Real PDF** (e.g. `MTVICDRWD191025_1_weekday.pdf`) — uses pdfplumber for text extraction.
- Weekday vs weekend auto-detected from filename (DRWD = weekday, DRWE = weekend).

#### Two-column page layout (new requirement v3.8)

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

#### Diagram block detection (unchanged from v3.7)

- A diagram block starts with `No. NNNN <day-type>` where `NNNN` is **3 or 4 digits** at line-start
- The next `No. NNNN` at line-start ends the block

#### Label and time format support (unchanged from v3.5/v3.7)

- Labels matched case-insensitively with flexible internal whitespace
- Time formats: 12-hour with am/pm, 12-hour spelled out, 24-hour

#### Per-diagram extraction

- **Sign on** → `sign_on` (scheduled start)
- **Time off duty** → `sign_off` (scheduled end)
- **Total shift** → `r_hrs`
- **Distance** → `km`
- **Cross-midnight** → derived

#### Warnings

- If sign-on or sign-off cannot be extracted for a diagram, MUST emit a warning listing the failed diagram numbers (de-duplicated).

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
| 3.5 | April 2026 | Schedule parser: Time off duty = scheduled end. Multi-format times |
| 3.6 | April 2026 | Lift-up/layback in frontend preview; RDO leave; leave handling in preview |
| 3.7 | April 2026 | Schedule diagram-block detection hardened (3-4 digit, line-start) |
| 3.8 | April 2026 | **Critical bug fix:** Schedule PDFs are a TWO-COLUMN layout. Default pdfplumber `extract_text()` interleaved both columns line-by-line, causing the parser to (a) miss ~half the diagrams entirely (3155, 3158, 3160, 3162, 3164, 3168 etc.) and (b) pull `Time off duty` from the wrong column (e.g. reporting 10:32 instead of 11:21 for diagram 3154 — picking up 3155's value because the columns were jumbled). Now crops each PDF page at `page.width/2` into LEFT and RIGHT halves, extracts each separately, and concatenates with newlines — producing clean per-column text that the existing regex logic can parse correctly. **Verified locally against the user's actual MTVICDRWD191025 and MTVICDRWE191025 PDFs: 18/18 weekday diagrams extracted, 14/14 weekend diagrams extracted, ZERO failed extractions, 3154 correctly returns Sign on 01:51 and Time off duty 11:21.** |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
