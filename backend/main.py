"""FastAPI application entry point — Mt Victoria Driver Wage Calculator.
PRD ref: Section 7 (Functional Requirements), Solution Design Section 4.2"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import io
import json
import os
from pathlib import Path

from models import (
    CalculateRequest, CalculateResponse,
    ParseRosterResponse, ParsePayslipResponse,
    ParsedRosterResponse, ParsedScheduleResponse,
)
from calculator import compute_fortnight
from parsers import (
    parse_roster_pdf, parse_payslip_file,
    parse_roster_zip, parse_schedule_zip,
)
from exporters import render_pdf, render_csv

app = FastAPI(
    title="Mt Victoria Driver Wage Calculator API",
    description="EA 2025 pay calculation engine for Mt Victoria intercity train drivers.",
    version="3.1.0",
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
    return {"status": "ok", "version": "3.1.0"}


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


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile, allowed_types: list[str], max_mb: int):
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(allowed_types)}",
        )
