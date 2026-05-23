"""Locust load test for the Mt Victoria Wage Calculator backend.

Two user classes:
- DriverUser: models a typical driver — mostly hits /api/calculate with realistic
  think time. Use this for ramp tests up to 100 concurrent users.
- ParseUser: models burst PDF uploads — hits the (much heavier) parse endpoints.
  Use sparingly; each call blocks the single Render worker for 3-8 seconds.

Run examples:
    # Light: 10 driver users, ramp at 2/s, 60s duration
    locust -f locustfile.py DriverUser --headless -u 10 -r 2 -t 60s \\
        -H https://mt-victoria-driver-wage-calculator.onrender.com

    # Web UI mode (recommended) — opens http://localhost:8089
    locust -f locustfile.py DriverUser \\
        -H https://mt-victoria-driver-wage-calculator.onrender.com
"""
from __future__ import annotations
import json
import random
from locust import HttpUser, task, between

from payload import CALCULATE_PAYLOAD


class DriverUser(HttpUser):
    """Models a driver tweaking actuals + recalculating periodically.

    Weight ratio in tasks reflects ~90% calculate, ~10% health probe.  Think
    time 3-10s mirrors a real user editing time fields between calculations.
    """
    wait_time = between(3, 10)

    @task(9)
    def calculate(self) -> None:
        # Vary roster_line slightly per request so the server can't cache trivially.
        payload = dict(CALCULATE_PAYLOAD)
        payload["rosterLine"] = random.choice([1, 5, 8, 12, 17])
        with self.client.post(
            "/api/calculate",
            json=payload,
            name="POST /api/calculate",
            timeout=60,
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"HTTP {resp.status_code}: {resp.text[:200]}")
                return
            try:
                data = resp.json()
            except json.JSONDecodeError:
                resp.failure("non-JSON response")
                return
            # Sanity check: the canonical fortnight should always return ≥$3000.
            total = data.get("totalPay") or data.get("total_pay") or 0
            if total < 3000:
                resp.failure(f"suspicious totalPay: {total}")

    @task(1)
    def health(self) -> None:
        self.client.get("/health", name="GET /health", timeout=15)


class ParseUser(HttpUser):
    """Models a driver uploading a PDF for parsing. WAY heavier than calculate.

    Run this with very small u (e.g. -u 3 -r 1) — each parse blocks the single
    Render worker for several seconds.  This is the worst-case load.
    """
    wait_time = between(2, 5)  # tight loop for stress test

    def on_start(self) -> None:
        # Load the canonical fortnight PDF once per simulated user.
        import pathlib

        pdf_path = (
            pathlib.Path(__file__).resolve().parents[1]
            / "docs"
            / "Mount Victoria Drivers Next Fortnight (2).pdf"
        )
        if not pdf_path.exists():
            self.environment.runner.quit()
            raise FileNotFoundError(f"PDF not found at {pdf_path}")
        self._pdf_bytes = pdf_path.read_bytes()
        self._pdf_name = pdf_path.name

    @task
    def parse_fortnight_roster(self) -> None:
        files = {"file": (self._pdf_name, self._pdf_bytes, "application/pdf")}
        with self.client.post(
            "/api/parse-fortnight-roster",
            files=files,
            name="POST /api/parse-fortnight-roster",
            timeout=120,
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"HTTP {resp.status_code}")
                return
            try:
                data = resp.json()
            except json.JSONDecodeError:
                resp.failure("non-JSON")
                return
            lines = data.get("lines") or {}
            if len(lines) < 30:
                resp.failure(f"only {len(lines)} lines parsed — expected ~36")
