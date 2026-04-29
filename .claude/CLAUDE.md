# Mt Victoria Driver Wage Calculator — Claude Code context

## Project
Sydney Trains Mt Victoria intercity driver wage calculator.
Hosted: frontend on Vercel, backend on Render free tier.
Repo: Prahlad91/Mt-Victoria-Driver-Wage-Calculator, branch `main`.

Production URLs:
- Frontend: https://mt-victoria-driver-wage-calculator.vercel.app
- Backend:  https://mt-victoria-driver-wage-calculator.onrender.com

## Current state (as of 26 Apr 2026, end of v3.11 chat session)
- v3.11 backend is live and verified locally to produce $7,336.55 to the
  cent against the real payslip for Line 8, fortnight starting 22 Mar 2026.
- v3.11 frontend types/calcPreview/ResultsTab/FortnightContext were
  re-pushed after being found empty (0 bytes) on main from a prior bad
  push. Vercel had been falling back to a previously successful build.
- Backend Render deploy and frontend Vercel deploy both should be
  succeeding now — first task in any new session is to verify both.

## Outstanding work (NOT yet done)
1. **DayRow.tsx** — surface the KM value inside the actual times block,
   render the auto-suppress non-overlap warning chip when the calc is
   suppressing a lift-up/layback claim.
2. **SetupTab.tsx** — replace the comma-separated PH text input with a
   multi-date calendar picker. User reports the current input only picks
   up the first PH when multiple are entered.
3. **PRD.md** — bump from v3.10 to v3.11. Fix the EA citations (the old
   `Cl. 136 double-time min 4` line was hallucinated; the correct rule
   is `Cl. 140.4 + Cl. 140.7` with weekday counter). PRD must be
   standalone-readable — no "unchanged from..." placeholders.
4. **Regression test** — write `backend/tests/test_v311_payslip.py`
   asserting the $7,336.55 case end-to-end so future changes are guarded.

## Workflow rules (user-imposed)
1. **PRD-first.** Bump version + changelog BEFORE any code change.
2. **PRD must be standalone-readable.** No "see previous" placeholders.
3. **Verify locally before push.** `cd backend && python -m pytest` and
   `cd frontend && npm run build` must both pass before any commit lands.
4. **Small focused commits.** Push to main directly, but each commit
   does ONE thing.
5. **No long chat preambles.** Push code, narrate briefly. The user is
   impatient with explain-then-do; prefer do-then-explain-the-diff.
6. **Use git branches for risky work.** `git checkout -b ux-polish-v311`,
   not direct-to-main, when touching multiple files at once.

## Domain quick-ref

### ADO (Accrued Day Off) — Cl. 120
- Short fortnight = ADO is paid out as a +4hr Adjustment line (code 1462).
- Long fortnight = ADO accrues only, applied as a -4hr Adjustment.
- A fortnight is "short" if ANY day in the original roster was an ADO,
  even if the user has overridden that day to WORKED via WOBOD. The
  frontend tracks this via `wasAdo: boolean` on each DayState and sends
  `is_short_fortnight` explicitly in the calculate request.

### Diagram numbers
"Diagram", "schedule number", and "roster line entry" are interchangeable.
4-digit codes like 3151, 3154, 3652. Lookups go: weekend schedule (Sat/Sun)
or weekday schedule (Mon-Fri) → master roster → built-in fallback.

### Lift-up / layback / buildup — Cl. 131
- Effective window = `min(scheduledStart, actualStart)` to
  `max(scheduledEnd, actualEnd)`.
- Hours within first 8h pay at ordinary rate; beyond 8h at OT rate.
- NOT a flat 1.5× multiplier (this was wrong in v3.9 and earlier).
- **Auto-suppress rule:** if the actual/scheduled overlap is less than
  50% of the shorter shift, the calc treats it as a shift swap and
  forces `claim=No` regardless of the user's toggle. A warning flag
  is emitted. User can still manually override via the toggle.

### WOBOD (Work on Booked-Off Day) — Cl. 140.4 + Cl. 140.7
- Primary rate (Cl. 140.4) + 50% Train Crew loading (Cl. 140.7).
- Sat WOBOD: 200% primary + 50% loading = 250% combined.
- Sun WOBOD: 250% primary + 50% loading = 300% combined.
- Weekday WOBOD uses an OT-shift counter PER FORTNIGHT:
  - 1st and 2nd weekday WOBOD: 150% primary (code 1100)
  - 3rd+ weekday WOBOD: 200% primary (code 1110)
  - Sat/Sun WOBOD do NOT increment this counter.
- No OT split, no shift penalties, no 4-hr minimum on WOBOD shifts.
  (The "4-hr minimum citing Cl. 136" was hallucinated in v3.10.)

### Afternoon penalty — Cl. 134.1(a)
- Triggers when ordinary time (first 8h of shift) commences before AND
  concludes after 18:00.
- Sign-on rule: `10:00 ≤ sign-on < 18:00`.
- Common bug: triggering on actual sign-off > 18:00 regardless of
  ordinary time end. v3.11 fixed this.

### Other shift penalties (Cl. 134.1)
- Night (Item 7, code 1487): sign-on 18:00 - 03:59
- Early morning (Item 8, code 1483): sign-on 04:00 - 05:30
- Special Loading Item 9 (code 1470): weekday Mon-Fri only,
  sign-on 01:01 - 03:59, NOT on a PH, NOT on an OT shift.

### Payroll codes (real, from user's payslip)
| Code | Description |
|------|-------------|
| 1001 | Ordinary Hours (pooled at fortnight level) |
| 1010 | Public Holiday Paid (weekend PHNW) |
| 1026 | Sched OT 150% |
| 1059 | WOBOD Loading 50% |
| 1064 | Loading 50% Saturday |
| 1100 | Overtime 150% (weekday WOBOD #1, #2) |
| 1110 | Overtime 250% / 200% (Sun WOBOD, Sat WOBOD, weekday WOBOD #3+) |
| 1462 | Accrued Day Off Adjustm |
| 1470 | Special Loading Drvs/Grds |
| 1483 | Morning Shift Drvs/Grds H |
| 1487 | Night Shift Drvs/Grds Hrl |
| 5042 | Public holiday paid (weekday PHNW) |

### KM credit — Cl. 146.4
- Credited hours kick in at ≥161 km. Bands defined in
  `backend/data/km_bands.json` (with fallback hardcoded in
  `backend/calculator.py`) and mirrored in `frontend/src/utils/eaRules.ts`.
- KM credit creates a bonus line if `credited_hrs > worked_hrs`.
- KM falls back to schedule when actual=0 (handled at frontend).

### Rounding rules
- **Hours rounded to 2dp BEFORE multiplying by rate.** This matches the
  payroll system exactly. v3.11 fix.
- **Pooled 1001 line uses sum-of-rounded-per-day.** E.g. 8 days × 8h ×
  $49.81842/h: per-day $398.55 (rounded), sum = $3,188.40. NOT
  64h × $49.81842 = $3,188.38. The payslip uses the former.
- **Cl. 134.3(b)** — penalty hours rounding: <30 min disregarded,
  30-59 min rounds up to 1 full hour.

## The canonical $7,336.55 test fortnight

Line 8, fortnight start `2026-03-22`, PHs `2026-04-03` + `2026-04-04`,
`is_short_fortnight=true` (because Mar 30 was rostered ADO).

| Date | DOW | Diag | Sched | Actual | KM | Notes |
|------|-----|------|-------|--------|----|----|
| Mar 22 | Sun | OFF | — | — | 0 | |
| Mar 23 | Mon | OFF | — | — | 0 | |
| Mar 24 | Tue | 3154 | 01:51-11:21 | 03:20-11:20 | 254.109 | claim=Yes, night shift |
| Mar 25 | Wed | 3155 | 02:27-10:32 | 01:06-09:06 | 254.109 | claim=Yes, lift-up, night |
| Mar 26 | Thu | 3157 | 03:11-12:41 | 04:41-12:42 | 127.489 | claim=Yes, early morning |
| Mar 27 | Fri | 3156 | 02:42-11:41 | 04:20-12:42 | 127.489 | claim=Yes, early morning |
| Mar 28 | Sat | 3652 | 04:43-12:58 | 12:00-20:00 | 254.109 | auto-suppress (12% overlap) |
| Mar 29 | Sun | WOBOD | — | 13:30-21:30 | 0 | Sun WOBOD = 250%+50% |
| Mar 30 | Mon | WOBOD | — | 09:13-18:08 | 0 | wasAdo=true, wkdy WOBOD #1 = 150%+50% |
| Mar 31 | Tue | 3151 [manual] | 09:13-18:08 | 09:13-18:08 | 254.109 | claim=No, no afternoon penalty |
| Apr 1  | Wed | 3152 [manual] | 09:13-18:08 | 09:13-18:08 | 0 | claim=No |
| Apr 2  | Thu | 3153 [manual] | 09:13-18:08 | 09:13-18:08 | 181.954 | claim=No |
| Apr 3  | Fri | — | — | — | 0 | PHNW, code 5042 |
| Apr 4  | Sat | — | — | — | 0 | PHNW, code 1010 |

Expected output:
- Total: **$7,336.55**
- Pooled 1001 Ordinary: 64.00h × $49.81842 = **$3,188.40** (sum-of-rounded)
- 1462 ADO Adjustm: +4.00h × $49.81842 = **$199.27**
- All other line items match payslip to the cent.

## File map

```
backend/
  models.py        Pydantic v2, alias_generator=to_camel + populate_by_name=True
  calculator.py    compute_fortnight() is the entry point
  main.py          FastAPI routes
  parsers.py       PDF parsers + ZIP-of-PDF parsers
  exporters.py     PDF + CSV export
  config.yaml      Default rates and codes
  requirements.txt Python deps
  data/
    km_bands.json  Optional override of Cl. 146.4 bands
  tests/           (currently empty — add test_v311_payslip.py here)

frontend/src/
  App.tsx
  main.tsx
  types/index.ts                     Mirrors backend/models.py
  utils/
    calcPreview.ts                   Mirrors backend, NOT authoritative
    eaRules.ts                       KM bands + Cl. 134.3(b) rounding + LEAVE_CATS
    dateUtils.ts                     Date helpers
  context/FortnightContext.tsx       THE state hub. Sends is_short_fortnight in calc request.
  components/
    SetupTab.tsx                     Roster/schedule/payslip uploads + line loader
    DailyEntryTab.tsx                14-day view with calculate button
    DayRow.tsx                       Per-day expanded form
    ResultsTab.tsx                   Payslip-format breakdown
    RatesTab.tsx                     Rate + code editor
    KmTableTab.tsx                   Cl. 146.4 reference
  constants/roster.ts                Built-in fallback roster lines
  styles/globals.css

PRD.md                               (currently v3.10 — needs bump to v3.11)
README.md
```

## How to run locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# In another terminal
cd frontend
npm install
npm run dev   # http://localhost:5173
```

The frontend dev server proxies `/api/*` to `localhost:8000` via Vite config.

## Key technical gotchas (avoid these regressions)

1. **Pydantic camelCase.** All input models in `backend/models.py` MUST
   inherit from `CamelModel` (which sets `alias_generator=to_camel` and
   `populate_by_name=True`). The frontend sends camelCase (`aStart`,
   `claimLiftupLayback`); without aliases, Pydantic with `extra='ignore'`
   silently drops everything and computes $0.

2. **Cache schema versioning.** `FortnightContext.tsx` has a
   `CACHE_SCHEMA_VERSION` constant. Bump it whenever the schedule parser
   output format changes — it forces stale localStorage cache to clear.
   Currently `'3.11'`.

3. **`wasAdo` preservation.** Every DayState mutator (`loadLine`,
   `applyManualDiag`, `markWorkedOnOff`, `resetDay`) MUST preserve
   `wasAdo`. Losing it during an override breaks short-fortnight
   detection.

4. **WOBOD weekday counter is fortnight-scoped, not day-scoped.** The
   per-day `previewDay()` shows a conservative 150% for ALL weekday
   WOBODs because it doesn't know the counter; the server is
   authoritative. This is intentional — don't try to "fix" the preview
   to match the server, it can't without seeing the whole fortnight.

5. **Pooled 1001 amount = sum of rounded per-day amounts**, NOT
   total_hours × rate. The backend already does this correctly via the
   `pool_to_ordinary` flag on PayComponent — don't change it.
