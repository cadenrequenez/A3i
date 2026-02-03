from datetime import date
from app.tests.utils import create_user, get_auth_headers


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
