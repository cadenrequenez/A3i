from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.core.deps import get_current_admin, get_db, get_current_user
from app.scheduling.engine import WeeklyLimits, generate_monthly_schedule

router = APIRouter(prefix="/schedules", tags=["schedules"])


@router.post("/", response_model=schemas.ScheduleOut)
def create_schedule(
    data: schemas.ScheduleCreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    return crud.create_schedule(db, data)


@router.get("/", response_model=list[schemas.ScheduleOut])
def list_schedules(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return db.query(models.Schedule).all()


@router.get("/{schedule_id}", response_model=schemas.ScheduleOut)
def get_schedule(
    schedule_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.put("/{schedule_id}", response_model=schemas.ScheduleOut)
def update_schedule(
    schedule_id: int,
    data: schemas.ScheduleUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return crud.update_schedule(db, schedule, data)


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(schedule)
    db.commit()
    return {"status": "deleted"}


@router.post("/generate", response_model=schemas.ScheduleGenerateResponse)
def generate_schedule(
    data: schemas.ScheduleGenerateRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    start_date = date(data.year, data.month, 1)
    end_date = (start_date.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)

    facilities = db.query(models.Facility).all()
    facility_lookup = {facility.site_name: facility.id for facility in facilities}
    if not facility_lookup:
        raise HTTPException(status_code=400, detail="No facilities configured")

    md_staff = [
        {
            "id": md.id,
            "name": md.name,
            "pedi_qualified": md.pedi_qualified,
            "cv_qualified": md.cv_qualified,
        }
        for md in db.query(models.MD).filter(models.MD.active.is_(True)).all()
    ]
    crna_staff = [
        {
            "id": crna.id,
            "name": crna.name,
            "pedi_qualified": crna.pedi_qualified,
            "cv_qualified": crna.cv_qualified,
        }
        for crna in db.query(models.CRNA).filter(models.CRNA.active.is_(True)).all()
    ]

    limits = WeeklyLimits(
        max_on_call=data.max_on_call or 7,
        max_surgical=data.max_surgical or 7,
    )
    generated = generate_monthly_schedule(md_staff, crna_staff, start_date, limits=limits)

    if data.overwrite:
        db.query(models.Schedule).filter(
            models.Schedule.date >= start_date,
            models.Schedule.date <= end_date,
        ).delete()
        db.commit()
        existing_pairs: set[tuple[date, int]] = set()
    else:
        existing_pairs = {
            (schedule.date, schedule.facility_id)
            for schedule in db.query(models.Schedule).filter(
                models.Schedule.date >= start_date,
                models.Schedule.date <= end_date,
            )
        }

    created = 0
    for entry in generated:
        facility_id = facility_lookup.get(entry["facility"])
        if facility_id is None:
            continue
        if (entry["date"], facility_id) in existing_pairs:
            continue
        db.add(
            models.Schedule(
                date=entry["date"],
                facility_id=facility_id,
                md_ids=entry["md_ids"],
                crna_ids=entry["crna_ids"],
                call_assignments=entry["call_assignments"],
            )
        )
        created += 1
    db.commit()

    return schemas.ScheduleGenerateResponse(
        created=created,
        start_date=start_date,
        end_date=end_date,
    )
