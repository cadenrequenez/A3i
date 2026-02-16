from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, pstdev
from typing import Any, Iterable


@dataclass(frozen=True)
class ScheduleRuleset:
    require_weekend_continuity: bool = True
    require_cv_coverage: bool = True
    score_weight_first_call: float = 1.25
    score_weight_second_call: float = 1.0
    score_weight_weekend: float = 2.0
    score_penalty_back_to_back_first: float = 4.0
    score_penalty_back_to_back_weekend: float = 4.0


@dataclass(frozen=True)
class NormalizedDayAssignment:
    date: date
    first_call_md_id: int | None
    second_call_md_id: int | None


@dataclass(frozen=True)
class ScheduleViolation:
    code: str
    message: str
    date: date | None
    people: list[str]
    severity: str


def _coerce_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise ValueError(f"Unsupported date value: {value!r}")


def _extract_call_ids(item: dict[str, Any]) -> tuple[int | None, int | None]:
    if "call_assignments" in item and isinstance(item["call_assignments"], dict):
        call_data = item["call_assignments"]
        first = call_data.get("first_call_md_id", call_data.get("first_call"))
        second = call_data.get("second_call_md_id", call_data.get("second_call"))
        return first, second

    first = item.get("first_call_md_id", item.get("set_first_call_md_id"))
    second = item.get("second_call_md_id", item.get("set_second_call_md_id"))
    return first, second


def normalize_assignments(assignments: Iterable[NormalizedDayAssignment | dict[str, Any]]) -> list[NormalizedDayAssignment]:
    normalized: list[NormalizedDayAssignment] = []
    for item in assignments:
        if isinstance(item, NormalizedDayAssignment):
            normalized.append(item)
            continue

        current_date = _coerce_date(item["date"])
        first, second = _extract_call_ids(item)
        normalized.append(
            NormalizedDayAssignment(
                date=current_date,
                first_call_md_id=first,
                second_call_md_id=second,
            )
        )
    normalized.sort(key=lambda entry: entry.date)
    return normalized


def apply_suggestion_changes(
    assignments: Iterable[NormalizedDayAssignment | dict[str, Any]],
    changes: Iterable[dict[str, Any]],
) -> list[NormalizedDayAssignment]:
    by_date = {entry.date: entry for entry in normalize_assignments(assignments)}
    for change in changes:
        current_date = _coerce_date(change["date"])
        first = change.get("set_first_call_md_id")
        second = change.get("set_second_call_md_id")
        by_date[current_date] = NormalizedDayAssignment(
            date=current_date,
            first_call_md_id=first,
            second_call_md_id=second,
        )
    return sorted(by_date.values(), key=lambda entry: entry.date)


def validate_schedule(
    assignments: Iterable[NormalizedDayAssignment | dict[str, Any]],
    ruleset: ScheduleRuleset = ScheduleRuleset(),
    cv_qualified_md_ids: set[int] | None = None,
    expected_start_date: date | None = None,
    expected_end_date: date | None = None,
    md_name_lookup: dict[int, str] | None = None,
) -> list[ScheduleViolation]:
    normalized = normalize_assignments(assignments)
    violations: list[ScheduleViolation] = []
    by_date = {entry.date: entry for entry in normalized}
    cv_qualified_md_ids = cv_qualified_md_ids or set()
    md_name_lookup = md_name_lookup or {}

    if expected_start_date and expected_end_date:
        current = expected_start_date
        while current <= expected_end_date:
            if current not in by_date:
                violations.append(
                    ScheduleViolation(
                        code="MISSING_DAY",
                        message="Missing schedule assignment for date",
                        date=current,
                        people=[],
                        severity="error",
                    )
                )
            current += timedelta(days=1)

    for entry in normalized:
        first = entry.first_call_md_id
        second = entry.second_call_md_id
        if first is None or second is None:
            violations.append(
                ScheduleViolation(
                    code="MISSING_CALL_SLOT",
                    message="Each day must have both first and second call assignments",
                    date=entry.date,
                    people=[],
                    severity="error",
                )
            )
            continue

        if first == second:
            name = md_name_lookup.get(first, str(first))
            violations.append(
                ScheduleViolation(
                    code="DUPLICATE_CALL_ASSIGNMENT",
                    message="First and second call cannot be assigned to the same MD",
                    date=entry.date,
                    people=[name],
                    severity="error",
                )
            )

        if ruleset.require_cv_coverage and cv_qualified_md_ids and first not in cv_qualified_md_ids and second not in cv_qualified_md_ids:
            people = [md_name_lookup.get(first, str(first)), md_name_lookup.get(second, str(second))]
            violations.append(
                ScheduleViolation(
                    code="MISSING_CV_COVERAGE",
                    message="At least one on-call MD must be CV-qualified",
                    date=entry.date,
                    people=people,
                    severity="error",
                )
            )

    if ruleset.require_weekend_continuity:
        for entry in normalized:
            if entry.date.weekday() != 4:
                continue
            friday = by_date.get(entry.date)
            saturday = by_date.get(entry.date + timedelta(days=1))
            sunday = by_date.get(entry.date + timedelta(days=2))
            if not friday or not saturday or not sunday:
                continue
            if None in (friday.first_call_md_id, friday.second_call_md_id, saturday.first_call_md_id, saturday.second_call_md_id, sunday.first_call_md_id, sunday.second_call_md_id):
                continue

            fri_pair = {friday.first_call_md_id, friday.second_call_md_id}
            sat_pair = {saturday.first_call_md_id, saturday.second_call_md_id}
            sun_pair = {sunday.first_call_md_id, sunday.second_call_md_id}
            if fri_pair != sat_pair or fri_pair != sun_pair:
                weekend_people = sorted(fri_pair | sat_pair | sun_pair)
                violations.append(
                    ScheduleViolation(
                        code="WEEKEND_CONTINUITY",
                        message="Friday, Saturday, and Sunday must use the same two MDs",
                        date=entry.date,
                        people=[md_name_lookup.get(person, str(person)) for person in weekend_people],
                        severity="error",
                    )
                )

    return violations


def score_schedule(
    assignments: Iterable[NormalizedDayAssignment | dict[str, Any]],
    ruleset: ScheduleRuleset = ScheduleRuleset(),
    md_name_lookup: dict[int, str] | None = None,
) -> dict[str, Any]:
    normalized = normalize_assignments(assignments)
    md_name_lookup = md_name_lookup or {}

    stats: dict[int, dict[str, Any]] = {}

    def _ensure(md_id: int) -> None:
        if md_id not in stats:
            stats[md_id] = {
                "md_id": md_id,
                "name": md_name_lookup.get(md_id, f"MD {md_id}"),
                "first_call_count": 0,
                "second_call_count": 0,
                "weekend_count": 0,
                "back_to_back_first_count": 0,
                "back_to_back_weekend_count": 0,
                "total_call": 0,
                "score": 0.0,
            }

    for md_id in md_name_lookup:
        _ensure(md_id)

    by_date = {entry.date: entry for entry in normalized}
    for entry in normalized:
        if entry.first_call_md_id is not None:
            _ensure(entry.first_call_md_id)
            stats[entry.first_call_md_id]["first_call_count"] += 1
        if entry.second_call_md_id is not None:
            _ensure(entry.second_call_md_id)
            stats[entry.second_call_md_id]["second_call_count"] += 1

    for entry in normalized:
        if entry.date.weekday() != 4:
            continue
        saturday = by_date.get(entry.date + timedelta(days=1))
        sunday = by_date.get(entry.date + timedelta(days=2))
        if not saturday or not sunday:
            continue
        weekend_ids = {
            entry.first_call_md_id,
            entry.second_call_md_id,
            saturday.first_call_md_id,
            saturday.second_call_md_id,
            sunday.first_call_md_id,
            sunday.second_call_md_id,
        }
        weekend_ids.discard(None)
        for md_id in weekend_ids:
            _ensure(md_id)
            stats[md_id]["weekend_count"] += 1

    # Back-to-back first call days.
    prev_entry = None
    for entry in normalized:
        if prev_entry is None:
            prev_entry = entry
            continue
        if (entry.date - prev_entry.date).days == 1 and entry.first_call_md_id is not None and entry.first_call_md_id == prev_entry.first_call_md_id:
            _ensure(entry.first_call_md_id)
            stats[entry.first_call_md_id]["back_to_back_first_count"] += 1
        prev_entry = entry

    # Back-to-back weekends (Friday to next Friday).
    weekend_pairs: list[tuple[date, set[int]]] = []
    for entry in normalized:
        if entry.date.weekday() != 4:
            continue
        saturday = by_date.get(entry.date + timedelta(days=1))
        sunday = by_date.get(entry.date + timedelta(days=2))
        if not saturday or not sunday:
            continue
        weekend_ids = {
            entry.first_call_md_id,
            entry.second_call_md_id,
            saturday.first_call_md_id,
            saturday.second_call_md_id,
            sunday.first_call_md_id,
            sunday.second_call_md_id,
        }
        weekend_ids.discard(None)
        weekend_pairs.append((entry.date, weekend_ids))

    weekend_pairs.sort(key=lambda item: item[0])
    for idx in range(1, len(weekend_pairs)):
        prev_ids = weekend_pairs[idx - 1][1]
        curr_ids = weekend_pairs[idx][1]
        for md_id in prev_ids & curr_ids:
            _ensure(md_id)
            stats[md_id]["back_to_back_weekend_count"] += 1

    per_md: list[dict[str, Any]] = []
    for md_id, row in stats.items():
        row["total_call"] = row["first_call_count"] + row["second_call_count"]
        row["score"] = round(
            row["first_call_count"] * ruleset.score_weight_first_call
            + row["second_call_count"] * ruleset.score_weight_second_call
            + row["weekend_count"] * ruleset.score_weight_weekend,
            4,
        )
        row["score"] = round(
            row["score"]
            + row["back_to_back_first_count"] * ruleset.score_penalty_back_to_back_first
            + row["back_to_back_weekend_count"] * ruleset.score_penalty_back_to_back_weekend,
            4,
        )
        per_md.append({"md_id": md_id, **row})

    per_md.sort(key=lambda item: item["md_id"])
    score_values = [item["score"] for item in per_md]
    summary = {
        "mean_score": round(mean(score_values), 4) if score_values else 0.0,
        "stdev_score": round(pstdev(score_values), 4) if len(score_values) > 1 else 0.0,
        "min": round(min(score_values), 4) if score_values else 0.0,
        "max": round(max(score_values), 4) if score_values else 0.0,
    }
    return {"per_md": per_md, "summary": summary}
