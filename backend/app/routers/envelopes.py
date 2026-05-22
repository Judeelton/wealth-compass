from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.envelope import Envelope
from app.models.user import User
from app.utils.auth import get_current_user

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

# What the frontend must send when creating or updating an envelope
class EnvelopeCreate(BaseModel):
    name: str
    category: str          # must be: "need", "want", or "saving"
    allocated_amount: float = 0.0


# What we send back — includes the database-generated id and created_at timestamp
class EnvelopeResponse(BaseModel):
    id: int
    name: str
    category: str
    allocated_amount: float
    created_at: datetime

    class Config:
        # This lets Pydantic read values from SQLAlchemy model attributes directly
        from_attributes = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

# GET /api/envelopes/
# Returns all envelopes for the currently logged-in user,
# sorted by category then name so the frontend can display them in a consistent order
@router.get("/", response_model=List[EnvelopeResponse])
def get_envelopes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Envelope)
        .filter(Envelope.user_id == current_user.id)
        .order_by(Envelope.category, Envelope.name)
        .all()
    )


# POST /api/envelopes/bulk-save
# Replaces all of the user's envelopes in one go.
# I build the new envelope objects first, THEN delete the old ones —
# that way we never end up in a state where the old data is gone but the
# new data hasn't been written yet.
@router.post("/bulk-save")
def bulk_save_envelopes(
    envelopes: List[EnvelopeCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Step 1 — build all the new Envelope rows in memory before touching the database
    new_envelopes = []
    for env in envelopes:
        new_env = Envelope(
            user_id=current_user.id,
            name=env.name.strip(),
            # Store category lowercase so comparisons elsewhere are consistent
            category=env.category.lower().strip(),
            # Guard against negative amounts slipping through from the frontend
            allocated_amount=max(0.0, env.allocated_amount),
        )
        new_envelopes.append(new_env)

    # Step 2 — safe to delete old rows now that the new ones are ready
    db.query(Envelope).filter(Envelope.user_id == current_user.id).delete()

    # Step 3 — write all new envelopes and commit once
    for env in new_envelopes:
        db.add(env)
    db.commit()

    # Return the count so the frontend can confirm everything was saved
    return {"saved": len(new_envelopes), "message": "Envelopes saved successfully"}


# DELETE /api/envelopes/{envelope_id}
# Deletes a single envelope by ID.
# We check that the envelope belongs to the current user before deleting —
# otherwise any logged-in user could delete anyone else's envelopes.
@router.delete("/{envelope_id}")
def delete_envelope(
    envelope_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    envelope = (
        db.query(Envelope)
        .filter(
            Envelope.id == envelope_id,
            Envelope.user_id == current_user.id,  # ownership check
        )
        .first()
    )

    if not envelope:
        raise HTTPException(status_code=404, detail="Envelope not found")

    db.delete(envelope)
    db.commit()
    return {"message": "Envelope deleted successfully"}
