from sqlalchemy import Boolean, Column, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class MD(Base):
    __tablename__ = "mds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    active = Column(Boolean, nullable=False, default=True)
    pedi_qualified = Column(Boolean, nullable=False, default=False)
    cv_qualified = Column(Boolean, nullable=False, default=False)
    specialties = Column(JSONB, nullable=False, default=list)
    availability = Column(JSONB, nullable=False, default=dict)


class CRNA(Base):
    __tablename__ = "crnas"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    active = Column(Boolean, nullable=False, default=True)
    pedi_qualified = Column(Boolean, nullable=False, default=False)
    cv_qualified = Column(Boolean, nullable=False, default=False)
    specialties = Column(JSONB, nullable=False, default=list)
    availability = Column(JSONB, nullable=False, default=dict)
