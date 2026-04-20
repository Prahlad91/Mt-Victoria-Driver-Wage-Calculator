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
)
from calculator import compute_fortnight
from parsers import parse_roster_pdf, parse_payslip_file
from exporters import render_pdf, render_csv

app = FastAPI(
    title="Mt Victoria Driver Wage Calculator API",
    description="EA 2025 pay calculation engine for Mt Victoria intercity train drivers.",
    version="3.0.0",
)

# CORS — allow the Vercel frontend origin in production
ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"


# ─── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "3.0.0"}


# ─── Roster and config data ───────────────────────────────────────────────────

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


# ─── Core calculation ─────────────────────────────────────────────────────────

@app.post("/api/calculate", response_model=CalculateResponse)
def calculate(req: CalculateRequest):
    """
    Calculate gross pay for a full fortnight.
    PRD §FR-03, Solution Design §4.2
    """
    try:
        return compute_fortnight(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")


# ─── File uploads ─────────────────────────────────────────────────────────────

@app.post("/api/parse-roster", response_model=ParseRosterResponse)
async def upload_roster(file: UploadFile = File(...)):
    """
    Parse a Sydney Trains fortnightly roster PDF.
    PRD §FR-U1, Solution Design §4.4
    """
    _validate_upload(file, allowed_types=["application/pdf"], max_mb=10)
    content = await file.read()
    try:
        return parse_roster_pdf(content, filename=file.filename or "roster.pdf")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Roster parse failed: {str(e)}")


@app.post("/api/parse-payslip", response_model=ParsePayslipResponse)
async def upload_payslip(file: UploadFile = File(...)):
    """
    Parse a Sydney Trains payslip (XLSX or PDF).
    PRD §FR-U2, Solution Design §4.4
    """
    allowed = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/pdf",
        "application/octet-stream",  # some browsers send this for xlsx
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
    """
    Render a PDF report from a CalculateResponse.
    PRD §FR-04 (export), Solution Design §4.5
    """
    try:
        pdf_bytes = render_pdf(result)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="wage_calc_{result.fortnight_start}.pdf"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")


@app.post("/api/export/csv")
def export_csv(result: CalculateResponse):
    """
    Render a CSV report from a CalculateResponse.
    PRD §FR-04 (export), Solution Design §4.5
    """
    try:
        csv_text = render_csv(result)
        return StreamingResponse(
            io.StringIO(csv_text),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="wage_calc_{result.fortnight_start}.csv"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _validate_upload(file: UploadFile, allowed_types: list[str], max_mb: int):
    """PRD §FR-U4 — file validation."""
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(allowed_types)}",
        )
    # Size check happens after read — for now, rely on server limits
    # (configurable via reverse proxy / Render settings)
