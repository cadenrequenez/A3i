from datetime import date
from app.scheduling.engine import generate_monthly_schedule


def build_staff():
    mds = [
        {"id": 1, "name": "Dr A", "pedi_qualified": False, "cv_qualified": True},
        {"id": 2, "name": "Dr B", "pedi_qualified": False, "cv_qualified": False},
        {"id": 3, "name": "Dr C", "pedi_qualified": False, "cv_qualified": False},
        {"id": 4, "name": "Dr D", "pedi_qualified": False, "cv_qualified": False},
    ]
    crnas = [
        {"id": 10, "name": "CRNA 1", "pedi_qualified": True, "cv_qualified": False},
        {"id": 11, "name": "CRNA 2", "pedi_qualified": True, "cv_qualified": False},
        {"id": 12, "name": "CRNA 3", "pedi_qualified": True, "cv_qualified": False},
        {"id": 13, "name": "CRNA 4", "pedi_qualified": False, "cv_qualified": False},
        {"id": 14, "name": "CRNA 5", "pedi_qualified": False, "cv_qualified": False},
    ]
    return mds, crnas


def test_schedule_rules():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 1, 1))

    rio_hospital = [s for s in schedules if s["facility"] == "Rio Hospital"]
    assert all(len(s["md_ids"]) == 2 for s in rio_hospital)
    assert all(
        any(md_id == 1 for md_id in s["md_ids"]) for s in rio_hospital
    ), "Rio Hospital must include a CV-qualified MD"

    rio_surgical = [s for s in schedules if s["facility"] == "Rio Surgical Center"]
    assert all(len(s["md_ids"]) == 1 for s in rio_surgical)
    assert all(len(s["crna_ids"]) == 4 for s in rio_surgical)
    assert all(
        len([c for c in s["crna_ids"] if c in {10, 11, 12}]) >= 3
        for s in rio_surgical
    )

    utrgv = [s for s in schedules if s["facility"] == "UTRGV Surgical Center"]
    assert all(len(s["md_ids"]) == 1 for s in utrgv)
    assert all(len(s["crna_ids"]) == 3 for s in utrgv)
    assert all(set(s["crna_ids"]).issubset({10, 11, 12}) for s in utrgv)

    driscoll = [s for s in schedules if s["facility"] == "Driscoll Hospital (McAllen)"]
    assert all(len(s["md_ids"]) == 1 for s in driscoll)
    assert all(len(s["crna_ids"]) == 2 for s in driscoll)


def test_call_logic_thursday_weekend_alignment():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 1, 1))

    def by_date(target_date):
        return next(s for s in schedules if s["date"] == target_date)

    thursday = by_date(date(2026, 1, 1))
    friday = by_date(date(2026, 1, 2))
    saturday = by_date(date(2026, 1, 3))
    sunday = by_date(date(2026, 1, 4))

    assert thursday["call_assignments"]["first_call_md_id"] == friday["call_assignments"]["first_call_md_id"]
    assert thursday["call_assignments"]["first_call_md_id"] == sunday["call_assignments"]["first_call_md_id"]
    assert thursday["call_assignments"]["second_call_md_id"] == saturday["call_assignments"]["first_call_md_id"]
