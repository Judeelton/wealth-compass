from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.assessment import Assessment
from app.models.budget import Budget
from app.models.expense import Expense
from app.models.insight import Insight
from app.models.user import User
from app.schemas.insight import InsightGenerateRequest, InsightResponse
from app.services.insights import generate_insights
from app.utils.auth import get_current_user

router = APIRouter()

# Maps the 3 ordered insight slots to a stable type label
_INSIGHT_TYPES = ["spending", "savings", "behaviour"]


@router.post(
    "/generate",
    response_model=List[InsightResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Generate and persist 3 personalised insights for a budget month",
)
def generate_and_save(
    payload: InsightGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Fetch the budget for the requested month
    budget = db.query(Budget).filter(
        Budget.user_id == current_user.id,
        Budget.month == payload.month,
    ).first()
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No budget found for {payload.month}",
        )

    # Fetch all expenses linked to that budget
    expenses = db.query(Expense).filter(Expense.budget_id == budget.id).all()
    if not expenses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No expenses found for {payload.month} — add some transactions first",
        )

    transactions = [
        {
            "amount": e.amount,
            "need_or_want": e.need_or_want.value,  # convert enum to string
            "category": e.category,
            "envelope": e.envelope,
        }
        for e in expenses
    ]

    # Resolve stress score: use the override value or fall back to latest assessment
    stress_score = payload.stress_score
    if stress_score is None:
        latest_assessment = (
            db.query(Assessment)
            .filter(Assessment.user_id == current_user.id)
            .order_by(Assessment.created_at.desc())
            .first()
        )
        stress_score = latest_assessment.stress_score if latest_assessment else 0.0

    intended_split = {
        "needs_pct": budget.needs_pct,
        "wants_pct": budget.wants_pct,
        "savings_pct": budget.savings_pct,
    }

    insight_texts = generate_insights(
        transactions=transactions,
        envelope_allocations=payload.envelope_allocations,
        intended_split=intended_split,
        stress_score=stress_score,
        income=budget.income,
    )

    # Persist all 3 insights then return them
    saved: List[Insight] = []
    for i, message in enumerate(insight_texts):
        insight = Insight(
            user_id=current_user.id,
            message=message,
            insight_type=_INSIGHT_TYPES[i % len(_INSIGHT_TYPES)],
        )
        db.add(insight)
        saved.append(insight)

    db.commit()
    for insight in saved:
        db.refresh(insight)

    return saved


@router.get(
    "",
    response_model=List[InsightResponse],
    summary="Get recent insights for the current user, newest first",
)
def get_insights(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only return insights from the last 30 days so stale advice doesn't linger.
    # Ordered newest-first and capped at 10 so the dashboard never shows a wall of text.
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    return (
        db.query(Insight)
        .filter(
            Insight.user_id == current_user.id,
            Insight.created_at >= thirty_days_ago,
        )
        .order_by(Insight.created_at.desc())
        .limit(10)
        .all()
    )
