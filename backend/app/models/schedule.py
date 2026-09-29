from sqlalchemy import Column, Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.db.base import Base


class Schedule(Base):
    __tablename__ = "schedules"

    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    md_ids = Column(JSONB, nullable=False, default=list)
    crna_ids = Column(JSONB, nullable=False, default=list)
    call_assignments = Column(JSONB, nullable=False, default=dict)

    facility = relationship("Facility")


class ScheduleMonthBackup(Base):
    __tablename__ = "schedule_month_backups"
    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint("owner_id", "facility_id", "year", "month", name="uq_month_backup_owner"),)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    id = Column(Integer, primary_key=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    entries = Column(JSONB, nullable=False)
