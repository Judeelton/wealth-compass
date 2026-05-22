from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Insight(Base):
    """
    Personalised behavioural insight stored after each generation call.
    insight_type groups insights by category, e.g. 'spending', 'savings', 'anxiety'.
    """
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String, nullable=False)
    insight_type = Column(String, nullable=False)  # spending | savings | anxiety
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="insights")
