from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class InsightGenerateRequest(BaseModel):
    """
    Body for POST /api/insights/generate.

    month: the YYYY-MM budget period to analyse.
    stress_score: override the FAS score (optional — falls back to the user's
                  most recent assessment if omitted).
    envelope_allocations: maps each envelope name to its intended £ budget for
                          the month. Pass an empty dict if not tracking per-envelope
                          targets; the rule engine will still run bucket-level checks.
    """
    month: str
    stress_score: Optional[float] = None
    envelope_allocations: dict[str, float] = {}


class InsightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    message: str
    insight_type: str
    created_at: datetime
