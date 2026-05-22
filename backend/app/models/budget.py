from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Budget(Base):
    """
    Monthly budget record for a user.
    needs_pct + wants_pct + savings_pct should sum to 100.
    month is stored as a string in YYYY-MM format (e.g. '2026-04').
    """
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    income = Column(Float, nullable=False)
    needs_pct = Column(Float, nullable=False, default=50.0)
    wants_pct = Column(Float, nullable=False, default=30.0)
    savings_pct = Column(Float, nullable=False, default=20.0)
    month = Column(String(7), nullable=False)  # YYYY-MM
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="budgets")
    expenses = relationship("Expense", back_populates="budget", cascade="all, delete-orphan")
