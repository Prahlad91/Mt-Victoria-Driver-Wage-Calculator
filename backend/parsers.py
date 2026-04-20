"""File parsing — roster PDFs and payslip XLSXs / PDFs.
PRD ref: Section 6 (File Upload Requirements), Solution Design Section 4.4
"""
from __future__ import annotations
import io
import re
from typing import Optional

try:
    import pdfplumber
except ImportError:
    pdfplumber = None  # type: ignore

try:
    import openpyxl
except ImportError:
    openpyxl = None  # type: ignore

from models import (
    ParseRosterResponse, ParsedDayEntry,
    ParsePayslipResponse, PayslipLineItem,
)


# ─── Roster PDF parser ────────────────────────────────────────────────────────

def parse_roster_pdf(file_bytes: bytes, filename: str = "roster.pdf") -> ParseRosterResponse:
    """
    Extract day entries from a Sydney Trains fortnightly roster PDF.
    PRD §FR-U1, Solution Design §4.4

    Strategy:
    - Use pdfplumber to extract all text and tables
    - Look for rows containing a time pattern HH:MM alongside a date or day label
    - Map to ParsedDayEntry with a confidence score
    - Low confidence (<0.7) generates a warning
    """
    if pdfplumber is None:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")

    parsed_days: list[ParsedDayEntry] = []
    warnings: list[str] = []
    time_re = re.compile(r"\b(\d{2}):(\d{2})\b")
    date_re = re.compile(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b")
    diag_re = re.compile(r"\b(3[0-9]{3}[A-Z\s]*|SBY|OFF|ADO|RDO)\b")

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in (tables or []):
                for row in (table or []):
                    cells = [str(c or "").strip() for c in row]
                    row_text = " ".join(cells)

                    times = time_re.findall(row_text)
                    date_match = date_re.search(row_text)
                    diag_match = diag_re.search(row_text)

                    if not date_match and not times:
                        continue

                    # Build date string
                    date_str = None
                    confidence = 0.5
                    if date_match:
                        d, m, y = date_match.groups()
                        y = f"20{y}" if len(y) == 2 else y
                        date_str = f"{y}-{int(m):02d}-{int(d):02d}"
                        confidence += 0.3

                    sign_on = f"{times[0][0]}:{times[0][1]}" if len(times) >= 1 else None
                    sign_off = f"{times[1][0]}:{times[1][1]}" if len(times) >= 2 else None
                    if sign_on:
                        confidence += 0.1
                    if sign_off:
                        confidence += 0.1

                    diagram = diag_match.group(0).strip() if diag_match else "UNKNOWN"

                    entry = ParsedDayEntry(
                        date=date_str or "UNKNOWN",
                        diagram=diagram,
                        sign_on=sign_on,
                        sign_off=sign_off,
                        confidence=min(confidence, 1.0),
                    )
                    parsed_days.append(entry)

                    if confidence < 0.7:
                        warnings.append(
                            f"Low confidence ({confidence:.0%}) for row: {row_text[:60]}... — please verify."
                        )

    if not parsed_days:
        warnings.append(
            "No roster entries could be extracted from this PDF. "
            "The layout may not be supported. Please enter times manually."
        )

    return ParseRosterResponse(
        source_file=filename,
        parsed_days=parsed_days,
        warnings=warnings,
    )


# ─── Payslip parser ───────────────────────────────────────────────────────────

def parse_payslip_file(file_bytes: bytes, filename: str = "payslip") -> ParsePayslipResponse:
    """
    Auto-detect format and parse a Sydney Trains payslip.
    Supports: NSW_Payslip.xlsx, Sydney_Crew_Payslip.xlsx, PDF payslips.
    PRD §FR-U2, Solution Design §4.4
    """
    fname_lower = filename.lower()
    if fname_lower.endswith(".xlsx") or fname_lower.endswith(".xls"):
        return _parse_payslip_xlsx(file_bytes, filename)
    elif fname_lower.endswith(".pdf"):
        return _parse_payslip_pdf(file_bytes, filename)
    else:
        # Try XLSX first, then PDF
        try:
            return _parse_payslip_xlsx(file_bytes, filename)
        except Exception:
            return _parse_payslip_pdf(file_bytes, filename)


def _detect_payslip_format(headers: list[str]) -> str:
    """Detect NSW_Payslip vs Sydney_Crew format by column headers."""
    header_str = " ".join(h.lower() for h in headers)
    if "crew" in header_str or "sydney crew" in header_str:
        return "sydney_crew"
    return "nsw_payslip"


def _parse_payslip_xlsx(file_bytes: bytes, filename: str) -> ParsePayslipResponse:
    """Parse NSW_Payslip.xlsx or Sydney_Crew_Payslip.xlsx. PRD §FR-U2"""
    if openpyxl is None:
        raise RuntimeError("openpyxl not installed. Run: pip install openpyxl")

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    warnings: list[str] = []
    line_items: list[PayslipLineItem] = []
    total_gross = 0.0
    period_start = None
    period_end = None
    fmt = "nsw_payslip"

    # Find header row and detect format
    header_row_idx = None
    for i, row in enumerate(rows):
        cells = [str(c or "").strip() for c in row]
        if any("code" in c.lower() or "description" in c.lower() for c in cells):
            header_row_idx = i
            fmt = _detect_payslip_format(cells)
            break

    # Extract period dates from top rows
    for row in rows[:10]:
        row_str = " ".join(str(c or "") for c in row)
        date_matches = re.findall(r"\d{1,2}/\d{1,2}/\d{4}", row_str)
        if len(date_matches) >= 2 and period_start is None:
            def _fmt(d):
                parts = d.split("/")
                return f"{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}"
            period_start = _fmt(date_matches[0])
            period_end = _fmt(date_matches[1])

    # Parse line items below header
    if header_row_idx is not None:
        for row in rows[header_row_idx + 1:]:
            cells = [c for c in row]
            if not any(cells):
                continue
            try:
                code = str(cells[0] or "").strip()
                desc = str(cells[1] or "").strip() if len(cells) > 1 else ""
                hrs_val = cells[2] if len(cells) > 2 else None
                rate_val = cells[3] if len(cells) > 3 else None
                amt_val = cells[4] if len(cells) > 4 else None

                if not code or not desc:
                    continue

                hrs = float(hrs_val) if hrs_val and str(hrs_val).replace(".", "").replace("-", "").isdigit() else None
                rate = float(rate_val) if rate_val and str(rate_val).replace(".", "").replace("-", "").isdigit() else None
                amount = float(amt_val) if amt_val else 0.0

                if amount != 0:
                    line_items.append(PayslipLineItem(
                        code=code, description=desc,
                        hours=hrs, rate=rate, amount=amount,
                    ))
                    total_gross += amount
            except (ValueError, TypeError, IndexError):
                continue
    else:
        warnings.append("Could not identify header row in payslip. Data may be incomplete.")

    return ParsePayslipResponse(
        source_file=filename,
        format=fmt,
        period_start=period_start,
        period_end=period_end,
        total_gross=round(total_gross, 2),
        line_items=line_items,
        warnings=warnings,
    )


def _parse_payslip_pdf(file_bytes: bytes, filename: str) -> ParsePayslipResponse:
    """Fallback: parse payslip from PDF using pdfplumber. PRD §FR-U2"""
    if pdfplumber is None:
        raise RuntimeError("pdfplumber not installed. Run: pip install pdfplumber")

    line_items: list[PayslipLineItem] = []
    warnings: list[str] = []
    total_gross = 0.0
    money_re = re.compile(r"\$?([\d,]+\.\d{2})")

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for table in (page.extract_tables() or []):
                for row in (table or []):
                    cells = [str(c or "").strip() for c in row]
                    amounts = [float(m.replace(",", "")) for m in money_re.findall(" ".join(cells))]
                    if amounts and len(cells) >= 2:
                        try:
                            item = PayslipLineItem(
                                code=cells[0] if cells[0] else "—",
                                description=cells[1] if len(cells) > 1 else "",
                                hours=None,
                                rate=None,
                                amount=amounts[-1],
                            )
                            line_items.append(item)
                            total_gross += amounts[-1]
                        except Exception:
                            continue

    if not line_items:
        warnings.append("No line items extracted from payslip PDF. Please use XLSX format if available.")

    return ParsePayslipResponse(
        source_file=filename,
        format="pdf",
        total_gross=round(total_gross, 2),
        line_items=line_items,
        warnings=warnings,
    )
