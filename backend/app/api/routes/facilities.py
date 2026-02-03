from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.core.deps import get_current_admin, get_db, get_current_user

router = APIRouter(prefix="/facilities", tags=["facilities"])


@router.post("/", response_model=schemas.FacilityOut)
def create_facility(
    data: schemas.FacilityCreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    return crud.create_facility(db, data)


@router.get("/", response_model=list[schemas.FacilityOut])
def list_facilities(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return db.query(models.Facility).all()


@router.get("/{facility_id}", response_model=schemas.FacilityOut)
def get_facility(
    facility_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    facility = db.query(models.Facility).filter(models.Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    return facility


@router.put("/{facility_id}", response_model=schemas.FacilityOut)
def update_facility(
    facility_id: int,
    data: schemas.FacilityUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    facility = db.query(models.Facility).filter(models.Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    return crud.update_facility(db, facility, data)


@router.delete("/{facility_id}")
def delete_facility(
    facility_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    facility = db.query(models.Facility).filter(models.Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    db.delete(facility)
    db.commit()
    return {"status": "deleted"}
