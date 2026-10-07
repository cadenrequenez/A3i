"""Account-owned workforce editing; call schedules remain independent."""
from calendar import monthrange
from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session
from app.core.deps import get_db, get_current_user, get_current_admin
from app.models import MD, CRNA, Facility, User
from app.models.workforce import WorkforceSettings, WorkforceDay, WorkforceHistory, WorkforceMonth, WorkforceIssue

router = APIRouter(prefix="/workforce", tags=["workforce"])

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Member(StrictModel):
    key: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    active: bool = True

class SettingsWrite(StrictModel):
    expected_revision: int = Field(ge=0)
    rosters: dict[str, list[Member]]
    crnas: list[Member] = Field(max_length=200)
    site_crnas: dict[str, list[Member]] | None = None

class Entry(StrictModel):
    kind: Literal["md", "crna"]
    key: str | None = Field(default=None, max_length=100)
    name: str = Field(default="", max_length=100)
    guest: bool = False
    site_id: int | None = None
    home_site_id: int | None = None
    status: Literal["working", "off", "admin", "post_call"] = "working"
    note: str = Field(default="", max_length=250)

class SiteDay(StrictModel):
    closed: bool = False
    md: int | None = Field(default=None, ge=0, le=100)
    crna: int | None = Field(default=None, ge=0, le=100)
    note: str = Field(default="", max_length=250)

class DayPayload(StrictModel):
    entries: list[Entry] = Field(default_factory=list, max_length=300)
    sites: dict[str, SiteDay] = Field(default_factory=dict)
    note: str = Field(default="", max_length=2000)
    reviewed: bool = False

class DayWrite(StrictModel):
    expected_revision: int = Field(ge=0)
    payload: DayPayload

class MonthWrite(StrictModel):
    expected_revision: int = Field(ge=0)
    status: Literal["draft", "ready"]


def lock_owner(db, owner):
    # Serialize saves, settings, and ready marking, including first-row creation.
    db.query(User).filter(User.id == owner).with_for_update().one()


def settings_data(db, owner):
    row = db.get(WorkforceSettings, owner)
    md_members = [dict(key=f"md-{s.id}", name=s.name, active=s.active) for s in db.query(MD).order_by(MD.id)]
    sites = db.query(Facility).order_by(Facility.id).all()
    defaults = {str(s.id): ([] if "driscoll" in s.site_name.lower() else md_members) for s in sites}
    return dict(revision=row.revision if row else 0, rosters={**defaults, **(row.rosters if row else {})},
                crnas=row.crnas if row else [dict(key=f"crna-{s.id}", name=s.name, active=s.active) for s in db.query(CRNA).order_by(CRNA.id)],
                site_crnas=row.site_crnas if row else {})


def sync_rio_md(db, owner, md, *, added=False):
    """Keep Team's Rio editor and this owner's workforce roster in one transaction."""
    row = db.get(WorkforceSettings, owner)
    if not row:
        return  # Default rosters already read the current MD table.
    key = f"md-{md.id}"
    rosters = {site: [dict(member) for member in members] for site, members in row.rosters.items()}
    changed = False
    for members in rosters.values():
        for member in members:
            if member["key"] == key and (member["name"] != md.name or member["active"] != md.active):
                member.update(name=md.name, active=md.active)
                changed = True
    if added:
        for site in db.query(Facility).all():
            name = site.site_name.lower()
            if "rio" in name and "surgical" not in name:
                members = rosters.setdefault(str(site.id), [])
                if not any(member["key"] == key for member in members):
                    members.append(dict(key=key, name=md.name, active=md.active))
                    changed = True
    if changed:
        row.rosters = rosters
        row.revision += 1
        for month in db.query(WorkforceMonth).filter_by(owner_id=owner).all():
            month.status = "draft"
            month.revision += 1


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return settings_data(db, user.id)


@router.put("/settings")
def put_settings(body: SettingsWrite, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    lock_owner(db, user.id)
    current = settings_data(db, user.id)
    if body.expected_revision != current["revision"]:
        raise HTTPException(409, "The roster changed in another tab. Reload before saving.")
    valid_sites = {str(s.id) for s in db.query(Facility).all()}
    if set(body.rosters) - valid_sites or set(body.site_crnas or {}) - valid_sites or len(body.rosters) > 30:
        raise HTTPException(422, "Unknown facility.")
    for members in [*body.rosters.values(), body.crnas, *(body.site_crnas or {}).values()]:
        if len(members) > 200 or len({m.key for m in members}) != len(members) or any(not m.name.strip() for m in members):
            raise HTTPException(422, "Use a name and a unique roster key for each person.")
    # The same key identifies the same person across facilities.
    names = {}
    for members in body.rosters.values():
        for member in members:
            if member.key in names and names[member.key] != member.name.strip():
                raise HTTPException(422, "The same MD must have the same name across rosters.")
            names[member.key] = member.name.strip()
    home_keys = [m.key for m in body.crnas] + [m["key"] for members in (current["site_crnas"] if body.site_crnas is None else {k: [m.model_dump() for m in v] for k, v in body.site_crnas.items()}).values() for m in members]
    if len(home_keys) != len(set(home_keys)):
        raise HTTPException(422, "Each CRNA has one home roster. Move the daily assignment for transfers.")
    row = db.get(WorkforceSettings, user.id)
    if not row:
        row = WorkforceSettings(owner_id=user.id)
        db.add(row)
    row.revision = current["revision"] + 1
    row.rosters = {k: [dict(m.model_dump(), name=m.name.strip()) for m in v] for k, v in body.rosters.items()}
    row.crnas = [dict(m.model_dump(), name=m.name.strip()) for m in body.crnas]
    if body.site_crnas is not None:
        row.site_crnas = {k: [dict(m.model_dump(), name=m.name.strip()) for m in v] for k, v in body.site_crnas.items()}
    # Membership and coverage expectations can change after review.
    for month in db.query(WorkforceMonth).filter_by(owner_id=user.id).all():
        month.status = "draft"
        month.revision += 1
    db.commit()
    return settings_data(db, user.id)


def month_bounds(year, month):
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def day_data(row):
    return dict(date=row.date.isoformat(), revision=row.revision, payload=row.payload, updated_at=row.updated_at.isoformat())


def warnings_for(payload, facilities):
    warnings = []
    seen = {}
    for entry in payload.get("entries", []):
        if entry["status"] == "post_call":
            continue  # An annotation may accompany the same person's working assignment.
        # Also catch aliases when a roster entry and a guest share a name.
        identity = (entry["kind"], entry["name"].strip().casefold())
        if identity in seen:
            warnings.append(f'{entry["name"]} appears more than once (check assignments and Off).')
        seen[identity] = True
    for site in facilities:
        override = payload.get("sites", {}).get(str(site.id), {})
        assigned = [e for e in payload.get("entries", []) if e["site_id"] == site.id and e["status"] == "working"]
        if override.get("closed"):
            if assigned:
                warnings.append(f"{site.site_name} is closed but has assignments.")
            continue
        for kind in ("md", "crna"):
            target = override.get(kind)
            if target is None:
                target = (site.staffing_requirements or {}).get(kind, 0)
            count = sum(e["kind"] == kind for e in assigned)
            if count != target:
                warnings.append(f"{site.site_name}: {count}/{target} {kind.upper()} assigned.")
    return warnings


def month_data(db, owner, year, month):
    start, end = month_bounds(year, month)
    rows = db.query(WorkforceDay).filter(WorkforceDay.owner_id == owner, WorkforceDay.date.between(start, end)).order_by(WorkforceDay.date).all()
    marker = db.query(WorkforceMonth).filter_by(owner_id=owner, year=year, month=month).first()
    sites = db.query(Facility).order_by(Facility.id).all()
    return dict(year=year, month=month, revision=marker.revision if marker else 0, status=("draft" if marker and marker.status == "ready" and any(warnings_for(r.payload, sites) or not r.payload.get("reviewed") for r in rows) else marker.status) if marker else "draft",
                days=[dict(day_data(r), warnings=warnings_for(r.payload, sites)) for r in rows])


@router.get("/month")
def get_month(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), db: Session = Depends(get_db), user=Depends(get_current_user)):
    return month_data(db, user.id, year, month)


@router.put("/day/{day}")
def put_day(day: date, body: DayWrite, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    if not 2000 <= day.year <= 2100:
        raise HTTPException(422, "Date is outside the supported range.")
    lock_owner(db, user.id)
    row = db.query(WorkforceDay).filter_by(owner_id=user.id, date=day).first()
    if body.expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "This day changed in another tab. Your edits are still here. Reload the saved day before trying again.")
    config = settings_data(db, user.id)
    md_lookup = {m["key"]: m for members in config["rosters"].values() for m in members}
    crna_lookup = {m["key"]: m for m in [*config["crnas"], *[m for members in config["site_crnas"].values() for m in members]]}
    sites = db.query(Facility).all()
    ids = {s.id for s in sites}
    payload = body.payload.model_dump()
    if set(payload["sites"]) - {str(i) for i in ids}:
        raise HTTPException(422, "Unknown facility.")
    for entry in payload["entries"]:
        if entry["status"] == "post_call" and entry["kind"] != "md":
            raise HTTPException(422, "Post-call annotations apply to MDs.")
        if entry["site_id"] not in ids | {None} or entry["home_site_id"] not in ids | {None}:
            raise HTTPException(422, "Unknown facility.")
        if entry["guest"]:
            entry["name"] = entry["name"].strip()
            entry["key"] = None
            if not entry["name"]:
                raise HTTPException(422, "Enter the temporary clinician's name.")
        else:
            member = (md_lookup if entry["kind"] == "md" else crna_lookup).get(entry["key"])
            if not member:
                raise HTTPException(422, "Select a roster member or use a temporary clinician.")
            entry["name"] = member["name"]
            if entry["kind"] == "md" and entry["status"] == "working" and entry["key"] not in {m["key"] for m in config["rosters"].get(str(entry["site_id"]), [])}:
                raise HTTPException(422, "Choose an MD from this facility's roster, or use a temporary clinician.")
        if entry["status"] == "working" and entry["site_id"] is None:
            raise HTTPException(422, "Choose a location for each working assignment.")
    if not row:
        row = WorkforceDay(owner_id=user.id, date=day, revision=0, payload={})
        db.add(row)
    db.add(WorkforceHistory(owner_id=user.id, date=day, revision=row.revision, payload=row.payload))
    row.payload = payload
    row.revision += 1
    marker = db.query(WorkforceMonth).filter_by(owner_id=user.id, year=day.year, month=day.month).first()
    if not marker:
        marker = WorkforceMonth(owner_id=user.id, year=day.year, month=day.month, revision=0)
        db.add(marker)
    marker.status = "draft"
    marker.revision += 1
    db.commit()
    db.refresh(row)
    return dict(day_data(row), warnings=warnings_for(payload, sites), month_revision=marker.revision)


@router.get("/day/{day}/history")
def get_history(day: date, db: Session = Depends(get_db), user=Depends(get_current_user)):
    rows = db.query(WorkforceHistory).filter_by(owner_id=user.id, date=day).order_by(WorkforceHistory.id.desc()).limit(20).all()
    return [dict(revision=r.revision, payload=r.payload, created_at=r.created_at.isoformat()) for r in rows]


@router.put("/month/{year}/{month}/status")
def put_month_status(year: int, month: int, body: MonthWrite, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise HTTPException(422, "Invalid month.")
    lock_owner(db, user.id)
    current = month_data(db, user.id, year, month)
    if body.expected_revision != current["revision"]:
        raise HTTPException(409, "The month changed while you were reviewing it. Reload and review the latest version.")
    if body.status == "ready":
        if len(current["days"]) != monthrange(year, month)[1] or any(not d["payload"].get("reviewed") or d["warnings"] for d in current["days"]):
            raise HTTPException(422, "Review every day and resolve coverage warnings before marking this month ready. Partial work can always be saved as a draft.")
    marker = db.query(WorkforceMonth).filter_by(owner_id=user.id, year=year, month=month).first()
    if not marker:
        marker = WorkforceMonth(owner_id=user.id, year=year, month=month, revision=0)
        db.add(marker)
    marker.status = body.status
    marker.revision += 1
    db.commit()
    return month_data(db, user.id, year, month)


class IssueWrite(StrictModel):
    expected_revision: int = Field(ge=0)
    section: str = Field(max_length=40)
    audience: Literal["hospital", "provider", "office"] = "hospital"
    include_notes: bool = False


def copy_for_audience(month, facilities, section, audience, include_notes=False):
    """Return a data-filtered copy, never hidden private fields or other-site sheets."""
    from copy import deepcopy
    site_ids = {s.id for s in facilities}
    driscoll_ids = {s.id for s in facilities if "driscoll" in s.site_name.lower()}
    if section == "relief":
        if audience == "hospital":
            raise HTTPException(422, "Relief is an internal coordination copy. Choose a site for a hospital copy.")
        selected = facilities
    else:
        try:
            site_id = int(section)
        except ValueError:
            raise HTTPException(422, "Choose a facility or relief.")
        if site_id not in site_ids:
            raise HTTPException(422, "Unknown facility.")
        selected = [s for s in facilities if s.id == site_id]
    result = deepcopy(month)
    for day in result["days"]:
        payload = day["payload"]
        entries = []
        for entry in payload.get("entries", []):
            off = entry["status"] == "off"
            if off:
                if audience != "office":
                    continue
            elif section == "relief":
                if entry["kind"] != "crna" or entry.get("home_site_id") in driscoll_ids or (entry.get("home_site_id") is None and entry.get("site_id") in driscoll_ids):
                    continue
            elif entry.get("site_id") != site_id:
                continue
            if entry["status"] == "admin" and audience != "office":
                continue
            if audience != "office":
                entry["key"] = None
                entry["guest"] = True
                entry["home_site_id"] = None
                if not include_notes:
                    entry["note"] = ""
            entries.append(entry)
        payload["entries"] = entries
        payload["sites"] = {str(s.id): deepcopy(payload.get("sites", {}).get(str(s.id), {})) for s in selected}
        if audience != "office":
            payload["note"] = ""
            day["warnings"] = []
            for override in payload["sites"].values():
                if not include_notes:
                    override["note"] = ""
    return {"month": result, "sites": [dict(id=s.id, site_name=s.site_name, staffing_requirements=s.staffing_requirements) for s in selected]}


def issue_data(row):
    return dict(id=row.id, year=row.year, month=row.month, section=row.section, audience=row.audience,
                revision=row.revision, created_at=row.created_at.isoformat(), snapshot=row.snapshot)


@router.get("/issues")
def get_issues(year: int = Query(ge=2000, le=2100), month: int = Query(ge=1, le=12), db: Session = Depends(get_db), user=Depends(get_current_admin)):
    rows = db.query(WorkforceIssue).filter_by(owner_id=user.id, year=year, month=month).order_by(WorkforceIssue.id.desc()).all()
    return [issue_data(r) for r in rows]


@router.put("/issues/{year}/{month}")
def issue_month(year: int, month: int, body: IssueWrite, db: Session = Depends(get_db), user=Depends(get_current_admin)):
    if not 2000 <= year <= 2100 or not 1 <= month <= 12:
        raise HTTPException(422, "Invalid month.")
    lock_owner(db, user.id)
    current = month_data(db, user.id, year, month)
    if current["revision"] != body.expected_revision:
        raise HTTPException(409, "The saved month changed. Reload and preview it before issuing a copy.")
    facilities = db.query(Facility).order_by(Facility.id).all()
    snapshot = copy_for_audience(current, facilities, body.section, body.audience, body.include_notes)
    previous = db.query(WorkforceIssue).filter_by(owner_id=user.id, year=year, month=month, section=body.section, audience=body.audience).order_by(WorkforceIssue.revision.desc()).first()
    row = WorkforceIssue(owner_id=user.id, year=year, month=month, section=body.section, audience=body.audience,
                         revision=(previous.revision if previous else 0) + 1, snapshot=snapshot)
    db.add(row)
    db.commit()
    db.refresh(row)
    return issue_data(row)
