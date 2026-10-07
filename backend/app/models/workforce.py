from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class WorkforceSettings(Base):
    __tablename__ = "workforce_settings"
    owner_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    rosters = Column(JSONB, nullable=False, default=dict)
    crnas = Column(JSONB, nullable=False, default=list)


class WorkforceDay(Base):
    __tablename__ = "workforce_days"
    __table_args__ = (UniqueConstraint("owner_id", "date", name="uq_workforce_day_owner"),)
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    revision = Column(Integer, nullable=False, default=0)
    payload = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class WorkforceHistory(Base):
    __tablename__ = "workforce_history"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    revision = Column(Integer, nullable=False)
    payload = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class WorkforceMonth(Base):
    __tablename__ = "workforce_months"
    __table_args__ = (UniqueConstraint("owner_id", "year", "month", name="uq_workforce_month_owner"),)
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    revision = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="draft")
