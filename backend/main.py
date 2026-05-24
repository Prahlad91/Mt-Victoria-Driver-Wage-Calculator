"""FastAPI application entry point — Mt Victoria Driver Wage Calculator.
PRD ref: Section 7 (Functional Requirements), Solution Design Section 4.2"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Query
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
from db import save_artifact, get_latest_artifact, close_pool


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
    return {"status": "ok", "version": "3.22.0"}


# ─── Admin auth stopgap (v3.22 — proper JWT in follow-up PR) ────────────────
# This is NOT real auth.  It's a shared-secret header check designed to keep
# drive-by traffic off the admin write endpoints while the proper JWT layer is
# being built.  Set ADMIN_TOKEN in Render + Vercel env vars.  If ADMIN_TOKEN is
# unset (e.g. local dev), admin endpoints are unreachable — explicit rather
# than silently open.

def _require_admin(x_admin_token: Optional[str]) -> None:
    expected = (os.environ.get("ADMIN_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail=(
                "Admin uploads disabled: server has no ADMIN_TOKEN configured. "
                "Set the ADMIN_TOKEN env var on the backend to enable."
            ),
        )
    if not x_admin_token or x_admin_token.strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token.")


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
def calculate(req: CalculateRequest):
    """Calculate gross pay for a full fortnight. PRD §FR-03"""
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
# Gated by the X-Admin-Token shared secret.
#
# The fortnight roster does NOT live here — per v3.23 it is user-driven, see
# the next section below.

_SCHEDULE_TYPES = {"weekday", "weekend"}


@app.post("/api/admin/upload-roster", response_model=ParsedRosterResponse)
async def admin_upload_master_roster(
    file: UploadFile = File(...),
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse the master roster ZIP/PDF and persist globally.
    Only the master roster is admin-uploaded; the fortnight roster is per-user
    (POST /api/upload-fortnight-roster).  Annual cadence."""
    _require_admin(x_admin_token)
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
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse a weekday/weekend schedule and persist for all drivers."""
    _require_admin(x_admin_token)
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
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse an assoc/un-assoc payments chart and persist for all drivers."""
    _require_admin(x_admin_token)
    content = await file.read()
    try:
        parsed = parse_assoc_chart_file(content, filename=file.filename or "chart")
    except ValueError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Chart parse failed: {e}")
    await save_artifact(
        kind="assoc_chart",
        payload=parsed.model_dump(),
        source_file=file.filename or "chart",
    )
    return parsed


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
