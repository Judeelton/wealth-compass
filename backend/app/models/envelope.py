from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Envelope(Base):
    # This tells SQLAlchemy which database table this class maps to
    __tablename__ = "envelopes"

    # Every envelope gets a unique auto-incrementing ID
    id = Column(Integer, primary_key=True, index=True)

    # Which user this envelope belongs to — references the users table
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Human-readable name for the envelope, e.g. "Rent", "Groceries", "Netflix"
    name = Column(String(100), nullable=False)

    # Which budget category this envelope falls under: "need", "want", or "saving"
    category = Column(String(20), nullable=False)

    # How much the user plans to spend on this envelope each month
    # Defaults to 0.0 so an envelope can be created before the amount is decided
    allocated_amount = Column(Float, default=0.0)

    # Automatically recorded when the row is first inserted
    created_at = Column(DateTime, default=datetime.utcnow)

    # This lets me do envelope.user to get the User object without a separate query
    user = relationship("User", back_populates="envelopes")
