from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.core.deps import get_current_admin, get_db, get_current_user

router = APIRouter(prefix="/crnas", tags=["crnas"])


@router.post("/", response_model=schemas.CRNAOut)
def create_crna(
    data: schemas.CRNACreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    return crud.create_crna(db, data)


@router.get("/", response_model=list[schemas.CRNAOut])
def list_crnas(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = db.query(models.CRNA)
    if not include_inactive:
        query = query.filter(models.CRNA.active.is_(True))
    return query.all()


@router.get("/{crna_id}", response_model=schemas.CRNAOut)
def get_crna(crna_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    crna = db.query(models.CRNA).filter(models.CRNA.id == crna_id).first()
    if not crna:
        raise HTTPException(status_code=404, detail="CRNA not found")
    return crna


@router.put("/{crna_id}", response_model=schemas.CRNAOut)
def update_crna(
    crna_id: int,
    data: schemas.CRNAUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    crna = db.query(models.CRNA).filter(models.CRNA.id == crna_id).first()
    if not crna:
        raise HTTPException(status_code=404, detail="CRNA not found")
    return crud.update_crna(db, crna, data)


@router.delete("/{crna_id}")
def delete_crna(
    crna_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    crna = db.query(models.CRNA).filter(models.CRNA.id == crna_id).first()
    if not crna:
        raise HTTPException(status_code=404, detail="CRNA not found")
    db.delete(crna)
    db.commit()
    return {"status": "deleted"}
