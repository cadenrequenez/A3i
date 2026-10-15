"""Store reports as data only. Never dispatch reports to AI, tools or schedules."""
from datetime import datetime
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy.orm import Session
from app import models
from app.core.deps import get_db, get_current_user, get_current_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])
Status = Literal["received", "reviewing", "testing", "resolved"]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: Literal["bug", "fix", "feature", "schedule_correction"]
    description: Description
    expected_behavior: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""
    page_context: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300, pattern=r"^(/[^?#]*|)$")] = ""
    urgency: Literal["normal", "high"] = "normal"


class FeedbackStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status


class FeedbackOut(FeedbackCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    status: Status
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=FeedbackOut, status_code=201)
def create_feedback(data: FeedbackCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    report = models.FeedbackRequest(owner_id=user.id, **data.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=list[FeedbackOut])
def list_feedback(inbox: bool = False, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), user=Depends(get_current_user)):
    query = db.query(models.FeedbackRequest)
    if inbox:
        if user.role != "admin":
            raise HTTPException(403, "Admin access required")
    else:
        query = query.filter(models.FeedbackRequest.owner_id == user.id)
    return query.order_by(models.FeedbackRequest.created_at.desc(), models.FeedbackRequest.id.desc()).offset(offset).limit(limit).all()


@router.patch("/{report_id}", response_model=FeedbackOut)
def update_status(report_id: int, data: FeedbackStatusUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    report = db.get(models.FeedbackRequest, report_id)
    if report is None:
        raise HTTPException(404, "Request not found")
    report.status = data.status
    report.updated_by_id = admin.id
    db.commit()
    db.refresh(report)
    return report
