from sqlalchemy.orm import Session
from app import models, schemas
from app.core.security import hash_password


def create_md(db: Session, data: schemas.MDCreate) -> models.MD:
    md = models.MD(**data.dict())
    db.add(md)
    db.commit()
    db.refresh(md)
    return md


def update_md(db: Session, md: models.MD, data: schemas.MDUpdate) -> models.MD:
    for key, value in data.dict(exclude_unset=True).items():
        setattr(md, key, value)
    db.commit()
    db.refresh(md)
    return md


def create_crna(db: Session, data: schemas.CRNACreate) -> models.CRNA:
    crna = models.CRNA(**data.dict())
    db.add(crna)
    db.commit()
    db.refresh(crna)
    return crna


def update_crna(db: Session, crna: models.CRNA, data: schemas.CRNAUpdate) -> models.CRNA:
    for key, value in data.dict(exclude_unset=True).items():
        setattr(crna, key, value)
    db.commit()
    db.refresh(crna)
    return crna


def create_facility(db: Session, data: schemas.FacilityCreate) -> models.Facility:
    facility = models.Facility(**data.dict())
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility


def update_facility(db: Session, facility: models.Facility, data: schemas.FacilityUpdate) -> models.Facility:
    for key, value in data.dict(exclude_unset=True).items():
        setattr(facility, key, value)
    db.commit()
    db.refresh(facility)
    return facility


def create_schedule(db: Session, data: schemas.ScheduleCreate) -> models.Schedule:
    schedule = models.Schedule(**data.dict())
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


def update_schedule(db: Session, schedule: models.Schedule, data: schemas.ScheduleUpdate) -> models.Schedule:
    for key, value in data.dict(exclude_unset=True).items():
        setattr(schedule, key, value)
    db.commit()
    db.refresh(schedule)
    return schedule


def create_user(db: Session, data: schemas.UserCreate) -> models.User:
    user = models.User(
        username=data.username,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
