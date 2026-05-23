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


# ─── Admin uploads — parse + persist (v3.22) ────────────────────────────────
#
# These endpoints replace the per-driver use of /api/parse-* for the SHARED
# workflow (admin uploads once, all drivers read).  The original /api/parse-*
# endpoints remain for one-off / non-persisted parsing (e.g. payslip audit).
#
# Each admin endpoint:
#   1. Verifies the X-Admin-Token shared-secret header.
#   2. Runs the existing parser (synchronous; same 3:39 wait the admin always had).
#   3. Persists the parsed payload to Postgres via db.save_artifact().
#   4. Returns the parsed payload so the admin UI can preview before publish.

_ROSTER_TYPES = {"master", "fortnight"}
_SCHEDULE_TYPES = {"weekday", "weekend"}


@app.post("/api/admin/upload-roster", response_model=ParsedRosterResponse)
async def admin_upload_roster(
    type: str = Query(..., description="roster type: 'master' or 'fortnight'"),
    file: UploadFile = File(...),
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """Admin: parse a roster ZIP/PDF and persist for all drivers to read.
    Per v3.22 §6.12.  Replaces the per-driver use of /api/parse-master-roster /
    /api/parse-fortnight-roster — those endpoints remain but should not be on
    the driver request hot path."""
    _require_admin(x_admin_token)
    if type not in _ROSTER_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(_ROSTER_TYPES)}")
    content = await file.read()
    try:
        parsed = parse_roster_zip(content, filename=file.filename or f"{type}_roster")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Roster parse failed: {e}")
    await save_artifact(
        kind=f"{type}_roster",
        payload=parsed.model_dump(),
        source_file=file.filename or f"{type}_roster",
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


# ─── User reads — fetch latest persisted artifacts (v3.22) ──────────────────
#
# Public-read endpoints.  Return 404 when no admin upload exists yet — frontend
# falls back to its localStorage cache (or, ultimately, the built-in defaults).

@app.get("/api/roster/current", response_model=ParsedRosterResponse)
async def get_current_roster(
    type: str = Query(..., description="roster type: 'master' or 'fortnight'"),
):
    """Return the latest admin-published roster of the requested type."""
    if type not in _ROSTER_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(_ROSTER_TYPES)}")
    row = await get_latest_artifact(kind=f"{type}_roster")
    if row is None:
        raise HTTPException(status_code=404, detail=f"No {type} roster published yet.")
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
