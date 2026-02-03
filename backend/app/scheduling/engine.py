from __future__ import annotations
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import cycle
from typing import Any, Dict, Iterable, List


@dataclass(frozen=True)
class StaffMember:
    id: int
    name: str
    pedi_qualified: bool
    cv_qualified: bool


FACILITY_RULES = {
    "Rio Hospital": {"md": 2, "crna": 0, "cv_required": True},
    "Rio Surgical Center": {"md": 1, "crna": 4},
    "Driscoll Hospital (McAllen)": {"md": 1, "crna": 2},
    "UTRGV Surgical Center": {"md": 1, "crna": 3},
}

ASC_FACILITIES = {"Rio Surgical Center", "UTRGV Surgical Center"}


def _last_day_of_month(start_date: date) -> date:
    next_month = start_date.replace(day=28) + timedelta(days=4)
    return next_month - timedelta(days=next_month.day)


def _take_from_cycle(source: Iterable[StaffMember], count: int) -> List[StaffMember]:
    chosen = []
    for _ in range(count):
        chosen.append(next(source))
    return chosen


def _assign_calls(
    rotation: Iterable[StaffMember],
    weekend_pairs: Dict[date, Dict[str, int]],
    current_date: date,
) -> Dict[str, Any]:
    week_start = current_date - timedelta(days=current_date.weekday())

    def get_week_pair(week: date) -> Dict[str, int]:
        if week not in weekend_pairs:
            fri_sun_first = next(rotation).id
            sat_first = next(rotation).id
            weekend_pairs[week] = {
                "fri_sun_first": fri_sun_first,
                "sat_first": sat_first,
            }
        return weekend_pairs[week]

    if current_date.weekday() in {3, 4, 5, 6}:  # Thu/Fri/Sat/Sun
        pair = get_week_pair(week_start)
        if current_date.weekday() == 3:  # Thursday
            return {
                "first_call_md_id": pair["fri_sun_first"],
                "second_call_md_id": pair["sat_first"],
            }
        if current_date.weekday() == 5:  # Saturday
            return {
                "first_call_md_id": pair["sat_first"],
                "second_call_md_id": pair["fri_sun_first"],
            }
        return {
            "first_call_md_id": pair["fri_sun_first"],
            "second_call_md_id": pair["sat_first"],
        }

    first_call = next(rotation).id
    second_call = next(rotation).id
    return {"first_call_md_id": first_call, "second_call_md_id": second_call}


def generate_monthly_schedule(
    mds: List[Dict[str, Any]],
    crnas: List[Dict[str, Any]],
    start_date: date,
) -> List[Dict[str, Any]]:
    md_staff = [StaffMember(**md) for md in mds]
    crna_staff = [StaffMember(**crna) for crna in crnas]
    if not md_staff:
        raise ValueError("At least one MD is required")

    cv_mds = [md for md in md_staff if md.cv_qualified]
    if not cv_mds:
        raise ValueError("At least one CV-qualified MD is required")

    pedi_crnas = [crna for crna in crna_staff if crna.pedi_qualified]
    if len(pedi_crnas) < 3:
        raise ValueError("At least three pedi-qualified CRNAs are required")

    md_cycle = cycle(md_staff)
    cv_md_cycle = cycle(cv_mds)
    crna_cycle = cycle(crna_staff)
    pedi_cycle = cycle(pedi_crnas)
    call_rotation = cycle(md_staff)
    weekend_pairs: Dict[date, Dict[str, int]] = {}

    end_date = _last_day_of_month(start_date)
    schedules: List[Dict[str, Any]] = []

    current = start_date
    while current <= end_date:
        call_assignments = _assign_calls(call_rotation, weekend_pairs, current)
        for facility, rules in FACILITY_RULES.items():
            assigned_mds: List[StaffMember] = []
            assigned_crnas: List[StaffMember] = []

            if facility == "Rio Hospital":
                assigned_mds.append(next(cv_md_cycle))
                assigned_mds.extend(_take_from_cycle(md_cycle, rules["md"] - 1))
            else:
                assigned_mds.extend(_take_from_cycle(md_cycle, rules["md"]))

            if rules["crna"]:
                if facility in ASC_FACILITIES:
                    assigned_crnas.extend(_take_from_cycle(pedi_cycle, min(3, rules["crna"])))
                    remaining = rules["crna"] - len(assigned_crnas)
                    if remaining > 0:
                        assigned_crnas.extend(_take_from_cycle(crna_cycle, remaining))
                else:
                    assigned_crnas.extend(_take_from_cycle(crna_cycle, rules["crna"]))

            schedules.append(
                {
                    "date": current,
                    "facility": facility,
                    "md_ids": [md.id for md in assigned_mds],
                    "crna_ids": [crna.id for crna in assigned_crnas],
                    "call_assignments": call_assignments,
                }
            )

        current += timedelta(days=1)

    return schedules
