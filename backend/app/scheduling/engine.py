from __future__ import annotations
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, List, Tuple


@dataclass(frozen=True)
class StaffMember:
    id: int
    name: str
    pedi_qualified: bool
    cv_qualified: bool
    active: bool = True


@dataclass(frozen=True)
class WeeklyLimits:
    max_on_call: int = 5
    max_surgical: int = 2


FACILITY_RULES = {
    "Rio Grande Regional Hospital": {"md": 2, "crna": 0, "cv_required": True},
}

ASC_FACILITIES: set[str] = set()

ED_NAME = "Edward Requenez"
DANIEL_NAME = "Daniel Requenez"


class RotationPool:
    def __init__(self, staff: List[StaffMember]):
        if not staff:
            raise ValueError("Staff pool cannot be empty")
        self.staff = staff
        self.index = 0

    def next_available(self, predicate) -> StaffMember:
        for _ in range(len(self.staff)):
            candidate = self.staff[self.index % len(self.staff)]
            self.index += 1
            if predicate(candidate):
                return candidate
        raise ValueError("No available staff meet assignment constraints")

    def take(self, count: int, predicate) -> List[StaffMember]:
        return [self.next_available(predicate) for _ in range(count)]


def _last_day_of_month(start_date: date) -> date:
    next_month = start_date.replace(day=28) + timedelta(days=4)
    return next_month - timedelta(days=next_month.day)


def _generation_window_end(end_date: date) -> date:
    # Include spillover days so a month-ending Friday/Saturday still follows
    # Fri/Sat/Sun weekend block logic.
    if end_date.weekday() == 4:  # Friday
        return end_date + timedelta(days=2)
    if end_date.weekday() == 5:  # Saturday
        return end_date + timedelta(days=1)
    return end_date


def _week_start(current_date: date) -> date:
    return current_date - timedelta(days=current_date.weekday())


def _daterange(start_date: date, end_date: date) -> List[date]:
    days = []
    current = start_date
    while current <= end_date:
        days.append(current)
        current += timedelta(days=1)
    return days


def _weekend_groups(start_date: date, end_date: date) -> List[Tuple[date, date, date]]:
    groups = []
    for day in _daterange(start_date, end_date):
        if day.weekday() == 4:  # Friday
            saturday = day + timedelta(days=1)
            sunday = day + timedelta(days=2)
            if sunday <= end_date:
                groups.append((day, saturday, sunday))
    return groups


def _is_every_other_first(last_first_date: date | None, current_date: date) -> bool:
    if not last_first_date:
        return False
    return (current_date - last_first_date).days == 2


def _generate_call_schedule(mds: List[StaffMember], start_date: date, end_date: date) -> Dict[date, Dict[str, Any]]:
    if not mds:
        raise ValueError("At least one MD is required")

    md_by_id = {md.id: md for md in mds}
    md_ids = [md.id for md in mds]
    cv_ids = {md.id for md in mds if md.cv_qualified}
    if not cv_ids:
        raise ValueError("At least one CV-qualified MD is required")

    stats = {
        md.id: {
            "total": 0,
            "first": 0,
            "second": 0,
            "last_call": None,
            "last_first": None,
            "last_weekend": None,
            "weekend_count": 0,
        }
        for md in mds
    }

    call_assignments: Dict[date, Dict[str, Any]] = {}

    def can_call(md_id: int, current_date: date, role: str) -> bool:
        last_call = stats[md_id]["last_call"]
        if last_call and (current_date - last_call).days == 1:
            return False
        if role == "first" and _is_every_other_first(stats[md_id]["last_first"], current_date):
            return False
        return True

    def assign(md_id: int, current_date: date, role: str) -> None:
        stats[md_id]["total"] += 1
        stats[md_id][role] += 1
        stats[md_id]["last_call"] = current_date
        if role == "first":
            stats[md_id]["last_first"] = current_date

    def _days_since(last_date: date | None, current_date: date) -> int:
        if not last_date:
            return 365
        return (current_date - last_date).days

    def choose_pair(current_date: date) -> Tuple[int, int]:
        # Balance call burden while preferring staff who have had more rest,
        # with extra weight against repeated first-call burden.
        candidates = sorted(
            md_ids,
            key=lambda mid: (
                stats[mid]["total"],
                stats[mid]["first"],
                -_days_since(stats[mid]["last_call"], current_date),
                -_days_since(stats[mid]["last_first"], current_date),
            ),
        )
        for first_id in candidates:
            if not can_call(first_id, current_date, "first"):
                continue
            for second_id in candidates:
                if second_id == first_id:
                    continue
                if not can_call(second_id, current_date, "second"):
                    continue
                if first_id not in cv_ids and second_id not in cv_ids:
                    continue
                return first_id, second_id
        raise ValueError("No available staff meet call constraints")

    def choose_weekend_pair(weekend_index: int) -> Tuple[int, int]:
        # Prefer MDs with zero weekend assignments first so weekend burden
        # is distributed across the team before repeats.
        candidates = sorted(
            md_ids,
            key=lambda mid: (
                0 if stats[mid]["weekend_count"] == 0 else 1,
                stats[mid]["weekend_count"],
                stats[mid]["total"],
            ),
        )
        for first_id in candidates:
            if stats[first_id]["last_weekend"] == weekend_index - 1:
                continue
            if md_by_id[first_id].name in {ED_NAME, DANIEL_NAME} and stats[first_id]["weekend_count"] >= 1:
                continue
            for second_id in candidates:
                if second_id == first_id:
                    continue
                if stats[second_id]["last_weekend"] == weekend_index - 1:
                    continue
                if md_by_id[second_id].name in {ED_NAME, DANIEL_NAME} and stats[second_id]["weekend_count"] >= 1:
                    continue
                if first_id not in cv_ids and second_id not in cv_ids:
                    continue
                return first_id, second_id
        raise ValueError("No available staff meet weekend call constraints")

    pending_thursday_assignments: Dict[date, Tuple[int, int]] = {}
    weekend_index = -1

    def choose_weekend_pattern(md_a: int, md_b: int, fri: date, sat: date, sun: date) -> Dict[str, int] | None:
        pattern_options = [
            {"fri_first": md_a, "sat_first": md_b, "sun_first": md_a, "thu_first": md_a, "thu_second": md_b},
            {"fri_first": md_b, "sat_first": md_a, "sun_first": md_b, "thu_first": md_b, "thu_second": md_a},
        ]

        for pattern in pattern_options:
            feasible = True
            for day, first_id in ((fri, pattern["fri_first"]), (sat, pattern["sat_first"]), (sun, pattern["sun_first"])):
                second_id = md_b if first_id == md_a else md_a

                if first_id not in cv_ids and second_id not in cv_ids:
                    feasible = False
                    break

            if feasible:
                return pattern
        return None

    for current_date in _daterange(start_date, end_date):
        if current_date in call_assignments:
            continue

        if current_date.weekday() == 4 and current_date + timedelta(days=2) <= end_date:
            weekend_index += 1
            fri, sat, sun = current_date, current_date + timedelta(days=1), current_date + timedelta(days=2)
            md_a, md_b = choose_weekend_pair(weekend_index)
            selected = choose_weekend_pattern(md_a, md_b, fri, sat, sun)
            if not selected:
                raise ValueError("No available staff meet weekend pattern constraints")

            weekend_days = [
                (fri, selected["fri_first"], md_b if selected["fri_first"] == md_a else md_a),
                (sat, selected["sat_first"], md_b if selected["sat_first"] == md_a else md_a),
                (sun, selected["sun_first"], md_b if selected["sun_first"] == md_a else md_a),
            ]
            for day, first_id, second_id in weekend_days:
                call_assignments[day] = {"first_call_md_id": first_id, "second_call_md_id": second_id}
                assign(first_id, day, "first")
                assign(second_id, day, "second")

            stats[md_a]["last_weekend"] = weekend_index
            stats[md_b]["last_weekend"] = weekend_index
            stats[md_a]["weekend_count"] += 1
            stats[md_b]["weekend_count"] += 1

            next_thursday = sun + timedelta(days=4)
            if next_thursday <= end_date:
                pending_thursday_assignments[next_thursday] = (selected["thu_first"], selected["thu_second"])
            continue

        if current_date in pending_thursday_assignments:
            first_id, second_id = pending_thursday_assignments[current_date]
            if (
                first_id != second_id
                and can_call(first_id, current_date, "first")
                and can_call(second_id, current_date, "second")
                and (first_id in cv_ids or second_id in cv_ids)
            ):
                call_assignments[current_date] = {"first_call_md_id": first_id, "second_call_md_id": second_id}
                assign(first_id, current_date, "first")
                assign(second_id, current_date, "second")
                continue

        first_id, second_id = choose_pair(current_date)
        call_assignments[current_date] = {"first_call_md_id": first_id, "second_call_md_id": second_id}
        assign(first_id, current_date, "first")
        assign(second_id, current_date, "second")

    return call_assignments


def generate_monthly_schedule(
    mds: List[Dict[str, Any]],
    crnas: List[Dict[str, Any]],
    start_date: date,
    limits: WeeklyLimits = WeeklyLimits(),
) -> List[Dict[str, Any]]:
    md_staff = [StaffMember(**md) for md in mds if md.get("active", True)]
    if not md_staff:
        raise ValueError("At least one MD is required")

    cv_mds = [md for md in md_staff if md.cv_qualified]
    if not cv_mds:
        raise ValueError("At least one CV-qualified MD is required")

    end_date = _last_day_of_month(start_date)
    generation_end = _generation_window_end(end_date)
    schedules: List[Dict[str, Any]] = []
    call_assignments = _generate_call_schedule(md_staff, start_date, generation_end)

    current = start_date
    while current <= end_date:
        call_entry = call_assignments.get(current, {})
        first_id = call_entry.get("first_call_md_id")
        second_id = call_entry.get("second_call_md_id")
        md_ids = [md_id for md_id in (first_id, second_id) if md_id is not None]
        schedules.append(
            {
                "date": current,
                "facility": "Rio Grande Regional Hospital",
                "md_ids": md_ids,
                "crna_ids": [],
                "call_assignments": call_entry,
            }
        )

        current += timedelta(days=1)

    return schedules
