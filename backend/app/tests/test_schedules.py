from datetime import date
from app.tests.utils import create_user, get_auth_headers
from app import models


def test_schedules_crud(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    headers = get_auth_headers(client, "admin", "secret")

    facility_response = client.post(
        "/api/v1/facilities/",
        json={"site_name": "UTRGV Surgical Center", "staffing_requirements": {"md": 1}},
        headers=headers,
    )
    facility_id = facility_response.json()["id"]

    response = client.post(
        "/api/v1/schedules/",
        json={
            "date": date(2026, 1, 1).isoformat(),
            "facility_id": facility_id,
            "md_ids": [1],
            "crna_ids": [2, 3],
            "call_assignments": {"first_call": 1, "second_call": 2},
        },
        headers=headers,
    )
    assert response.status_code == 200
    schedule_id = response.json()["id"]

    response = client.get("/api/v1/schedules/", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get(f"/api/v1/schedules/{schedule_id}", headers=headers)
    assert response.status_code == 200

    response = client.put(
        f"/api/v1/schedules/{schedule_id}",
        json={"md_ids": [4]},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/api/v1/schedules/{schedule_id}", headers=headers)
    assert response.status_code == 200


def test_schedule_validate_and_score_endpoints(client, db_session):
    create_user(db_session, "admin2", "secret", "admin")
    headers = get_auth_headers(client, "admin2", "secret")

    cv_md = models.MD(name="CV MD", active=True, cv_qualified=True)
    non_cv_md = models.MD(name="General MD", active=True, cv_qualified=False)
    db_session.add_all([cv_md, non_cv_md])
    db_session.commit()
    db_session.refresh(cv_md)
    db_session.refresh(non_cv_md)

    facility = models.Facility(site_name="Rio Grande Regional Hospital", staffing_requirements={})
    db_session.add(facility)
    db_session.commit()
    db_session.refresh(facility)

    for day in (6, 7, 8):
        db_session.add(
            models.Schedule(
                date=date(2026, 2, day),
                facility_id=facility.id,
                md_ids=[cv_md.id, non_cv_md.id],
                crna_ids=[],
                call_assignments={"first_call_md_id": cv_md.id, "second_call_md_id": non_cv_md.id},
            )
        )
    db_session.commit()

    validate_response = client.post(
        "/api/v1/schedules/validate",
        json={"facility_id": facility.id, "year": 2026, "month": 2},
        headers=headers,
    )
    assert validate_response.status_code == 200
    assert validate_response.json()["ok"] is True

    score_response = client.post(
        "/api/v1/schedules/score",
        json={"facility_id": facility.id, "year": 2026, "month": 2},
        headers=headers,
    )
    assert score_response.status_code == 200
    assert "summary" in score_response.json()
