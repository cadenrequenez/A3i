from sqlalchemy import Column, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, index=True)
    site_name = Column(String, nullable=False, unique=True, index=True)
    staffing_requirements = Column(JSONB, nullable=False, default=dict)
