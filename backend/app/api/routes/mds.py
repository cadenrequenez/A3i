from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.api.routes.workforce import lock_owner, sync_rio_md
from app.core.deps import get_current_admin, get_db, get_current_user

router = APIRouter(prefix="/mds", tags=["mds"])


@router.post("/", response_model=schemas.MDOut)
def create_md(
    data: schemas.MDCreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    lock_owner(db, _user.id)
    md = crud.create_md(db, data, commit=False)
    sync_rio_md(db, _user.id, md, added=True)
    db.commit()
    db.refresh(md)
    return md


@router.get("/", response_model=list[schemas.MDOut])
def list_mds(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    query = db.query(models.MD)
    if not include_inactive:
        query = query.filter(models.MD.active.is_(True))
    return query.all()


@router.get("/{md_id}", response_model=schemas.MDOut)
def get_md(md_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)):
    md = db.query(models.MD).filter(models.MD.id == md_id).first()
    if not md:
        raise HTTPException(status_code=404, detail="MD not found")
    return md


@router.put("/{md_id}", response_model=schemas.MDOut)
def update_md(
    md_id: int,
    data: schemas.MDUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    md = db.query(models.MD).filter(models.MD.id == md_id).first()
    if not md:
        raise HTTPException(status_code=404, detail="MD not found")
    lock_owner(db, _user.id)
    md = crud.update_md(db, md, data, commit=False)
    sync_rio_md(db, _user.id, md)
    db.commit()
    db.refresh(md)
    return md


@router.delete("/{md_id}")
def delete_md(
    md_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    md = db.query(models.MD).filter(models.MD.id == md_id).first()
    if not md:
        raise HTTPException(status_code=404, detail="MD not found")
    db.delete(md)
    db.commit()
    return {"status": "deleted"}
