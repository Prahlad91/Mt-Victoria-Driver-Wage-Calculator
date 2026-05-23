# Load test harness

Quick capacity-validation suite for the Mt Victoria Wage Calculator backend.

## Setup

```bash
pip install locust    # one-time, ~30 MB
```

## Run

The `locustfile.py` defines two user classes; pick one per invocation.

### `DriverUser` — light realistic load on `/api/calculate`

Models a driver hitting Calculate with realistic 3–10 s think time between requests.
This is the safe one to ramp up — calculate is fast.

```bash
# Web UI mode (recommended; live charts at http://localhost:8089)
python3 -m locust -f locustfile.py DriverUser \
    -H https://mt-victoria-driver-wage-calculator.onrender.com

# Headless: 100 users, 60s
python3 -m locust -f locustfile.py DriverUser --headless \
    -u 100 -r 20 -t 60s \
    -H https://mt-victoria-driver-wage-calculator.onrender.com \
    --only-summary
```

### `ParseUser` — heavy PDF upload load on `/api/parse-fortnight-roster`

Each request blocks the Render worker for ~3 min 39 s (see `RESULTS.md`).
Use **very small** `-u` values, otherwise the queue depth balloons.

```bash
python3 -m locust -f locustfile.py ParseUser --headless \
    -u 1 -r 1 -t 600s \
    -H https://mt-victoria-driver-wage-calculator.onrender.com \
    --only-summary
```

## What to look at

| Stat | Healthy | Worrying |
|---|---|---|
| `failures` | 0% | any > 0 |
| `p50` | < 500 ms | > 1 s |
| `p95` | < 1 s | > 2 s |
| `p99` | < 2 s | > 5 s |
| `Max` | < 5 s | > 10 s |
| `req/s` | scales linearly with `-u` | plateaus → backend saturated |

## Files

| File | Purpose |
|---|---|
| `locustfile.py` | User-class definitions (DriverUser, ParseUser) |
| `payload.py` | Canonical $7,336.55 calculate payload (lifted from regression test) |
| `RESULTS.md` | 23 May 2026 baseline measurements |

## Cautions

- Tests hit the **live production Render backend**. Don't run at high concurrency for long durations — Render free tier has a 100 GB/month bandwidth cap.
- `ParseUser` consumes ~3.5 min of server time per request. Each user spawned ties up the worker.
- Stop the test (Ctrl-C) if you see failures > 5% — you've found the ceiling, no need to keep hammering.
