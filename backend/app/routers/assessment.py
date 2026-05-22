from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.assessment import Assessment
from app.models.user import User
from app.schemas.assessment import AssessmentCreate, AssessmentResponse, _score_to_level
from app.utils.auth import get_current_user

router = APIRouter()


@router.post(
    "",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a FAS questionnaire result",
)
def submit_assessment(
    payload: AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Derive the categorical label from the numeric score server-side
    assessment = Assessment(
        user_id=current_user.id,
        stress_score=payload.stress_score,
        anxiety_level=_score_to_level(payload.stress_score),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


@router.get(
    "",
    response_model=List[AssessmentResponse],
    summary="Get all FAS assessments for the current user, newest first",
)
def get_assessments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Assessment)
        .filter(Assessment.user_id == current_user.id)
        .order_by(Assessment.created_at.desc())
        .all()
    )
