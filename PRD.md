# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.9
**Date:** April 2026
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)
**Status:** Active — governs all development on this repository

> **Process rules (updated v3.9):**
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
- WOBOD (working on a book-off day) is double time with a 4-hour minimum (Cl. 136)

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
- Roster lines are fortnightly repeating patterns; lines 1–22 are permanent/fixed, lines 201–210 are standby/swinger lines whose diagram assignments change every fortnight
- The ADO system (19-day month) alternates short fortnights (ADO paid out) and long fortnights (ADO accruing)
- Drivers frequently work shift swaps — taking a different diagram than originally rostered — on **any day of the fortnight**, including regular weekdays, Saturdays, Sundays, and public holidays. The ability to override the rostered diagram for any day is therefore a core operational need.
- **Times and KMs come from the schedule file, not the master roster** — the master roster shows the assignment (which diagram on which day); the schedule file is the authoritative source for sign-on, sign-off and distance per diagram.

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
| **Fortnight Roster** | Per-fortnight roster document for swinger lines 201–210. Published every fortnight. Same ZIP/PDF format as master roster. Defines which diagram each swinger line works that fortnight. |
| **Schedule file** | Per-diagram file (weekday or weekend). Authoritative source for sign-on, sign-off, total hours, and KM distance per diagram number. |
| **Sign on** | The "Sign on" line in the schedule block (e.g. `Sign on 1:51a MOUNT VICTORIA`). Authoritative source for **scheduled start time**. |
| **Time off duty** | The "Time off duty" line in the schedule block (e.g. `Time off duty : 11:21a`). Authoritative source for **scheduled end time**. |
| **Distance** | The `Distance: NNN.NNN Km` line in the schedule block. Authoritative source for **KMs**. |
| **Scheduled times** | Sign-on and sign-off for a day — looked up from the schedule file using the day's diagram number. Pre-populated on roster load; never changes after that unless the user applies a manual diagram override. |
| **Actual times** | User-entered start and end times reflecting what actually happened. May differ from scheduled (lift-up, layback, late sign-off). Defaults to scheduled times on load; can be changed by user; can be re-synced via "Same as scheduled" button. |
| **Time source** | Tags every day with where its scheduled times came from: `schedule` (from uploaded schedule file), `master` (from master roster), `builtin` (from built-in fallback data), `manual` (user override), `none` (OFF/ADO). |
| **Manual diagram override** | User-entered diagram number that replaces the roster-assigned diagram for a specific day. Searches BOTH weekday and weekend schedules to find the diagram. Applies to **any day type**: regular workday, Saturday, Sunday, public holiday, OFF, or ADO. |
| **Swinger line** | Roster lines 201–210. Standby/flexible positions whose diagram assignments change each fortnight (sourced from the Fortnight Roster). |
| **OT** | Overtime. Hours beyond 8 in a single day. 1.5× first 2 hrs, 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Working on a rostered day off. Double time, minimum 4 hours (Cl. 136). |
| **Lift-up / Buildup** | Driver signs on **before** scheduled start. Hours between actual sign-on and scheduled sign-on. Paid at ordinary rate within the 8-hr daily limit and at OT rates beyond. |
| **Layback / Extend** | Driver signs off **after** scheduled end. Hours between scheduled sign-off and actual sign-off. Paid as per lift-up. |
| **KM credit** | Under Cl. 146.4, intercity drivers doing ≥161 km are credited more hours than actually worked (26-band table). Credited excess paid at ordinary rate, excluded from OT. KMs always come from the schedule file. |
| **Shift penalty** | Per-hour loading for afternoon, night, or early morning shifts. EA rounding: <30 min disregarded, 30–59 min = 1 hr. Not payable Sat/Sun/PH. |
| **Un-associated duties** | Duties not directly associated with train operations (road review, pilot prep, etc.) paid additionally for ≥161 km shifts (Cl. 146.4(d)). |
| **RDO** | Roster Day Off. A scheduled rest day in the roster pattern. When taken as a leave entry, treated as **unpaid** — same pay treatment as LWOP. |
| **Roster source indicator** | UI badge showing which data source was used: "Master roster", "Fortnight roster", or "Built-in data". |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A)
- Base rate: $49.81842/hr (configurable)
- First 8 hours of any shift at ordinary rate
- Weekend: Saturday 1.5×, Sunday 2.0×

### 5.2 Overtime (Cl. 140.1)
- Hours 1–2 beyond 8-hr daily limit: 1.5×
- Hours beyond 2 hrs OT: 2.0×
- Saturday OT >8 hrs: 2.0×
- Fortnightly threshold: 72h (short) or 76h (long)

### 5.3 Public holidays (Cl. 31)
- Weekday PH worked: 1.5×
- Weekend PH worked: 2.5×
- PH not worked: 8 hrs ordinary pay (Cl. 31.7)
- Shift penalties not payable on PH (Cl. 134.3(a))

### 5.4 Shift penalties (Sch. 4B / Cl. 134.3)
- Item 6 (Afternoon): $4.84/hr — commences before AND concludes after 18:00
- Item 7 (Night): $5.69/hr — commences at or between 18:00 and 03:59
- Item 8 (Early morning): $4.84/hr — commences at or between 04:00 and 05:30
- Item 9 (Additional loading): $5.69 flat/shift — sign on/off 01:01–03:59 Mon–Fri only
- Rounding (Cl. 134.3(b)): <30 min disregarded; 30–59 min = 1 hr
- Not payable Sat/Sun/PH (Cl. 134.3(a))

### 5.5 KM credit system (Cl. 146.4)
26-band table from <161 km (actual time) up to 644+ km (+0.5 hr per 16 km). See Section 10.
- Credited excess hours paid at ordinary rate, NOT in OT computation (Cl. 146.4(b))
- KM distance auto-filled from uploaded schedule file's `Distance` field
- Cl. 157.1: greater-of rule (scheduled shift time vs km-credited hrs + un-associated time)

### 5.6 WOBOD (Cl. 136)
- Double time on all hours, minimum 4 hours paid

### 5.7 Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1)

Lift-up (driver started before scheduled start) and Layback (driver finished after scheduled end) are computed as the difference between the day's **scheduled** times and the **actual** times entered by the user.

**Lift-up gap** = scheduled start − actual start (only when actual start < scheduled start)
**Layback gap** = actual end − scheduled end (only when actual end > scheduled end)

For each gap, the calculator splits the hours into:
- **Ordinary-rate hours** — the portion of the gap that fits within the 8-hr daily ordinary limit (i.e. up to `max(0, 8 − (actual_hrs − gap))`)
- **OT-tier-1 hours** — first 2 hours beyond the 8-hr limit, paid at 1.5× (or Sat/Sun/PH multiplier)
- **OT-tier-2 hours** — beyond 2 OT hours, paid at 2.0× (or Sat/Sun/PH multiplier)

These components MUST appear as separate line items in both the **per-day live preview** and the **server-side full calculation**. They MUST be labelled "Lift-up / buildup" or "Layback / extend" and reference Cl. 131 / Cl. 140.1.

The frontend live preview (`calcPreview.ts`) and the backend calculator (`calculator.py`) MUST produce identical lift-up and layback components for the same input.

### 5.8 ADO pay
- Short fortnight: ADO = 8 hrs ordinary rate paid out
- Long fortnight: ADO accruing, no payout

### 5.9 Leave categories

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
| RDO | Roster day off | — (rostering) | $0 — unpaid (treat as regular RDO) |
| LWOP | Leave without pay | — | $0 |

---

## 6. File Upload Requirements

### 6.1 Roster and schedule file architecture

Three distinct roster/schedule documents exist, all in the same ZIP-based format (manifest.json + text layer + image layer per page) — and all also accepted as real PDFs:

| File | Update frequency | Purpose | Lines served |
|------|-----------------|---------|--------------|
| **Master Roster** | Annually | Maps lines 1–22 to diagram assignments for the 14-day window | 1–22 (and 201–210 as template) |
| **Fortnight Roster** | Each fortnight | Maps swinger lines 201–210 to their actual diagram assignments for that fortnight | 201–210 |
| **Weekday Schedule** | Annually (or as needed) | Per-diagram detail for weekday diagrams (3151–3168): sign-on, sign-off, KMs, total hrs | All weekday diagrams |
| **Weekend Schedule** | Annually (or as needed) | Per-diagram detail for weekend diagrams (3651–3664): sign-on, sign-off, KMs, total hrs | All weekend diagrams |

### 6.2 Roster lookup rules (FR-R1)

**Lines 1–22 (permanent lines):**
1. Look up master roster → get diagram name for each of the 14 days
2. Look up weekday or weekend schedule (based on day-of-week) → get sign-on, sign-off, KMs
3. Display roster source badge: **"✓ Master roster"**
4. Fallback: if master roster not uploaded, use built-in `roster.json` data

**Lines 201–210 (swinger lines):**
1. Look up **fortnight roster** → get diagram name for each of the 14 days
2. Look up schedule file → get sign-on, sign-off, KMs
3. Display roster source badge: **"✓ Fortnight roster"**
4. Fallback order: fortnight roster → master roster → built-in data
5. Always indicate which source was used; swinger line notice shown when entering 201+ line

### 6.3 KM auto-fill (FR-R2)

When a weekday or weekend schedule is uploaded:
- Each diagram's KM distance is extracted (`Distance: NNN.NNN Km` from schedule text)
- When a roster line is loaded, KMs are automatically populated for each work day
- "✓ KMs auto-filled from schedule" indicator shown in the Setup tab

### 6.4 Master Roster upload (FR-U1)
- Endpoint: `POST /api/parse-master-roster`
- File format: ZIP archive (disguised as .pdf) containing `manifest.json` + `.txt` + `.jpeg` per page, OR real PDF
- Parser extracts for each roster line (1–22, 201–210): per-day diagram name, sign-on, sign-off, cross-midnight flag, rostered hours, fatigue units
- Uploaded once per year; replaces built-in roster data for lines 1–22

### 6.5 Fortnight Roster upload (FR-U2)
- Endpoint: `POST /api/parse-fortnight-roster`
- Same ZIP/PDF format as master roster
- Used exclusively for swinger lines 201–210
- Uploaded at the start of each fortnight

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

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
- User selects roster line number (1–22 or 201–210)
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
  - Swinger line notice (201+) showing which roster will be used
  - Lines 1–22 notice showing master roster will be used
  - Roster source badge after loading
  - KMs auto-fill indicator if schedule is uploaded
- Legacy: Payslip upload card + legacy fortnight roster PDF card

### FR-02: Daily Entry

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

#### FR-02-B: Scheduled vs Actual times

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

The KM field remains editable for manual adjustment.

#### FR-02-E: Other daily entry controls
- Actual start / end time inputs (covered in FR-02-B)
- KMs field (auto-filled from schedule or manual)
- WOBOD toggle
- Cross-midnight toggle
- "Use rostered" button (copies rostered times to actual fields)
- Leave type selector
- Live pay preview per day (must include lift-up/layback components per §5.7)

### FR-03: Pay calculation
- `POST /api/calculate` — server-side EA 2025 engine (authoritative)
- Client-side preview (`calcPreview.ts`) for immediate feedback while typing — must produce identical output to backend for the same input
- Uses **actual** times for worked hours; difference vs scheduled drives lift-up/layback
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
- Auto-detected from actual vs scheduled times
- Ordinary/OT split at 8-hr boundary
- Components shown in BOTH live preview and server calculation (per §5.7)

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

### NFR-05: Accuracy
- All amounts rounded to 2 decimal places
- EA rounding rules applied exactly (Cl. 134.3(b))
- KM credit table exact per EA 2025

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

  // Scheduled times (read-only after load; updated by manual override)
  rStart: string | null;     // Scheduled start HH:MM (label: "Scheduled start")
  rEnd: string | null;       // Scheduled end HH:MM (label: "Scheduled end")
  cm: boolean;
  rHrs: number;              // Scheduled hours

  // Actual times (user-editable; pre-filled from scheduled on load)
  aStart: string;            // Actual start HH:MM
  aEnd: string;              // Actual end HH:MM

  // Source tracking
  timeSource: 'schedule' | 'master' | 'builtin' | 'manual' | 'none';

  // Distance
  km: number;                // KM distance — from schedule's Distance field; editable

  // Other
  wobod: boolean;
  leaveCat: string;          // 'none' | 'SL' | 'CL' | 'AL' | 'PHNW' | 'PHW' | 'BL' | 'JD' | 'PD' | 'RDO' | 'LWOP'
  manualDiag: string | null; // Set when user has applied a manual diagram override
  manualDiagInput: string;   // Current value of the diagram input field
  workedOnOff: boolean;      // True when user chose "Worked (no diagram)" on an OFF/ADO day
  isShortFortnight: boolean;
}
```

**Key rule:** `_origDiag` is set whenever a manual override is applied (whether the day was originally a workday, Saturday, Sunday, PH, OFF, or ADO). Resetting always restores to `_origDiag`.

### 9.2 Backend `DayState` model

```python
class DayState(BaseModel):
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

    model_config = ConfigDict(extra='ignore')
```

### 9.3 API request — `POST /api/calculate`
```json
{
  "fortnight_start": "2025-08-10",
  "roster_line": 7,
  "public_holidays": ["2025-08-11"],
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
    "201": [
      { "diag": "OFF",       "r_start": null,    "r_end": null,    "cm": false, "r_hrs": 0.0 },
      { "diag": "SBY",       "r_start": "05:00", "r_end": "13:00", "cm": false, "r_hrs": 8.0 }
    ]
  },
  "warnings": []
}
```

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

### 11.2 Swinger lines (201–210)
- Flexible standby positions
- **Diagram assignments change every fortnight** (sourced from fortnight roster)
- Data source priority: **uploaded fortnight roster → uploaded master roster → built-in roster.json**
- Always show swinger line notice in Setup tab when line 201+ is entered

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
| `POST` | `/api/export/pdf` | Export results as PDF |
| `POST` | `/api/export/csv` | Export results as CSV |

---

## 13. UI Design Specification

### 13.1 Layout
- React SPA with 5 tabs: **Setup**, **Daily Entry**, **Results**, **Rates & Codes**, **KM Table**
- Legacy `index.html` served at `/legacy` as fallback
- Responsive: single-column mobile (<768px), multi-column desktop

### 13.2 Setup tab

**Step 1 — Upload rosters & schedules** (do before loading a line)
- Upload card: **Master Roster** (annual, lines 1–22) — `Mt_Victoria_Drivers_Master.pdf`
- Upload card: **Fortnight Roster** (swinger lines 201–210) — upload each fortnight
- Upload card: **Weekday Schedule** — diagrams 3151–3168, auto-fills KMs + times
- Upload card: **Weekend Schedule** — diagrams 3651–3664, auto-fills KMs + times

**Step 2 — Load roster line**
- Roster line input (1–22 or 201–210)
- Swinger line info banner (when 201+ entered): shows which roster will be used
- Lines 1–22 info banner: shows master roster will be used
- Fortnight start date, public holidays, payslip total
- **Load roster line** button
- After loading: roster source badge + KM auto-fill indicator + date chips

**Below: payslip and legacy uploads**
- Payslip upload card (for comparison)
- Legacy fortnight roster PDF card (for sign-on/sign-off pre-fill)

### 13.3 Daily Entry tab

Each day row has two sections: **header** (always visible) and **body** (expanded on click).

**Header (always visible):**
- Date and day name
- Diagram number badge (e.g. `3151`) — large, prominent (purple if manual override active)
- Diagram name (smaller, secondary)
- Time-source badge (`✓ Schedule` / `ⓘ Master roster` / `ⓘ Built-in` / `✏ Manual` / `—`)
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

**Body — Manual diagram override (available on ALL day types):**
- Label: "Override diagram / schedule no." with hint "e.g. 3158, 3651, SBY"
- Text input for diagram number
- **Load diagram ↗** button — looks up schedule and pre-fills times + KMs
- When override is active: purple `✏ Manual` badge in header + reset banner showing original diagram name and a **Reset** button

**Body — Other controls:**
- KMs (editable, auto-filled)
- WOBOD toggle, Cross-midnight toggle
- Leave type selector
- Live pay breakdown table (must include lift-up/layback per §5.7)

**Body — OFF/ADO state (no override applied):**
- Informational text ("Day off — no pay unless worked")
- Diagram override input (same as above)
- "Worked (no diagram)" button as alternative

### 13.4 Results tab
- Summary metric cards across the top: gross pay, total hours, OT hours, ADO payout, fortnight type
- 14-day breakdown table: date | day | diagram | hours | paid hrs | total pay
- Component totals table: name | EA ref | code | total amount (sums across the fortnight)
- Payslip comparison block (if payslip uploaded): calculated vs payslip, variance flag
- Audit section: aggregated flags from all days
- Export buttons: PDF and CSV

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
| 3.9 | April 2026 | **Documentation restoration.** Earlier versions (v3.2 onward) progressively replaced section content with placeholder text like *"unchanged from v3.X"*, leaving the PRD unreadable as a standalone document — to know what any single requirement actually said, the reader had to manually walk through git history and reassemble fragments. v3.9 restores every section to its full content (drawing on v3.1 baseline + every subsequent change), so the PRD reads as a single complete document. **Process rule 2 added** at the top: when bumping versions, content must be preserved verbatim and only changed sections may be edited; "unchanged from..." placeholders are never acceptable. NFR-07 also updated to reference this rule. No functional code changes in this version. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
