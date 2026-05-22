from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.budget import Budget
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetUpdate, BudgetResponse
from app.utils.auth import get_current_user

router = APIRouter()


@router.post(
    "",
    response_model=BudgetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a monthly budget",
)
def create_budget(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Enforce one budget per user per month
    if db.query(Budget).filter(
        Budget.user_id == current_user.id,
        Budget.month == payload.month,
    ).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A budget for {payload.month} already exists — use PUT to update it",
        )

    budget = Budget(user_id=current_user.id, **payload.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.get(
    "",
    response_model=List[BudgetResponse],
    summary="List all budgets for the current user, newest first",
)
def get_budgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Budget)
        .filter(Budget.user_id == current_user.id)
        .order_by(Budget.month.desc())
        .all()
    )


@router.put(
    "/{budget_id}",
    response_model=BudgetResponse,
    summary="Update a budget by ID",
)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id,
    ).first()
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")

    updates = payload.model_dump(exclude_none=True)

    # If any percentage is being changed, validate the resulting sum
    if any(k in updates for k in ("needs_pct", "wants_pct", "savings_pct")):
        new_needs = updates.get("needs_pct", budget.needs_pct)
        new_wants = updates.get("wants_pct", budget.wants_pct)
        new_savings = updates.get("savings_pct", budget.savings_pct)
        total = new_needs + new_wants + new_savings
        if abs(total - 100) > 0.01:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"needs_pct + wants_pct + savings_pct must sum to 100 (got {total:.2f})",
            )

    for field, value in updates.items():
        setattr(budget, field, value)

    db.commit()
    db.refresh(budget)
    return budget
