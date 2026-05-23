# Load test results — 23 May 2026

**Target**: `https://mt-victoria-driver-wage-calculator.onrender.com` (Render free tier, single uvicorn worker, ~512 MB RAM, shared CPU)

**Tool**: Locust 2.34 (`loadtest/locustfile.py`)

**Test client**: MacBook Pro on residential network. Network adds ~50–100 ms RTT to every request.

---

## TL;DR

| Metric | Result |
|---|---|
| Cold start (server asleep ≥15 min) | **31.8 s** |
| Warm `/health` p50 | 250 ms |
| `/api/calculate` p50 (1 user) | 250 ms |
| **Max concurrent users (calculate) with 0 failures** | **400+** |
| Knee of latency curve (calculate) | ~200 users (p95 stays < 700 ms) |
| **Catastrophic ceiling: PDF parse blocks entire backend** | **~3 min 39 s per call**, fully serial |
| Sustained throughput at 400 users | **52 req/s** |

## Headline numbers

**The `/api/calculate` endpoint scales much better than I predicted.** Pre-test I'd estimated ~10–20 concurrent users would degrade; in practice the backend held 400 concurrent simulated drivers with 100% success at p95 = 1.8 s. The calculator is pure Python arithmetic — no DB, no I/O — so a single uvicorn worker on shared CPU dispatches it in ~230 ms with no contention up to ~200 users.

**The `/api/parse-*` endpoints are catastrophically slow.** A 762 KB fortnight-roster PDF parse on the live backend takes **~3 min 39 s** — vs ~2 s on a developer laptop. Render's shared CPU + 512 MB RAM gives pdfplumber a hard time. The same worker handles every request, so for the entire 3+ minutes that parse runs, **no other user can hit `/api/calculate` or anything else**.

## Ramp test — `/api/calculate`

Each level: ramp at `users / 5` per second to target, hold for 30–60 s. Test client adds ~50 ms RTT.

| Users | Throughput | p50 | p90 | p95 | p99 | Max | Failures |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.2 req/s | 250 ms | 270 ms | 270 ms | 270 ms | 270 ms | 0% |
| 10 | 1.6 req/s | 230 ms | 270 ms | 290 ms | 310 ms | 870 ms | 0% |
| 25 | 3.9 req/s | 240 ms | 310 ms | 330 ms | 400 ms | 730 ms | 0% |
| 50 | 7.6 req/s | 230 ms | 320 ms | 350 ms | 730 ms | 750 ms | 0% |
| 100 | 15 req/s | 230 ms | 340 ms | 450 ms | 540 ms | 760 ms | 0% |
| 200 | 30 req/s | 230 ms | 380 ms | 660 ms | 790 ms | 890 ms | 0% |
| 400 | 52 req/s | 270 ms | 1.3 s | 1.8 s | 2.8 s | 3.5 s | 0% |

**Interpretation:**

- **Up to 200 users**: indistinguishable from idle. p95 < 700 ms.
- **200 → 400 users**: knee. Median is still fine (270 ms) but the long tail (p95–p99) blows past 1 s and is user-visible. No failures yet.
- **400 users**: the soft ceiling. p99 = 2.9 s, max = 3.5 s. A driver hitting "Calculate" would wait 1–3 s. Still no errors.
- **Beyond 400**: not tested but extrapolating from the curve, expect first error responses (timeouts, 5xx) around 600–800 concurrent users.

## Parse endpoint — single user

| Action | Wall-clock | Notes |
|---|---:|---|
| `POST /api/parse-fortnight-roster` with 762 KB PDF | **3 min 39 s** | Returned 200 with 36 lines correctly parsed |

I didn't bother stress-testing parse concurrency because a single call is so slow that the system is effectively serialised on it. Three drivers uploading simultaneously would mean the third waits ~11 minutes — which is broken UX, full stop.

## Cold-start probe

| Probe | Wall-clock |
|---|---:|
| First request after >15 min idle | **31.8 s** |
| Subsequent requests (warm) | 250 ms |

Render free tier sleeps the instance after 15 min of inactivity. The first user every fortnight (or every quiet afternoon) eats this hit.

## Realistic capacity for Mt Victoria depot

| Scenario | Concurrent active drivers | Verdict on current infra |
|---|---:|---|
| Day-to-day, no uploads | up to ~200 | ✅ Fine |
| Right after payslip drop, many calculating | up to ~400 | ⚠️ Slow tail but no errors |
| Anyone uploading a roster | 1 | ❌ Blocks whole backend ~3 min 39 s |
| First user every 15 min of quiet | 1 | ❌ 30 s cold-start hit |

## Implications for the auth / commercial-rollout discussion

1. The **`/api/calculate` path is genuinely production-ready** as far as raw throughput goes. The earlier worry about single-worker bottleneck on calc was wrong — empirically it holds 400 users.
2. The **`/api/parse-*` path must move off the request hot path** before any wider rollout. Options, cheapest first:
   - Cache parsed results server-side (admin uploads once → all users read JSON; today's 3:39 happens once per fortnight roster, not per user).
   - Move parsing to a background job (Vercel Queues, Celery, or a separate worker process), respond immediately, frontend polls.
   - Move OFF Render free tier — Render Starter or Standard with 2 GB RAM cuts parse time roughly in half.
3. **Cold start** must be eliminated regardless — paid Render tier, or a keep-alive cron pinging `/health` every 10 min.
4. The earlier capacity claim of "~10–20 concurrent users" in my §2 estimate was too pessimistic for `/api/calculate` and too optimistic about parse. New claim to communicate to Sydney Trains:

   > **Calculator: comfortably 200 simultaneous users on current infrastructure, 400 with tolerable tail. PDF uploads must be cached server-side or done by an admin once per fortnight — they cannot be on the user request path.**

## Reproducing this test

```bash
cd loadtest
pip install locust    # one-time
python3 -m locust -f locustfile.py DriverUser --headless \
    -u 100 -r 20 -t 60s \
    -H https://mt-victoria-driver-wage-calculator.onrender.com \
    --only-summary
```

Swap `DriverUser` for `ParseUser` to hit the heavy path. Be mindful that each `ParseUser` request consumes ~4 minutes of server time and ~1 MB of bandwidth.
