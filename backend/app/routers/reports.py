"""
POST /api/reports/generate
Generates a multi-page PDF financial report for the authenticated user.
"""
import io
from datetime import datetime, timedelta
from typing import Literal, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.assessment import Assessment
from app.models.budget import Budget
from app.models.expense import Expense
from app.models.insight import Insight
from app.models.user import User
from app.utils.auth import get_current_user

router = APIRouter()

# ── Palette ───────────────────────────────────────────────────────────────────
PURPLE     = colors.HexColor("#7F77DD")
GREEN      = colors.HexColor("#1D9E75")
AMBER      = colors.HexColor("#EF9F27")
LIGHT_GRAY = colors.HexColor("#F3F4F6")
DARK_TEXT  = colors.HexColor("#111827")
MID_GRAY   = colors.HexColor("#6B7280")


class ReportRequest(BaseModel):
    report_type: Literal["day", "weekly", "monthly"] = "monthly"
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None    # YYYY-MM-DD


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(n: float) -> str:
    return f"£{round(abs(n)):,}"


def _score_label(score: int) -> str:
    if score <= 14:
        return "Low"
    if score <= 24:
        return "Moderate"
    return "High"


def _pie_image(budget: Budget, expenses: list) -> io.BytesIO:
    """Generate planned vs actual pie charts, return PNG BytesIO."""
    income = budget.income
    needs_p   = income * budget.needs_pct   / 100
    wants_p   = income * budget.wants_pct   / 100
    savings_p = income * budget.savings_pct / 100

    needs_a   = sum(e.amount for e in expenses if e.need_or_want.value == "need")
    wants_a   = sum(e.amount for e in expenses if e.need_or_want.value == "want")
    savings_a = sum(e.amount for e in expenses if e.need_or_want.value == "saving")

    labels = ["Needs", "Wants", "Savings"]
    clrs   = ["#1D9E75", "#EF9F27", "#7F77DD"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9, 4))
    fig.patch.set_facecolor("white")

    planned = [needs_p, wants_p, savings_p]
    actual  = [needs_a, wants_a, savings_a]

    def _pie_labels(vals):
        return [f"{l}\n{_fmt(v)}" for l, v in zip(labels, vals)]

    ax1.pie(
        planned, labels=_pie_labels(planned), colors=clrs,
        autopct="%1.0f%%", startangle=90, textprops={"fontsize": 8},
    )
    ax1.set_title("Planned Split", fontsize=10, fontweight="bold", pad=10)

    if sum(actual) > 0:
        ax2.pie(
            actual, labels=_pie_labels(actual), colors=clrs,
            autopct="%1.0f%%", startangle=90, textprops={"fontsize": 8},
        )
    else:
        ax2.text(0.5, 0.5, "No spending recorded yet",
                 ha="center", va="center", transform=ax2.transAxes,
                 fontsize=9, color="#6b7280")
        ax2.axis("off")
    ax2.set_title("Actual Spending", fontsize=10, fontweight="bold", pad=10)

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


def _build_recommendations(
    budget, expenses,
    needs_b, wants_b, savings_b,
    needs_a, wants_a, savings_a,
) -> list[dict]:
    recs = []

    def _top_cat(bucket_key: str):
        cats: dict[str, float] = {}
        for e in expenses:
            if e.need_or_want.value == bucket_key:
                cats[e.category] = cats.get(e.category, 0) + e.amount
        if not cats:
            return None, 0.0
        top = max(cats, key=cats.__getitem__)
        return top, cats[top]

    # 1. Wants overspend
    if budget and wants_b > 0 and wants_a > wants_b:
        over = wants_a - wants_b
        cat, cat_amt = _top_cat("want")
        label = f"{cat} ({_fmt(cat_amt)})" if cat else "discretionary spending"
        weekly_target = _fmt(cat_amt / 4.3 * 0.75) if cat_amt else "less"
        recs.append({
            "problem":  f"Wants overspend — top category: {label}",
            "impact":   f"{_fmt(over)} over your {_fmt(wants_b)} wants budget this month",
            "solution": (
                f"Set a weekly cap of {weekly_target} on {cat or 'wants spending'}. "
                f"At this rate you save {_fmt(over * 3)} over 3 months toward your savings goal."
            ),
        })

    # 2. Savings shortfall
    if budget and savings_b > 0 and savings_a < savings_b:
        shortfall = savings_b - savings_a
        env = next(
            (e.envelope for e in expenses if e.need_or_want.value == "saving" and e.envelope),
            "your savings goal",
        )
        recs.append({
            "problem":  f"Savings shortfall — {_fmt(savings_a)} saved vs {_fmt(savings_b)} target",
            "impact":   f"{_fmt(shortfall)} gap this month",
            "solution": (
                f"Set up an automatic transfer of {_fmt(shortfall / 4)} per week to {env}. "
                f"This closes the gap within the current month."
            ),
        })

    # 3. Needs overspend
    if budget and needs_b > 0 and needs_a > needs_b:
        over = needs_a - needs_b
        cat, cat_amt = _top_cat("need")
        label = f"{cat} ({_fmt(cat_amt)})" if cat else "essential costs"
        recs.append({
            "problem":  f"Needs overspend — top category: {label}",
            "impact":   f"{_fmt(over)} over your {_fmt(needs_b)} needs budget",
            "solution": (
                f"Review {cat or 'essential'} costs for cheaper alternatives. "
                f"Even a {_fmt(over * 0.25)} monthly reduction saves {_fmt(over * 0.25 * 12)} per year."
            ),
        })

    # Fallback — all good
    if not recs:
        total = needs_a + wants_a + savings_a
        inc   = budget.income if budget else 0
        recs.append({
            "problem":  "No major overspending detected this period",
            "impact":   f"You spent {_fmt(total)} within your {_fmt(inc)} income",
            "solution": (
                "Great work staying on budget! Consider increasing your savings percentage by 5% "
                "to build a stronger emergency fund over the next 6 months."
            ),
        })

    return recs[:3]


def _build_pdf(
    user: User,
    budget: Budget | None,
    expenses: list,
    assessments: list,
    insights: list,
    report_type: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm,  bottomMargin=2 * cm,
    )

    ss = getSampleStyleSheet()

    def _style(name, parent="Normal", **kw):
        return ParagraphStyle(name, parent=ss[parent], **kw)

    S_TITLE   = _style("WCTitle",  "Title",   fontSize=26, textColor=PURPLE, spaceAfter=10, leading=32)
    S_SUB     = _style("WCSub",    "Normal",  fontSize=16, textColor=DARK_TEXT, spaceAfter=20)
    S_H1      = _style("WCH1",     "Heading1",fontSize=15, textColor=DARK_TEXT, spaceAfter=8)
    S_H2      = _style("WCH2",     "Heading2",fontSize=11, textColor=DARK_TEXT, spaceAfter=5)
    S_BODY    = _style("WCBody",   "Normal",  fontSize=10, leading=15, spaceAfter=4)
    S_CAPTION = _style("WCCap",    "Normal",  fontSize=8,  textColor=MID_GRAY)
    S_BAR     = _style("WCBar",    "Normal",  fontName="Courier", fontSize=8, leading=12, spaceAfter=3)

    now = datetime.now()
    if start_date and end_date:
        period_label = (
            f"{datetime.strptime(start_date, '%Y-%m-%d').strftime('%d %b %Y')}"
            f" – {datetime.strptime(end_date, '%Y-%m-%d').strftime('%d %b %Y')}"
        )
    elif report_type == "day":
        period_label = now.strftime("%d %B %Y")
    elif report_type == "weekly":
        period_label = f"{(now - timedelta(days=7)).strftime('%d %b')} – {now.strftime('%d %b %Y')}"
    else:
        period_label = now.strftime("%B %Y")

    income      = budget.income        if budget else 0
    needs_b     = income * (budget.needs_pct   if budget else 50) / 100
    wants_b     = income * (budget.wants_pct   if budget else 30) / 100
    savings_b   = income * (budget.savings_pct if budget else 20) / 100
    needs_a     = sum(e.amount for e in expenses if e.need_or_want.value == "need")
    wants_a     = sum(e.amount for e in expenses if e.need_or_want.value == "want")
    savings_a   = sum(e.amount for e in expenses if e.need_or_want.value == "saving")
    total_spent = needs_a + wants_a + savings_a

    latest_as = assessments[0]  if assessments else None
    first_as  = assessments[-1] if assessments else None

    elems = []

    # ── PAGE 1 — Cover ────────────────────────────────────────────────────────
    elems.append(Spacer(1, 3 * cm))
    elems.append(Paragraph("Wealth Compass", S_TITLE))
    elems.append(Paragraph("Financial Report", S_SUB))
    elems.append(Spacer(1, 0.8 * cm))

    cover_rows = [
        ["Name:",         user.name],
        ["Report type:",  report_type.capitalize()],
        ["Period:",       period_label],
        ["Generated:",    now.strftime("%d %B %Y, %H:%M")],
    ]
    cover_t = Table(cover_rows, colWidths=[3.5 * cm, 10 * cm])
    cover_t.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 11),
        ("TEXTCOLOR",     (0, 0), (0, -1), PURPLE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elems.append(cover_t)
    elems.append(Spacer(1, 2.5 * cm))

    banner = Table(
        [["  Wealth Compass — your financial anxiety companion"]],
        colWidths=[17 * cm],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PURPLE),
        ("TEXTCOLOR",     (0, 0), (-1, -1), colors.white),
        ("FONTSIZE",      (0, 0), (-1, -1), 10),
        ("TOPPADDING",    (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    elems.append(banner)
    elems.append(PageBreak())

    # ── PAGE 2 — Financial Summary ────────────────────────────────────────────
    elems.append(Paragraph("Financial Summary", S_H1))
    elems.append(Paragraph(f"Period: {period_label}", S_CAPTION))
    elems.append(Spacer(1, 0.4 * cm))

    rem = income - total_spent
    rem_color = "#1D9E75" if rem >= 0 else "#ef4444"
    rem_word  = "remaining" if rem >= 0 else "over budget"
    elems.append(Paragraph(f"Monthly income: <b>{_fmt(income)}</b>", S_BODY))
    elems.append(Paragraph(
        f"Total spent: <b>{_fmt(total_spent)}</b> — "
        f"<font color='{rem_color}'><b>{_fmt(abs(rem))} {rem_word}</b></font>",
        S_BODY,
    ))
    elems.append(Spacer(1, 0.4 * cm))

    rows = [["Category", "Planned %", "Planned £", "Actual £", "Difference"]]
    for label, pct_val, pb, pa in [
        ("Needs",   budget.needs_pct   if budget else 50, needs_b,   needs_a),
        ("Wants",   budget.wants_pct   if budget else 30, wants_b,   wants_a),
        ("Savings", budget.savings_pct if budget else 20, savings_b, savings_a),
    ]:
        diff = pb - pa
        sign = "+" if diff >= 0 else "−"
        rows.append([label, f"{pct_val:.0f}%", _fmt(pb), _fmt(pa), f"{sign}{_fmt(abs(diff))}"])

    tbl = Table(rows, colWidths=[3.5 * cm, 2.5 * cm, 3 * cm, 3 * cm, 3 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  PURPLE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ("BACKGROUND",    (0, 1), (-1, 1),  LIGHT_GRAY),
        ("BACKGROUND",    (0, 2), (-1, 2),  colors.white),
        ("BACKGROUND",    (0, 3), (-1, 3),  LIGHT_GRAY),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    elems.append(tbl)
    elems.append(Spacer(1, 0.6 * cm))

    elems.append(Paragraph("Spending vs Budget", S_H2))
    for label, spent, budg in [
        ("Needs  ", needs_a,   needs_b),
        ("Wants  ", wants_a,   wants_b),
        ("Savings", savings_a, savings_b),
    ]:
        if budg > 0:
            pct_v  = min(100, int(spent / budg * 100))
            filled = pct_v // 5
            bar    = "[" + "#" * filled + "-" * (20 - filled) + "]"
            status_word = "OVER" if spent > budg else "ok"
            elems.append(Paragraph(
                f"<b>{label}</b>  {bar}  {pct_v}%  {_fmt(spent)} of {_fmt(budg)}  [{status_word}]",
                S_BAR,
            ))

    elems.append(PageBreak())

    # ── PAGE 3 — Pie Charts ───────────────────────────────────────────────────
    elems.append(Paragraph("Spending Breakdown", S_H1))
    elems.append(Paragraph("Planned split vs actual spending this period.", S_BODY))
    elems.append(Spacer(1, 0.4 * cm))

    if budget:
        pie_buf = _pie_image(budget, expenses)
        elems.append(Image(pie_buf, width=16 * cm, height=7 * cm))
    else:
        elems.append(Paragraph("No budget set up yet.", S_BODY))

    elems.append(Spacer(1, 0.5 * cm))

    leg_rows = [
        ["", "Category", "Planned £", "Actual £"],
        [" ", "Needs",   _fmt(needs_b),   _fmt(needs_a)],
        [" ", "Wants",   _fmt(wants_b),   _fmt(wants_a)],
        [" ", "Savings", _fmt(savings_b), _fmt(savings_a)],
    ]
    leg_t = Table(leg_rows, colWidths=[0.6 * cm, 4 * cm, 4 * cm, 4 * cm])
    leg_t.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("BACKGROUND",    (0, 1), (0, 1),   GREEN),
        ("BACKGROUND",    (0, 2), (0, 2),   AMBER),
        ("BACKGROUND",    (0, 3), (0, 3),   PURPLE),
        ("ALIGN",         (2, 0), (-1, -1), "CENTER"),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elems.append(leg_t)
    elems.append(PageBreak())

    # ── PAGE 4 — FAS Score ────────────────────────────────────────────────────
    elems.append(Paragraph("Financial Anxiety Score (FAS)", S_H1))
    elems.append(Paragraph("Financial Anxiety Scale — Archuleta et al. 2013", S_CAPTION))
    elems.append(Spacer(1, 0.4 * cm))

    if latest_as:
        score = latest_as.stress_score
        level = _score_label(score)
        lc    = "#1D9E75" if level == "Low" else "#EF9F27" if level == "Moderate" else "#ef4444"
        elems.append(Paragraph(
            f"Current score: <font size='18'><b>{score}</b></font> / 35 — "
            f"<font color='{lc}'><b>{level} Anxiety</b></font>",
            S_BODY,
        ))
        elems.append(Spacer(1, 0.25 * cm))

        if first_as and first_as.id != latest_as.id:
            change      = score - first_as.stress_score
            change_word = "improved" if change < 0 else "increased" if change > 0 else "unchanged"
            cc          = "#1D9E75" if change < 0 else "#ef4444" if change > 0 else "#6b7280"
            elems.append(Paragraph(
                f"First assessment: <b>{first_as.stress_score}</b> "
                f"({first_as.created_at.strftime('%d %b %Y')}) → "
                f"Latest: <b>{score}</b> ({latest_as.created_at.strftime('%d %b %Y')}) — "
                f"<font color='{cc}'><b>{change_word} by {abs(change)}</b></font>",
                S_BODY,
            ))

        elems.append(Spacer(1, 0.5 * cm))
        explanations = {
            "Low":      "Score 7–14: You are generally comfortable with your financial situation. Keep up your healthy financial habits.",
            "Moderate": "Score 15–24: Some areas of your finances are causing stress. Focus on the actionable tips in this report.",
            "High":     "Score 25–35: Financial anxiety is significantly affecting you. Consider speaking to a financial advisor or counsellor.",
        }
        elems.append(Paragraph(explanations[level], S_BODY))
    else:
        elems.append(Paragraph(
            "No assessment recorded yet. Complete the FAS questionnaire in the app to track your financial anxiety over time.",
            S_BODY,
        ))

    elems.append(PageBreak())

    # ── PAGE 5 — Insights ────────────────────────────────────────────────────
    elems.append(Paragraph("Your Top Insights", S_H1))
    elems.append(Spacer(1, 0.3 * cm))

    type_color = {"spending": AMBER, "savings": GREEN, "behaviour": PURPLE}
    if insights:
        for i, ins in enumerate(insights[:3], 1):
            elems.append(Paragraph(f"{i}. {ins.insight_type.capitalize()} Insight", S_H2))
            elems.append(Paragraph(ins.message, S_BODY))
            elems.append(Paragraph(ins.created_at.strftime("%d %B %Y"), S_CAPTION))
            elems.append(Spacer(1, 0.4 * cm))
    else:
        elems.append(Paragraph(
            "No insights generated yet. Tag your transactions in the app then use the Generate Insights button.",
            S_BODY,
        ))

    elems.append(PageBreak())

    # ── PAGE 6 — Personalised Strategy ───────────────────────────────────────
    elems.append(Paragraph("Personalised Strategy", S_H1))
    elems.append(Paragraph(
        "Recommendations based on your real spending data and budget targets.",
        S_BODY,
    ))
    elems.append(Spacer(1, 0.3 * cm))

    recs = _build_recommendations(
        budget, expenses,
        needs_b, wants_b, savings_b,
        needs_a, wants_a, savings_a,
    )
    for i, rec in enumerate(recs, 1):
        rec_t = Table(
            [
                [Paragraph(f"<b>{i}. Problem</b>", S_BODY), Paragraph(rec["problem"],  S_BODY)],
                [Paragraph("<b>Impact</b>",         S_BODY), Paragraph(rec["impact"],   S_BODY)],
                [Paragraph("<b>Solution</b>",       S_BODY), Paragraph(rec["solution"], S_BODY)],
            ],
            colWidths=[3 * cm, 13 * cm],
        )
        rec_t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (0, -1), LIGHT_GRAY),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]))
        elems.append(rec_t)
        elems.append(Spacer(1, 0.5 * cm))

    doc.build(elems)
    buf.seek(0)
    return buf.read()


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/generate")
def generate_report(
    payload: ReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.id)
        .order_by(Budget.created_at.desc())
        .first()
    )

    # Resolve date range — default to current month when not provided
    now = datetime.now()
    if payload.start_date:
        start_dt = datetime.strptime(payload.start_date, "%Y-%m-%d")
    else:
        start_dt = datetime(now.year, now.month, 1)
    if payload.end_date:
        end_dt = datetime.strptime(payload.end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    else:
        end_dt = now

    expenses = (
        db.query(Expense)
        .filter(
            Expense.budget_id == budget.id,
            Expense.created_at >= start_dt,
            Expense.created_at <= end_dt,
        )
        .all()
        if budget else []
    )
    assessments = (
        db.query(Assessment)
        .filter(Assessment.user_id == current_user.id)
        .order_by(Assessment.created_at.desc())
        .all()
    )
    insights = (
        db.query(Insight)
        .filter(Insight.user_id == current_user.id)
        .order_by(Insight.created_at.desc())
        .limit(3)
        .all()
    )

    try:
        pdf_bytes = _build_pdf(
            user=current_user,
            budget=budget,
            expenses=expenses,
            assessments=assessments,
            insights=insights,
            report_type=payload.report_type,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report generation failed: {exc}",
        )

    filename = f"wealth-compass-{payload.report_type}-report.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
