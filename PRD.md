# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.0  
**Date:** April 2026  
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)  
**Status:** Active — governs all development on this repository

> **Process rule:** Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a **full-stack web application** built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its purpose is to allow drivers to calculate their exact gross fortnightly pay — derived from their rostered line, their actual worked times, and all applicable Enterprise Agreement 2025 rules — so they can independently verify every line on their payslip without needing payroll or HR involvement.

From v3.0 the system moves from a single monolithic HTML file to a **React frontend + Python (FastAPI) backend** architecture. The backend handles all file parsing (PDF roster uploads, XLSX payslip uploads, EA PDF reference), calculation logic, and data persistence. The frontend handles UI rendering and user interaction only.

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

### 2.3 Depot context

Mt Victoria is an intercity depot on the Blue Mountains line. Key characteristics:

- Long-distance shifts accumulate significant KMs (often 200–400+ km per shift)
- The KM credit system (Cl. 146.4) is heavily used and contributes substantially to pay
- Roster lines are fortnightly repeating patterns; lines 1–22 are permanent/fixed, lines 201–210 are standby/flexible
- The ADO system (19-day month) alternates short fortnights (ADO paid out) and long fortnights (ADO accruing)
- Shift swaps and working on off days are common, requiring manual diagram/schedule number entry

---

## 3. Users

### Primary user
**Mt Victoria intercity train driver**
- Knows their roster line number and fortnight start date
- Understands EA terminology (diagram, ADO, WOBOD, layback, lift-up, KM credit)
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
| **Diagram / Schedule number** | Unique identifier for a specific roster line. Used interchangeably. Defines sign-on, sign-off, and train services worked. |
| **Fortnight** | 14-day pay period starting on a Sunday. |
| **Short fortnight** | Fortnight containing an ADO day — ADO paid out this period (9 shifts + 1 ADO paid = 10 paid days). |
| **Long fortnight** | Fortnight with no ADO — all 10 days are worked shifts; ADO accrues (10 shifts, no ADO payout). |
| **ADO** | Accrued Day Off. Under the 19-day month arrangement, drivers accumulate extra time daily (working 8h 48m instead of 8h), building to one paid day off per 4-week cycle. |
| **OT** | Overtime. Hours beyond 8 in a single day, or beyond the fortnightly threshold (72h short / 76h long). 1.5× first 2 hrs, 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Working on a rostered day off. Double time, minimum 4 hours (Cl. 136). |
| **Lift-up / Buildup** | Driver signs on before rostered start. Gap hours at ordinary rate if total ≤8 hrs; OT rate beyond 8. |
| **Layback / Extend** | Driver signs off after rostered end. Same rate rules as lift-up. |
| **KM credit** | Under Cl. 146.4, intercity drivers doing ≥161 km are credited more hours than actually worked (26-band table). Credited excess paid at ordinary rate, excluded from OT. |
| **Shift penalty** | Per-hour loading for afternoon (Item 6), night (Item 7), or early morning (Item 8) shifts. EA rounding: <30 min disregarded, 30–59 min = 1 hr. Not payable Sat/Sun/PH. |
| **Additional loading (Item 9)** | Flat per-shift payment for drivers signing on/off 01:01–03:59 Mon–Fri (not PH). |
| **Cross-midnight shift** | Shift spanning midnight. Hours on the second calendar day rated at that day's rules. |
| **PH** | Public holiday. |
| **Un-associated duties** | Duties not directly associated with train operations (road review, pilot prep, etc.) paid additionally for ≥161 km shifts (Cl. 146.4(d) / Cl. 157.2). |
| **Payroll code** | Alphanumeric code on a Sydney Trains payslip identifying each pay component line. |

---

## 5. EA 2025 Rules Applied

### 5.1 Ordinary time (Sch. 4A)
- Base rate: $49.81842/hr (configurable)
- First 8 hours of any shift at ordinary rate
- Weekend: Saturday 1.5×, Sunday 2.0× (Cl. 54 / Cl. 133)

### 5.2 Overtime (Cl. 140.1)
- Hours 1–2 beyond 8-hr daily limit: 1.5×
- Hours beyond 2 hrs OT: 2.0×
- Saturday OT >8 hrs: 2.0×
- Sunday OT: Sunday rate applies (2.0×)
- Fortnightly threshold: 72h (short) or 76h (long)

### 5.3 Public holidays (Cl. 31)
- Weekday PH worked: 1.5×
- Weekend PH worked: 2.5×
- PH not worked: 8 hrs ordinary pay (Cl. 31.7)
- Day in lieu accrues; shift penalties not payable on PH (Cl. 134.3(a))

### 5.4 Shift penalties (Sch. 4B / Cl. 134.3)
- Item 6 (Afternoon): $4.84/hr — commences before AND concludes after 18:00
- Item 7 (Night): $5.69/hr — commences at or between 18:00 and 03:59
- Item 8 (Early morning): $4.84/hr — commences at or between 04:00 and 05:30
- Item 9 (Additional loading): $5.69 flat/shift — sign on/off 01:01–03:59 Mon–Fri only
- Rounding (Cl. 134.3(b)): <30 min disregarded; 30–59 min = 1 hr
- Not payable Sat/Sun/PH (Cl. 134.3(a))

### 5.5 KM credit system (Cl. 146.4)
26-band table from <161 km (actual time) up to 644+ km (+0.5 hr per 16 km). See Section 10 for full table.
- Credited excess hours paid at ordinary rate, NOT in OT computation (Cl. 146.4(b))
- Cl. 157.1: greater-of rule (scheduled shift time vs km-credited hrs + un-associated time)
- Double shifts (≥257 km): round trip, min 30 min meal, relieved if >10 hrs
- ≥370 km: max 4/week, relieved at terminal, 8 hr traffic cap

### 5.6 WOBOD (Cl. 136)
- Double time on all hours, minimum 4 hours paid

### 5.7 Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1)
- Auto-detected from actual vs rostered times
- Gap hours: ordinary rate within 8-hr total, OT rate beyond 8
- Rate depends on shift day type (weekday/Sat/Sun/PH)
- Not applied when WOBOD is active

### 5.8 ADO pay
- Short fortnight: ADO = 8 hrs ordinary rate paid out
- Long fortnight: ADO accruing, no payout
- Auto-detected from whether loaded roster line has ADO in the 14-day window

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

## 6. File Upload Requirements (New in v3.0)

### FR-U1: Fortnightly roster PDF upload
- User uploads a fortnightly roster PDF (e.g. MTVICDRWD191025_1_weekday.pdf)
- Backend parses the PDF and extracts: date, diagram number, sign-on time, sign-off time for each day
- Extracted data pre-fills the daily entry form
- User reviews and confirms before calculation
- Error handling: if parsing fails, falls back to manual entry with an error message

### FR-U2: Payslip upload (NSW_Payslip.xlsx / Sydney_Crew_Payslip.xlsx)
- User uploads their payslip XLSX or PDF
- Backend parses line items: component name, payroll code, hours, dollar amount
- Parsed payslip displayed alongside calculated results for direct comparison
- Variance highlighted per line item (over/under)
- Supports both payslip formats: NSW_Payslip and Sydney_Crew_Payslip

### FR-U3: EA PDF reference upload
- Admin/user can upload the EA PDF to a `/uploads/ea/` endpoint
- Backend extracts and caches key rates and clause text for reference
- Referenced inline in the calculator UI next to each rule

### FR-U4: File validation
- File type validation: PDF and XLSX only
- File size limit: 10 MB
- Rejected files return a clear error message
- All uploaded files are stored temporarily (session-scoped, deleted after 1 hour)

---

## 7. Functional Requirements

### FR-01: Fortnight Setup
- User selects roster line number (1–22, 201–210)
- User sets fortnight start date (snapped to Sunday)
- Auto-detect short vs long fortnight
- Prominent SHORT / LONG display with plain-English explanation
- Public holiday dates (comma-separated YYYY-MM-DD)
- Payslip total for variance audit
- **New (v3.0):** Upload roster PDF button — pre-fills daily entry from parsed PDF

### FR-02: Daily entry
- 14 collapsible day rows
- Work-shift day: actual start/end, KMs, WOBOD, cross-midnight, Use rostered, leave type
- OFF/ADO day: diagram input, Load diagram, Worked (no diagram), reset banner
- Fill all with rostered times button
- **New (v3.0):** If roster PDF was uploaded and parsed, "Apply uploaded roster" button appears in toolbar

### FR-03: Pay calculation (server-side in v3.0)
- API endpoint `POST /api/calculate` accepts fortnight state JSON
- Returns per-day components and fortnight summary
- Calculation logic lives in Python backend (`calculator.py`), not in the browser
- Frontend renders results from API response
- Real-time per-day preview still available (lightweight client-side calculation for immediate feedback; server calculation is authoritative for final results)

### FR-04: Results
- Summary metric cards: gross pay, actual hours, daily OT hours, fortnight OT / KM bonus
- 14-day breakdown table with colour coding
- Component totals table with payroll code column
- Audit section: payslip variance, OT alerts, KM notes, ADO payout, compliance flags
- **New (v3.0):** If payslip was uploaded, side-by-side comparison table per line item
- **New (v3.0):** Export to PDF button (server-rendered)
- **New (v3.0):** Export to CSV button

### FR-05: Configuration
- All pay rates configurable with EA references
- All payroll codes configurable
- Un-associated duties amount and code
- Config saved to backend (user session) and localStorage fallback

### FR-06: KM table reference
- Full Cl. 146.4 table in dedicated tab
- All rule notes

### FR-07: Reset and toggling
- Diagram picker always has a reset path
- No irrecoverable locked state

### FR-08: ADO handling
- Short/long auto-detect
- Short: ADO paid; Long: ADO accruing
- Audit flags fortnight type and ADO amount

### FR-09: Lift-up / Layback / Buildup
- Auto-detected from actual vs rostered
- Ordinary/OT split at 8-hr boundary
- Not applied with WOBOD

### FR-10: Cross-midnight shifts
- Auto-detected; manual override
- Next-day rules applied to post-midnight hours

---

## 8. Non-Functional Requirements

### NFR-01: Architecture
- React (Vite) frontend, FastAPI (Python) backend
- Single-repo monorepo: `frontend/` and `backend/` directories
- Deployable to Vercel (frontend) + Railway / Render (backend)
- Frontend can operate in "offline mode" (client-side calculation only) when backend is unavailable

### NFR-02: Performance
- API response for `/api/calculate` < 200ms
- Frontend renders result within 100ms of API response
- PDF parsing < 5 seconds for typical roster PDF

### NFR-03: Browser compatibility
- Chrome, Firefox, Safari (desktop and mobile)
- Mobile-responsive (breakpoint at 768px)

### NFR-04: Data persistence
- Config saved to localStorage + backend session
- Uploaded files: session-scoped, auto-deleted after 1 hour
- No long-term user data storage (no accounts, no database)

### NFR-05: Accuracy
- All amounts rounded to 2 decimal places
- EA rounding rules applied exactly (Cl. 134.3(b))
- KM credit table exact per EA 2025
- No floating-point display artifacts

### NFR-06: Security
- File uploads: type and size validation
- No user authentication required (single-user local tool)
- Uploaded files never persisted beyond session
- CORS restricted to frontend origin

### NFR-07: Maintainability
- All EA clause references visible in UI
- Pay rates configurable without code changes (config.yaml)
- Roster data in a separate JSON file (roster.json), not hardcoded
- PRD updated before any implementation change

### NFR-08: Auditability
- Every pay component shows: name, EA ref, payroll code, hours, rate, amount
- Audit section highlights anomalies, compliance alerts, payslip variances

---

## 9. Data Model

### 9.1 Day state (frontend)
```ts
interface DayState {
  date: string;           // YYYY-MM-DD
  dow: number;            // 0=Sun, 6=Sat
  ph: boolean;            // is public holiday
  diag: string;           // diagram name ('3158 RK', 'OFF', 'ADO')
  _origDiag?: string;     // original before manual override
  rStart: string | null;  // rostered start HH:MM
  rEnd: string | null;    // rostered end HH:MM
  cm: boolean;            // cross-midnight
  rHrs: number;           // rostered hours
  aStart: string;         // actual start HH:MM
  aEnd: string;           // actual end HH:MM
  wobod: boolean;
  km: number;
  leaveCat: string;       // 'none' | 'SL' | 'AL' | ...
  manualDiag: string | null;
  manualDiagInput: string;
  workedOnOff: boolean;
  isShortFortnight: boolean; // set by calcAll
}
```

### 9.2 API request — `POST /api/calculate`
```json
{
  "fortnight_start": "2025-08-10",
  "roster_line": 7,
  "public_holidays": ["2025-08-11"],
  "payslip_total": 4250.00,
  "config": { ...rates },
  "codes": { ...payroll_codes },
  "days": [ ...DayState[] ]
}
```

### 9.3 API response — `POST /api/calculate`
```json
{
  "fortnight_type": "short",
  "ado_payout": 398.55,
  "total_hours": 84.5,
  "total_pay": 4389.22,
  "days": [
    {
      "date": "2025-08-10",
      "diag": "3158 RK",
      "day_type": "weekday",
      "hours": 9.08,
      "total_pay": 512.33,
      "components": [
        { "name": "Ordinary time", "ea": "Sch. 4A", "code": "ORD", "hrs": 8.0, "rate": "$49.82/hr", "amount": 398.55 },
        { "name": "OT — first 2 hrs", "ea": "Cl. 140.1", "code": "OT1", "hrs": 1.08, "rate": "1.5x", "amount": 80.81 }
      ],
      "flags": ["Daily OT: 1.08 hrs"]
    }
  ],
  "component_totals": { "Ordinary time": 3200.44, "OT — first 2 hrs": 450.10 },
  "audit": {
    "payslip_variance": -139.22,
    "fn_ot_hrs": 8.5,
    "km_bonus_hrs": 2.0,
    "flags": ["Fortnight OT: 8.5 hrs above 76-hr threshold"]
  }
}
```

### 9.4 API response — `POST /api/parse-roster`
```json
{
  "source_file": "MTVICDRWD191025_1_weekday.pdf",
  "parsed_days": [
    { "date": "2025-10-19", "diagram": "3158 RK", "sign_on": "03:36", "sign_off": "12:41", "confidence": 0.95 },
    { "date": "2025-10-20", "diagram": "OFF", "sign_on": null, "sign_off": null, "confidence": 1.0 }
  ],
  "warnings": ["Day 3 sign-off time unclear — please verify"]
}
```

### 9.5 API response — `POST /api/parse-payslip`
```json
{
  "source_file": "NSW_Payslip.xlsx",
  "format": "nsw_payslip",
  "period_start": "2025-08-10",
  "period_end": "2025-08-23",
  "total_gross": 4250.00,
  "line_items": [
    { "code": "ORD", "description": "Ordinary time", "hours": 72.0, "rate": 49.82, "amount": 3587.04 },
    { "code": "OT1", "description": "Overtime 1.5x", "hours": 8.0, "rate": 74.73, "amount": 597.84 }
  ]
}
```

### 9.6 Roster data format (roster.json)
```json
{
  "1": [
    ["00:51", "09:18", false, 8.45, "3151 SMB"],
    [null, null, false, 0, "OFF"]
  ]
}
```

### 9.7 Config (config.yaml / API config object)
Same structure as v2.0 config — all rates and multipliers. Stored in `backend/config.yaml`.

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

All 32 roster lines stored in `backend/data/roster.json`.
- **1–22**: Fixed permanent roster lines
- **201–210**: Standby / flexible lines (SBY)

Each line: 14 entries (one per fortnight day, starting Sunday).

---

## 12. UI Design Specification

### 12.1 Layout
- React SPA with 5 tabs: **Setup**, **Daily Entry**, **Results**, **Rates & Codes**, **KM Table**
- Header: app name, EA version badge, upload status indicator
- Responsive: single-column mobile (<768px), multi-column desktop

### 12.2 Setup tab
- Row 1 (3 cols): Roster line | Fortnight start date | Fortnight type
- Row 2 (2 cols): Public holidays | Payslip total
- **New:** Upload roster PDF card (drag-drop or browse) with parse status
- **New:** Upload payslip card (XLSX or PDF) with parse status
- Load button + fortnight preview (line, dates, work days, ADO, SHORT/LONG)
- Date chips row (work/ADO/off colour coded)
- Shift penalty reference table

### 12.3 Daily Entry tab
- Toolbar: Calculate (API call) | Fill all rostered | **Apply uploaded roster** (if parsed) | Line/date label
- 14 collapsible day rows
- Work-shift day: start/end/KMs/WOBOD/cross-midnight/Use rostered + leave selector + result preview
- OFF/ADO day: diagram input + Load + Worked + reset banner

### 12.4 Results tab
- 4 metric cards
- 14-day table
- Component totals table with payroll codes
- **New:** Payslip comparison table (if payslip uploaded) — side-by-side per line item with variance column
- **New:** Export PDF and Export CSV buttons
- Audit section

### 12.5 Rates & Codes tab
- Rate config grid with EA refs
- Payroll code grid
- Un-associated duties

### 12.6 KM Table tab
- Full Cl. 146.4 table
- Rule notes

---

## 13. Known Limitations and Out of Scope

| Item | Status |
|------|--------|
| Back pay (4% to May 2024) calculation | Out of scope — payroll handles retroactively |
| Superannuation | Out of scope |
| Tax / net pay | Out of scope — gross pay only |
| Multi-driver / depot-wide use | Out of scope for v3 — single-user tool |
| Leave accrual balances | Out of scope — pay amount only |
| Penalty rate changes mid-fortnight | Out of scope |
| Other depots' roster lines | Out of scope — Mt Victoria only |

---

## 14. Future Enhancements (Backlog)

- Save and compare multiple fortnights (history view)
- Support for other Sydney Trains depots (Lithgow, Penrith)
- Mobile PWA wrapper (offline, home screen install)
- Automated EA update when new rates are published
- Notification when a new fortnight starts
- Improved OCR for scanned roster PDFs

---

## 15. Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | March 2026 | Initial single-file calculator, all 32 roster lines, basic EA rules |
| 1.1 | March 2026 | Lift-up/layback/buildup, ADO pay, manual diagram entry, reset toggle |
| 2.0 | April 2026 | Full PRD written; redesigned UI; leave categories; payslip audit |
| 3.0 | April 2026 | Architecture change: React frontend + FastAPI backend; file upload requirements; solution design; PRD-first process rule |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
