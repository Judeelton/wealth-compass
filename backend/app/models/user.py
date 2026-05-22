from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)  # stored as bcrypt hash
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    budgets = relationship("Budget", back_populates="owner", cascade="all, delete-orphan")
    assessments = relationship("Assessment", back_populates="owner", cascade="all, delete-orphan")
    insights = relationship("Insight", back_populates="owner", cascade="all, delete-orphan")
    # A user can have many envelopes — cascade means if the user is deleted, their envelopes go too
    envelopes = relationship("Envelope", back_populates="user", cascade="all, delete-orphan")
