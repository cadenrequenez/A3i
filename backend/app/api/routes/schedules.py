from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import crud, models, schemas
from app.core.ai import request_schedule_suggestions
from app.core.audit import log_ai_suggestion_event
from app.core.config import settings
from app.core.deps import get_current_admin, get_db, get_current_user
from app.scheduling.engine import WeeklyLimits, generate_monthly_schedule
from app.scheduling.rules import (
    ScheduleRuleset,
    apply_suggestion_changes,
    score_schedule,
    validate_schedule,
)

router = APIRouter(prefix="/schedules", tags=["schedules"])
EXCLUDED_SUGGESTION_MD_NAMES = {"tim castro"}
WEEKEND_CAP_MD_NAMES = {"edward requenez", "ed requenez", "daniel requenez", "dan requenez"}


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    start_date = date(year, month, 1)
    end_date = (start_date.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return start_date, end_date


def _resolve_range(
    year: int | None,
    month: int | None,
    start_date: date | None,
    end_date: date | None,
) -> tuple[date, date]:
    if year and month:
        return _month_bounds(year, month)
    if start_date and end_date:
        return start_date, end_date
    raise HTTPException(status_code=400, detail="Provide year/month or start_date/end_date")


def _serialize_violations(violations) -> list[schemas.ScheduleViolationOut]:
    return [
        schemas.ScheduleViolationOut(
            code=item.code,
            message=item.message,
            date=item.date,
            people=item.people,
            severity=item.severity,
        )
        for item in violations
    ]


def _build_ruleset() -> ScheduleRuleset:
    return ScheduleRuleset(
        score_weight_first_call=settings.score_weight_first_call,
        score_weight_second_call=settings.score_weight_second_call,
        score_weight_weekend=settings.score_weight_weekend,
        score_penalty_back_to_back_first=settings.score_penalty_back_to_back_first,
        score_penalty_back_to_back_weekend=settings.score_penalty_back_to_back_weekend,
    )


def _fairness_badness(summary: schemas.ScheduleScoreSummary) -> float:
    # Lower is better: tighter spread means fairer distribution.
    score_range = summary.max - summary.min
    return round(summary.stdev_score + (score_range * 0.25), 6)


def _load_assignments(
    db: Session,
    *,
    facility_id: int | None,
    range_start: date,
    range_end: date,
    payload_schedule: list[schemas.ScheduleAssignment] | None = None,
) -> list[dict]:
    if payload_schedule:
        return [
            {
                "date": item.date,
                "first_call_md_id": item.first_call_md_id,
                "second_call_md_id": item.second_call_md_id,
            }
            for item in payload_schedule
        ]

    query = db.query(models.Schedule).filter(
        models.Schedule.date >= range_start,
        models.Schedule.date <= range_end,
    )
    if facility_id is not None:
        query = query.filter(models.Schedule.facility_id == facility_id)

    assignments: list[dict] = []
    for row in query.order_by(models.Schedule.date.asc()).all():
        call_data = row.call_assignments or {}
        assignments.append(
            {
                "date": row.date,
                "first_call_md_id": call_data.get("first_call_md_id", call_data.get("first_call")),
                "second_call_md_id": call_data.get("second_call_md_id", call_data.get("second_call")),
            }
        )
    return assignments


def _md_lookups(db: Session) -> tuple[dict[int, str], set[int]]:
    md_rows = db.query(models.MD).filter(models.MD.active.is_(True)).all()
    md_name_lookup = {row.id: row.name for row in md_rows}
    cv_qualified_ids = {row.id for row in md_rows if row.cv_qualified}
    md_name_lookup = {
        md_id: name
        for md_id, name in md_name_lookup.items()
        if name.strip().lower() not in EXCLUDED_SUGGESTION_MD_NAMES
    }
    cv_qualified_ids = {md_id for md_id in cv_qualified_ids if md_id in md_name_lookup}
    return md_name_lookup, cv_qualified_ids


def _normalized_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def _is_weekend_cap_md(name: str) -> bool:
    return _normalized_name(name) in WEEKEND_CAP_MD_NAMES


def _weekend_counts(assignments: list[dict]) -> dict[int, int]:
    by_date = {item["date"]: item for item in assignments}
    counts: dict[int, int] = {}
    for item in assignments:
        current_date = item["date"]
        if current_date.weekday() != 4:
            continue
        sat = by_date.get(current_date + timedelta(days=1))
        sun = by_date.get(current_date + timedelta(days=2))
        if not sat or not sun:
            continue
        weekend_ids = {
            item.get("first_call_md_id"),
            item.get("second_call_md_id"),
            sat.get("first_call_md_id"),
            sat.get("second_call_md_id"),
            sun.get("first_call_md_id"),
            sun.get("second_call_md_id"),
        }
        weekend_ids.discard(None)
        for md_id in weekend_ids:
            counts[md_id] = counts.get(md_id, 0) + 1
    return counts


def _back_to_back_first_call_counts(assignments: list[dict]) -> dict[int, int]:
    rows = sorted(assignments, key=lambda item: item["date"])
    counts: dict[int, int] = {}
    prev_first = None
    prev_date = None
    for row in rows:
        current_date = row["date"]
        current_first = row.get("first_call_md_id")
        if (
            current_first is not None
            and prev_first == current_first
            and prev_date is not None
            and (current_date - prev_date).days == 1
        ):
            counts[current_first] = counts.get(current_first, 0) + 1
        prev_first = current_first
        prev_date = current_date
    return counts


def _passes_candidate_hard_constraints(
    *,
    candidate_assignments: list[dict],
    baseline_back_to_back: dict[int, int],
    md_name_lookup: dict[int, str],
) -> bool:
    weekend_counts = _weekend_counts(candidate_assignments)
    for md_id, count in weekend_counts.items():
        if _is_weekend_cap_md(md_name_lookup.get(md_id, "")) and count > 1:
            return False

    candidate_back_to_back = _back_to_back_first_call_counts(candidate_assignments)
    for md_id, value in candidate_back_to_back.items():
        if value > baseline_back_to_back.get(md_id, 0):
            return False
    return True


def _select_final_suggestions(
    suggestions: list[schemas.AISuggestedFixOut],
    max_suggestions: int,
) -> list[schemas.AISuggestedFixOut]:
    if not suggestions:
        return []

    def sort_key(item: schemas.AISuggestedFixOut):
        is_weekend = any(change.date.weekday() in (4, 5, 6) for change in item.changes)
        return (0 if is_weekend else 1, -item.actual_fairness_delta)

    ordered = sorted(suggestions, key=sort_key)
    selected: list[schemas.AISuggestedFixOut] = []
    used_dates: set[date] = set()
    md_target_counts: dict[int, int] = {}
    seen_change_keys: set[tuple] = set()

    def can_take(item: schemas.AISuggestedFixOut, enforce_md_diversity: bool) -> bool:
        change_key = tuple(
            (change.date.isoformat(), change.set_first_call_md_id, change.set_second_call_md_id)
            for change in item.changes
        )
        if change_key in seen_change_keys:
            return False
        if any(change.date in used_dates for change in item.changes):
            return False
        if enforce_md_diversity:
            touched = set()
            for change in item.changes:
                touched.add(change.set_first_call_md_id)
                touched.add(change.set_second_call_md_id)
            if any(md_target_counts.get(md_id, 0) >= 1 for md_id in touched):
                return False
        return True

    # Pass 1: prefer diverse MD targets.
    for item in ordered:
        if len(selected) >= max_suggestions:
            break
        if not can_take(item, enforce_md_diversity=True):
            continue
        selected.append(item)
        for change in item.changes:
            used_dates.add(change.date)
            md_target_counts[change.set_first_call_md_id] = md_target_counts.get(change.set_first_call_md_id, 0) + 1
            md_target_counts[change.set_second_call_md_id] = md_target_counts.get(change.set_second_call_md_id, 0) + 1
        seen_change_keys.add(
            tuple((change.date.isoformat(), change.set_first_call_md_id, change.set_second_call_md_id) for change in item.changes)
        )

    # Pass 2: fill remaining slots without diversity constraint.
    if len(selected) < max_suggestions:
        for item in ordered:
            if len(selected) >= max_suggestions:
                break
            if not can_take(item, enforce_md_diversity=False):
                continue
            selected.append(item)
            for change in item.changes:
                used_dates.add(change.date)
            seen_change_keys.add(
                tuple((change.date.isoformat(), change.set_first_call_md_id, change.set_second_call_md_id) for change in item.changes)
            )

    return selected


def _is_valid_weekend_block_change_set(changes: list[dict]) -> bool:
    if not changes:
        return False
    grouped: dict[date, list[dict]] = {}
    for change in changes:
        grouped.setdefault(change["date"], []).append(change)
    if any(len(items) != 1 for items in grouped.values()):
        return False

    dates = sorted(grouped.keys())
    if len(dates) != 3:
        return False
    if dates[0].weekday() != 4:
        return False
    if (dates[1] - dates[0]).days != 1 or (dates[2] - dates[1]).days != 1:
        return False
    return True


def _build_fallback_suggestions(
    *,
    base_assignments: list[dict],
    ruleset: ScheduleRuleset,
    cv_qualified_ids: set[int],
    md_name_lookup: dict[int, str],
    range_start: date,
    range_end: date,
    baseline_violation_codes: set[str],
    baseline_badness: float,
    baseline_score_data: dict,
    max_suggestions: int,
) -> list[schemas.AISuggestedFixOut]:
    md_ids = sorted(md_name_lookup.keys())
    base_by_date = {item["date"]: item for item in base_assignments}
    fridays = [item["date"] for item in base_assignments if item["date"].weekday() == 4]
    candidates: list[tuple[float, schemas.AISuggestedFixOut]] = []
    baseline_back_to_back = _back_to_back_first_call_counts(base_assignments)

    def evaluate_changes(title: str, rationale: str, raw_changes: list[dict]) -> None:
        candidate = apply_suggestion_changes(base_assignments, raw_changes)
        if not _passes_candidate_hard_constraints(
            candidate_assignments=candidate,
            baseline_back_to_back=baseline_back_to_back,
            md_name_lookup=md_name_lookup,
        ):
            return

        violations = validate_schedule(
            candidate,
            ruleset=ruleset,
            cv_qualified_md_ids=cv_qualified_ids,
            expected_start_date=range_start,
            expected_end_date=range_end,
            md_name_lookup=md_name_lookup,
        )
        candidate_violation_codes = {item.code for item in violations}
        violations_added = sorted(list(candidate_violation_codes - baseline_violation_codes))
        if violations_added:
            return

        candidate_score_data = score_schedule(candidate, ruleset=ruleset, md_name_lookup=md_name_lookup)
        candidate_summary = schemas.ScheduleScoreSummary.model_validate(candidate_score_data["summary"])
        actual_delta = round(baseline_badness - _fairness_badness(candidate_summary), 4)
        violations_fixed = sorted(list(baseline_violation_codes - candidate_violation_codes))
        if actual_delta <= 0 and not violations_fixed:
            return

        suggestion_changes = [schemas.AISuggestionChange.model_validate(change) for change in raw_changes]
        why, impact_summary = _build_suggestion_impact(
            suggestion_changes=suggestion_changes,
            baseline_score_data=baseline_score_data,
            candidate_score_data=candidate_score_data,
            md_name_lookup=md_name_lookup,
            actual_delta=actual_delta,
        )

        suggestion = schemas.AISuggestedFixOut(
            title=title,
            changes=suggestion_changes,
            rationale=rationale,
            why=why,
            impact_summary=impact_summary,
            expected_fairness_delta=actual_delta,
            actual_fairness_delta=actual_delta,
            violations_fixed=violations_fixed,
            violations_added=violations_added,
            remaining_violations=_serialize_violations(violations),
        )
        candidates.append((actual_delta, suggestion))

    # 1) Weekend-block replacements (Fri/Sat/Sun together) to preserve continuity.
    for friday in fridays:
        saturday = friday + timedelta(days=1)
        sunday = friday + timedelta(days=2)
        fri = base_by_date.get(friday)
        sat = base_by_date.get(saturday)
        sun = base_by_date.get(sunday)
        if not fri or not sat or not sun:
            continue
        weekend_ids = {
            fri.get("first_call_md_id"),
            fri.get("second_call_md_id"),
            sat.get("first_call_md_id"),
            sat.get("second_call_md_id"),
            sun.get("first_call_md_id"),
            sun.get("second_call_md_id"),
        }
        weekend_ids.discard(None)
        if len(weekend_ids) != 2:
            continue
        weekend_pair = sorted(list(weekend_ids))
        a_id, b_id = weekend_pair[0], weekend_pair[1]
        for replacement in md_ids:
            if replacement in weekend_pair:
                continue
            evaluate_changes(
                title=f"Rebalance weekend block starting {friday.isoformat()}",
                rationale="Replace one weekend-pair member across Fri/Sat/Sun to improve fairness without breaking weekend continuity.",
                raw_changes=[
                    {"date": friday, "set_first_call_md_id": replacement, "set_second_call_md_id": b_id},
                    {"date": saturday, "set_first_call_md_id": b_id, "set_second_call_md_id": replacement},
                    {"date": sunday, "set_first_call_md_id": replacement, "set_second_call_md_id": b_id},
                ],
            )
            evaluate_changes(
                title=f"Rebalance weekend block starting {friday.isoformat()}",
                rationale="Replace one weekend-pair member across Fri/Sat/Sun to improve fairness without breaking weekend continuity.",
                raw_changes=[
                    {"date": friday, "set_first_call_md_id": a_id, "set_second_call_md_id": replacement},
                    {"date": saturday, "set_first_call_md_id": replacement, "set_second_call_md_id": a_id},
                    {"date": sunday, "set_first_call_md_id": a_id, "set_second_call_md_id": replacement},
                ],
            )

    ranked = [item[1] for item in sorted(candidates, key=lambda item: item[0], reverse=True)]
    return _select_final_suggestions(ranked, max_suggestions=max_suggestions)


def _build_suggestion_impact(
    *,
    suggestion_changes: list[schemas.AISuggestionChange],
    baseline_score_data: dict,
    candidate_score_data: dict,
    md_name_lookup: dict[int, str],
    actual_delta: float,
) -> tuple[str, str]:
    touched_md_ids: set[int] = set()
    for change in suggestion_changes:
        touched_md_ids.add(change.set_first_call_md_id)
        touched_md_ids.add(change.set_second_call_md_id)

    before_rows = {item["md_id"]: item for item in baseline_score_data.get("per_md", [])}
    after_rows = {item["md_id"]: item for item in candidate_score_data.get("per_md", [])}

    parts: list[str] = []
    for md_id in sorted(touched_md_ids):
        before = before_rows.get(md_id)
        after = after_rows.get(md_id)
        if not before or not after:
            continue
        total_delta = after["total_call"] - before["total_call"]
        first_delta = after["first_call_count"] - before["first_call_count"]
        weekend_delta = after["weekend_count"] - before["weekend_count"]
        parts.append(
            f'{md_name_lookup.get(md_id, str(md_id))}: total {before["total_call"]}->{after["total_call"]} '
            f"({total_delta:+d}), first {before['first_call_count']}->{after['first_call_count']} "
            f"({first_delta:+d}), weekends {before['weekend_count']}->{after['weekend_count']} "
            f"({weekend_delta:+d})"
        )

    why = (
        "This suggestion is shown because it does not add any rule violations and "
        f"improves fairness by {actual_delta:.3f}."
        if actual_delta > 0
        else "This suggestion is shown because it removes rule violations without adding new ones."
    )
    impact_summary = " | ".join(parts) if parts else "No MD impact details available."
    return why, impact_summary


@router.post("/", response_model=schemas.ScheduleOut)
def create_schedule(
    data: schemas.ScheduleCreate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    return crud.create_schedule(db, data)


@router.get("/", response_model=list[schemas.ScheduleOut])
def list_schedules(db: Session = Depends(get_db), _user=Depends(get_current_user)):
    return db.query(models.Schedule).all()


@router.get("/{schedule_id}", response_model=schemas.ScheduleOut)
def get_schedule(
    schedule_id: int, db: Session = Depends(get_db), _user=Depends(get_current_user)
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.put("/{schedule_id}", response_model=schemas.ScheduleOut)
def update_schedule(
    schedule_id: int,
    data: schemas.ScheduleUpdate,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return crud.update_schedule(db, schedule, data)


@router.delete("/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db.delete(schedule)
    db.commit()
    return {"status": "deleted"}


@router.post("/generate", response_model=schemas.ScheduleGenerateResponse)
def generate_schedule(
    data: schemas.ScheduleGenerateRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_admin),
):
    start_date, end_date = _month_bounds(data.year, data.month)

    facilities = db.query(models.Facility).all()
    facility_lookup = {facility.site_name: facility.id for facility in facilities}
    if not facility_lookup:
        raise HTTPException(status_code=400, detail="No facilities configured")

    md_staff = [
        {
            "id": md.id,
            "name": md.name,
            "pedi_qualified": md.pedi_qualified,
            "cv_qualified": md.cv_qualified,
        }
        for md in db.query(models.MD).filter(models.MD.active.is_(True)).all()
    ]
    crna_staff = [
        {
            "id": crna.id,
            "name": crna.name,
            "pedi_qualified": crna.pedi_qualified,
            "cv_qualified": crna.cv_qualified,
        }
        for crna in db.query(models.CRNA).filter(models.CRNA.active.is_(True)).all()
    ]

    limits = WeeklyLimits(
        max_on_call=data.max_on_call or 7,
        max_surgical=data.max_surgical or 7,
    )
    generated = generate_monthly_schedule(md_staff, crna_staff, start_date, limits=limits)

    if data.overwrite:
        db.query(models.Schedule).filter(
            models.Schedule.date >= start_date,
            models.Schedule.date <= end_date,
        ).delete()
        db.commit()
        existing_pairs: set[tuple[date, int]] = set()
    else:
        existing_pairs = {
            (schedule.date, schedule.facility_id)
            for schedule in db.query(models.Schedule).filter(
                models.Schedule.date >= start_date,
                models.Schedule.date <= end_date,
            )
        }

    created = 0
    for entry in generated:
        facility_id = facility_lookup.get(entry["facility"])
        if facility_id is None:
            continue
        if (entry["date"], facility_id) in existing_pairs:
            continue
        db.add(
            models.Schedule(
                date=entry["date"],
                facility_id=facility_id,
                md_ids=entry["md_ids"],
                crna_ids=entry["crna_ids"],
                call_assignments=entry["call_assignments"],
            )
        )
        created += 1
    db.commit()

    return schemas.ScheduleGenerateResponse(
        created=created,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/validate", response_model=schemas.ScheduleValidationResponse)
def validate_schedule_route(
    data: schemas.ScheduleValidationRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    range_start, range_end = _resolve_range(data.year, data.month, data.start_date, data.end_date)
    md_name_lookup, cv_qualified_ids = _md_lookups(db)
    assignments = _load_assignments(
        db,
        facility_id=data.facility_id,
        range_start=range_start,
        range_end=range_end,
        payload_schedule=data.schedule,
    )
    violations = validate_schedule(
        assignments,
        ruleset=_build_ruleset(),
        cv_qualified_md_ids=cv_qualified_ids,
        expected_start_date=range_start,
        expected_end_date=range_end,
        md_name_lookup=md_name_lookup,
    )
    serialized = _serialize_violations(violations)
    return schemas.ScheduleValidationResponse(ok=not serialized, violations=serialized)


@router.post("/score", response_model=schemas.ScheduleScoreResponse)
def score_schedule_route(
    data: schemas.ScheduleScoreRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
):
    range_start, range_end = _resolve_range(data.year, data.month, data.start_date, data.end_date)
    md_name_lookup, _cv_qualified_ids = _md_lookups(db)
    assignments = _load_assignments(
        db,
        facility_id=data.facility_id,
        range_start=range_start,
        range_end=range_end,
        payload_schedule=data.schedule,
    )
    score_data = score_schedule(
        assignments,
        ruleset=_build_ruleset(),
        md_name_lookup=md_name_lookup,
    )
    return schemas.ScheduleScoreResponse.model_validate(score_data)


@router.post("/ai-suggest-fixes", response_model=schemas.AISuggestFixesResponse)
def ai_suggest_fixes_route(
    data: schemas.AISuggestFixesRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_admin),
):
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on backend",
        )

    range_start, range_end = _resolve_range(data.year, data.month, None, None)
    md_name_lookup, cv_qualified_ids = _md_lookups(db)
    base_assignments = _load_assignments(
        db,
        facility_id=data.facility_id,
        range_start=range_start,
        range_end=range_end,
    )

    ruleset = _build_ruleset()
    baseline_violations_raw = validate_schedule(
        base_assignments,
        ruleset=ruleset,
        cv_qualified_md_ids=cv_qualified_ids,
        expected_start_date=range_start,
        expected_end_date=range_end,
        md_name_lookup=md_name_lookup,
    )
    baseline_violations = _serialize_violations(baseline_violations_raw)
    baseline_score_data = score_schedule(base_assignments, ruleset=ruleset, md_name_lookup=md_name_lookup)
    baseline_score = schemas.ScheduleScoreSummary.model_validate(baseline_score_data["summary"])

    ai_input = {
        "facility_id": data.facility_id,
        "year": data.year,
        "month": data.month,
        "focus_weekend_date": data.focus_weekend_date,
        "baseline_violations": [item.model_dump(mode="json") for item in baseline_violations],
        "baseline_score": baseline_score.model_dump(mode="json"),
        "schedule": base_assignments,
        "mds": [{"id": key, "name": value, "cv_qualified": key in cv_qualified_ids} for key, value in md_name_lookup.items()],
    }
    drafts = request_schedule_suggestions(model_input=ai_input, max_suggestions=max(1, min(data.max_suggestions, 3)))

    validated_suggestions: list[schemas.AISuggestedFixOut] = []
    baseline_violation_codes = {item.code for item in baseline_violations_raw}
    baseline_badness = _fairness_badness(baseline_score)
    base_by_date = {item["date"]: item for item in base_assignments}
    baseline_back_to_back = _back_to_back_first_call_counts(base_assignments)

    for draft in drafts:
        proposed_changes = [change.model_dump(mode="json") for change in draft.changes]
        if not _is_valid_weekend_block_change_set(proposed_changes):
            continue
        has_real_change = False
        for change in proposed_changes:
            current = base_by_date.get(change["date"])
            if not current:
                has_real_change = True
                break
            if (
                current.get("first_call_md_id") != change["set_first_call_md_id"]
                or current.get("second_call_md_id") != change["set_second_call_md_id"]
            ):
                has_real_change = True
                break
        if not has_real_change:
            continue

        candidate = apply_suggestion_changes(
            base_assignments,
            proposed_changes,
        )
        if not _passes_candidate_hard_constraints(
            candidate_assignments=candidate,
            baseline_back_to_back=baseline_back_to_back,
            md_name_lookup=md_name_lookup,
        ):
            continue

        candidate_violations_raw = validate_schedule(
            candidate,
            ruleset=ruleset,
            cv_qualified_md_ids=cv_qualified_ids,
            expected_start_date=range_start,
            expected_end_date=range_end,
            md_name_lookup=md_name_lookup,
        )
        candidate_violation_codes = {item.code for item in candidate_violations_raw}
        violations_added = sorted(list(candidate_violation_codes - baseline_violation_codes))
        if violations_added:
            continue

        candidate_score_data = score_schedule(candidate, ruleset=ruleset, md_name_lookup=md_name_lookup)
        candidate_summary = schemas.ScheduleScoreSummary.model_validate(candidate_score_data["summary"])
        candidate_badness = _fairness_badness(candidate_summary)
        actual_delta = round(baseline_badness - candidate_badness, 4)

        violations_fixed = sorted(list(baseline_violation_codes - candidate_violation_codes))
        # Keep only meaningful suggestions: must improve fairness or fix at least one violation.
        if actual_delta <= 0 and not violations_fixed:
            continue

        why, impact_summary = _build_suggestion_impact(
            suggestion_changes=draft.changes,
            baseline_score_data=baseline_score_data,
            candidate_score_data=candidate_score_data,
            md_name_lookup=md_name_lookup,
            actual_delta=actual_delta,
        )

        validated_suggestions.append(
            schemas.AISuggestedFixOut(
                title=draft.title,
                changes=draft.changes,
                rationale=draft.rationale,
                why=why,
                impact_summary=impact_summary,
                expected_fairness_delta=draft.expected_fairness_delta,
                actual_fairness_delta=actual_delta,
                violations_fixed=violations_fixed,
                violations_added=violations_added,
                remaining_violations=_serialize_violations(candidate_violations_raw),
            )
        )

    validated_suggestions = _select_final_suggestions(
        validated_suggestions,
        max_suggestions=max(1, min(data.max_suggestions, 3)),
    )

    used_fallback_generator = False
    if not validated_suggestions:
        used_fallback_generator = True
        validated_suggestions = _build_fallback_suggestions(
            base_assignments=base_assignments,
            ruleset=ruleset,
            cv_qualified_ids=cv_qualified_ids,
            md_name_lookup=md_name_lookup,
            range_start=range_start,
            range_end=range_end,
            baseline_violation_codes=baseline_violation_codes,
            baseline_badness=baseline_badness,
            baseline_score_data=baseline_score_data,
            max_suggestions=max(1, min(data.max_suggestions, 3)),
        )

    log_ai_suggestion_event(
        {
            "user": user.username,
            "facility_id": data.facility_id,
            "year": data.year,
            "month": data.month,
            "focus_weekend_date": data.focus_weekend_date,
            "model": settings.openai_model,
            "requested_max_suggestions": data.max_suggestions,
            "baseline_violation_count": len(baseline_violations),
            "draft_count": len(drafts),
            "draft_titles": [item.title for item in drafts],
            "returned_count": len(validated_suggestions),
            "returned_titles": [item.title for item in validated_suggestions],
            "used_fallback_generator": used_fallback_generator,
        }
    )

    return schemas.AISuggestFixesResponse(
        suggestions=validated_suggestions,
        baseline_violations=baseline_violations,
        baseline_score=baseline_score,
    )
