# Mt Victoria Driver Wage Calculator

Sydney Trains & NSW TrainLink Enterprise Agreement 2025 wage calculator for Mt Victoria intercity drivers.

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
# 1. Create a GitHub repo and push this folder
git init
git add .
git commit -m "Initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/wage-calc.git
git push -u origin main

# 2. Connect to Vercel
# Go to vercel.com → New Project → Import from GitHub
# Select your repo → Deploy
# Auto-deploys on every push from then on
```

## What's in this repo

| File | Purpose |
|------|---------|
| `index.html` | The complete single-file calculator app |
| `vercel.json` | Vercel deployment configuration |

## Calculator features

- All 32 Mt Victoria roster lines (1–22, 201–210) embedded
- Custom fortnight start date — any Sunday
- Actual vs rostered times comparison
- Shift penalties per hour (Cl. 134.3) with EA rounding
- Full Cl. 146.4 KM credit table (all 26 bands)
- Cl. 157.1 greater-of rule for intercity payments
- Overtime, public holiday, WOBOD, lift-up calculations
- Payslip variance audit
- Payroll code fields for line-by-line matching

## EA 2025 rules applied

- Base rate: $49.81842/hr (configurable)
- Sch. 4A: all classification rates
- Sch. 4B Items 6/7/8/9: shift penalties (per hour, Cl. 134.3(b) rounding)
- Cl. 140.1: overtime (1.5× first 2 hrs, 2.0× beyond)
- Cl. 134.3(a): penalties not payable Sat/Sun/PH
- Cl. 146.4(a)–(j): full KM credit system
- Cl. 157.1: greater-of payment basis
- Cl. 31: public holiday rates (weekday 1.5×, weekend 2.5×)
- Cl. 136: WOBOD double time, min 4 hrs
