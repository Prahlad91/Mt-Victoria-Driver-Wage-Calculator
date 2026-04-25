"""File parsing — roster PDFs, schedule ZIPs, payslip XLSXs / PDFs.
PRD ref: Section 6 (File Upload Requirements), Solution Design Section 4.4
"""
from __future__ import annotations
import io
import json as json_mod
import re
from datetime import datetime, timedelta
from typing import Optional
from zipfile import ZipFile, BadZipFile

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
    ParsedRosterResponse, RosterDayEntry,
    ParsedScheduleResponse, DiagramInfo,
)

# Valid Mt Victoria line numbers
_VALID_LINES = set(list(range(1, 23)) + list(range(201, 211)))


# ─── Roster ZIP parser (master and fortnight) ──────────────────────────────────

def parse_roster_zip(file_bytes: bytes, filename: str) -> ParsedRosterResponse:
    """
    Parse a ZIP-packaged roster file (master or fortnight format).
    The ZIP contains manifest.json, *.txt (text layer), and *.jpeg (image layer).
    Works for both the annual master roster and the per-fortnight roster.
    """
    warnings: list[str] = []

    # ─ Read ZIP contents
    try:
        with ZipFile(io.BytesIO(file_bytes)) as zf:
            manifest = json_mod.loads(zf.read('manifest.json'))
            full_text = ''
            for page in manifest['pages']:
                page_text = zf.read(page['text']['path']).decode('utf-8', errors='replace')
                full_text += page_text + '\n'
    except BadZipFile:
        raise ValueError("File is not a valid ZIP archive. Expected the roster .pdf/.zip file.")
    except Exception as e:
        raise ValueError(f"Could not read roster file: {e}")

    # ─ Normalise line endings
    text = full_text.replace('\r\n', '\n').replace('\r', '\n')

    # ─ Extract metadata
    fn_end_m = re.search(r'Fortnight ending\s+(\d{2}/\d{2}/\d{4})', text)
    fn_start = fn_end = None
    if fn_end_m:
        dt = datetime.strptime(fn_end_m.group(1), '%d/%m/%Y')
        fn_end = dt.strftime('%Y-%m-%d')
        fn_start = (dt - timedelta(days=13)).strftime('%Y-%m-%d')

    layer_m = re.search(r'Layer:\s*(Master)', text)
    line_type = 'master' if layer_m else 'fortnight'

    # ─ Find each roster line's text section
    # Line numbers appear at the start of a text line (after \n), optionally followed by
    # a space and then OFF / ADO / a time pattern.
    line_starts: list[tuple[int, int]] = []  # (line_number, char_position)
    line_re = re.compile(r'(?m)^(\d{1,3})(?=\s+(?:OFF|ADO|\d{2}:\d{2}))')
    for m in line_re.finditer(text):
        num = int(m.group(1))
        if num in _VALID_LINES:
            line_starts.append((num, m.start()))

    if not line_starts:
        warnings.append('No roster lines found. The file format may not be supported.')
        return ParsedRosterResponse(
            source_file=filename, line_type=line_type,
            fn_start=fn_start, fn_end=fn_end, lines={}, warnings=warnings
        )

    # ─ Extract and parse each line section
    lines_data: dict[str, list[RosterDayEntry]] = {}
    for idx, (line_num, start_pos) in enumerate(line_starts):
        end_pos = line_starts[idx + 1][1] if idx + 1 < len(line_starts) else len(text)
        section = text[start_pos:end_pos]
        days = _parse_day_entries(section)
        if days:
            lines_data[str(line_num)] = days
        if len(days) != 14:
            warnings.append(f'Line {line_num}: expected 14 days, got {len(days)} — check for parsing errors.')

    return ParsedRosterResponse(
        source_file=filename,
        line_type=line_type,
        fn_start=fn_start,
        fn_end=fn_end,
        lines=lines_data,
        warnings=warnings,
    )


def _parse_day_entries(section_text: str) -> list[RosterDayEntry]:
    """
    Parse 14 day entries from a roster line section using word-by-word state machine.
    Each day entry is: OFF | ADO | (HH:MM - HH:MM[L] HH:MMW DIAG... F\d+)
    """
    words = section_text.split()
    days: list[RosterDayEntry] = []
    i = 0

    # Skip the line number at the very start
    if words and re.match(r'^\d{1,3}$', words[0]):
        i = 1

    while i < len(words) and len(days) < 14:
        w = words[i]

        if w == 'OFF':
            days.append(RosterDayEntry(diag='OFF'))
            i += 1

        elif w == 'ADO':
            days.append(RosterDayEntry(diag='ADO'))
            i += 1

        elif re.match(r'^\d{2}:\d{2}$', w) and i + 2 < len(words) and words[i + 1] == '-':
            # Start of a time range: HH:MM - HH:MM[L]
            r_start = w
            end_raw = words[i + 2]
            cm = end_raw.endswith('L')
            r_end = end_raw.rstrip('L')
            i += 3

            # Rostered hours: HH:MMW
            r_hrs = 8.0
            if i < len(words) and re.match(r'^\d{2}:\d{2}W$', words[i]):
                h_str, m_str = words[i].rstrip('W').split(':')
                r_hrs = round(int(h_str) + int(m_str) / 60, 4)
                i += 1

            # Diagram name: everything up to (and consuming) F\d+
            diag_parts: list[str] = []
            while i < len(words):
                if re.match(r'^F\d+$', words[i]):
                    i += 1  # consume fatigue-unit token
                    break
                # Safety: stop if we hit a new time range (shouldn't happen)
                if re.match(r'^\d{2}:\d{2}$', words[i]) and i + 1 < len(words) and words[i + 1] == '-':
                    break
                diag_parts.append(words[i])
                i += 1

            diag = ' '.join(diag_parts)
            days.append(RosterDayEntry(
                diag=diag, r_start=r_start, r_end=r_end, cm=cm, r_hrs=r_hrs
            ))

        else:
            i += 1  # skip unknown/header token

    return days


# ─── Schedule ZIP parser (weekday and weekend) ───────────────────────────────────

def parse_schedule_zip(file_bytes: bytes, filename: str) -> ParsedScheduleResponse:
    """
    Parse a ZIP-packaged schedule file (weekday or weekend).
    Extracts per-diagram: sign-on, sign-off, total shift hours, distance (KM), cross-midnight.
    Only the first occurrence per diagram number is stored (adequate for KM lookup).
    """
    warnings: list[str] = []

    try:
        with ZipFile(io.BytesIO(file_bytes)) as zf:
            manifest = json_mod.loads(zf.read('manifest.json'))
            full_text = ''
            for page in manifest['pages']:
                page_text = zf.read(page['text']['path']).decode('utf-8', errors='replace')
                full_text += page_text + '\n'
    except BadZipFile:
        raise ValueError("File is not a valid ZIP archive. Expected the schedule .pdf/.zip file.")
    except Exception as e:
        raise ValueError(f"Could not read schedule file: {e}")

    # Detect schedule type from filename
    fname_upper = filename.upper()
    if 'DRWD' in fname_upper or 'WEEKDAY' in fname_upper:
        schedule_type = 'weekday'
    elif 'DRWE' in fname_upper or 'WEEKEND' in fname_upper:
        schedule_type = 'weekend'
    else:
        schedule_type = 'weekday'  # default

    text = full_text.replace('\r\n', '\n').replace('\r', '\n')

    # Each diagram block starts with "No. NNNN DayType\n"
    no_re = re.compile(r'No\.\s+(\d+)\s+([^\n]+)')
    blocks = list(no_re.finditer(text))

    diagrams: dict[str, DiagramInfo] = {}

    for idx, block_m in enumerate(blocks):
        diag_num = block_m.group(1)
        day_type_raw = block_m.group(2).strip()
        block_start = block_m.end()
        block_end = blocks[idx + 1].start() if idx + 1 < len(blocks) else len(text)
        block_text = text[block_start:block_end]

        # Parse times
        sign_on_m  = re.search(r'Sign on\s+(\d{1,2}:\d{2}[ap])', block_text)
        sign_off_m = re.search(r'Time off duty\s*:\s*(\d{1,2}:\d{2}[ap])', block_text)
        total_m    = re.search(r'Total shift\s*:\s*(\d{1,2}:\d{2})', block_text)
        km_m       = re.search(r'Distance:\s*([\d.]+)\s*Km', block_text)

        sign_on  = _ampm_to_hhmm(sign_on_m.group(1))  if sign_on_m  else None
        sign_off = _ampm_to_hhmm(sign_off_m.group(1)) if sign_off_m else None
        km       = float(km_m.group(1)) if km_m else 0.0
        r_hrs    = _hmm_to_float(total_m.group(1)) if total_m else 8.0

        # Cross-midnight: sign-off time-of-day < sign-on time-of-day
        cm = False
        if sign_on and sign_off:
            cm = _time_to_mins(sign_off) < _time_to_mins(sign_on)

        # Normalise day_type string
        dl = day_type_raw.lower()
        if 'saturday' in dl:
            day_type = 'saturday'
        elif 'sunday' in dl:
            day_type = 'sunday'
        else:
            day_type = 'weekday'  # Monday-Friday, Monday, Tuesday, ...

        info = DiagramInfo(
            diag_num=diag_num, day_type=day_type,
            sign_on=sign_on, sign_off=sign_off,
            r_hrs=r_hrs, km=km, cm=cm,
        )

        # Store by diagram number (first occurrence = weekday entry, preferred for KM lookup)
        if diag_num not in diagrams:
            diagrams[diag_num] = info

    if not diagrams:
        warnings.append('No diagram entries found. The schedule format may not be supported.')

    return ParsedScheduleResponse(
        source_file=filename,
        schedule_type=schedule_type,
        diagrams=diagrams,
        warnings=warnings,
    )


# ─── Time helpers ─────────────────────────────────────────────────────────────────────

def _ampm_to_hhmm(t: str) -> str:
    """Convert '12:51a' or '9:18a' or '10:30p' to 'HH:MM' 24-hour."""
    is_pm = t.endswith('p')
    t = t[:-1]  # strip a/p suffix
    h, m = map(int, t.split(':'))
    if is_pm and h != 12:
        h += 12
    elif not is_pm and h == 12:
        h = 0
    return f'{h:02d}:{m:02d}'


def _hmm_to_float(t: str) -> float:
    """Convert '8:27' to 8.45 decimal hours."""
    h, m = map(int, t.split(':'))
    return round(h + m / 60, 4)


def _time_to_mins(t: str) -> int:
    """Convert 'HH:MM' to minutes past midnight."""
    h, m = map(int, t.split(':'))
    return h * 60 + m


# ─── Fortnight roster PDF parser (legacy — kept for backward compat) ────────────────

def parse_roster_pdf(file_bytes: bytes, filename: str = 'roster.pdf') -> ParseRosterResponse:
    """
    Extract day entries from a Sydney Trains fortnightly roster PDF (legacy table-based).
    Falls back to this when the file is not a ZIP-packaged roster.
    """
    if pdfplumber is None:
        raise RuntimeError('pdfplumber not installed. Run: pip install pdfplumber')

    parsed_days: list[ParsedDayEntry] = []
    warnings: list[str] = []
    time_re = re.compile(r'\b(\d{2}):(\d{2})\b')
    date_re = re.compile(r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b')
    diag_re = re.compile(r'\b(3[0-9]{3}[A-Z\s]*|SBY|OFF|ADO|RDO)\b')

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in (tables or []):
                for row in (table or []):
                    cells = [str(c or '').strip() for c in row]
                    row_text = ' '.join(cells)
                    times = time_re.findall(row_text)
                    date_match = date_re.search(row_text)
                    diag_match = diag_re.search(row_text)
                    if not date_match and not times:
                        continue
                    date_str = None
                    confidence = 0.5
                    if date_match:
                        d, m_val, y = date_match.groups()
                        y = f'20{y}' if len(y) == 2 else y
                        date_str = f'{y}-{int(m_val):02d}-{int(d):02d}'
                        confidence += 0.3
                    sign_on  = f'{times[0][0]}:{times[0][1]}' if len(times) >= 1 else None
                    sign_off = f'{times[1][0]}:{times[1][1]}' if len(times) >= 2 else None
                    if sign_on:  confidence += 0.1
                    if sign_off: confidence += 0.1
                    diagram = diag_match.group(0).strip() if diag_match else 'UNKNOWN'
                    entry = ParsedDayEntry(
                        date=date_str or 'UNKNOWN', diagram=diagram,
                        sign_on=sign_on, sign_off=sign_off, confidence=min(confidence, 1.0),
                    )
                    parsed_days.append(entry)
                    if confidence < 0.7:
                        warnings.append(f'Low confidence ({confidence:.0%}) for row: {row_text[:60]}...')

    if not parsed_days:
        warnings.append(
            'No roster entries could be extracted from this PDF. '
            'The layout may not be supported. Please enter times manually.'
        )
    return ParseRosterResponse(source_file=filename, parsed_days=parsed_days, warnings=warnings)


# ─── Payslip parser ─────────────────────────────────────────────────────────────────────

def parse_payslip_file(file_bytes: bytes, filename: str = 'payslip') -> ParsePayslipResponse:
    fname_lower = filename.lower()
    if fname_lower.endswith('.xlsx') or fname_lower.endswith('.xls'):
        return _parse_payslip_xlsx(file_bytes, filename)
    elif fname_lower.endswith('.pdf'):
        return _parse_payslip_pdf(file_bytes, filename)
    else:
        try:
            return _parse_payslip_xlsx(file_bytes, filename)
        except Exception:
            return _parse_payslip_pdf(file_bytes, filename)


def _detect_payslip_format(headers: list[str]) -> str:
    header_str = ' '.join(h.lower() for h in headers)
    if 'crew' in header_str or 'sydney crew' in header_str:
        return 'sydney_crew'
    return 'nsw_payslip'


def _parse_payslip_xlsx(file_bytes: bytes, filename: str) -> ParsePayslipResponse:
    if openpyxl is None:
        raise RuntimeError('openpyxl not installed.')
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    warnings: list[str] = []
    line_items: list[PayslipLineItem] = []
    total_gross = 0.0
    period_start = period_end = None
    fmt = 'nsw_payslip'
    header_row_idx = None
    for i, row in enumerate(rows):
        cells = [str(c or '').strip() for c in row]
        if any('code' in c.lower() or 'description' in c.lower() for c in cells):
            header_row_idx = i
            fmt = _detect_payslip_format(cells)
            break
    for row in rows[:10]:
        row_str = ' '.join(str(c or '') for c in row)
        date_matches = re.findall(r'\d{1,2}/\d{1,2}/\d{4}', row_str)
        if len(date_matches) >= 2 and period_start is None:
            def _fmt(d):
                parts = d.split('/')
                return f'{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}'
            period_start = _fmt(date_matches[0])
            period_end = _fmt(date_matches[1])
    if header_row_idx is not None:
        for row in rows[header_row_idx + 1:]:
            cells = list(row)
            if not any(cells):
                continue
            try:
                code = str(cells[0] or '').strip()
                desc = str(cells[1] or '').strip() if len(cells) > 1 else ''
                if not code or not desc:
                    continue
                hrs_val  = cells[2] if len(cells) > 2 else None
                rate_val = cells[3] if len(cells) > 3 else None
                amt_val  = cells[4] if len(cells) > 4 else None
                hrs  = float(hrs_val)  if hrs_val  and str(hrs_val).replace('.', '').replace('-', '').isdigit() else None
                rate = float(rate_val) if rate_val and str(rate_val).replace('.', '').replace('-', '').isdigit() else None
                amount = float(amt_val) if amt_val else 0.0
                if amount != 0:
                    line_items.append(PayslipLineItem(code=code, description=desc, hours=hrs, rate=rate, amount=amount))
                    total_gross += amount
            except (ValueError, TypeError, IndexError):
                continue
    else:
        warnings.append('Could not identify header row in payslip.')
    return ParsePayslipResponse(
        source_file=filename, format=fmt,
        period_start=period_start, period_end=period_end,
        total_gross=round(total_gross, 2), line_items=line_items, warnings=warnings,
    )


def _parse_payslip_pdf(file_bytes: bytes, filename: str) -> ParsePayslipResponse:
    if pdfplumber is None:
        raise RuntimeError('pdfplumber not installed.')
    line_items: list[PayslipLineItem] = []
    warnings: list[str] = []
    total_gross = 0.0
    money_re = re.compile(r'\$?([\d,]+\.\d{2})')
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for table in (page.extract_tables() or []):
                for row in (table or []):
                    cells = [str(c or '').strip() for c in row]
                    amounts = [float(m.replace(',', '')) for m in money_re.findall(' '.join(cells))]
                    if amounts and len(cells) >= 2:
                        try:
                            item = PayslipLineItem(
                                code=cells[0] if cells[0] else '—',
                                description=cells[1] if len(cells) > 1 else '',
                                hours=None, rate=None, amount=amounts[-1],
                            )
                            line_items.append(item)
                            total_gross += amounts[-1]
                        except Exception:
                            continue
    if not line_items:
        warnings.append('No line items extracted from payslip PDF. Please use XLSX format if available.')
    return ParsePayslipResponse(
        source_file=filename, format='pdf',
        total_gross=round(total_gross, 2), line_items=line_items, warnings=warnings,
    )
