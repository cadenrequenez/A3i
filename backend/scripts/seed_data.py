from datetime import date
import os
from app.core.security import hash_password
from app.db.session import SessionLocal
from app import models
from app.scheduling.engine import FACILITY_RULES, WeeklyLimits, generate_monthly_schedule


def seed_users(db):
    users = [
        {"username": "admin", "password": "admin123", "role": "admin"},
        {"username": "readonly1", "password": "readonly123", "role": "read-only"},
        {"username": "readonly2", "password": "readonly123", "role": "read-only"},
    ]
    for user in users:
        existing = db.query(models.User).filter(models.User.username == user["username"]).first()
        if existing:
            continue
        db.add(
            models.User(
                username=user["username"],
                password_hash=hash_password(user["password"]),
                role=user["role"],
            )
        )
    db.commit()


def seed_facilities(db):
    facilities = []
    for name, rules in FACILITY_RULES.items():
        facility = db.query(models.Facility).filter(models.Facility.site_name == name).first()
        if facility:
            facilities.append(facility)
            continue
        facility = models.Facility(site_name=name, staffing_requirements=rules)
        db.add(facility)
        facilities.append(facility)
    db.commit()
    for facility in facilities:
        db.refresh(facility)
    return facilities


def seed_staff(db):
    if db.query(models.MD).count() > 0 and db.query(models.CRNA).count() > 0:
        return

    md_definitions = [
        {"name": "Ricky Salinas", "pedi": True, "cv": False, "active": True},
        {"name": "Edward Requenez", "pedi": True, "cv": True, "active": True},
        {"name": "Daniel Requenez", "pedi": True, "cv": True, "active": True},
        {"name": "Erika Schwegler", "pedi": True, "cv": True, "active": True},
        {"name": "Mike Gorena", "pedi": True, "cv": True, "active": True},
        {"name": "Maria Lozano", "pedi": True, "cv": False, "active": True},
        {"name": "Jaime Garcia", "pedi": False, "cv": True, "active": True},
        {"name": "Clarissa Gutierrez", "pedi": False, "cv": True, "active": True},
        {"name": "Tim Castro", "pedi": False, "cv": False, "active": False},
    ]
    md_records = [
        models.MD(
            name=definition["name"],
            active=definition["active"],
            pedi_qualified=definition["pedi"],
            cv_qualified=definition["cv"],
            specialties=["general"],
            availability={},
        )
        for definition in md_definitions
    ]

    pedi_crnas = {
        "Stacy Beach",
        "David Cavazos",
        "Eddie Daniel",
        "Noel Dubaldo",
        "Yanelli Gutierrez",
        "Lisa Masica",
        "Binoj Mathew",
        "Tony Nelson",
        "Luis Serrato",
        "Aaron Valdez",
        "Angel Arjona",
        "Noe Herrera",
        "Sean Acebedo",
        "Rachel Guerrero",
    }
    crna_names = [
        "Stacy Beach",
        "David Cavazos",
        "Eddie Daniel",
        "Noel Dubaldo",
        "Yanelli Gutierrez",
        "Lisa Masica",
        "Binoj Mathew",
        "Tony Nelson",
        "Luis Serrato",
        "Aaron Valdez",
        "Angel Arjona",
        "Noe Herrera",
        "Sean Acebedo",
        "Rachel Guerrero",
    ]
    crna_records = [
        models.CRNA(
            name=crna_name,
            pedi_qualified=crna_name in pedi_crnas,
            cv_qualified=False,
            specialties=["general"],
            availability={},
        )
        for crna_name in crna_names
    ]

    db.add_all(md_records + crna_records)
    db.commit()


def seed_schedules(db, facilities):
    if db.query(models.Schedule).count() > 0:
        return

    md_staff = [
        {
            "id": md.id,
            "name": md.name,
            "pedi_qualified": md.pedi_qualified,
            "cv_qualified": md.cv_qualified,
        }
        for md in db.query(models.MD).all()
    ]
    crna_staff = [
        {
            "id": crna.id,
            "name": crna.name,
            "pedi_qualified": crna.pedi_qualified,
            "cv_qualified": crna.cv_qualified,
        }
        for crna in db.query(models.CRNA).all()
    ]

    schedule = generate_monthly_schedule(
        md_staff,
        crna_staff,
        date.today().replace(day=1),
        limits=WeeklyLimits(max_on_call=7, max_surgical=7),
    )

    facility_lookup = {facility.site_name: facility.id for facility in facilities}
    for entry in schedule:
        db.add(
            models.Schedule(
                date=entry["date"],
                facility_id=facility_lookup[entry["facility"]],
                md_ids=entry["md_ids"],
                crna_ids=entry["crna_ids"],
                call_assignments=entry["call_assignments"],
            )
        )
    db.commit()


def main():
    db = SessionLocal()
    try:
        if os.getenv("SEED_OVERWRITE") == "1":
            db.query(models.Schedule).delete()
            db.query(models.Facility).delete()
            db.query(models.MD).delete()
            db.query(models.CRNA).delete()
            db.query(models.User).delete()
            db.commit()
        seed_users(db)
        facilities = seed_facilities(db)
        seed_staff(db)
        seed_schedules(db, facilities)
    finally:
        db.close()


if __name__ == "__main__":
    main()
