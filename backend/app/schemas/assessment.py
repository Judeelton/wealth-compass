from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _score_to_level(score: int) -> str:
    """Derive the anxiety label from the FAS score (7–35)."""
    if score <= 14:
        return "low"
    if score <= 24:
        return "moderate"
    return "high"


class AssessmentCreate(BaseModel):
    stress_score: int
    # anxiety_level is computed server-side from stress_score; clients don't send it

    @field_validator("stress_score")
    @classmethod
    def score_in_range(cls, v: int) -> int:
        if not 7 <= v <= 35:
            raise ValueError("stress_score must be between 7 and 35")
        return v


class AssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    stress_score: int
    anxiety_level: str
    created_at: datetime
