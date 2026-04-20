# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 2.0  
**Date:** April 2026  
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)  
**Status:** Active — governs all development on this repository

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a browser-based, zero-dependency single-page application built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its sole purpose is to allow drivers to calculate their exact gross fortnightly pay — derived from their rostered line, their actual worked times, and all applicable Enterprise Agreement 2025 rules — so they can independently verify every line on their payslip without needing payroll or HR involvement.

The calculator is not a generic pay tool. It is deeply specialised: it embeds all 32 Mt Victoria roster lines (lines 1–22 and 201–210), applies EA 2025 clauses directly by name and number, detects short vs long fortnights automatically, handles ADO accrual and payout, auto-detects lift-up/layback/buildup from actual vs rostered times, applies the Cl. 146.4 KM credit table across all 26 bands, and supports payslip line-by-line code matching.

---

## 2. Background and Problem Statement

### 2.1 The payslip verification problem

Sydney Trains drivers receive fortnightly payslips containing 10–25 line items across multiple pay codes. The calculation rules are complex:

- Ordinary hours are capped at 8 per day; beyond that, two tiers of OT apply
- Shift penalties (afternoon, night, early morning) are paid per worked hour, not per shift, with EA-mandated rounding (Cl. 134.3(b))
- Saturday, Sunday, and public holidays each have different rate multipliers
- Cross-midnight shifts may split across two calendar days with different rate rules
- KM credits for intercity services grant additional credited hours above actual worked hours under a 26-band table (Cl. 146.4)
- Lift-up, layback, and buildup (working before rostered start or after rostered end) must be paid at ordinary rate within the 8-hr limit and OT rate beyond it
- ADO days are paid as 8 hrs ordinary only in the fortnightly pay period that contains the ADO (short fortnight); in the alternating fortnight (long fortnight), the ADO accrues without payout
- WOBOD (working on a book-off day) is double time with a 4-hour minimum (Cl. 136)

Without a calculation tool, drivers cannot easily verify their pay and underpayments go unchallenged.

### 2.2 The 2025 EA context

The Sydney Trains and NSW TrainLink Enterprise Agreement 2025 was approved by the Fair Work Commission in August 2025. Key changes:

| Item | Detail |
|------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate (Sch. 4A) | $49.81842/hr (from 1 July 2025) |
| Effective from | 1 July 2025 |

All clause references in this PRD and in the calculator UI refer to the EA 2025 text.

### 2.3 Depot context

Mt Victoria is an intercity depot. Drivers work primarily on Blue Mountains intercity services. Key characteristics:

- Long-distance shifts accumulate significant KMs (often 200–400+ km per shift)
- The KM credit system (Cl. 146.4) is therefore heavily used and contributes substantially to pay
- Roster lines are fortnightly repeating patterns; lines 1–22 are permanent/fixed, lines 201–210 are standby/flexible
- The ADO system (19-day month / accrued day off) alternates between short fortnights (ADO paid out) and long fortnights (ADO accruing)
- Shift swaps and working on off days are common at this depot, requiring manual diagram/schedule number entry

---

## 3. Users

### Primary user
**Mt Victoria intercity train driver**
- Knows their roster line number and fortnight start date
- Understands EA terminology (diagram, ADO, WOBOD, layback, lift-up, KM credit)
- Uses the calculator after receiving a payslip to verify it, or before the pay period ends to forecast pay
- Not a developer; does not understand code
- Uses the app on a phone or desktop browser at home or in the crew room

### Secondary users
- **Delegates / union reps** at Mt Victoria who assist drivers in disputes
- **Other depot drivers** who may adapt the roster data for their own depot

---

## 4. Terminology Glossary

| Term | Definition |
|------|------------|
| **Diagram / Schedule number** | The unique identifier for a specific roster line. Used interchangeably. Each defines sign-on, sign-off, and the train services worked. |
| **Fortnight** | A 14-day pay period starting on a Sunday. |
| **Short fortnight** | A fortnight that contains an ADO day — the ADO is paid out in this period (9 shifts worked + 1 ADO paid = 10 paid days). |
| **Long fortnight** | A fortnight with no ADO — all 10 days are worked shifts; ADO accrues toward next short fortnight (10 shifts worked, no ADO payout). |
| **ADO** | Accrued Day Off. Under the 19-day month arrangement, drivers accumulate extra time each day (from working 8h 48m instead of 8h). This accumulates into one paid day off per 4-week cycle. |
| **OT** | Overtime. Any hours beyond 8 in a single day, or beyond the fortnightly threshold (72h short / 76h long). Paid at 1.5× for first 2 hrs beyond 8, then 2.0× beyond that. |
| **WOBOD** | Work on Book-Off Day. Working on a rostered day off. Paid at double time with a 4-hour minimum (Cl. 136). |
| **Lift-up / Buildup** | Driver signs on before their rostered start time. Hours before rostered start are paid at ordinary rate if total shift ≤8 hrs, or at OT rate for hours that push total beyond 8. |
| **Layback / Extend** | Driver signs off after their rostered end time. Same rate rules as lift-up. |
| **KM credit** | Under Cl. 146.4, intercity drivers doing ≥161 km are credited more hours than they actually work (per a 26-band table). The credited hours above actual are paid at ordinary rate and excluded from OT threshold. |
| **Shift penalty** | Per-hour loading for afternoon (Item 6), night (Item 7), or early morning (Item 8) shifts. Applied to ordinary hours only, with EA-mandated rounding (Cl. 134.3(b): <30 min fraction disregarded, 30–59 min = 1 full hour). Not payable on Sat/Sun/PH. |
| **Additional loading (Item 9)** | Flat per-shift payment for drivers signing on or off between 01:01–03:59 Mon–Fri (not PH). |
| **Cross-midnight shift** | A shift that spans midnight. The hours on the second calendar day are rated at that day's rules (e.g., if the second day is a Sunday, those hours attract Sunday rates). |
| **PH** | Public holiday. |
| **Un-associated duties** | Duties not directly associated with train operations (road review, pilot prep, etc.) paid additionally for ≥161 km shifts (Cl. 146.4(d) / Cl. 157.2). |
| **Payroll code** | The alphanumeric code on a Sydney Trains payslip identifying each pay component line. |

---

## 5. EA 2025 Rules Applied

All rules are sourced directly from the Sydney Trains and NSW TrainLink Enterprise Agreement 2025 text.

### 5.1 Ordinary time (Sch. 4A)
- Base rate: $49.81842/hr (configurable by user to match their payslip)
- First 8 hours of any shift at ordinary rate
- Weekend ordinary: Saturday 1.5×, Sunday 2.0× (Cl. 54 / Cl. 133)

### 5.2 Overtime (Cl. 140.1)
- Hours 1–2 beyond 8-hr daily limit: 1.5×
- Hours beyond 2 hrs OT: 2.0×
- Saturday OT >8 hrs: 2.0×
- Sunday OT: Sunday rate applies (2.0×)
- Fortnightly threshold: 72h (short fortnight) or 76h (long fortnight)

### 5.3 Public holidays (Cl. 31)
- Weekday PH worked: 1.5×
- Weekend PH worked: 2.5×
- PH not worked: 8 hrs ordinary pay (Cl. 31.7)
- Day in lieu accrues
- Shift penalties not payable on PH (Cl. 134.3(a))

### 5.4 Shift penalties (Sch. 4B / Cl. 134.3)
- Item 6 (Afternoon): $4.84/hr — commences before AND concludes after 18:00
- Item 7 (Night): $5.69/hr — commences at or between 18:00 and 03:59
- Item 8 (Early morning): $4.84/hr — commences at or between 04:00 and 05:30
- Item 9 (Additional loading): $5.69 flat per shift — sign on/off 01:01–03:59 Mon–Fri only
- Rounding (Cl. 134.3(b)): <30 min fraction disregarded; 30–59 min rounded up to 1 hour
- Not payable on Saturday, Sunday, or Public Holidays (Cl. 134.3(a))

### 5.5 KM credit system (Cl. 146.4)

| KM band | Credited hrs |
|---------|-------------|
| <161 | Actual time |
| 161–193 | 5.0 |
| 193–225 | 6.0 |
| 225–257 | 7.0 |
| 257–290 | 8.0 |
| 290–322 | 9.0 |
| 322–338 | 10.0 |
| 338–354 | 10.5 |
| 354–370 | 11.0 |
| 370–386 | 11.5 |
| 386–402 | 12.0 |
| 402–418 | 12.5 |
| 418–435 | 13.0 |
| 435–451 | 13.5 |
| 451–467 | 14.0 |
| 467–483 | 14.5 |
| 483–499 | 15.0 |
| 499–515 | 15.5 |
| 515–531 | 16.0 |
| 531–547 | 16.5 |
| 547–563 | 17.0 |
| 563–579 | 17.5 |
| 579–595 | 18.0 |
| 595–612 | 18.5 |
| 612–628 | 19.0 |
| 628–644 | 19.5 |
| 644+ | +0.5 hr per 16 km |

- Credited hours above actual are paid at ordinary rate — NOT included in OT computation (Cl. 146.4(b))
- Cl. 157.1: drivers paid the GREATER of (a) scheduled shift time or (b) km-credited hrs + un-associated work time
- For double shifts (≥257 km): round trip, min 30 min meal at turnaround, relieved if >10 hrs
- For ≥370 km shifts: max 4 per week, relieved at terminal, 8 hr traffic cap

### 5.6 WOBOD (Cl. 136)
- Double time on all hours
- Minimum 4 hours paid
- Pre-selects when driver marks a book-off day as worked

### 5.7 Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1)
- Auto-detected: actual start before rostered start = lift-up/buildup
- Auto-detected: actual end after rostered end = layback/extend
- Gap hours paid at ordinary rate if total shift ≤8 hrs; OT rate for hours beyond 8
- Rate depends on shift day type (weekday/Sat/Sun/PH)
- No manual toggle required — calculator detects automatically from times entered

### 5.8 ADO pay
- Short fortnight (contains ADO day): ADO paid as 8 hrs at ordinary rate
- Long fortnight (no ADO): ADO accruing, no payout, noted in audit
- Auto-detected from whether the loaded roster line has an ADO in the 14-day window

### 5.9 Leave categories

| Code | Name | EA ref | Pay basis |
|------|------|--------|-----------|
| SL | Sick leave | Cl. 30.4 | Rostered hrs at ordinary rate |
| CL | Carer's leave | Cl. 30.7(b)(ix) | Rostered hrs at base rate |
| AL | Annual leave | Cl. 30.1/30.2 | 8 hrs + 20% loading (shiftworker) |
| PHNW | PH not worked | Cl. 31.7 | 8 hrs ordinary |
| PHW | PH worked | Cl. 31.5 | 150% loading + additional day |
| BL | Bereavement leave | Cl. 30.8(k)(iv) | Rostered hrs at base rate |
| JD | Jury duty | Cl. 30.8(g) | Rostered hrs ordinary (jury fee offsets) |
| PD | Picnic day | Cl. 32.1 | 8 hrs ordinary |
| LWOP | Leave without pay | — | $0 |

---

## 6. Roster Data

### 6.1 Master roster — Mt Victoria (lines 1–22)
Fixed repeating fortnightly patterns. Each day entry contains:
- Rostered start time (HH:MM)
- Rostered end time (HH:MM)
- Cross-midnight flag (boolean)
- Rostered hours (decimal)
- Diagram/train number (string, e.g. "3158 RK", "SBY", "OFF", "ADO")

All 32 lines embedded in the application (no external file required at runtime).

### 6.2 Standby lines (201–210)
Flexible standby patterns. Times are typical standby windows. Manual override via fortnightly roster upload (planned) or manual grid entry.

### 6.3 Manual diagram entry
For shift swaps, day-off work, or standby lines where the actual diagram differs from the roster:
- User enters a line number (e.g. "7") or a diagram code (e.g. "3158")
- Calculator looks up the master roster for matching times and pre-fills them
- Unrecognised diagrams open a blank form for manual time entry
- Available on any OFF or ADO day
- Reset button always visible — user can toggle back to the original OFF/ADO picker at any time without losing other day entries

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
- User selects roster line number (1–22, 201–210)
- User sets fortnight start date (any date; system snaps to nearest Sunday if not Sunday)
- System auto-detects short vs long fortnight from whether ADO appears in the 14-day window
- System displays the fortnight type prominently (SHORT / LONG) with a plain-English explanation
- User can enter comma-separated public holiday dates in YYYY-MM-DD format
- User can enter a payslip total for variance audit

### FR-02: Daily entry
- All 14 days rendered as collapsible rows
- Each work-shift day shows: actual start, actual end, KMs driven, WOBOD toggle, cross-midnight toggle, "Use rostered" button
- Rostered times shown as placeholder/hint on each input
- OFF and ADO days show: diagram/schedule number input, "Load diagram" button, "Worked (no diagram)" button
- After loading a manual diagram or clicking worked: shift entry form appears with a grey reset banner at the top allowing the user to undo and go back to the picker at any time
- "Fill all with rostered times" button pre-fills all work-shift days in one click
- Leave type selector available on every work-shift day

### FR-03: Pay calculation
- Calculates in real time when fields change (per day)
- Full fortnight calculation triggered by "Calculate fortnight" button
- Per-day breakdown table shows: component name, EA reference, payroll code field, hours, rate, amount
- Total row per day
- Flags shown as chips below the table: anomalies, OT alerts, KM alerts

### FR-04: Results
- Summary metric cards: gross pay, actual hours, daily OT hours, fortnight OT / KM bonus
- 14-day table: date, diagram, day type, rostered times, actual times, KMs, hours, pay — with colour highlighting for PH/Sun/Sat variance
- Component totals table for payslip matching: component, EA ref, payroll code, fortnight total
- Audit section: payslip variance alert (if payslip total entered), fortnight OT alert, KM credit note, ADO payout note, short/long fortnight confirmation, ALERT chips for any EA compliance flags

### FR-05: Configuration
- All pay rates configurable (base hourly, OT multipliers, Sat/Sun/PH rates, shift penalty rates, WOBOD rate/min hours, additional loading)
- All payroll codes configurable per component (for payslip matching)
- Un-associated duties: flat per-shift amount and payroll code
- Save/restore config (via localStorage)

### FR-06: KM table reference
- Full Cl. 146.4 KM credit table displayed in a dedicated tab
- Notes on Cl. 146.4(b), Cl. 157.1, double-shift rules, ≥370 km rules

### FR-07: Reset and toggling
- Diagram picker on OFF/ADO days must always show a reset path
- After entering a manual diagram or "Worked (no diagram)", a reset banner appears
- Clicking reset restores the day to its original OFF/ADO state cleanly
- No day entry should ever be in an irrecoverable locked state

### FR-08: ADO handling
- Auto-detect short fortnight (ADO present) vs long (no ADO)
- Short fortnight: ADO day shows 8 hrs ordinary pay in breakdown and in results
- Long fortnight: ADO day shows "ADO accruing" with info banner
- Audit section flags which type of fortnight and the ADO payout amount
- Fortnight type shown in Setup preview after line load

### FR-09: Lift-up / Layback / Buildup
- Auto-detected from actual vs rostered times — no manual toggle
- Lift-up: actual start < rostered start → hours before rostered start are lift-up/buildup
- Layback: actual end > rostered end → hours after rostered end are layback/extend
- Each gap broken into ordinary-rate portion (within 8 hr total) and OT-rate portion (beyond 8 hr total)
- Rate for OT portion depends on shift day type (weekday/Sat/Sun/PH)
- Shown as separate line items in the day breakdown with EA ref Cl. 131 / Cl. 140.1
- Not applied when WOBOD is selected (WOBOD rate covers everything)

### FR-10: Cross-midnight shifts
- Cross-midnight detected automatically when actual end ≤ actual start
- Manual override via cross-midnight dropdown
- Hours on the next calendar day rated at that day's rules
- Next-day day state (PH, Sun, Sat) read from the days array

---

## 8. Non-Functional Requirements

### NFR-01: Zero dependencies
- Single HTML file, no external JS libraries, no CDN calls at runtime
- Works fully offline once loaded
- Can be shared as a file attachment

### NFR-02: Performance
- Full fortnight calculation completes in <100ms
- No perceptible lag when entering times

### NFR-03: Browser compatibility
- Works on Chrome, Firefox, Safari (desktop and mobile)
- Mobile-responsive layout (flex/grid with breakpoint at 700px)

### NFR-04: Data persistence
- Pay rates and payroll codes saved to localStorage
- Session data (entered times) is not persisted between browser sessions (by design — each pay period is a fresh entry)

### NFR-05: Accuracy
- All monetary amounts rounded to 2 decimal places
- EA rounding rules applied exactly (Cl. 134.3(b))
- KM credit table applied exactly per EA 2025 text
- No floating-point display artifacts (all numbers passed through toFixed(2) before display)

### NFR-06: Maintainability
- All EA clause references visible in the UI (in the breakdown table and rate reference tables)
- Pay rates configurable without code changes
- Roster data structured as a single JS object — easy to update when roster changes

### NFR-07: Auditability
- Every pay component shows: name, EA clause reference, payroll code field, hours, rate, dollar amount
- Audit section highlights any anomalies, compliance alerts, or payslip variances

---

## 9. Data Model

### 9.1 Day state object
```js
{
  date: 'YYYY-MM-DD',      // ISO date string
  dow: 0-6,                // 0=Sun, 6=Sat
  ph: boolean,             // is public holiday
  diag: string,            // diagram/schedule name (e.g. '3158 RK', 'OFF', 'ADO')
  _origDiag: string,       // original diag before manual override (for reset)
  rStart: 'HH:MM'|null,   // rostered start
  rEnd: 'HH:MM'|null,     // rostered end
  cm: boolean,             // cross-midnight
  rHrs: number,            // rostered hours (decimal)
  aStart: 'HH:MM',        // actual start
  aEnd: 'HH:MM',          // actual end
  wobod: boolean,          // work on book-off day
  km: number,              // kilometres driven
  leaveCat: string,        // leave category code or 'none'
  manualDiag: string|null, // manual diagram input (for OFF/ADO days)
  manualDiagInput: string, // raw text in the diagram input field
  workedOnOff: boolean,    // worked on a book-off day without a diagram
  isShortFortnight: boolean // set by calcAll before calcDay is called
}
```

### 9.2 Pay component object
```js
{
  n: string,      // component name
  ea: string,     // EA clause reference (e.g. 'Cl. 140.1')
  code: string,   // payroll code (from codes config)
  hrs: string,    // hours or 'flat'
  rate: string,   // rate description
  amount: number, // dollar amount
  cls: string     // CSS class for row styling ('pen-row', 'km-row', '')
}
```

### 9.3 Config object
```js
{
  baseRate: 49.81842,   // $/hr
  ot1: 1.5,             // OT multiplier tier 1
  ot2: 2.0,             // OT multiplier tier 2
  satRate: 1.5,         // Saturday multiplier
  sunRate: 2.0,         // Sunday multiplier
  satOt: 2.0,           // Saturday OT multiplier
  phWkd: 1.5,           // PH weekday multiplier
  phWke: 2.5,           // PH weekend multiplier
  afternoonRate: 4.84,  // Item 6 $/hr
  nightRate: 5.69,      // Item 7 $/hr
  earlyRate: 4.84,      // Item 8 $/hr
  addLoading: 5.69,     // Item 9 $/shift flat
  wobodRate: 2.0,       // WOBOD multiplier
  wobodMin: 4           // WOBOD minimum hours
}
```

### 9.4 Roster entry format
```js
// Per-day entry in the ROSTER constant:
[startHHMM, endHHMM, crossMidnight, rosteredHours, diagramName]
// e.g.:
["03:36", "12:41", false, 9.08, "3158 RK"]
[null, null, false, 0, "OFF"]
[null, null, false, 0, "ADO"]
```

---

## 10. Roster Lines — Mt Victoria

All 32 roster lines are embedded. Line numbers:
- **1–22**: Fixed permanent roster lines with specific diagram assignments
- **201–210**: Standby / flexible lines (SBY) with typical shift windows

Each line contains 14 entries (one per fortnight day, starting Sunday).

Key embedded diagrams include: 3151 SMB, 3152 SBY, 3153, 3154 SMB, 3155 SMB, 3156, 3157, 3158 RK, 3159 RK, 3160, 3161 RR, 3162 RK, 3163 SBY, 3164, 3165 SMB, 3166, 3167, 3168, 3651, 3652, 3653, 3654 SMB, 3655, 3656, 3657 SMB, 3658, 3659, 3660 SMB, 3661, 3662, 3663, 3664.

---

## 11. UI Design Specification

### 11.1 Layout
- Single-page app with 5 tabs: **Setup**, **Daily Entry**, **Results**, **Rates & Codes**, **KM Table**
- Header: app name, EA version badge
- Responsive: single-column on mobile (<700px), multi-column grid on desktop

### 11.2 Setup tab
- Row 1 (3 columns): Roster line input | Fortnight start date | Fortnight type (Short 72h / Long 76h)
- Row 2 (2 columns): Public holidays | Payslip total
- Load button + fortnight preview (line loaded, date range, work days, ADO count, SHORT/LONG label)
- Date chips row showing all 14 days with work/ADO/off colour coding
- Shift penalty reference table (read-only)

### 11.3 Daily Entry tab
- Toolbar: Calculate button | Fill all rostered button | Line/date label
- 14 collapsible day rows
- Work-shift day body: 6-column input grid (start, end, KMs, WOBOD, cross-midnight, Use rostered) + leave selector + result table
- OFF/ADO day body (no manual diagram active): day type label + diagram input + Load button + Worked button
- OFF/ADO day body (manual diagram active): grey reset banner ("Working on OFF/ADO — diagram X [↩ Reset to OFF]") + standard shift entry form

### 11.4 Results tab
- 4 metric cards: gross pay, actual hours, daily OT hours, fortnight OT or KM bonus
- 14-day breakdown table
- Component totals table with payroll code column
- Audit section with colour-coded alert banners

### 11.5 Rates & Codes tab
- Rate configuration grid (all configurable values with EA references)
- Payroll code grid (one input per pay component)
- Un-associated duties flat amount and code

### 11.6 KM Table tab
- Full Cl. 146.4 table
- Rule notes for Cl. 146.4(b), Cl. 157.1, double-shift, ≥370 km provisions

---

## 12. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) calculation | Out of scope — handled by payroll retroactively |
| Superannuation calculation | Out of scope |
| Tax / net pay | Out of scope — gross pay only |
| Multi-driver / depot-wide use | Out of scope for v2 — single-user tool |
| PDF payslip parsing | Out of scope — user enters times manually |
| Leave accrual balances | Out of scope — pay amount only |
| Penalty rate changes mid-fortnight (e.g. step increase) | Out of scope |
| Other depots' roster lines | Out of scope — Mt Victoria only |
| Auto-population from rosters without file upload | Out of scope |

---

## 13. Future Enhancements (Backlog)

- Payslip PDF/image upload with OCR to pre-fill actual times
- Export to PDF or CSV for record-keeping
- Save and compare multiple fortnights (history)
- Support for other Sydney Trains depots (Lithgow, Penrith, etc.)
- Notification / reminder when a new fortnight starts
- Automated EA update when new rates are published
- Mobile-native PWA wrapper (offline, home screen install)

---

## 14. Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | March 2026 | Initial single-file calculator with all 32 roster lines and basic EA rules |
| 1.1 | March 2026 | Lift-up/layback/buildup logic, ADO pay, manual diagram entry, reset toggle |
| 2.0 | April 2026 | Full PRD written; redesigned UI from PRD spec; leave categories; payslip audit improvements |

---

*This PRD is the authoritative requirements document for the Mt Victoria Driver Wage Calculator. All changes to the calculator must be consistent with this document. Updates to EA rules, roster lines, or rate values should be reflected here first, then in the code.*
