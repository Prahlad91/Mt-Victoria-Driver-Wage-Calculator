# Solution Design
# Mt Victoria Driver Wage Calculator — v3.0

**Date:** April 2026  
**Status:** Approved — implements PRD v3.0  
**Derived from:** PRD.md (read that first)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React SPA)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐  │
│  │  Setup   │ │  Daily   │ │ Results  │ │ Rates  │ │  KM    │  │
│  │   Tab    │ │  Entry   │ │   Tab    │ │& Codes │ │ Table  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ └────────┘  │
│       │             │             │            │                  │
│  ┌────┴─────────────┴─────────────┴────────────┴────────────┐   │
│  │                    React Context / State                   │   │
│  │         (fortnight state, config, upload status)          │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │ fetch() / axios                      │
└───────────────────────────┼─────────────────────────────────────┘
                            │ HTTP/REST
┌───────────────────────────▼─────────────────────────────────────┐
│                   FastAPI Backend (Python)                        │
│                                                                  │
│  POST /api/calculate        ← fortnight state → pay result       │
│  POST /api/parse-roster     ← PDF upload → parsed day entries    │
│  POST /api/parse-payslip    ← XLSX/PDF upload → line items       │
│  GET  /api/roster           ← returns roster.json                │
│  GET  /api/config           ← returns current config.yaml        │
│  POST /api/export/pdf       ← result JSON → PDF bytes            │
│  POST /api/export/csv       ← result JSON → CSV bytes            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ calculator.py│  │  parsers.py  │  │     exporters.py     │  │
│  │  (EA logic)  │  │  (PDF/XLSX)  │  │  (PDF/CSV output)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    data/                                  │   │
│  │  roster.json   config.yaml   km_bands.json               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Calculation logic lives in the Python backend (single source of truth)
- Frontend has a lightweight "preview" calculation (client-side) for instant feedback as the user types
- The server calculation is authoritative and used for final results, export, and payslip comparison
- No database: state is transient per session; config is persisted in localStorage + config.yaml on backend
- File uploads are session-scoped and deleted after 1 hour

---

## 2. Repository Structure

```
Mt-Victoria-Driver-Wage-Calculator/
│
├── PRD.md                          # Product requirements (update before code)
├── SOLUTION_DESIGN.md              # This document
├── README.md                       # Setup and deployment guide
│
├── frontend/                       # React (Vite + TypeScript)
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # Tab routing, global state provider
│       ├── context/
│       │   └── FortnightContext.tsx # Global fortnight state + config
│       ├── types/
│       │   └── index.ts            # DayState, PayComponent, ApiResponse, etc.
│       ├── constants/
│       │   └── roster.ts           # ROSTER data (imported from backend JSON)
│       ├── hooks/
│       │   ├── useCalculate.ts     # POST /api/calculate
│       │   ├── useUploadRoster.ts  # POST /api/parse-roster
│       │   └── useUploadPayslip.ts # POST /api/parse-payslip
│       ├── utils/
│       │   ├── calcPreview.ts      # Lightweight client-side calc for live preview
│       │   ├── dateUtils.ts        # toSunday, makeFortnight, fmtDate, etc.
│       │   └── eaRules.ts          # getKmCredit, roundHrsEA, getShiftPenalty
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Header.tsx
│       │   │   └── TabBar.tsx
│       │   ├── setup/
│       │   │   ├── SetupTab.tsx
│       │   │   ├── FortnightSetupCard.tsx
│       │   │   ├── UploadRosterCard.tsx
│       │   │   ├── UploadPayslipCard.tsx
│       │   │   ├── DateChips.tsx
│       │   │   └── PenaltyReferenceTable.tsx
│       │   ├── daily/
│       │   │   ├── DailyEntryTab.tsx
│       │   │   ├── DayRow.tsx
│       │   │   ├── WorkShiftForm.tsx
│       │   │   ├── OffAdoForm.tsx
│       │   │   ├── ManualDiagForm.tsx
│       │   │   ├── ResetBanner.tsx
│       │   │   ├── LeaveSelector.tsx
│       │   │   └── DayResultTable.tsx
│       │   ├── results/
│       │   │   ├── ResultsTab.tsx
│       │   │   ├── MetricCards.tsx
│       │   │   ├── FortnightTable.tsx
│       │   │   ├── ComponentTotalsTable.tsx
│       │   │   ├── PayslipComparison.tsx
│       │   │   ├── AuditSection.tsx
│       │   │   └── ExportButtons.tsx
│       │   ├── config/
│       │   │   ├── RatesTab.tsx
│       │   │   ├── RateGrid.tsx
│       │   │   └── PayrollCodeGrid.tsx
│       │   └── km/
│       │       └── KmTableTab.tsx
│       └── styles/
│           └── globals.css
│
├── backend/                        # Python FastAPI
│   ├── main.py                     # FastAPI app, route definitions
│   ├── calculator.py               # All EA pay calculation logic
│   ├── parsers.py                  # PDF and XLSX parsing
│   ├── exporters.py                # PDF and CSV export
│   ├── models.py                   # Pydantic request/response models
│   ├── config.yaml                 # Pay rates, OT multipliers, thresholds
│   ├── requirements.txt
│   └── data/
│       ├── roster.json             # All 32 Mt Victoria roster lines
│       ├── km_bands.json           # KM credit table (Cl. 146.4)
│       └── leave_cats.json         # Leave category definitions
│
├── vercel.json                     # Frontend deployment (Vercel)
└── render.yaml                     # Backend deployment (Render)
```

---

## 3. Frontend Design

### 3.1 Technology stack
- **React 18** with TypeScript
- **Vite** as build tool (fast HMR, small bundles)
- **No UI library** — custom CSS (mirrors the existing app's design language: flat, clean, card-based)
- **React Context** for global fortnight state
- **fetch API** for backend calls (no axios dependency)
- **No Redux / Zustand** — context is sufficient for this app's complexity

### 3.2 State architecture

```ts
// FortnightContext.tsx
interface FortnightContextValue {
  // Setup
  rosterLine: number;
  fnStart: string;
  fnType: 'short' | 'long';
  publicHolidays: string[];
  payslipTotal: number | null;

  // Days
  days: DayState[];          // 14 day objects
  setDay: (i: number, patch: Partial<DayState>) => void;

  // Config
  config: RateConfig;
  codes: PayrollCodes;
  setConfig: (c: Partial<RateConfig>) => void;

  // Upload state
  rosterUpload: UploadState | null;   // parsed roster from PDF
  payslipUpload: UploadState | null;  // parsed payslip from XLSX

  // Results
  result: CalculateResponse | null;
  calculating: boolean;
  calculate: () => Promise<void>;

  // Actions
  loadLine: (line: number, startDate: string) => void;
  applyUploadedRoster: () => void;
  resetDay: (i: number) => void;
}
```

### 3.3 Client-side preview calculation

`calcPreview.ts` is a lightweight port of the Python calculator logic. It runs synchronously in the browser as the user types, providing immediate feedback in each day row. It is **not** used for final results — the server calculation is authoritative. This avoids round-trip latency for every keystroke while keeping the server as the source of truth for the final "Calculate fortnight" action.

### 3.4 File upload flow

```
User drops file on UploadRosterCard
  → useUploadRoster hook sends multipart/form-data POST to /api/parse-roster
  → Shows loading spinner
  → On success: stores ParsedRoster in context, shows preview of parsed days
  → User clicks "Apply uploaded roster" in Daily Entry toolbar
  → applyUploadedRoster() patches days[] with parsed sign-on/sign-off times
  → User reviews and calculates
```

### 3.5 Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| `App.tsx` | Tab routing, context provider wrapping |
| `FortnightContext.tsx` | All state, API calls, business-level actions |
| `SetupTab.tsx` | Orchestrates setup cards |
| `DayRow.tsx` | Single collapsible day — decides which form to show (WorkShiftForm vs OffAdoForm) |
| `WorkShiftForm.tsx` | 6-field grid: start, end, km, wobod, cross-midnight, use-rostered + leave selector |
| `OffAdoForm.tsx` | Diagram input + Load + Worked buttons (when no manual diagram active) |
| `ManualDiagForm.tsx` | Reset banner + WorkShiftForm (when manual diagram is active) |
| `DayResultTable.tsx` | Renders pay components from client-side preview result |
| `ResultsTab.tsx` | Renders server calculation results |
| `PayslipComparison.tsx` | Side-by-side parsed payslip vs calculated result |
| `AuditSection.tsx` | Coloured banners for flags, variance, ADO, OT |

---

## 4. Backend Design

### 4.1 Technology stack
- **FastAPI** (Python 3.11+)
- **pydantic v2** for request/response validation
- **pdfplumber** for PDF parsing (roster and payslip PDFs)
- **openpyxl** for XLSX payslip parsing
- **reportlab** for PDF export
- **python-multipart** for file uploads
- **PyYAML** for config loading
- **uvicorn** as ASGI server

### 4.2 API endpoints

#### `POST /api/calculate`
- **Input:** `CalculateRequest` (Pydantic model — see PRD §9.2)
- **Output:** `CalculateResponse` (see PRD §9.3)
- **Logic:** Calls `calculator.py::compute_fortnight()`
- **Error:** 422 on validation failure; 500 with message on calculation error

#### `POST /api/parse-roster`
- **Input:** `multipart/form-data` with `file` field (PDF)
- **Output:** `ParseRosterResponse` (see PRD §9.4)
- **Logic:** `parsers.py::parse_roster_pdf(file_bytes)`
- Attempts to extract date, diagram, sign-on, sign-off from each row
- Returns `confidence` score per day; low-confidence rows flagged as warnings

#### `POST /api/parse-payslip`
- **Input:** `multipart/form-data` with `file` field (XLSX or PDF)
- **Output:** `ParsePayslipResponse` (see PRD §9.5)
- **Logic:** `parsers.py::parse_payslip_xlsx()` or `parse_payslip_pdf()`
- Auto-detects format (NSW_Payslip vs Sydney_Crew_Payslip) from column headers

#### `GET /api/roster`
- **Output:** Full roster JSON (all 32 lines)
- Reads from `data/roster.json`

#### `GET /api/config`
- **Output:** Current config.yaml as JSON

#### `POST /api/export/pdf`
- **Input:** `CalculateResponse` JSON
- **Output:** `application/pdf` bytes
- **Logic:** `exporters.py::render_pdf(result)`
- Produces a 2-page PDF: summary + 14-day breakdown

#### `POST /api/export/csv`
- **Input:** `CalculateResponse` JSON
- **Output:** `text/csv` bytes
- Two sheets: day breakdown + component totals

### 4.3 Calculator module (`calculator.py`)

The authoritative EA calculation engine. Key functions:

```python
def compute_fortnight(req: CalculateRequest) -> CalculateResponse:
    """Entry point. Detects short/long fortnight, processes each day."""

def compute_day(day: DayState, config: RateConfig, is_short_fn: bool) -> DayResult:
    """All pay components for one day."""

def calc_ordinary(actual_hrs, b, day_type) -> List[PayComponent]:
def calc_overtime(actual_hrs, b, day_type) -> List[PayComponent]:
def calc_shift_penalty(s_min, e_min, ord_hrs, day_type, config) -> List[PayComponent]:
def calc_km_credit(km, actual_hrs, b, day_type) -> List[PayComponent]:
def calc_liftup_layback(actual_start, actual_end, r_start, r_end, cm, actual_hrs, b, day_type) -> List[PayComponent]:
def calc_wobod(actual_hrs, b, config) -> List[PayComponent]:
def calc_ado(b, is_short_fn) -> Optional[PayComponent]:
def calc_leave(leave_cat, r_hrs, b) -> List[PayComponent]:
def get_km_credit(km: float) -> Optional[float]:  # 26-band table lookup
def round_hrs_ea(hrs: float) -> int:               # Cl. 134.3(b) rounding
```

### 4.4 Parsers module (`parsers.py`)

```python
def parse_roster_pdf(file_bytes: bytes) -> ParseRosterResponse:
    """
    Extracts roster data from Sydney Trains fortnightly roster PDF.
    Strategy:
    1. Use pdfplumber to extract tables from the PDF
    2. Identify rows by date pattern (DD/MM/YYYY or day-of-week headers)
    3. Extract diagram number, sign-on (HH:MM), sign-off (HH:MM) per row
    4. Assign confidence score based on parse quality
    5. Return list of ParsedDayEntry with warnings for low-confidence rows
    """

def parse_payslip_xlsx(file_bytes: bytes) -> ParsePayslipResponse:
    """
    Reads NSW_Payslip.xlsx or Sydney_Crew_Payslip.xlsx.
    Strategy:
    1. Load workbook with openpyxl
    2. Auto-detect format by checking column header patterns
    3. Extract: payroll code, description, hours, rate, amount per row
    4. Sum to total gross for validation
    """

def parse_payslip_pdf(file_bytes: bytes) -> ParsePayslipResponse:
    """
    Fallback for payslip PDFs. Uses pdfplumber table extraction.
    """

def detect_payslip_format(wb) -> str:  # 'nsw_payslip' | 'sydney_crew'
```

### 4.5 Exporters module (`exporters.py`)

```python
def render_pdf(result: CalculateResponse) -> bytes:
    """
    Produces a formatted PDF report using reportlab.
    Page 1: Summary (metric cards, fortnight type, ADO, OT)
    Page 2+: 14-day breakdown table + component totals + audit
    """

def render_csv(result: CalculateResponse) -> str:
    """
    Two sections separated by blank line:
    Section 1: Daily breakdown (date, diagram, type, hrs, pay)
    Section 2: Component totals (component, EA ref, code, amount)
    """
```

### 4.6 Models (`models.py`)

All Pydantic v2 models mirroring the data model in PRD §9.

```python
class DayState(BaseModel): ...
class RateConfig(BaseModel): ...
class PayrollCodes(BaseModel): ...
class CalculateRequest(BaseModel): ...
class PayComponent(BaseModel): ...
class DayResult(BaseModel): ...
class CalculateResponse(BaseModel): ...
class ParsedDayEntry(BaseModel): ...
class ParseRosterResponse(BaseModel): ...
class PayslipLineItem(BaseModel): ...
class ParsePayslipResponse(BaseModel): ...
```

---

## 5. Data Files

### `backend/data/roster.json`
All 32 Mt Victoria roster lines. Format per PRD §9.6. Moved from hardcoded JS constant to a JSON file — editable without touching application code.

### `backend/data/km_bands.json`
```json
[
  { "min_km": 0,   "max_km": 161, "credited_hrs": null },
  { "min_km": 161, "max_km": 193, "credited_hrs": 5.0 },
  ...
  { "min_km": 628, "max_km": 644, "credited_hrs": 19.5 },
  { "min_km": 644, "max_km": null, "increment_per_16km": 0.5, "base_at_644": 19.5 }
]
```

### `backend/data/leave_cats.json`
```json
[
  { "code": "SL", "label": "Sick leave", "ea_ref": "Cl. 30.4", "pay_basis": "rostered_ordinary" },
  ...
]
```

### `backend/config.yaml`
All configurable rates. Identical structure to current config.yaml but with EA 2025 values pre-filled.

---

## 6. Deployment Architecture

```
┌────────────────────┐        ┌────────────────────────┐
│   Vercel (free)    │        │    Render (free tier)   │
│                    │        │                        │
│  frontend/         │──────▶│  backend/              │
│  React SPA         │  CORS  │  FastAPI + uvicorn     │
│  (static build)    │  HTTP  │  (Python 3.11)         │
└────────────────────┘        └────────────────────────┘

Local dev:
  frontend:  npm run dev   → http://localhost:5173
  backend:   uvicorn main:app --reload  → http://localhost:8000
  VITE_API_URL=http://localhost:8000
```

**Fallback:** If backend is unavailable (Render cold start, offline use), the frontend falls back to client-side calculation using `calcPreview.ts`. Export and payslip comparison features are disabled in offline mode.

---

## 7. Development Workflow

### Setup
```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Environment variables
```
# frontend/.env.local
VITE_API_URL=http://localhost:8000

# backend/.env (optional)
MAX_UPLOAD_SIZE_MB=10
SESSION_TTL_MINUTES=60
```

### Adding a new pay rule (PRD-first process)
1. Update `PRD.md` — add/modify the relevant functional requirement and data model
2. Version bump in PRD version history
3. Update `backend/config.yaml` if a new rate constant is needed
4. Add/modify function in `backend/calculator.py`
5. Add/modify Pydantic model in `backend/models.py`
6. Update `frontend/src/utils/calcPreview.ts` to match
7. Update `frontend/src/types/index.ts` if the response shape changes
8. Update the relevant UI component to display the new component
9. Commit: `feat: <description> (implements PRD §X.X)`

### Git conventions
- Branch: `feature/prd-<section>-<description>` or `fix/prd-<section>-<description>`
- Commit message always references PRD section: `feat: add ADO payout (implements PRD §FR-08)`
- PRD update commits: `docs(prd): <what changed> — bump to vX.X`

---

## 8. Implementation Phases

### Phase 1 — Backend foundation (Week 1)
- [ ] FastAPI project setup with all routes stubbed
- [ ] `models.py` — all Pydantic models from PRD §9
- [ ] `calculator.py` — port existing JS logic to Python, fully tested
- [ ] `backend/data/roster.json` — extract roster data from current index.html
- [ ] `backend/data/km_bands.json` and `leave_cats.json`
- [ ] `GET /api/roster` and `GET /api/config` working
- [ ] `POST /api/calculate` working with test cases
- [ ] Unit tests for all calculator functions (pytest)

### Phase 2 — Frontend scaffold (Week 1–2)
- [ ] Vite + React + TypeScript project
- [ ] `types/index.ts` — TypeScript interfaces from PRD §9.1
- [ ] `FortnightContext.tsx` — all state and actions
- [ ] `utils/dateUtils.ts` and `utils/eaRules.ts`
- [ ] `utils/calcPreview.ts` — client-side preview calc
- [ ] Tab bar and routing
- [ ] SetupTab (without upload cards)
- [ ] DailyEntryTab with all day row forms (WorkShiftForm, OffAdoForm, ManualDiagForm, ResetBanner)
- [ ] ResultsTab (basic — no payslip comparison yet)
- [ ] RatesTab and KmTableTab

### Phase 3 — File uploads (Week 2)
- [ ] `parsers.py` — `parse_roster_pdf()` using pdfplumber
- [ ] `parsers.py` — `parse_payslip_xlsx()` for both payslip formats
- [ ] `POST /api/parse-roster` endpoint
- [ ] `POST /api/parse-payslip` endpoint
- [ ] `UploadRosterCard.tsx` — drag-drop, parse status, apply button
- [ ] `UploadPayslipCard.tsx` — drag-drop, parse status
- [ ] `PayslipComparison.tsx` — side-by-side comparison with variance

### Phase 4 — Export and polish (Week 3)
- [ ] `exporters.py` — PDF and CSV
- [ ] `POST /api/export/pdf` and `/csv`
- [ ] `ExportButtons.tsx`
- [ ] Full responsive CSS pass
- [ ] Error states and loading states throughout
- [ ] Offline fallback mode
- [ ] Deployment: Vercel (frontend) + Render (backend)
- [ ] End-to-end test with real roster PDF and payslip XLSX

---

## 9. Testing Strategy

### Backend unit tests (pytest)
- One test per EA rule with known inputs and expected dollar outputs
- Verified against real payslip examples
- Key test cases:
  - Pure weekday ordinary shift (8 hrs exactly)
  - Night shift with penalty (Cl. 134.3(b) rounding)
  - Cross-midnight shift spanning Saturday/Sunday boundary
  - KM credit shift: 290 km = 9.0 credited hrs (verify bonus paid)
  - Short fortnight ADO payout
  - Long fortnight ADO accrual (no payout)
  - Lift-up: started 30 min before rostered — all within 8 hr total
  - Layback: finished 2 hrs after rostered — 1 hr ordinary + 1 hr OT
  - WOBOD on Sunday (double time, min 4 hrs)
  - Payslip variance detection (>$0.10 difference)

### Frontend integration tests
- Load line 2 (has ADO on day 1) → verify SHORT fortnight detected
- Load line 1 (no ADO) → verify LONG fortnight detected
- Enter manual diagram on OFF day → verify reset works
- Upload mock roster PDF → verify apply populates times

---

## 10. Open Questions / Decisions Needed

| # | Question | Decision |
|---|----------|---------|
| 1 | Should the frontend ever make a network request on every keystroke, or only on "Calculate" click? | **Decision: client-side preview on keystrokes; server calculation on Calculate click only** |
| 2 | Render free tier has cold-start latency (~30s first request). Acceptable? | **Decision: yes, with offline fallback message shown during cold start** |
| 3 | Should uploaded files be stored on disk or in memory only? | **Decision: in memory (BytesIO) for session duration, never written to disk** |
| 4 | Do we need user authentication? | **Decision: no — single-user local tool, no auth required** |
| 5 | What happens if the roster PDF format changes (e.g. new Sydney Trains roster layout)? | **Decision: parser is versioned; parse failure falls back gracefully to manual entry with an error message** |

---

*This solution design implements PRD v3.0. Any deviation from this design during implementation must be reflected back in both this document and the PRD.*
