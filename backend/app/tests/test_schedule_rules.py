from datetime import date

from app.scheduling.rules import ScheduleRuleset, score_schedule, validate_schedule


def test_validate_schedule_flags_weekend_continuity_violation():
    assignments = [
        {"date": date(2026, 2, 6), "first_call_md_id": 1, "second_call_md_id": 2},  # Fri
        {"date": date(2026, 2, 7), "first_call_md_id": 1, "second_call_md_id": 3},  # Sat mismatch
        {"date": date(2026, 2, 8), "first_call_md_id": 2, "second_call_md_id": 1},  # Sun
    ]
    violations = validate_schedule(
        assignments,
        ruleset=ScheduleRuleset(),
        cv_qualified_md_ids={1},
        md_name_lookup={1: "Ed", 2: "Dan", 3: "Alex"},
    )
    assert any(item.code == "WEEKEND_CONTINUITY" for item in violations)


def test_score_schedule_counts_first_second_and_weekends():
    assignments = [
        {"date": date(2026, 2, 6), "first_call_md_id": 1, "second_call_md_id": 2},  # Fri
        {"date": date(2026, 2, 7), "first_call_md_id": 2, "second_call_md_id": 1},  # Sat
        {"date": date(2026, 2, 8), "first_call_md_id": 1, "second_call_md_id": 2},  # Sun
        {"date": date(2026, 2, 9), "first_call_md_id": 1, "second_call_md_id": 3},  # Mon
    ]
    score = score_schedule(
        assignments,
        ruleset=ScheduleRuleset(score_weight_first_call=1.0, score_weight_second_call=1.0, score_weight_weekend=2.0),
        md_name_lookup={1: "Ed", 2: "Dan", 3: "Sam"},
    )
    md_rows = {row["md_id"]: row for row in score["per_md"]}

    assert md_rows[1]["first_call_count"] == 3
    assert md_rows[1]["second_call_count"] == 1
    assert md_rows[1]["weekend_count"] == 1

    assert md_rows[2]["first_call_count"] == 1
    assert md_rows[2]["second_call_count"] == 2
    assert md_rows[2]["weekend_count"] == 1

    assert md_rows[3]["first_call_count"] == 0
    assert md_rows[3]["second_call_count"] == 1
    assert md_rows[3]["weekend_count"] == 0


def test_validate_flags_back_to_back_weekends_and_ed_dan_cap():
    assignments = [
        {"date": date(2026, 2, 6), "first_call_md_id": 2, "second_call_md_id": 3},
        {"date": date(2026, 2, 7), "first_call_md_id": 3, "second_call_md_id": 2},
        {"date": date(2026, 2, 8), "first_call_md_id": 2, "second_call_md_id": 3},
        {"date": date(2026, 2, 13), "first_call_md_id": 2, "second_call_md_id": 4},
        {"date": date(2026, 2, 14), "first_call_md_id": 4, "second_call_md_id": 2},
        {"date": date(2026, 2, 15), "first_call_md_id": 2, "second_call_md_id": 4},
    ]
    violations = validate_schedule(
        assignments,
        ruleset=ScheduleRuleset(),
        cv_qualified_md_ids={2, 3, 4},
        md_name_lookup={2: "Edward Requenez", 3: "Daniel Requenez", 4: "Alex"},
    )
    codes = {item.code for item in violations}
    assert "BACK_TO_BACK_WEEKEND" in codes
    assert "WEEKEND_CAP_ED_DAN" in codes
