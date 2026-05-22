from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Assessment(Base):
    """
    Stores results of the Financial Anxiety Scale (FAS) assessment.
    stress_score is a raw numeric score; anxiety_level is a categorical label
    derived from that score (e.g. 'low', 'moderate', 'high', 'severe').
    """
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    stress_score = Column(Float, nullable=False)
    anxiety_level = Column(String, nullable=False)  # low | moderate | high | severe
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="assessments")
