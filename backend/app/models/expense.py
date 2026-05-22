import enum
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class NeedOrWant(str, enum.Enum):
    need = "need"
    want = "want"
    saving = "saving"


class Expense(Base):
    """
    Individual transaction linked to a monthly budget.
    envelope is a sub-category within the need/want/saving split
    (e.g. 'groceries', 'subscriptions', 'emergency fund').
    """
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    budget_id = Column(Integer, ForeignKey("budgets.id"), nullable=False)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)          # user-defined label, e.g. 'Food'
    need_or_want = Column(Enum(NeedOrWant), nullable=False)
    envelope = Column(String, nullable=True)           # optional envelope bucket name
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    budget = relationship("Budget", back_populates="expenses")
