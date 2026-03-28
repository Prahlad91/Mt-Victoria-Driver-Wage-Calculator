# Mt Victoria Driver Wage Calculator

A web-based wage calculator for Mt Victoria intercity train drivers at Sydney Trains, built to the **Sydney Trains & NSW TrainLink Enterprise Agreement 2025**. It lets drivers enter their actual worked times against their rostered lines for a given fortnight and calculates their exact gross pay — including all penalties, overtime, KM credits, and allowances — so they can verify their payslip line by line.

## What this app does

- **Select your roster line** — all 32 Mt Victoria roster lines (lines 1–22 and 201–210) are embedded, with rostered start/end times pre-filled
- **Set your fortnight start date** — pick any Sunday to align with your pay period
- **Enter actual times** — input the real start and finish times for each shift
- **Calculates your gross pay** including:
  - Ordinary hours at your base rate
  - Shift penalties per hour (Cl. 134.3) with EA rounding
  - Overtime (1.5× for first 2 hours, 2.0× beyond — Cl. 140.1)
  - Public holiday rates (weekday 1.5×, weekend 2.5× — Cl. 31)
  - WOBOD double time with 4-hour minimum (Cl. 136)
  - KM credits across all 26 bands (Cl. 146.4)
  - Greater-of intercity payment rule (Cl. 157.1)
- **Payslip variance audit** — compare calculated pay against your actual payslip with payroll code fields for line-by-line matching

## 2025 Enterprise Agreement update

The Sydney Trains & NSW TrainLink Enterprise Agreement 2025 was approved by the Fair Work Commission in August 2025 following a ballot in which 92% of workers voted yes. Key changes reflected in this calculator:

| Change | Detail |
|--------|--------|
| Pay rise | 12% over 3 years |
| Back pay | 4% back-dated to 1 May 2024 |
| Base rate | $49.81842/hr (Sch. 4A — configurable) |
| Effective from | 1 July 2025 |

All EA 2025 clauses applied in the calculator:

- **Sch. 4A** — all classification rates
- **Sch. 4B Items 6/7/8/9** — shift penalties (per hour, Cl. 134.3(b) rounding)
- **Cl. 134.3(a)** — penalties not payable on Sat/Sun/PH
- **Cl. 140.1** — overtime (1.5× first 2 hrs, 2.0× beyond)
- **Cl. 146.4(a)–(j)** — full KM credit system (all 26 bands)
- **Cl. 157.1** — greater-of payment basis for intercity
- **Cl. 31** — public holiday rates
- **Cl. 136** — WOBOD double time, minimum 4 hrs

## Deploy to Vercel (2 minutes)

### Option A — Vercel CLI (fastest)

```bash
# 1. Install Vercel CLI (once only)
npm install -g vercel

# 2. From this folder, deploy
vercel

# Follow the prompts:
#   Set up and deploy? → Y
#   Which scope? → your account
#   Link to existing project? → N
#   Project name? → mt-victoria-wage-calc (or anything)
#   Directory? → ./  (just press Enter)
#   Override settings? → N
#
# Vercel prints a URL like: https://mt-victoria-wage-calc.vercel.app
# That's it — share the URL.
```

### Option B — Vercel Dashboard (no CLI needed)

1. Go to [vercel.com](https://vercel.com) and sign in (free account)
2. Click **Add New → Project**
3. Click **"Deploy without Git"** or drag this folder into the upload area
4. Vercel auto-detects it as a static site and deploys instantly
5. Share the generated URL

### Option C — GitHub + Vercel (best for ongoing updates)

```bash
# 1. Push this repo to GitHub (already done if you're reading this here)

# 2. Connect to Vercel
# Go to vercel.com → New Project → Import from GitHub
# Select this repo → Deploy
# Auto-deploys on every push from then on
```

## What's in this repo

| File | Purpose |
|------|---------|
| `index.html` | The complete single-file calculator app |
| `vercel.json` | Vercel deployment configuration |
| `HourlyPayGrade/` | Pay grade reference data |
