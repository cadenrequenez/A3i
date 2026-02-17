from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from statistics import mean, pstdev
from typing import Any, Iterable

ED_DAN_WEEKEND_CAP_NAMES = {
    "edward requenez",
    "ed requenez",
    "daniel requenez",
    "dan requenez",
}


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
    md_availability_lookup: dict[int, dict[str, Any]] | None = None,
) -> list[ScheduleViolation]:
    normalized = normalize_assignments(assignments)
    violations: list[ScheduleViolation] = []
    by_date = {entry.date: entry for entry in normalized}
    cv_qualified_md_ids = cv_qualified_md_ids or set()
    md_name_lookup = md_name_lookup or {}
    md_availability_lookup = md_availability_lookup or {}

    vacation_dates_by_md: dict[int, set[date]] = {}
    vacation_starts_by_md: dict[int, set[date]] = {}
    for md_id, availability in md_availability_lookup.items():
        vacations = availability.get("vacations", []) if isinstance(availability, dict) else []
        day_set: set[date] = set()
        starts: set[date] = set()
        for vacation in vacations:
            if not isinstance(vacation, dict):
                continue
            start_raw = vacation.get("start") or vacation.get("date")
            end_raw = vacation.get("end") or vacation.get("date")
            try:
                if not start_raw:
                    continue
                start_day = date.fromisoformat(str(start_raw))
                end_day = date.fromisoformat(str(end_raw)) if end_raw else start_day
            except ValueError:
                continue
            if end_day < start_day:
                end_day = start_day
            starts.add(start_day)
            current = start_day
            while current <= end_day:
                day_set.add(current)
                current += timedelta(days=1)
        if day_set:
            vacation_dates_by_md[md_id] = day_set
        if starts:
            vacation_starts_by_md[md_id] = starts

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

        # Rule 9: do not schedule MD while on vacation.
        for md_id in (first, second):
            if md_id is None:
                continue
            if entry.date in vacation_dates_by_md.get(md_id, set()):
                violations.append(
                    ScheduleViolation(
                        code="VACATION_CONFLICT",
                        message="MD is assigned while on vacation",
                        date=entry.date,
                        people=[md_name_lookup.get(md_id, str(md_id))],
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

    # Rule 9: vacation pre-call planning (2 days before vacation starts, except Monday starts).
    if normalized:
        by_date_md_pairs = {
            entry.date: {entry.first_call_md_id, entry.second_call_md_id}
            for entry in normalized
        }
        for md_id, starts in vacation_starts_by_md.items():
            for start_day in starts:
                if start_day.weekday() == 0:
                    continue
                target_day = start_day - timedelta(days=2)
                if target_day not in by_date_md_pairs:
                    continue
                if md_id not in by_date_md_pairs[target_day]:
                    violations.append(
                        ScheduleViolation(
                            code="VACATION_PRECALL",
                            message="MD should be on call 2 days before vacation start (except Monday starts)",
                            date=target_day,
                            people=[md_name_lookup.get(md_id, str(md_id))],
                            severity="error",
                        )
                    )

    # Do not put MDs on back-to-back weekday calls (Mon-Thu).
    prev_entry = None
    for entry in normalized:
        if prev_entry is None:
            prev_entry = entry
            continue
        if (entry.date - prev_entry.date).days != 1:
            prev_entry = entry
            continue
        if prev_entry.date.weekday() > 3 or entry.date.weekday() > 3:
            prev_entry = entry
            continue
        prev_ids = {prev_entry.first_call_md_id, prev_entry.second_call_md_id}
        curr_ids = {entry.first_call_md_id, entry.second_call_md_id}
        prev_ids.discard(None)
        curr_ids.discard(None)
        overlap = sorted(list(prev_ids & curr_ids))
        if overlap:
            violations.append(
                ScheduleViolation(
                    code="BACK_TO_BACK_DAILY_CALL",
                    message="MD cannot be on call on consecutive days",
                    date=entry.date,
                    people=[md_name_lookup.get(person, str(person)) for person in overlap],
                    severity="error",
                )
            )
        prev_entry = entry

    # Do not place same MD on first call every other weekday night (D, D+2).
    for index, entry in enumerate(normalized):
        if entry.first_call_md_id is None:
            continue
        if entry.date.weekday() > 3:
            continue
        for j in range(index + 1, min(index + 4, len(normalized))):
            next_entry = normalized[j]
            if (next_entry.date - entry.date).days != 2:
                continue
            if next_entry.date.weekday() > 3:
                continue
            if next_entry.first_call_md_id == entry.first_call_md_id:
                md_name = md_name_lookup.get(entry.first_call_md_id, str(entry.first_call_md_id))
                violations.append(
                    ScheduleViolation(
                        code="EVERY_OTHER_NIGHT_FIRST_CALL",
                        message="Same MD cannot be first call every other night",
                        date=next_entry.date,
                        people=[md_name],
                        severity="error",
                    )
                )

    if ruleset.require_weekend_continuity:
        weekend_members: list[set[int]] = []
        weekend_fridays: list[date] = []
        weekend_pattern: list[tuple[date, int, int]] = []
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
            else:
                # Weekend pattern must be 1-2-1 or 2-1-2.
                if (
                    friday.first_call_md_id != sunday.first_call_md_id
                    or friday.first_call_md_id == saturday.first_call_md_id
                ):
                    weekend_people = sorted(fri_pair)
                    violations.append(
                        ScheduleViolation(
                            code="WEEKEND_PATTERN",
                            message="Weekend first-call pattern must be 1-2-1 or 2-1-2",
                            date=entry.date,
                            people=[md_name_lookup.get(person, str(person)) for person in weekend_people],
                            severity="error",
                        )
                    )
                else:
                    leader = friday.first_call_md_id
                    partner = friday.second_call_md_id if friday.first_call_md_id != friday.second_call_md_id else saturday.first_call_md_id
                    if leader is not None and partner is not None and leader != partner:
                        weekend_pattern.append((entry.date, leader, partner))

            if fri_pair:
                weekend_members.append({person for person in fri_pair if person is not None})
                weekend_fridays.append(entry.date)

        # Do not put MDs on back-to-back weekend calls.
        for idx in range(1, len(weekend_members)):
            overlap = sorted(list(weekend_members[idx - 1] & weekend_members[idx]))
            if overlap:
                violations.append(
                    ScheduleViolation(
                        code="BACK_TO_BACK_WEEKEND",
                        message="MD cannot be assigned on back-to-back weekends",
                        date=weekend_fridays[idx],
                        people=[md_name_lookup.get(person, str(person)) for person in overlap],
                        severity="error",
                    )
                )

        # Thursday mapping: following Thursday must map to the weekend 1-2-1 / 2-1-2 pair ordering.
        for friday_date, leader, partner in weekend_pattern:
            thursday_date = friday_date + timedelta(days=6)
            thursday = by_date.get(thursday_date)
            if not thursday:
                continue
            if thursday.first_call_md_id != leader or thursday.second_call_md_id != partner:
                violations.append(
                    ScheduleViolation(
                        code="THURSDAY_MAPPING",
                        message="Following Thursday must match prior weekend 1-2-1 / 2-1-2 mapping",
                        date=thursday_date,
                        people=[md_name_lookup.get(leader, str(leader)), md_name_lookup.get(partner, str(partner))],
                        severity="error",
                    )
                )

        # Ed and Dan max one weekend per month.
        weekend_count_by_md: dict[int, int] = {}
        for weekend in weekend_members:
            for md_id in weekend:
                weekend_count_by_md[md_id] = weekend_count_by_md.get(md_id, 0) + 1
        for md_id, count in weekend_count_by_md.items():
            md_name = md_name_lookup.get(md_id, "")
            if md_name.strip().lower() in ED_DAN_WEEKEND_CAP_NAMES and count > 1:
                violations.append(
                    ScheduleViolation(
                        code="WEEKEND_CAP_ED_DAN",
                        message="Ed and Dan can only be on one weekend per month",
                        date=None,
                        people=[md_name_lookup.get(md_id, str(md_id))],
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
