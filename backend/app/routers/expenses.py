from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.budget import Budget
from app.models.expense import Expense
from app.models.user import User
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse
from app.utils.auth import get_current_user

router = APIRouter()


def _owned_budget(budget_id: int, user_id: int, db: Session) -> Budget:
    """Return the budget if it belongs to user_id, else 404."""
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == user_id,
    ).first()
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    return budget


def _owned_expense(expense_id: int, user_id: int, db: Session) -> Expense:
    """
    Return the expense if it belongs to a budget owned by user_id, else 404.
    Joins through Budget so we never leak another user's data.
    """
    expense = (
        db.query(Expense)
        .join(Budget, Expense.budget_id == Budget.id)
        .filter(Expense.id == expense_id, Budget.user_id == user_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@router.post(
    "",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a tagged expense to a budget",
)
def add_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify the target budget belongs to this user before writing
    _owned_budget(payload.budget_id, current_user.id, db)

    expense = Expense(**payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get(
    "",
    response_model=List[ExpenseResponse],
    summary="List all expenses for a given budget",
)
def get_expenses(
    budget_id: int = Query(..., description="ID of the budget whose expenses to fetch"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _owned_budget(budget_id, current_user.id, db)

    return (
        db.query(Expense)
        .filter(Expense.budget_id == budget_id)
        .order_by(Expense.created_at.desc())
        .all()
    )


@router.put(
    "/{expense_id}",
    response_model=ExpenseResponse,
    summary="Update an expense's tag, amount, or envelope",
)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = _owned_expense(expense_id, current_user.id, db)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(expense, field, value)

    db.commit()
    db.refresh(expense)
    return expense


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an expense",
)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = _owned_expense(expense_id, current_user.id, db)
    db.delete(expense)
    db.commit()
