"""PDF and CSV export for wage calculation results.
PRD ref: Section 7 FR-04 (export), Solution Design Section 4.5
"""
from __future__ import annotations
import csv
import io
from models import CalculateResponse

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


def render_pdf(result: CalculateResponse) -> bytes:
    """
    Produce a formatted PDF report.
    Page 1: Summary (gross pay, hours, fortnight type, ADO, OT)
    Page 2+: 14-day breakdown + component totals + audit flags
    PRD §FR-04, Solution Design §4.5
    """
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab not installed. Run: pip install reportlab")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("title", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.grey, spaceAfter=12)
    heading_style = ParagraphStyle("heading", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=6)

    story.append(Paragraph("Mt Victoria Driver Wage Calculator", title_style))
    story.append(Paragraph(f"Fortnight starting {result.fortnight_start} · EA 2025 · {result.fortnight_type.upper()} fortnight", sub_style))

    # Summary table
    summary_data = [
        ["Calculated gross pay", f"${result.total_pay:,.2f}"],
        ["Total hours worked", f"{result.total_hours:.2f} hrs"],
        ["Fortnight type", result.fortnight_type.upper() + (" (ADO paid out)" if result.fortnight_type == "short" else " (ADO accruing)")],
        ["ADO payout", f"${result.ado_payout:.2f}" if result.ado_payout > 0 else "—"],
        ["Fortnight OT hours", f"{result.fn_ot_hrs:.2f} hrs" if result.fn_ot_hrs > 0 else "—"],
    ]
    if result.audit.payslip_variance is not None:
        summary_data.append(["Payslip variance", f"${result.audit.payslip_variance:+.2f}"])

    t = Table(summary_data, colWidths=[80*mm, 80*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a6fba")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#f5f5f5"), colors.white]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    # 14-day breakdown
    story.append(Paragraph("14-Day Breakdown", heading_style))
    day_data = [["Date", "Diagram", "Type", "Hours", "Pay"]]
    for d in result.days:
        day_data.append([
            d.date, d.diag, d.day_type.upper(),
            f"{d.hours:.2f}", f"${d.total_pay:.2f}",
        ])
    day_data.append(["TOTAL", "", "", f"{result.total_hours:.2f}", f"${result.total_pay:.2f}"])

    dt = Table(day_data, colWidths=[32*mm, 42*mm, 25*mm, 25*mm, 30*mm])
    dt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#444")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f9f9f9")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8f2fb")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(dt)

    # Component totals
    story.append(Paragraph("Component Totals", heading_style))
    comp_data = [["Pay component", "Amount"]]
    for name, amt in sorted(result.component_totals.items(), key=lambda x: -x[1]):
        comp_data.append([name, f"${amt:.2f}"])
    comp_data.append(["GROSS TOTAL", f"${result.total_pay:.2f}"])

    ct = Table(comp_data, colWidths=[130*mm, 30*mm])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#444")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8f2fb")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(ct)

    # Audit flags
    if result.audit.flags:
        story.append(Paragraph("Audit Flags", heading_style))
        for flag in result.audit.flags:
            story.append(Paragraph(f"⚑ {flag}", styles["Normal"]))
            story.append(Spacer(1, 2*mm))

    doc.build(story)
    return buf.getvalue()


def render_csv(result: CalculateResponse) -> str:
    """
    Produce a CSV with two sections:
    1. Daily breakdown
    2. Component totals
    PRD §FR-04, Solution Design §4.5
    """
    buf = io.StringIO()
    w = csv.writer(buf)

    w.writerow(["Mt Victoria Driver Wage Calculator — EA 2025"])
    w.writerow([f"Fortnight starting: {result.fortnight_start}"])
    w.writerow([f"Fortnight type: {result.fortnight_type.upper()}"])
    w.writerow([f"Calculated gross pay: ${result.total_pay:.2f}"])
    w.writerow([])

    w.writerow(["--- DAILY BREAKDOWN ---"])
    w.writerow(["Date", "Diagram", "Day type", "Actual hours", "Paid hours", "Total pay"])
    for d in result.days:
        w.writerow([d.date, d.diag, d.day_type, f"{d.hours:.2f}", f"{d.paid_hrs:.2f}", f"{d.total_pay:.2f}"])
    w.writerow(["TOTAL", "", "", f"{result.total_hours:.2f}", "", f"{result.total_pay:.2f}"])
    w.writerow([])

    w.writerow(["--- COMPONENT TOTALS ---"])
    w.writerow(["Pay component", "Amount"])
    for name, amt in sorted(result.component_totals.items(), key=lambda x: -x[1]):
        w.writerow([name, f"{amt:.2f}"])
    w.writerow(["GROSS TOTAL", f"{result.total_pay:.2f}"])
    w.writerow([])

    if result.audit.flags:
        w.writerow(["--- AUDIT FLAGS ---"])
        for flag in result.audit.flags:
            w.writerow([flag])

    return buf.getvalue()
