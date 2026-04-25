"""File parsing — roster PDFs, schedule ZIPs, payslip XLSXs / PDFs.
PRD ref: Section 6 (File Upload Requirements)
"""
from __future__ import annotations
import io
import json as json_mod
import re
from datetime import datetime, timedelta
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

# Time tokens used by the roster parser (HH:MM-style only — no am/pm)
_TIME_RE = re.compile(r'^\d{1,2}:\d{2}$')
_WHRS_RE = re.compile(r'^\d{1,2}:\d{2}[Ww]$')
_FAT_RE  = re.compile(r'^F\d+$')


def _norm_time(t: str) -> str:
    """Normalise H:MM or HH:MM to HH:MM (zero-pad the hour)."""
    h, m = t.split(':')
    return f'{int(h):02d}:{m}'


# ─── Text extraction ───────────────────────────────────────────────────────────

def _extract_text_from_file(file_bytes: bytes) -> str:
    """
    Extract all text from a file that may be either:
    1. A ZIP archive (Sydney Trains app format) containing manifest.json + .txt pages
    2. A real PDF file
    """
    try:
        with ZipFile(io.BytesIO(file_bytes)) as zf:
            if 'manifest.json' in zf.namelist():
                manifest = json_mod.loads(zf.read('manifest.json'))
                full_text = ''
                for page in manifest['pages']:
                    page_text = zf.read(page['text']['path']).decode('utf-8', errors='replace')
                    full_text += page_text + '\n'
                return full_text
    except (BadZipFile, KeyError, Exception):
        pass

    if pdfplumber is None:
        raise RuntimeError('pdfplumber not installed. Run: pip install pdfplumber')
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            full_text = ''
            for page in pdf.pages:
                page_text = page.extract_text() or ''
                full_text += page_text + '\n'
            return full_text
    except Exception as e:
        raise ValueError(
            f'Could not read file as ZIP or PDF. '
            f'Make sure you are uploading the correct file. Details: {e}'
        )


# ─── Roster parser ─────────────────────────────────────────────────────────────

def parse_roster_zip(file_bytes: bytes, filename: str) -> ParsedRosterResponse:
    """Parse a roster file (ZIP or PDF). Master roster (lines 1-22) or fortnight swinger (201-210)."""
    warnings: list[str] = []

    full_text = _extract_text_from_file(file_bytes)
    text = full_text.replace('\r\n', '\n').replace('\r', '\n')

    fn_end_m = re.search(r'Fortnight ending\s+(\d{2}/\d{2}/\d{4})', text)
    fn_start = fn_end = None
    if fn_end_m:
        dt = datetime.strptime(fn_end_m.group(1), '%d/%m/%Y')
        fn_end = dt.strftime('%Y-%m-%d')
        fn_start = (dt - timedelta(days=13)).strftime('%Y-%m-%d')

    layer_m = re.search(r'Layer:\s*(Master)', text)
    line_type = 'master' if layer_m else 'fortnight'

    line_starts: list[tuple[int, int]] = []
    line_re = re.compile(r'(?m)^(\d{1,3})(?=\s+(?:OFF|ADO|\d{1,2}:\d{2}))')
    for m in line_re.finditer(text):
        num = int(m.group(1))
        if num in _VALID_LINES:
            line_starts.append((num, m.start()))

    if not line_starts:
        warnings.append(
            'No roster lines found in this file. '
            'The PDF layout may differ from the expected format.'
        )
        return ParsedRosterResponse(
            source_file=filename, line_type=line_type,
            fn_start=fn_start, fn_end=fn_end, lines={}, warnings=warnings
        )

    lines_data: dict[str, list[RosterDayEntry]] = {}
    for idx, (line_num, start_pos) in enumerate(line_starts):
        end_pos = line_starts[idx + 1][1] if idx + 1 < len(line_starts) else len(text)
        section = text[start_pos:end_pos]
        days = _parse_day_entries(section)
        if days:
            lines_data[str(line_num)] = days
        if len(days) != 14:
            warnings.append(f'Line {line_num}: expected 14 days, got {len(days)}.')

    return ParsedRosterResponse(
        source_file=filename, line_type=line_type,
        fn_start=fn_start, fn_end=fn_end,
        lines=lines_data, warnings=warnings,
    )


def _parse_day_entries(section_text: str) -> list[RosterDayEntry]:
    """Parse up to 14 day entries from a roster line section."""
    words = section_text.split()
    days: list[RosterDayEntry] = []
    i = 0

    if words and re.match(r'^\d{1,3}$', words[0]):
        i = 1

    while i < len(words) and len(days) < 14:
        w = words[i]

        if w.upper() == 'OFF':
            days.append(RosterDayEntry(diag='OFF'))
            i += 1
        elif w.upper() == 'ADO':
            days.append(RosterDayEntry(diag='ADO'))
            i += 1
        elif _TIME_RE.match(w) and i + 2 < len(words) and words[i + 1] == '-':
            r_start = _norm_time(w)
            end_raw = words[i + 2]
            cm      = end_raw.upper().endswith('L')
            r_end   = _norm_time(end_raw.rstrip('LlLl'))
            i += 3

            r_hrs = 8.0
            if i < len(words) and _WHRS_RE.match(words[i]):
                hrs_str = words[i][:-1]
                h_str, m_str = hrs_str.split(':')
                r_hrs = round(int(h_str) + int(m_str) / 60, 4)
                i += 1

            diag_parts: list[str] = []
            while i < len(words):
                tok = words[i]
                if _FAT_RE.match(tok):
                    i += 1
                    break
                if tok.upper() in ('OFF', 'ADO'):
                    break
                if _TIME_RE.match(tok) and i + 1 < len(words) and words[i + 1] == '-':
                    break
                diag_parts.append(tok)
                i += 1

            diag = ' '.join(diag_parts).strip()
            days.append(RosterDayEntry(
                diag=diag, r_start=r_start, r_end=r_end, cm=cm, r_hrs=r_hrs
            ))
        else:
            i += 1

    return days


# ─── Schedule parser (v3.5: hardened time extraction) ──────────────────────────

# Patterns for labelled times — tried in order, most-specific first.
# Group 1 always captures the full time string (digits, optional colon spacing,
# optional am/pm marker).
_TIME_PATTERNS_FOR_LABEL = [
    # 12-hour with am/pm: "9:18a", "9:18 am", "12:51AM", "5 : 30 PM"
    r'(\d{1,2}\s*:\s*\d{2}\s*[AaPp][Mm]?)',
    # 24-hour: "09:18", "17:30"
    r'(\d{1,2}\s*:\s*\d{2})',
]


def _extract_labeled_time(label: str, text: str) -> str | None:
    """
    Find the first time value following a label.
    Tries 12-hour (with am/pm) first, then 24-hour as a fallback.

    Examples that all work for label='Time off duty':
      "Time off duty : 9:18a"
      "Time off duty: 9:18a"
      "Time off duty : 09:18"
      "Time off duty: 17:30"
      "Time off duty : 9:18 PM"
    """
    for tp in _TIME_PATTERNS_FOR_LABEL:
        # Allow optional space before colon, optional colon, then time pattern
        m = re.search(rf'{label}\s*:?\s*{tp}', text)
        if m:
            return m.group(1)
    return None


def parse_schedule_zip(file_bytes: bytes, filename: str) -> ParsedScheduleResponse:
    """
    Parse a schedule file (ZIP or PDF).
    Per diagram, extracts:
      - sign_on  ← from "Sign on" line                  (scheduled START)
      - sign_off ← from "Time off duty" line            (scheduled END)
      - r_hrs    ← from "Total shift" line
      - km       ← from "Distance: NNN.NNN Km" line
      - cm       ← derived (sign_off earlier than sign_on)
    """
    warnings: list[str] = []

    full_text = _extract_text_from_file(file_bytes)

    fname_upper = filename.upper()
    if 'DRWD' in fname_upper or 'WEEKDAY' in fname_upper:
        schedule_type = 'weekday'
    elif 'DRWE' in fname_upper or 'WEEKEND' in fname_upper:
        schedule_type = 'weekend'
    else:
        schedule_type = 'weekday'

    text = full_text.replace('\r\n', '\n').replace('\r', '\n')

    no_re  = re.compile(r'No\.\s+(\d+)\s+([^\n]+)')
    blocks = list(no_re.finditer(text))

    diagrams: dict[str, DiagramInfo] = {}
    failed_signon: list[str] = []
    failed_signoff: list[str] = []

    for idx, block_m in enumerate(blocks):
        diag_num     = block_m.group(1)
        day_type_raw = block_m.group(2).strip()
        block_start  = block_m.end()
        block_end    = blocks[idx + 1].start() if idx + 1 < len(blocks) else len(text)
        block_text   = text[block_start:block_end]

        # Use the robust labelled-time extractor for both ends
        sign_on_raw  = _extract_labeled_time('Sign on',       block_text)
        sign_off_raw = _extract_labeled_time('Time off duty', block_text)

        sign_on  = _parse_time_str(sign_on_raw)  if sign_on_raw  else None
        sign_off = _parse_time_str(sign_off_raw) if sign_off_raw else None

        # Track failures so we can report them clearly
        if sign_on is None:
            failed_signon.append(diag_num)
        if sign_off is None:
            failed_signoff.append(diag_num)

        total_m = re.search(r'Total shift\s*:\s*(\d{1,2}:\d{2})', block_text)
        km_m    = re.search(r'Distance:\s*([\d.]+)\s*Km', block_text, re.IGNORECASE)

        km    = float(km_m.group(1)) if km_m else 0.0
        r_hrs = _hmm_to_float(total_m.group(1)) if total_m else 8.0

        cm = False
        if sign_on and sign_off:
            cm = _time_to_mins(sign_off) < _time_to_mins(sign_on)

        dl = day_type_raw.lower()
        if   'saturday' in dl: day_type = 'saturday'
        elif 'sunday'   in dl: day_type = 'sunday'
        else:                  day_type = 'weekday'

        info = DiagramInfo(
            diag_num=diag_num, day_type=day_type,
            sign_on=sign_on, sign_off=sign_off,
            r_hrs=r_hrs, km=km, cm=cm,
        )
        if diag_num not in diagrams:
            diagrams[diag_num] = info

    if not diagrams:
        warnings.append(
            'No diagram entries found. '
            'Make sure this is a weekday or weekend schedule file (MTVICDRWD or MTVICDRWE).'
        )
    if failed_signon:
        warnings.append(
            f'Could not extract "Sign on" time for {len(failed_signon)} diagram(s): '
            f'{", ".join(failed_signon[:10])}. Times may render as blank in the daily entry.'
        )
    if failed_signoff:
        warnings.append(
            f'Could not extract "Time off duty" time for {len(failed_signoff)} diagram(s): '
            f'{", ".join(failed_signoff[:10])}. Schedule end time will fall back to master roster.'
        )

    return ParsedScheduleResponse(
        source_file=filename, schedule_type=schedule_type,
        diagrams=diagrams, warnings=warnings,
    )


# ─── Time helpers ─────────────────────────────────────────────────────────────

def _parse_time_str(t: str) -> str:
    """
    Convert a time string in any of these formats to 'HH:MM' (24-hour):
      '12:51a', '9:18a', '10:30p', '12:51 AM', '9:18 am', '10:30 PM',
      '09:18', '17:30', '9 : 18 PM'
    """
    # Strip all whitespace and lowercase
    t = re.sub(r'\s+', '', t.strip()).lower()

    # Detect am/pm marker
    has_am = t.endswith('am') or (t.endswith('a') and not t.endswith('pa'))
    has_pm = t.endswith('pm') or (t.endswith('p') and not t.endswith('ap'))

    # Strip am/pm marker
    t = re.sub(r'[apm]+$', '', t)

    # Parse HH:MM
    h, m = map(int, t.split(':'))

    if has_pm and h != 12:
        h += 12
    elif has_am and h == 12:
        h = 0
    # If no am/pm marker, treat as 24-hour — leave h alone

    # Sanity clamp
    if h < 0 or h > 23 or m < 0 or m > 59:
        raise ValueError(f'Invalid time: {t}')

    return f'{h:02d}:{m:02d}'


def _ampm_to_hhmm(t: str) -> str:
    return _parse_time_str(t)


def _hmm_to_float(t: str) -> float:
    h, m = map(int, t.split(':'))
    return round(h + m / 60, 4)


def _time_to_mins(t: str) -> int:
    h, m = map(int, t.split(':'))
    return h * 60 + m


# ─── Legacy fortnight roster PDF parser ───────────────────────────────────────

def parse_roster_pdf(file_bytes: bytes, filename: str = 'roster.pdf') -> ParseRosterResponse:
    """Legacy: extract sign-on/sign-off from a table-based roster PDF."""
    if pdfplumber is None:
        raise RuntimeError('pdfplumber not installed.')

    parsed_days: list[ParsedDayEntry] = []
    warnings: list[str] = []
    time_re = re.compile(r'\b(\d{2}):(\d{2})\b')
    date_re = re.compile(r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b')
    diag_re = re.compile(r'\b(3[0-9]{3}[A-Z\s]*|SBY|OFF|ADO|RDO)\b')

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for table in (page.extract_tables() or []):
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
                    parsed_days.append(ParsedDayEntry(
                        date=date_str or 'UNKNOWN', diagram=diagram,
                        sign_on=sign_on, sign_off=sign_off, confidence=min(confidence, 1.0),
                    ))
                    if confidence < 0.7:
                        warnings.append(f'Low confidence ({confidence:.0%}) for row: {row_text[:60]}...')

    if not parsed_days:
        warnings.append('No roster entries could be extracted. Please enter times manually.')
    return ParseRosterResponse(source_file=filename, parsed_days=parsed_days, warnings=warnings)


# ─── Payslip parser ───────────────────────────────────────────────────────────

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
    return 'sydney_crew' if ('crew' in header_str or 'sydney crew' in header_str) else 'nsw_payslip'


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
            period_end   = _fmt(date_matches[1])
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
                hrs    = float(hrs_val)  if hrs_val  and str(hrs_val).replace('.', '').replace('-', '').isdigit() else None
                rate   = float(rate_val) if rate_val and str(rate_val).replace('.', '').replace('-', '').isdigit() else None
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
                            line_items.append(PayslipLineItem(
                                code=cells[0] or '—', description=cells[1] if len(cells) > 1 else '',
                                hours=None, rate=None, amount=amounts[-1],
                            ))
                            total_gross += amounts[-1]
                        except Exception:
                            continue
    if not line_items:
        warnings.append('No line items extracted from payslip PDF. Please use XLSX format if available.')
    return ParsePayslipResponse(
        source_file=filename, format='pdf',
        total_gross=round(total_gross, 2), line_items=line_items, warnings=warnings,
    )
