from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from app.db.base import Base


class FeedbackRequest(Base):
    __tablename__ = "feedback_requests"

    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(30), nullable=False)
    description = Column(Text, nullable=False)
    expected_behavior = Column(Text, nullable=False, default="")
    page_context = Column(String(300), nullable=False, default="")
    urgency = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False, default="received")
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
