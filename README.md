# Mt Victoria Driver Wage Calculator

A full-stack web application for Mt Victoria intercity train drivers to verify their fortnightly pay against the Sydney Trains & NSW TrainLink Enterprise Agreement 2025.

**Read the [PRD](./PRD.md) before making any changes. Read the [Solution Design](./SOLUTION_DESIGN.md) before writing any code.**

---

## Architecture

```
frontend/   React (Vite + TypeScript) — UI only
backend/    FastAPI (Python) — EA calculation engine, file parsing, export
```

## Local Development

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:5173
```

### Environment variables
```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8000
```

---

## Key Features

- All 32 Mt Victoria roster lines (1–22, 201–210) embedded
- EA 2025 rules applied exactly: Cl. 134.3, 140.1, 146.4, 157.1, 31, 136, 30.x, 32.1
- Short vs long fortnight auto-detection (ADO payout vs accrual)
- Lift-up / layback / buildup: auto-detected, paid at correct rate tier
- **Roster PDF upload** — parse sign-on/sign-off from fortnightly roster
- **Payslip XLSX/PDF upload** — parse line items for side-by-side comparison
- Export to PDF or CSV
- Payslip variance audit with per-line comparison

---

## Deployment

**Frontend (Vercel):**
1. Connect repo to Vercel
2. Build command: `cd frontend && npm install && npm run build`
3. Output directory: `dist`

**Backend (Render):**
1. Connect repo to Render
2. Root directory: `backend`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set env var `ALLOWED_ORIGINS` to your Vercel URL

---

## Adding a new pay rule (PRD-first process)

1. Update `PRD.md` — add/modify the requirement, bump version
2. Update `backend/config.yaml` if a new rate is needed
3. Update `backend/calculator.py`
4. Update `backend/models.py`
5. Update `frontend/src/utils/calcPreview.ts` to match
6. Update `frontend/src/types/index.ts` if response shape changes
7. Update the relevant UI component
8. Commit: `feat: <description> (implements PRD §X.X)`

---

## EA 2025 rates (current)

| Component | Rate | EA ref |
|-----------|------|--------|
| Base hourly | $49.81842/hr | Sch. 4A |
| OT tier 1 | 1.5× (first 2 hrs) | Cl. 140.1 |
| OT tier 2 | 2.0× (beyond 2 hrs) | Cl. 140.1 |
| Saturday | 1.5× | Cl. 54/134 |
| Sunday | 2.0× | Cl. 133/54 |
| PH weekday | 1.5× | Cl. 31 |
| PH weekend | 2.5× | Cl. 31 |
| WOBOD | 2.0×, min 4 hrs | Cl. 136 |
| Night shift | $5.69/hr | Sch.4B Item 7 |
| Afternoon shift | $4.84/hr | Sch.4B Item 6 |
| Early morning | $4.84/hr | Sch.4B Item 8 |
| Additional loading | $5.69/shift flat | Sch.4B Item 9 |

---

## Version History

See `PRD.md` Section 15.
