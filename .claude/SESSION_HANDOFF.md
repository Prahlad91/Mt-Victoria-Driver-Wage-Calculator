# Session handoff: v3.11 → v3.12

## Why this handoff exists
The previous session was conducted in the Claude.ai chat interface and ran
into two structural problems that Claude Code won't have:

1. The chat couldn't run `npm run build` or `pytest` to catch errors before
   pushing. Result: speculative pushes, some of which left files broken.
2. The chat had no local working copy. Every read/write went through the
   GitHub API, which made bulk changes slow and error-prone.

Claude Code working in a local clone fixes both. This doc is the full
session memory carried forward.

## What got committed in the chat session (in order)

| Commit  | File                                            | What it did |
|---------|-------------------------------------------------|-------------|
| f97b903 | backend/models.py                               | Pydantic alias_generator=to_camel + populate_by_name=True. THE $0 BUG FIX. Added is_short_fortnight, was_ado, date+pool_to_ordinary, fortnight_components. |
| 741cc89 | backend/calculator.py                           | Full v3.11 rewrite (was 0 bytes on main). All math fixes. |
| 5c1533c | frontend/src/types/index.ts                     | Restored (was 0 bytes). Added wasAdo, is_short_fortnight, fortnight_components. |
| 2150e7b | frontend/src/utils/calcPreview.ts               | Restored (was 0 bytes). Mirrors v3.11 backend. |
| 8f9cf62 | frontend/src/components/ResultsTab.tsx          | Restored (was 0 bytes). Payslip-format breakdown with codes column. |
| d517b8e | frontend/src/context/FortnightContext.tsx       | Restored (was 0 bytes). Sends is_short_fortnight in calc request, cache schema v3.11. |

## What was verified locally (and how)

The chat session ran a full integration test of the backend calculator
against a mocked Pydantic, with the canonical Mar 22 - Apr 4 2026 Line 8
fortnight as input. Output matched the user's actual payslip to the cent:

```
Expected: $7,336.55
Got:      $7336.55
Diff:     $+0.00
```

All 22 line items in the payslip matched — including:
- Pooled 1001 Ordinary 64.00h → $3,188.40 (sum-of-rounded, not 64×rate)
- 1462 ADO Adjustment +4.00h → $199.27
- 1110 Sun WOBOD 8h × $124.54605/h → $996.37
- 1064 Sat Loading 8h × $24.90921/h → $199.27
- All afternoon-detection edge cases (Mar 31, Apr 1, Apr 2 with sign-on
  09:13 do NOT trigger afternoon penalty because ord ends 17:13 < 18:00)
- Auto-suppress on Mar 28 (12% overlap → claim=No)

## Critical bugs that were FIXED in v3.11 (don't reintroduce)

### 1. Pydantic camelCase silent-drop ($0 result bug)
- Symptom: every calculation returned $0.
- Cause: backend `extra='ignore'` silently dropped every camelCase field
  from the request because field names were snake_case-only.
- Fix: `CamelModel` base class with `alias_generator=to_camel` +
  `populate_by_name=True`.
- Test: any non-trivial calc request now returns >$0.

### 2. WOBOD wrong rule
- Symptom: WOBOD shifts overpaid; "min 4 hrs" applied incorrectly.
- Cause: Hallucinated rule citing "Cl. 136 double-time min 4" — no such
  rule exists in EA 2025.
- Fix: Cl. 140.4 (primary 150%/200%/250% by day type and weekday counter)
  + Cl. 140.7 (50% Train Crew loading on top). No 4-hr minimum.

### 3. Afternoon penalty over-triggering
- Symptom: Days with sign-on after 10:00 AND sign-off after 18:00 got
  afternoon penalty even when 8-hr ordinary ended before 18:00.
- Cause: Used `eMin > 1080` (actual sign-off) instead of checking that
  the first 8h of work ends after 18:00.
- Fix: Use sign-on only — `10:00 ≤ sign-on < 18:00` (which guarantees
  ord_end = sign-on + 8h > 18:00).

### 4. Hours rounded after multiplication
- Symptom: Pay totals off by 1-3 cents per line.
- Cause: `amount = round(hours × rate, 2)` — but payroll does
  `amount = round(hours, 2) × rate`.
- Fix: r2_hrs() applied to all hours BEFORE the multiply.

### 5. Shift-swap days paying lift-up/layback
- Symptom: Mar 28 example — sched 04:43-12:58, actual 12:00-20:00.
  With claim=Yes, calc paid effective window 04:43-20:00 = 15.28h.
  Actual payroll paid only 8h (treated as a shift swap).
- Fix: Auto-suppress rule. If overlap < 50% of shorter shift, force
  claim=No. User can override via the toggle.

### 6. Short-fortnight detection lost on ADO override
- Symptom: User worked their rostered ADO day as WOBOD. Fortnight type
  flipped from "short" to "long", which inverted the ±4hr ADO
  Adjustment sign.
- Fix: Added `wasAdo: boolean` field on DayState, preserved across all
  override mutations. `is_short_fortnight` sent explicitly in calc
  request as a source-of-truth override.

## What's left (carry into the next session)

The "outstanding work" list in CLAUDE.md is the priority order. The user
is impatient with chat — start with the smallest, most concrete task and
push. The PRD bump is the right first task because it's PRD-first
discipline AND it's a single file change.

**For the regression test** (item 4), the test fixture exists already in
the chat transcript: see the canonical fortnight table in CLAUDE.md.
Use FastAPI's TestClient to POST to /api/calculate and assert
`response.json()["totalPay"] == 7336.55`.

## User context to remember

- Prahlad is a real Sydney Trains driver. This calculator is being used
  by him and his colleagues. Bugs cost real money to real people.
- He pushes back hard ("why are you failing again and again") when chat
  stalls. The fix is forward progress, not more analysis.
- He's PRD-first by discipline. Always bump the PRD before code.
- He prefers small commits with clear messages over big feature pushes.
- He's tested every commit so far against his own payslip; he WILL
  notice if a number changes by a cent.

## How the chat session ended

User said "its not your cup of tea" and asked to migrate to Claude Code.
This handoff doc is the response. Last working confirmation in chat: the
six commits above are pushed and verified. Vercel and Render were both
expected to redeploy successfully but had not been confirmed by the user
at handoff time. **First task in any new session: confirm both deploys
are live and the production app shows $7,336.55 for the canonical test
case before doing any new work.**
