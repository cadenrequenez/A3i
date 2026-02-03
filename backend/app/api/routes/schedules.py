from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.core.deps import get_current_admin, get_db, get_current_user

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
