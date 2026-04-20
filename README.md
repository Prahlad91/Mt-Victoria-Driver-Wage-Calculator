# Mt Victoria Driver Wage Calculator

A personal wage calculator for Sydney Trains intercity drivers based at Mt Victoria depot, built against the **Sydney Trains & NSW TrainLink Enterprise Agreement 2025**.

---

## Architecture

```
┌──────────────────────────────┐     HTTPS     ┌─────────────────────────────┐
│  React + Vite (TypeScript)   │ ─────────────▶│  FastAPI + Pydantic v2      │
│  Vercel (free)               │   /api/*      │  Render free tier           │
│  /legacy → legacy index.html │               │  uvicorn                    │
└──────────────────────────────┘               └─────────────────────────────┘
```

- **Frontend:** `frontend/` — React 18, Vite, TypeScript, no UI library
- **Backend:** `backend/` — FastAPI, Pydantic v2, pdfplumber, openpyxl, reportlab
- **Legacy app:** `index.html` served at `/legacy` as a fallback

---

## EA 2025 Rules Implemented

| Rule | EA clause | Detail |
|------|-----------|--------|
| Ordinary time | Sch. 4A | $49.81842/hr base, Sat 1.5×, Sun 2.0× |
| Overtime | Cl. 140.1 | 1.5× first 2 hrs, 2.0× beyond; Sat OT 2.0× |
| Public holidays | Cl. 31 | Weekday 1.5×, Weekend 2.5× |
| Shift penalties | Sch.4B Items 6–9 | Afternoon $4.84/hr, Night $5.69/hr, Early $4.84/hr, Additional $5.69/shift flat; Cl. 134.3(b) rounding |
| KM credit | Cl. 146.4 | 26-band table, credited excess at ordinary rate, excluded from OT |
| WOBOD | Cl. 136 | 2.0×, min 4 hrs |
| Lift-up / Layback / Buildup | Cl. 131 / Cl. 140.1 | Auto-detected from actual vs rostered times |
| ADO | Cl. 120 | Short fortnight = 8 hrs ordinary paid; Long = accruing only |
| Leave | Cl. 30–32 | SL, CL, AL (8hrs + 20% loading), PHNW, PHW, BL, JD, PD, LWOP |

**EA 2025 changes:** 12% pay rise, $49.81842/hr base rate (was $44.48), 4% back pay.

---

## Local Development

### Prerequisites
- Python 3.11+
- Node 18+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run tests (22 unit tests)
pytest tests/ -v

# Start API server
uvicorn main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
cd frontend
npm install

# Point to local backend
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
# → http://localhost:5173
```

> The legacy calculator is still available in `index.html` at http://localhost:5173/legacy

---

## Deployment

### Step 1 — Deploy backend to Render (free tier)

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect your `Prahlad91/Mt-Victoria-Driver-Wage-Calculator` GitHub repo
3. Use these settings (or Render will pick them up from `render.yaml` automatically):
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** Free
4. Click **Deploy**. Wait for it to go live (first deploy ~2–3 min).
5. Copy your service URL — it will look like `https://mt-victoria-wage-calc-api.onrender.com`

> ⚠️ **Free tier cold starts:** Render free services sleep after 15 min of inactivity. First request after sleep takes ~30 seconds. This is acceptable for personal use.

### Step 2 — Update the backend URL in vercel.json

If your Render URL is different from the placeholder, edit `vercel.json`:

```bash
# In vercel.json, replace:
"dest": "https://mt-victoria-wage-calc-api.onrender.com/api/$1"
# with your actual Render URL
```

Commit and push the change.

### Step 3 — Deploy frontend to Vercel (free tier)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import `Prahlad91/Mt-Victoria-Driver-Wage-Calculator`
3. Vercel will auto-detect the `vercel.json` config. **No changes needed.**
4. Click **Deploy**. Your app will be live at `https://mt-victoria-wage-calc-api.vercel.app` (or your custom domain).

> The `/legacy` route will continue to serve the original `index.html` calculator.

---

## Project Structure

```
├── index.html                  # Legacy calculator (served at /legacy)
├── vercel.json                 # Vercel deploy config + API proxy
├── render.yaml                 # Render deploy config
├── PRD.md                      # Product requirements document v3.0
├── SOLUTION_DESIGN.md          # Architecture + API + component map
│
├── backend/
│   ├── main.py                 # FastAPI app (7 routes)
│   ├── calculator.py           # EA 2025 calculation engine
│   ├── parsers.py              # PDF roster + XLSX/PDF payslip parsers
│   ├── exporters.py            # reportlab PDF + CSV export
│   ├── models.py               # Pydantic v2 models
│   ├── config.yaml             # EA 2025 rate constants
│   ├── requirements.txt
│   ├── runtime.txt             # Python 3.11
│   ├── data/
│   │   ├── roster.json         # All 32 Mt Victoria roster lines
│   │   ├── km_bands.json       # Cl. 146.4 KM credit table
│   │   └── leave_cats.json     # Leave categories
│   └── tests/
│       ├── conftest.py
│       └── test_calculator.py  # 22 unit tests (all EA rules)
│
└── frontend/
    ├── src/
    │   ├── App.tsx             # Tab router
    │   ├── main.tsx
    │   ├── context/
    │   │   └── FortnightContext.tsx  # All global state + API calls
    │   ├── components/
    │   │   ├── SetupTab.tsx    # Fortnight setup + upload cards
    │   │   ├── DailyEntryTab.tsx
    │   │   ├── DayRow.tsx      # Per-day entry + live preview
    │   │   ├── ResultsTab.tsx  # Results + payslip comparison + audit
    │   │   ├── RatesTab.tsx    # Rate + code configuration
    │   │   └── KmTableTab.tsx  # Cl. 146.4 reference table
    │   ├── constants/
    │   │   └── roster.ts       # All 32 roster lines (embedded)
    │   ├── styles/
    │   │   └── globals.css
    │   ├── types/index.ts
    │   └── utils/
    │       ├── calcPreview.ts  # Client-side live preview
    │       ├── dateUtils.ts
    │       └── eaRules.ts      # EA rule helpers + LEAVE_CATS
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/calculate` | Full fortnight calculation (EA 2025) |
| `POST` | `/api/parse-roster` | Parse uploaded roster PDF |
| `POST` | `/api/parse-payslip` | Parse NSW or Sydney Crew XLSX/PDF payslip |
| `GET`  | `/api/roster` | Return all roster lines as JSON |
| `GET`  | `/api/config` | Return current EA 2025 rate config |
| `POST` | `/api/export/pdf` | Export results as PDF |
| `POST` | `/api/export/csv` | Export results as CSV |

Full Swagger docs at `http://localhost:8000/docs` when running locally.

---

## Payslip Formats Supported

| Format | File | Auto-detected |
|--------|------|---------------|
| NSW Payslip | `NSW_Payslip.xlsx` | ✅ by sheet name |
| Sydney Crew Payslip | `Sydney_Crew_Payslip.xlsx` | ✅ by sheet name |
| Payslip PDF | Any `.pdf` | ✅ via pdfplumber |

---

*For personal use only. Not financial or legal advice. Always verify against your official payslip.*
