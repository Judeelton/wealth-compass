import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class BudgetCreate(BaseModel):
    income: float
    needs_pct: float = 50.0
    wants_pct: float = 30.0
    savings_pct: float = 20.0
    month: str  # YYYY-MM

    @field_validator("income")
    @classmethod
    def income_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("income must be greater than 0")
        return v

    @field_validator("month")
    @classmethod
    def month_format(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", v):
            raise ValueError("month must be in YYYY-MM format (e.g. '2026-04')")
        return v

    @model_validator(mode="after")
    def percentages_sum_to_100(self) -> "BudgetCreate":
        total = self.needs_pct + self.wants_pct + self.savings_pct
        if abs(total - 100) > 0.01:
            raise ValueError(
                f"needs_pct + wants_pct + savings_pct must sum to 100 (got {total:.2f})"
            )
        return self


class BudgetUpdate(BaseModel):
    income: Optional[float] = None
    needs_pct: Optional[float] = None
    wants_pct: Optional[float] = None
    savings_pct: Optional[float] = None

    @field_validator("income")
    @classmethod
    def income_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("income must be greater than 0")
        return v


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    income: float
    needs_pct: float
    wants_pct: float
    savings_pct: float
    month: str
    created_at: datetime
