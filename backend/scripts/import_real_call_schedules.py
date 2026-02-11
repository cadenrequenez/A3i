from datetime import date
from typing import Dict, List, Tuple

from app import models
from app.db.session import SessionLocal

FACILITY_NAME = "Rio Grande Regional Hospital"
FACILITY_RULES = {"md": 2, "crna": 0, "cv_required": True}

ALIASES = {
    "D. REQUENEZ": "Daniel Requenez",
    "E. REQUENEZ": "Edward Requenez",
    "SCHWEGLER": "Erika Schwegler",
    "GORENA": "Mike Gorena",
    "LOZANO": "Maria Lozano",
    "SALINAS": "Ricky Salinas",
    "GARCIA": "Jaime Garcia",
    "GUTIERREZ": "Clarissa Gutierrez",
    "CASTRO": "Tim Castro",
}

FEB_2026: Dict[int, Tuple[str, str]] = {
    1: ("D. REQUENEZ", "SCHWEGLER"),
    2: ("E. REQUENEZ", "GORENA"),
    3: ("GARCIA", "GUTIERREZ"),
    4: ("SALINAS", "E. REQUENEZ"),
    5: ("D. REQUENEZ", "SCHWEGLER"),
    6: ("GORENA", "LOZANO"),
    7: ("LOZANO", "GORENA"),
    8: ("GORENA", "LOZANO"),
    9: ("SCHWEGLER", "E. REQUENEZ"),
    10: ("D. REQUENEZ", "GARCIA"),
    11: ("E. REQUENEZ", "GUTIERREZ"),
    12: ("GORENA", "LOZANO"),
    13: ("SALINAS", "CASTRO"),
    14: ("CASTRO", "SALINAS"),
    15: ("SALINAS", "CASTRO"),
    16: ("GARCIA", "D. REQUENEZ"),
    17: ("E. REQUENEZ", "GUTIERREZ"),
    18: ("LOZANO", "GORENA"),
    19: ("SALINAS", "D. REQUENEZ"),
    20: ("GUTIERREZ", "SCHWEGLER"),
    21: ("SCHWEGLER", "GUTIERREZ"),
    22: ("GUTIERREZ", "SCHWEGLER"),
    23: ("GARCIA", "SALINAS"),
    24: ("LOZANO", "GORENA"),
    25: ("SCHWEGLER", "GARCIA"),
    26: ("GUTIERREZ", "E. REQUENEZ"),
    27: ("D. REQUENEZ", "GARCIA"),
    28: ("GARCIA", "D. REQUENEZ"),
}

MAR_2026: Dict[int, Tuple[str, str]] = {
    1: ("Daniel Requenez", "Jaime Garcia"),
    2: ("Maria Lozano", "Edward Requenez"),
    3: ("Ricky Salinas", "Jaime Garcia"),
    4: ("Mike Gorena", "Maria Lozano"),
    5: ("Daniel Requenez", "Jaime Garcia"),
    6: ("Edward Requenez", "Ricky Salinas"),
    7: ("Ricky Salinas", "Edward Requenez"),
    8: ("Edward Requenez", "Ricky Salinas"),
    9: ("Clarissa Gutierrez", "Jaime Garcia"),
    10: ("Erika Schwegler", "Daniel Requenez"),
    11: ("Mike Gorena", "Maria Lozano"),
    12: ("Edward Requenez", "Ricky Salinas"),
    13: ("Jaime Garcia", "Clarissa Gutierrez"),
    14: ("Clarissa Gutierrez", "Jaime Garcia"),
    15: ("Jaime Garcia", "Clarissa Gutierrez"),
    16: ("Erika Schwegler", "Mike Gorena"),
    17: ("Clarissa Gutierrez", "Jaime Garcia"),
    18: ("Mike Gorena", "Maria Lozano"),
    19: ("Jaime Garcia", "Clarissa Gutierrez"),
    20: ("Maria Lozano", "Mike Gorena"),
    21: ("Mike Gorena", "Maria Lozano"),
    22: ("Maria Lozano", "Mike Gorena"),
    23: ("Jaime Garcia", "Erika Schwegler"),
    24: ("Daniel Requenez", "Maria Lozano"),
    25: ("Edward Requenez", "Ricky Salinas"),
    26: ("Maria Lozano", "Mike Gorena"),
    27: ("Erika Schwegler", "Daniel Requenez"),
    28: ("Daniel Requenez", "Erika Schwegler"),
    29: ("Erika Schwegler", "Daniel Requenez"),
    30: ("Clarissa Gutierrez", "Edward Requenez"),
    31: ("Ricky Salinas", "Erika Schwegler"),
}


def normalize_name(name: str) -> str:
    name = name.strip()
    return ALIASES.get(name, name)


def ensure_md(db, name: str) -> models.MD:
    md = db.query(models.MD).filter(models.MD.name == name).first()
    if md:
        return md
    md = models.MD(
        name=name,
        active=name != "Tim Castro",
        pedi_qualified=False,
        cv_qualified=name in {"Edward Requenez", "Daniel Requenez", "Erika Schwegler", "Mike Gorena", "Jaime Garcia", "Clarissa Gutierrez"},
        specialties=["general"],
        availability={},
    )
    db.add(md)
    db.commit()
    db.refresh(md)
    return md


def ensure_facility(db) -> models.Facility:
    facility = db.query(models.Facility).filter(models.Facility.site_name == FACILITY_NAME).first()
    if facility:
        return facility
    facility = models.Facility(site_name=FACILITY_NAME, staffing_requirements=FACILITY_RULES)
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility


def build_entries(month: int, year: int, mapping: Dict[int, Tuple[str, str]]) -> List[dict]:
    entries = []
    for day, (first, second) in mapping.items():
        entries.append(
            {
                "date": date(year, month, day),
                "first": normalize_name(first),
                "second": normalize_name(second),
            }
        )
    return entries


def import_entries(db, facility: models.Facility, entries: List[dict]) -> None:
    name_to_id = {}
    for entry in entries:
        for name in (entry["first"], entry["second"]):
            if name not in name_to_id:
                name_to_id[name] = ensure_md(db, name).id

    existing = {
        (s.date, s.facility_id): s
        for s in db.query(models.Schedule)
        .filter(models.Schedule.facility_id == facility.id)
        .filter(models.Schedule.date.in_([e["date"] for e in entries]))
        .all()
    }

    for entry in entries:
        call = {
            "first_call_md_id": name_to_id[entry["first"]],
            "second_call_md_id": name_to_id[entry["second"]],
        }
        md_ids = [call["first_call_md_id"], call["second_call_md_id"]]
        key = (entry["date"], facility.id)
        if key in existing:
            schedule = existing[key]
            schedule.md_ids = md_ids
            schedule.crna_ids = []
            schedule.call_assignments = call
        else:
            db.add(
                models.Schedule(
                    date=entry["date"],
                    facility_id=facility.id,
                    md_ids=md_ids,
                    crna_ids=[],
                    call_assignments=call,
                )
            )
    db.commit()


def main() -> None:
    db = SessionLocal()
    try:
        facility = ensure_facility(db)
        feb_entries = build_entries(2, 2026, FEB_2026)
        mar_entries = build_entries(3, 2026, MAR_2026)
        import_entries(db, facility, feb_entries + mar_entries)
        db.query(models.MD).filter(models.MD.name == "Tim Castro").update({"active": False})
        db.commit()
        print("Imported February and March 2026 call schedules.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
