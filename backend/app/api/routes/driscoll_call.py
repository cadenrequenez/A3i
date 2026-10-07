"""Manual Driscoll call editing with the account's separate site roster."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from app import models, schemas
from app.core.deps import get_current_admin, get_db
from app.api.routes.workforce import lock_owner, settings_data

router = APIRouter(prefix="/schedules/driscoll", tags=["schedules"])


class CallChoice(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str | None = Field(default=None, min_length=1, max_length=100)
    guest_name: schemas.StaffName | None = None


class CallDayWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    facility_id: int
    expected_revision: int = Field(ge=0)
    first: CallChoice = Field(default_factory=CallChoice)
    second: CallChoice = Field(default_factory=CallChoice)
    off_keys: list[str] = Field(default_factory=list, max_length=200)


@router.put("/day", response_model=schemas.ScheduleOut)
def save_day(body: CallDayWrite, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    site = db.get(models.Facility, body.facility_id)
    if not site or "driscoll" not in site.site_name.lower():
        raise HTTPException(400, "Select the Driscoll call calendar.")
    if not 2000 <= body.date.year <= 2100:
        raise HTTPException(422, "Date is outside the supported range.")
    # Share the roster lock: membership cannot change during validation/save.
    lock_owner(db, user.id)
    rows = db.query(models.Schedule).filter_by(owner_id=user.id, facility_id=site.id, date=body.date).with_for_update().all()
    if len(rows) > 1:
        raise HTTPException(409, "This day has duplicate saved records and needs review before editing.")
    row = rows[0] if rows else None
    current = (row.call_assignments or {}) if row else {}
    revision = current.get("revision", 0)
    if revision != body.expected_revision:
        raise HTTPException(409, "This day changed in another tab. Your edits are still here. Reload the saved day before trying again.")
    members = {m["key"]: m for m in settings_data(db, user.id)["rosters"].get(str(site.id), [])}
    calls = {}
    names = []
    ids = []
    for position, choice in (("first", body.first), ("second", body.second)):
        if choice.key and choice.guest_name:
            raise HTTPException(422, "Choose a roster doctor or type a guest name for each call.")
        name = choice.guest_name
        if choice.key:
            member = members.get(choice.key)
            # A removed doctor may remain on an already saved call, not a new one.
            retained = choice.key == current.get(f"{position}_call_key")
            if not member or (not member["active"] and not retained):
                if not retained or not current.get(f"{position}_call_name"):
                    raise HTTPException(422, "Choose a doctor from the active Driscoll roster, or use a guest / locum name.")
            name = member["name"] if member else current[f"{position}_call_name"]
        names.append(name)
        md_id = None
        if choice.key and choice.key.startswith("md-") and choice.key[3:].isdigit():
            md_id = int(choice.key[3:])
            ids.append(md_id)
        calls.update({f"{position}_call_key": choice.key, f"{position}_call_name": name,
                      f"{position}_call_guest_name": choice.guest_name, f"{position}_call_md_id": md_id})
    if all(names) and names[0].casefold() == names[1].casefold():
        raise HTTPException(422, "Choose different doctors for first and second call, or leave either blank.")
    if len(set(body.off_keys)) != len(body.off_keys):
        raise HTTPException(422, "Choose each person off only once.")
    previous_off = dict(zip(current.get("off_keys", []), current.get("off_names", [])))
    off_names = []
    for key in body.off_keys:
        member = members.get(key)
        retained = key in previous_off
        if not member or (not member["active"] and not retained):
            if not retained:
                raise HTTPException(422, "Choose a doctor from the active Driscoll roster for Off.")
        off_names.append(member["name"] if member else previous_off[key])
    if row is None:
        row = models.Schedule(owner_id=user.id, facility_id=site.id, date=body.date, crna_ids=[])
        db.add(row)
    row.md_ids = ids
    row.call_assignments = {**current, **calls, "off_keys": body.off_keys, "off_names": off_names, "revision": revision + 1}
    db.commit()
    db.refresh(row)
    return row
