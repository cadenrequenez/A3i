from datetime import date, timedelta
from app.scheduling.engine import WeeklyLimits, generate_monthly_schedule


def build_staff():
    mds = [
        {"id": 1, "name": "Edward Requenez", "pedi_qualified": True, "cv_qualified": True, "active": True},
        {"id": 2, "name": "Daniel Requenez", "pedi_qualified": True, "cv_qualified": True, "active": True},
        {"id": 3, "name": "Ricky Salinas", "pedi_qualified": True, "cv_qualified": False, "active": True},
        {"id": 4, "name": "Erika Schwegler", "pedi_qualified": True, "cv_qualified": True, "active": True},
        {"id": 5, "name": "Mike Gorena", "pedi_qualified": True, "cv_qualified": True, "active": True},
        {"id": 6, "name": "Jaime Garcia", "pedi_qualified": False, "cv_qualified": True, "active": True},
        {"id": 7, "name": "Clarissa Gutierrez", "pedi_qualified": False, "cv_qualified": True, "active": True},
        {"id": 8, "name": "Maria Lozano", "pedi_qualified": True, "cv_qualified": False, "active": True},
        {"id": 9, "name": "Tim Castro", "pedi_qualified": False, "cv_qualified": False, "active": False},
        {"id": 10, "name": "MD Extra", "pedi_qualified": False, "cv_qualified": False, "active": True},
    ]
    return mds, []


def test_schedule_rules():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 3, 1), limits=WeeklyLimits(max_on_call=7, max_surgical=7))

    assert all(s["facility"] == "Rio Grande Regional Hospital" for s in schedules)
    assert all(len(s["md_ids"]) == 2 for s in schedules)
    assert all(
        any(md_id in {1, 2, 4, 5, 6, 7} for md_id in s["md_ids"]) for s in schedules
    ), "Each day must include a CV-qualified MD"
    assert all(s["crna_ids"] == [] for s in schedules)


def test_unique_assignments_per_day():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 3, 1), limits=WeeklyLimits(max_on_call=7, max_surgical=7))

    day = date(2026, 3, 1)
    end_day = date(2026, 3, 7)
    current = day
    while current <= end_day:
        day_entries = [s for s in schedules if s["date"] == current]
        assert len(day_entries) == 1
        md_ids = [md for entry in day_entries for md in entry["md_ids"]]
        assert len(md_ids) == len(set(md_ids))
        current += timedelta(days=1)


def test_call_constraints():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 3, 1), limits=WeeklyLimits(max_on_call=7, max_surgical=7))

    call_by_date = {entry["date"]: entry["call_assignments"] for entry in schedules}

    md_cv = {1, 2, 4, 5, 6, 7}
    md_first_calls = {}
    md_call_dates = {}

    for day, calls in sorted(call_by_date.items()):
        first_id = calls["first_call_md_id"]
        second_id = calls["second_call_md_id"]
        assert first_id in md_cv or second_id in md_cv

        md_call_dates.setdefault(first_id, []).append(day)
        md_call_dates.setdefault(second_id, []).append(day)
        md_first_calls.setdefault(first_id, []).append(day)

    for md_id, dates in md_call_dates.items():
        dates = sorted(dates)
        for prev, current in zip(dates, dates[1:]):
            assert (current - prev).days > 1

    for md_id, dates in md_first_calls.items():
        dates = sorted(dates)
        for prev, current in zip(dates, dates[1:]):
            assert (current - prev).days != 2

    # Edward and Daniel max one weekend per month
    weekend_starts = [d for d in call_by_date if d.weekday() == 4]
    weekend_assignments = {1: 0, 2: 0}
    for friday in weekend_starts:
        calls = call_by_date[friday]
        weekend_ids = {calls["first_call_md_id"], calls["second_call_md_id"]}
        for md_id in weekend_assignments:
            if md_id in weekend_ids:
                weekend_assignments[md_id] += 1
    assert weekend_assignments[1] <= 1
    assert weekend_assignments[2] <= 1


def test_weekend_pair_stays_same_for_fri_sat_sun():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 3, 1), limits=WeeklyLimits(max_on_call=7, max_surgical=7))
    by_date = {entry["date"]: entry["call_assignments"] for entry in schedules}

    for day, calls in sorted(by_date.items()):
        if day.weekday() != 4:
            continue
        saturday = day + timedelta(days=1)
        sunday = day + timedelta(days=2)
        if saturday not in by_date or sunday not in by_date:
            continue
        friday_pair = {calls["first_call_md_id"], calls["second_call_md_id"]}
        saturday_pair = {by_date[saturday]["first_call_md_id"], by_date[saturday]["second_call_md_id"]}
        sunday_pair = {by_date[sunday]["first_call_md_id"], by_date[sunday]["second_call_md_id"]}
        assert friday_pair == saturday_pair == sunday_pair


def test_inactive_md_is_not_assigned_to_call():
    mds, crnas = build_staff()
    schedules = generate_monthly_schedule(mds, crnas, date(2026, 3, 1), limits=WeeklyLimits(max_on_call=7, max_surgical=7))
    assigned_ids = {md_id for entry in schedules for md_id in entry["md_ids"]}
    assert 9 not in assigned_ids
