# Product Requirements Document
# Mt Victoria Driver Wage Calculator

**Version:** 3.1  
**Date:** April 2026  
**Author:** Prahlad Modi (Mt Victoria depot, Sydney Trains)  
**Status:** Active — governs all development on this repository

> **Process rule:** Any new input field, calculation change, or feature addition must be reflected in this PRD first (version bump + changelog entry), then implemented. The PRD is the single source of truth.

---

## 1. Executive Summary

The Mt Victoria Driver Wage Calculator is a **full-stack web application** built specifically for intercity train drivers based at the **Mt Victoria depot** under Sydney Trains. Its purpose is to allow drivers to calculate their exact gross fortnightly pay — derived from their rostered line, their actual worked times, and all applicable Enterprise Agreement 2025 rules — so they can independently verify every line on their payslip without needing payroll or HR involvement.

From v3.0 the system moves from a single monolithic HTML file to a **React frontend + Python (FastAPI) backend** architecture. From v3.1, roster and schedule data is sourced from uploaded PDF/ZIP files rather than only from built-in hardcoded data.

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
- Roster lines are fortnightly repeating patterns; lines 1–22 are permanent/fixed, lines 201–210 are standby/swinger lines whose diagram assignments change every fortnight
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
| **Diagram / Schedule number** | Unique identifier for a specific shift. Used interchangeably. Defines sign-on, sign-off, train services, and KM distance. |
| **Fortnight** | 14-day pay period starting on a Sunday. |
| **Short fortnight** | Fortnight containing an ADO day — ADO paid out this period. |
| **Long fortnight** | Fortnight with no ADO — all shifts worked; ADO accrues. |
| **ADO** | Accrued Day Off. Under the 19-day month arrangement, drivers accumulate time building to one paid day off per 4-week cycle. |
| **Master Roster** | Annual roster document for lines 1–22. Published once a year. Defines which diagram (schedule number) each line works on each of the 14 days. Format: ZIP archive containing manifest.json + text + image layers. |
| **Fortnight Roster** | Per-fortnight roster document for swinger lines 201–210. Published every fortnight. Same ZIP format as master roster. Defines which diagram each swinger line works that fortnight. |
| **Schedule file** | Weekday or weekend schedule document. Contains detailed work instructions per diagram number, including sign-on time, sign-off time, distance (KMs), and total shift hours. Format: same ZIP archive structure. |
| **Swinger line** | Roster lines 201–210. Standby/flexible positions whose diagram assignments change each fortnight (sourced from the Fortnight Roster). |
| **OT** | Overtime. Hours beyond 8 in a single day. 1.5× first 2 hrs, 2.0× beyond. |
| **WOBOD** | Work on Book-Off Day. Working on a rostered day off. Double time, minimum 4 hours (Cl. 136). |
| **Lift-up / Buildup** | Driver signs on before rostered start. Ordinary rate within 8-hr total; OT rate beyond. |
| **Layback / Extend** | Driver signs off after rostered end. Same rate rules as lift-up. |
| **KM credit** | Under Cl. 146.4, intercity drivers doing ≥161 km are credited more hours than actually worked (26-band table). Credited excess paid at ordinary rate, excluded from OT. |
| **Shift penalty** | Per-hour loading for afternoon, night, or early morning shifts. EA rounding: <30 min disregarded, 30–59 min = 1 hr. Not payable Sat/Sun/PH. |
| **Un-associated duties** | Duties not directly associated with train operations (road review, pilot prep, etc.) paid additionally for ≥161 km shifts (Cl. 146.4(d)). |
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
- KM distance auto-filled from uploaded schedule file (v3.1)
- Cl. 157.1: greater-of rule (scheduled shift time vs km-credited hrs + un-associated time)

### 5.6 WOBOD (Cl. 136)
- Double time on all hours, minimum 4 hours paid

### 5.7 Lift-up / Layback / Buildup (Cl. 131 / Cl. 140.1)
- Auto-detected from actual vs rostered times
- Gap hours: ordinary rate within 8-hr total, OT rate beyond 8

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
| LWOP | Leave without pay | — | $0 |

---

## 6. File Upload Requirements

### 6.1 Roster and schedule file architecture (v3.1)

Three distinct roster/schedule documents exist, all in the same ZIP-based format (manifest.json + text layer + image layer per page):

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
- File format: ZIP archive (disguised as .pdf) containing `manifest.json` + `.txt` + `.jpeg` per page
- Parser extracts for each roster line (1–22, 201–210): per-day diagram name, sign-on, sign-off, cross-midnight flag, rostered hours, fatigue units
- Uploaded once per year; replaces built-in roster data for lines 1–22

### 6.5 Fortnight Roster upload (FR-U2)
- Endpoint: `POST /api/parse-fortnight-roster`
- Same ZIP format as master roster
- Used exclusively for swinger lines 201–210
- Uploaded at the start of each fortnight

### 6.6 Schedule upload (FR-U3) — weekday or weekend
- Endpoint: `POST /api/parse-schedule`
- Same ZIP format; weekday vs weekend auto-detected from filename (DRWD = weekday, DRWE = weekend)
- Extracts per diagram: sign-on (12-hr → 24-hr converted), sign-off, total shift hours, distance (KM), cross-midnight
- Diagram number is the primary key (e.g. `"3151"`)

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

### FR-01: Fortnight Setup (updated v3.1)
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

### FR-02: Daily entry
- 14 collapsible day rows
- Work-shift day: actual start/end, KMs (auto-filled if schedule uploaded), WOBOD, cross-midnight, Use rostered, leave type
- OFF/ADO day: diagram input, Load diagram, Worked (no diagram), reset banner
- Fill all with rostered times button

### FR-03: Pay calculation
- `POST /api/calculate` — server-side EA 2025 engine
- Client-side preview for immediate feedback while typing
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
- Full Cl. 146.4 reference table

### FR-07: Reset and toggling
- Diagram picker always has a reset path
- No irrecoverable locked state

### FR-08: ADO handling
- Short/long auto-detect from roster data
- Short: ADO paid; Long: ADO accruing

### FR-09: Lift-up / Layback / Buildup
- Auto-detected from actual vs rostered
- Ordinary/OT split at 8-hr boundary

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
- CORS: allow_origins=["*"] (personal tool, no sensitive data)
- No user authentication required

### NFR-07: Maintainability
- All EA clause references visible in UI
- Pay rates configurable without code changes (config.yaml)
- Roster data in `backend/data/roster.json` (built-in fallback)
- ZIP-based roster/schedule files replace built-in data when uploaded
- PRD updated before any implementation change

### NFR-08: Auditability
- Every pay component shows: name, EA ref, payroll code, hours, rate, amount
- Roster source always indicated in UI (Master / Fortnight / Built-in)

---

## 9. Data Model

### 9.1 Day state (frontend)
```ts
interface DayState {
  date: string;           // YYYY-MM-DD
  dow: number;            // 0=Sun, 6=Sat
  ph: boolean;
  diag: string;           // '3158 RK' | 'OFF' | 'ADO'
  _origDiag?: string;     // original before manual override
  rStart: string | null;  // rostered start HH:MM
  rEnd: string | null;    // rostered end HH:MM
  cm: boolean;            // cross-midnight
  rHrs: number;           // rostered hours
  aStart: string;         // actual start HH:MM
  aEnd: string;           // actual end HH:MM
  wobod: boolean;
  km: number;             // KM distance (auto-filled from schedule if available)
  leaveCat: string;
  manualDiag: string | null;
  manualDiagInput: string;
  workedOnOff: boolean;
  isShortFortnight: boolean;
}
```

### 9.2 API request — `POST /api/calculate`
```json
{
  "fortnight_start": "2025-08-10",
  "roster_line": 7,
  "public_holidays": ["2025-08-11"],
  "payslip_total": 4250.00,
  "config": { "base_rate": 49.81842, "..." },
  "codes": { "base": "ORD", "..." },
  "days": [ "...DayState[]" ],
  "unassoc_amt": 0.0
}
```

### 9.3 API response — `POST /api/calculate`
*(unchanged from v3.0 — see §9.3 above)*

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
    "3152": {
      "diag_num": "3152",
      "day_type": "weekday",
      "sign_on": "01:00",
      "sign_off": "09:00",
      "r_hrs": 8.0,
      "km": 0.0,
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

## 12. API Endpoints (v3.1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/api/roster` | Return built-in roster.json |
| `GET`  | `/api/config` | Return EA 2025 rate config |
| `POST` | `/api/calculate` | Full fortnight calculation |
| `POST` | `/api/parse-master-roster` | Parse annual master roster ZIP |
| `POST` | `/api/parse-fortnight-roster` | Parse per-fortnight swinger roster ZIP |
| `POST` | `/api/parse-schedule` | Parse weekday or weekend schedule ZIP (auto-detected) |
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

### 13.2 Setup tab (v3.1)

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
*(unchanged from v3.0)*

### 13.4 Results tab
*(unchanged from v3.0)*

### 13.5 Rates & Codes tab
*(unchanged from v3.0)*

### 13.6 KM Table tab
*(unchanged from v3.0)*

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
| 3.0 | April 2026 | Architecture change: React frontend + FastAPI backend; file upload requirements; solution design; PRD-first process rule |
| 3.1 | April 2026 | Roster architecture redesign: master roster (lines 1–22, annual), fortnight roster (lines 201–210, per-fortnight), weekday/weekend schedule files (KM auto-fill). New API endpoints. Swinger line rules. Roster source indicator. ZIP file format documented. |

---

*This PRD is the authoritative requirements document. All new inputs, features, or calculation changes must be reflected here first (version bump + changelog entry), then implemented in code.*
