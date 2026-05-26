"""FastAPI application entry point — Mt Victoria Driver Wage Calculator.
PRD ref: Section 7 (Functional Requirements), Solution Design Section 4.2"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional
import io
import json
import os
from pathlib import Path

from models import (
    CalculateRequest, CalculateResponse,
    ParseRosterResponse, ParsePayslipResponse,
    ParsedRosterResponse, ParsedScheduleResponse,
    ParseAssocChartResponse,
)
from calculator import compute_fortnight
from parsers import (
    parse_roster_pdf, parse_payslip_file,
    parse_roster_zip, parse_schedule_zip,
    parse_assoc_chart_file,
)
from exporters import render_pdf, render_csv
from db import (
    save_artifact, get_latest_artifact, close_pool,
    # v3.31 auth
    EMP_ID_RE, RATE_LIMIT_IP_HOUR,
    list_allowed_employees, get_employee, add_allowed_employee,
    remove_allowed_employee, unlock_employee,
    mark_login_success, increment_failed_attempts,
    record_login_attempt, count_recent_ip_failures,
    recent_audit_for_employee, cleanup_old_audit_rows,
)
from auth import issue_jwt, verify_jwt, extract_bearer, InvalidTokenError
import asyncio
import random
from datetime import datetime, timezone
from pydantic import BaseModel, Field


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """FastAPI lifespan — ensures the asyncpg pool is closed on shutdown.
    Pool is created lazily on first use; nothing to do on startup."""
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(
    title="Mt Victoria Driver Wage Calculator API",
    description="EA 2025 pay calculation engine for Mt Victoria intercity train drivers.",
    version="3.22.0",
    lifespan=lifespan,
)

# CORS — allow all origins (personal tool, no sensitive data)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "3.31.0"}


# ─── v3.31: Driver authentication (employee ID → JWT) ───────────────────────
#
# Drivers log in with their 8-digit employee ID.  No password.  The ID must
# be in the `allowed_employees` allowlist (managed by admin) and not locked.
# IP-based rate limiting (5 fails / hour) + per-ID lockout (10 fails / 24h)
# defend against brute-force enumeration of the 10^8 ID space.
#
# Successful login returns a 7-day JWT (HS256, signed with JWT_SECRET).  The
# frontend stores it in localStorage and sends it as Authorization: Bearer
# on every subsequent driver request.

class LoginRequest(BaseModel):
    employee_id: str = Field(..., description="8-digit numeric employee ID")


class LoginResponse(BaseModel):
    token: str
    role: str
    employee_id: str


def _client_ip(request: Request) -> Optional[str]:
    """Best-effort client IP — prefers X-Forwarded-For (set by Render / Vercel
    proxies) and falls back to the direct socket address."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # XFF can be a comma-separated chain; the leftmost is the original client
        return xff.split(",", 1)[0].strip()
    return request.client.host if request.client else None


async def _maybe_cleanup_audit() -> None:
    """Opportunistic background cleanup: 1% probability per login attempt.
    Runs as an asyncio task so it doesn't delay the login response."""
    if random.random() < 0.01:
        try:
            await cleanup_old_audit_rows()
        except Exception:
            pass  # cleanup failures should never affect login


@app.post("/api/auth/login", response_model=LoginResponse)
async def auth_login(body: LoginRequest, request: Request):
    """Driver login.  Takes an 8-digit employee ID, returns a 7-day JWT.

    Order of checks (each failure is audited):
      1. Format check — must be exactly 8 digits
      2. IP rate limit — reject if this IP has >5 failures in the last hour
      3. Allowlist lookup — reject if the ID isn't in `allowed_employees`
      4. Lockout check — reject if the ID's `locked_until` is in the future
      5. Success — reset counters, mint JWT
    """
    from fastapi import Request as _R  # noqa
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    submitted = (body.employee_id or "").strip()

    # Dispatch retention cleanup in the background (non-blocking).
    asyncio.create_task(_maybe_cleanup_audit())

    # 1. Format
    if not EMP_ID_RE.match(submitted):
        await record_login_attempt(submitted or "<empty>", ip, ua, "failed_invalid_format")
        raise HTTPException(status_code=400, detail="Employee ID must be exactly 8 digits.")

    # 2. IP rate limit
    recent_ip_fails = await count_recent_ip_failures(ip, hours=1)
    if recent_ip_fails >= RATE_LIMIT_IP_HOUR:
        await record_login_attempt(submitted, ip, ua, "failed_rate_limited_ip")
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts from this network. "
                   "Please try again in 1 hour.",
        )

    # 3. Allowlist
    emp = await get_employee(submitted)
    if not emp:
        await record_login_attempt(submitted, ip, ua, "failed_not_allowlisted")
        # Don't reveal whether the ID exists — generic error.
        raise HTTPException(status_code=401, detail="Invalid employee ID.")

    # 4. Lockout
    locked_until_iso = emp.get("locked_until")
    if locked_until_iso:
        try:
            lu = datetime.fromisoformat(locked_until_iso)
            if lu.tzinfo is None:
                lu = lu.replace(tzinfo=timezone.utc)
            if lu > datetime.now(timezone.utc):
                await record_login_attempt(submitted, ip, ua, "failed_locked")
                # Soft message — don't leak the exact unlock time.
                raise HTTPException(
                    status_code=423,
                    detail="This account is temporarily locked due to repeated failed "
                           "sign-in attempts. Contact your admin to unlock.",
                )
        except ValueError:
            pass  # malformed locked_until — treat as not locked

    # 5. Success
    await mark_login_success(submitted)
    await record_login_attempt(submitted, ip, ua, "success")

    # If JWT_SECRET isn't configured, surface that explicitly rather than 500.
    try:
        token = issue_jwt(submitted, role="driver")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return LoginResponse(token=token, role="driver", employee_id=submitted)


def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> dict:
    """FastAPI dependency: returns the JWT claims of the current driver.
    Raises 401 if no token / invalid / expired."""
    token = extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to use this endpoint.")
    try:
        return verify_jwt(token)
    except InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}")


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    """Return the current driver's identity (from JWT).  Used by the frontend
    on app mount to validate that a stored JWT is still valid before showing
    the calculator.  Returns the JWT claims — { sub, role, iat, exp }."""
    return {
        "employee_id": user.get("sub"),
        "role": user.get("role", "driver"),
        "issued_at": user.get("iat"),
        "expires_at": user.get("exp"),
    }


# ─── v3.31: Admin allowlist CRUD (gated by ADMIN_PASSWORD) ──────────────────

class AddEmployeeRequest(BaseModel):
    employee_id: str = Field(..., description="8-digit numeric employee ID")
    label: Optional[str] = Field(None, description="optional name / notes for admin reference")


@app.get("/api/admin/employees")
async def admin_list_employees(
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: list every allowlisted employee with their lockout/login status.
    Powers the Drivers admin tab in the frontend."""
    _require_admin(x_admin_password, x_admin_token)
    return {"employees": await list_allowed_employees()}


@app.post("/api/admin/employees")
async def admin_add_employee(
    body: AddEmployeeRequest,
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: add an employee to the allowlist.  Idempotent — re-adding an
    existing ID returns 200 with `added: false`."""
    _require_admin(x_admin_password, x_admin_token)
    eid = (body.employee_id or "").strip()
    if not EMP_ID_RE.match(eid):
        raise HTTPException(status_code=400, detail="Employee ID must be exactly 8 digits.")
    try:
        added = await add_allowed_employee(eid, body.label, created_by="admin")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"employee_id": eid, "added": added}


@app.delete("/api/admin/employees/{employee_id}")
async def admin_remove_employee(
    employee_id: str,
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: remove an employee from the allowlist.  Their audit-log history
    is intentionally preserved for forensic visibility."""
    _require_admin(x_admin_password, x_admin_token)
    removed = await remove_allowed_employee(employee_id.strip())
    if not removed:
        raise HTTPException(status_code=404, detail="Employee not found in allowlist.")
    return {"employee_id": employee_id, "removed": True}


@app.post("/api/admin/employees/{employee_id}/unlock")
async def admin_unlock_employee(
    employee_id: str,
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: clear an employee's lockout + failure counter so they can log
    in immediately.  Used to recover legit drivers who hit the auto-lockout."""
    _require_admin(x_admin_password, x_admin_token)
    unlocked = await unlock_employee(employee_id.strip())
    if not unlocked:
        raise HTTPException(status_code=404, detail="Employee not found in allowlist.")
    return {"employee_id": employee_id, "unlocked": True}


@app.get("/api/admin/audit")
async def admin_audit_log(
    employee_id: str = Query(..., description="8-digit employee ID to inspect"),
    limit: int = Query(25, ge=1, le=200),
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: return the most recent N login attempts for a given employee
    ID, ordered newest-first.  Useful for investigating sharing patterns or
    debugging lockouts."""
    _require_admin(x_admin_password, x_admin_token)
    return {
        "employee_id": employee_id,
        "limit": limit,
        "attempts": await recent_audit_for_employee(employee_id.strip(), limit=limit),
    }


# ─── Admin auth stopgap (v3.22 — proper JWT in follow-up PR) ────────────────
# This is NOT real auth.  It's a shared-secret header check designed to keep
# drive-by traffic off the admin write endpoints while the proper JWT layer is
# being built.  Set ADMIN_TOKEN in Render + Vercel env vars.  If ADMIN_TOKEN is
# unset (e.g. local dev), admin endpoints are unreachable — explicit rather
# than silently open.

def _require_admin(
    x_admin_password: Optional[str] = None,
    x_admin_token: Optional[str] = None,
) -> None:
    """Verify the admin shared secret.

    v3.28: prefers `ADMIN_PASSWORD` env var + `X-Admin-Password` header, but
    falls back to the legacy `ADMIN_TOKEN` env var + `X-Admin-Token` header so
    a Vercel/Render deploy out-of-order doesn't break admin sign-in during
    the rollout window.  Once both platforms have the new vars set, the old
    fallbacks can be removed."""
    expected = (
        (os.environ.get("ADMIN_PASSWORD") or "").strip()
        or (os.environ.get("ADMIN_TOKEN") or "").strip()
    )
    if not expected:
        raise HTTPException(
            status_code=503,
            detail=(
                "Admin uploads disabled: server has no ADMIN_PASSWORD configured. "
                "Set the ADMIN_PASSWORD env var on the backend to enable. "
                "(The legacy ADMIN_TOKEN env var also still works.)"
            ),
        )
    submitted = (x_admin_password or x_admin_token or "").strip()
    if not submitted or submitted != expected:
        raise HTTPException(status_code=401, detail="Invalid admin password.")


# ─── Session-id validation (v3.23 — per-user fortnight roster) ──────────────
# The frontend generates a UUID once per browser on first load (persisted in
# localStorage as `mvwc_session_id`) and sends it as `X-Session-Id` on every
# fortnight-roster request.  This scopes the DB row to that browser so each
# driver only ever replaces their OWN previous fortnight roster.
#
# This is NOT auth — anyone who steals a session id could read/overwrite that
# driver's roster.  The proper user-level auth lands in the separate JWT PR.

import re

_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def _require_session_id(x_session_id: Optional[str]) -> str:
    """Validate that X-Session-Id looks like a UUID-ish token.  Return the
    sanitised value or raise 400.  Rejects empty, too-short, and characters
    outside `[A-Za-z0-9_-]` to keep junk out of the uploaded_by column."""
    if not x_session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing X-Session-Id header.  Reload the page to get a fresh session id.",
        )
    sid = x_session_id.strip()
    if not _SESSION_ID_RE.match(sid):
        raise HTTPException(
            status_code=400,
            detail="X-Session-Id must be 16-64 chars of [A-Za-z0-9_-].",
        )
    return sid


# ─── Roster and config data ──────────────────────────────────────────────────

@app.get("/api/roster")
def get_roster():
    """Return all 32 Mt Victoria roster lines. PRD §6.1"""
    roster_path = DATA_DIR / "roster.json"
    if not roster_path.exists():
        raise HTTPException(status_code=404, detail="roster.json not found")
    return json.loads(roster_path.read_text())


@app.get("/api/config")
def get_config():
    """Return current pay rate configuration from config.yaml. PRD §9.3"""
    import yaml
    config_path = Path(__file__).parent / "config.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


# ─── Core calculation ────────────────────────────────────────────────────────

@app.post("/api/calculate", response_model=CalculateResponse)
def calculate(req: CalculateRequest, user: dict = Depends(get_current_user)):
    """Calculate gross pay for a full fortnight. PRD §FR-03.

    v3.32: requires a valid driver JWT.  user.sub = employee_id (currently
    unused by the calculator but available for audit logging in the future)."""
    try:
        return compute_fortnight(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")


# ─── File uploads: new roster ZIP endpoints ─────────────────────────────────────

@app.post("/api/parse-master-roster", response_model=ParsedRosterResponse)
async def upload_master_roster(file: UploadFile = File(...)):
    """
    Parse the annual master roster ZIP file.
    Used for lines 1–22 (and optionally 201–210 as a template).
    File format: ZIP archive containing manifest.json + .txt + .jpeg pages.
    """
    content = await file.read()
    try:
        return parse_roster_zip(content, filename=file.filename or "master_roster")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Master roster parse failed: {str(e)}")


@app.post("/api/parse-fortnight-roster", response_model=ParsedRosterResponse)
async def upload_fortnight_roster(file: UploadFile = File(...)):
    """
    Parse the per-fortnight roster ZIP file.
    Used for swinger lines 201–210 (changes each fortnight).
    File format: same ZIP structure as master roster.
    """
    content = await file.read()
    try:
        return parse_roster_zip(content, filename=file.filename or "fortnight_roster")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Fortnight roster parse failed: {str(e)}")


@app.post("/api/parse-schedule", response_model=ParsedScheduleResponse)
async def upload_schedule(file: UploadFile = File(...)):
    """
    Parse a weekday or weekend schedule ZIP file.
    Provides diagram-level detail: sign-on, sign-off, KMs, cross-midnight.
    The schedule type (weekday/weekend) is auto-detected from the filename.
    File format: ZIP archive containing manifest.json + .txt + .jpeg pages.
    """
    content = await file.read()
    try:
        return parse_schedule_zip(content, filename=file.filename or "schedule")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Schedule parse failed: {str(e)}")


# ─── File uploads: legacy fortnight roster PDF ─────────────────────────────────────

@app.post("/api/parse-roster", response_model=ParseRosterResponse)
async def upload_roster(file: UploadFile = File(...)):
    """
    Legacy endpoint: parse a Sydney Trains fortnightly roster PDF (table-based format).
    For the new ZIP-based roster format, use /api/parse-master-roster or
    /api/parse-fortnight-roster instead.
    """
    _validate_upload(file, allowed_types=["application/pdf"], max_mb=10)
    content = await file.read()
    try:
        return parse_roster_pdf(content, filename=file.filename or "roster.pdf")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Roster parse failed: {str(e)}")


@app.post("/api/parse-payslip", response_model=ParsePayslipResponse)
async def upload_payslip(file: UploadFile = File(...)):
    """Parse a Sydney Trains payslip (XLSX or PDF)."""
    allowed = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/pdf",
        "application/octet-stream",
    ]
    _validate_upload(file, allowed_types=allowed, max_mb=10)
    content = await file.read()
    try:
        return parse_payslip_file(content, filename=file.filename or "payslip")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Payslip parse failed: {str(e)}")


# ─── Assoc/Un-assoc chart upload (v3.12) ────────────────────────────────────

@app.post("/api/parse-assoc-chart", response_model=ParseAssocChartResponse)
async def upload_assoc_chart(file: UploadFile = File(...)):
    """
    Parse an Associated & Un-associated Payments Chart.
    Accepts CSV (.csv, .txt), PDF (.pdf), or image (.png, .jpg, .jpeg, .webp, .bmp, .tiff).
    Returns diagram → {unAssocMins, assocPaymentMins} for all non-zero entries.
    Image parsing requires Tesseract OCR (server-side); CSV and PDF always work.
    """
    content = await file.read()
    try:
        return parse_assoc_chart_file(content, filename=file.filename or "chart")
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Chart parse failed: {str(e)}")


# ─── Export ───────────────────────────────────────────────────────────────────

@app.post("/api/export/pdf")
def export_pdf(result: CalculateResponse):
    try:
        pdf_bytes = render_pdf(result)
        return StreamingResponse(
            io.BytesIO(pdf_bytes), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="wage_calc_{result.fortnight_start}.pdf"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")


@app.post("/api/export/csv")
def export_csv(result: CalculateResponse):
    try:
        csv_text = render_csv(result)
        return StreamingResponse(
            io.StringIO(csv_text), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="wage_calc_{result.fortnight_start}.csv"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")


# ─── Admin uploads — parse + persist (v3.22 / v3.23) ────────────────────────
#
# Admin-published artifacts are uploaded once per change-cycle (typically once
# per year for master roster / schedules / chart) and read by every driver.
# Gated by the X-Admin-Password (or legacy X-Admin-Token) shared secret.
#
# The fortnight roster does NOT live here — per v3.23 it is user-driven, see
# the next section below.

_SCHEDULE_TYPES = {"weekday", "weekend"}


@app.post("/api/admin/upload-roster", response_model=ParsedRosterResponse)
async def admin_upload_master_roster(
    file: UploadFile = File(...),
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse the master roster ZIP/PDF and persist globally.
    Only the master roster is admin-uploaded; the fortnight roster is per-user
    (POST /api/upload-fortnight-roster).  Annual cadence."""
    _require_admin(x_admin_password, x_admin_token)
    content = await file.read()
    try:
        parsed = parse_roster_zip(content, filename=file.filename or "master_roster")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Roster parse failed: {e}")
    await save_artifact(
        kind="master_roster",
        payload=parsed.model_dump(),
        source_file=file.filename or "master_roster",
    )
    return parsed


@app.post("/api/admin/upload-schedule", response_model=ParsedScheduleResponse)
async def admin_upload_schedule(
    type: str = Query(..., description="schedule type: 'weekday' or 'weekend'"),
    file: UploadFile = File(...),
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse a weekday/weekend schedule and persist for all drivers."""
    _require_admin(x_admin_password, x_admin_token)
    if type not in _SCHEDULE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(_SCHEDULE_TYPES)}")
    content = await file.read()
    try:
        parsed = parse_schedule_zip(content, filename=file.filename or f"{type}_schedule")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Schedule parse failed: {e}")
    await save_artifact(
        kind="schedule",
        sub_kind=type,
        payload=parsed.model_dump(),
        source_file=file.filename or f"{type}_schedule",
    )
    return parsed


@app.post("/api/admin/upload-chart", response_model=ParseAssocChartResponse)
async def admin_upload_chart(
    file: UploadFile = File(...),
    x_admin_password: Optional[str] = Header(None, alias="X-Admin-Password"),
    x_admin_token:    Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse an assoc/un-assoc payments chart and persist for all drivers."""
    _require_admin(x_admin_password, x_admin_token)
    content = await file.read()
    try:
        parsed = parse_assoc_chart_file(content, filename=file.filename or "chart")
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Chart parse failed: {e}")
    saved_id = await save_artifact(
        kind="assoc_chart",
        payload=parsed.model_dump(),
        source_file=file.filename or "chart",
    )
    # v3.38: If save_artifact returned None the DB is not configured on this
    # server.  The chart was parsed correctly but is NOT persisted — it will
    # only exist in the uploading admin's browser localStorage and other
    # drivers will not see it.  Surface this as an explicit warning so the
    # admin knows to set DATABASE_URL in the Render environment variables.
    warnings = list(parsed.warnings)
    if saved_id is None:
        warnings.append(
            "⚠ Chart was parsed successfully but NOT saved to the database "
            "(DATABASE_URL is not configured on this server). The chart only "
            "exists in your browser's local storage — other drivers will NOT "
            "see this update until DATABASE_URL is set on Render and the chart "
            "is re-uploaded."
        )
    from models import ParseAssocChartResponse
    return ParseAssocChartResponse(
        source_file=parsed.source_file,
        chart=parsed.chart,
        warnings=warnings,
    )


# ─── User-driven fortnight roster (v3.23) ───────────────────────────────────
#
# Each driver uploads their own fortnight roster every ~14 days.  Scoped to the
# uploader's session id (X-Session-Id header — a UUID generated once per
# browser by the frontend, persisted in localStorage).  Each new upload by the
# same session replaces (soft-deletes) that session's prior fortnight roster
# row, leaving other drivers' rows untouched.

@app.post("/api/upload-fortnight-roster", response_model=ParsedRosterResponse)
async def user_upload_fortnight_roster(
    file: UploadFile = File(...),
    x_session_id: Optional[str] = Header(None, alias="X-Session-Id"),
):
    """User: parse a fortnight roster ZIP/PDF and persist scoped to this browser.
    No admin token required — every driver does this individually each fortnight."""
    sid = _require_session_id(x_session_id)
    content = await file.read()
    try:
        parsed = parse_roster_zip(content, filename=file.filename or "fortnight_roster")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Fortnight roster parse failed: {e}")
    await save_artifact(
        kind="fortnight_roster",
        payload=parsed.model_dump(),
        source_file=file.filename or "fortnight_roster",
        uploaded_by=sid,
        scope_by_uploader=True,
    )
    return parsed


@app.get("/api/fortnight-roster/current", response_model=ParsedRosterResponse)
async def get_current_fortnight_roster(
    x_session_id: Optional[str] = Header(None, alias="X-Session-Id"),
):
    """User: return this browser's most recently uploaded fortnight roster."""
    sid = _require_session_id(x_session_id)
    row = await get_latest_artifact(kind="fortnight_roster", uploaded_by=sid)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No fortnight roster uploaded for this session yet.",
        )
    return ParsedRosterResponse.model_validate(row["payload"])


# ─── Admin-published reads (v3.22) ──────────────────────────────────────────
#
# Public reads of the admin-published artifacts.  Return 404 when no admin
# upload exists yet — frontend falls back to its localStorage cache.

@app.get("/api/roster/current", response_model=ParsedRosterResponse)
async def get_current_master_roster():
    """Return the latest admin-published master roster.  Public read."""
    row = await get_latest_artifact(kind="master_roster")
    if row is None:
        raise HTTPException(status_code=404, detail="No master roster published yet.")
    return ParsedRosterResponse.model_validate(row["payload"])


@app.get("/api/schedule/current", response_model=ParsedScheduleResponse)
async def get_current_schedule(
    type: str = Query(..., description="schedule type: 'weekday' or 'weekend'"),
):
    """Return the latest admin-published schedule of the requested type."""
    if type not in _SCHEDULE_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(_SCHEDULE_TYPES)}")
    row = await get_latest_artifact(kind="schedule", sub_kind=type)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No {type} schedule published yet.")
    return ParsedScheduleResponse.model_validate(row["payload"])


@app.get("/api/chart/current", response_model=ParseAssocChartResponse)
async def get_current_chart():
    """Return the latest admin-published assoc/un-assoc chart."""
    row = await get_latest_artifact(kind="assoc_chart")
    if row is None:
        raise HTTPException(status_code=404, detail="No assoc/un-assoc chart published yet.")
    return ParseAssocChartResponse.model_validate(row["payload"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile, allowed_types: list[str], max_mb: int):
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(allowed_types)}",
        )
