from app.tests.utils import create_user, get_auth_headers


def test_facilities_crud(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    headers = get_auth_headers(client, "admin", "secret")

    response = client.post(
        "/api/v1/facilities/",
        json={"site_name": "Rio Hospital", "staffing_requirements": {"md": 2}},
        headers=headers,
    )
    assert response.status_code == 200
    facility_id = response.json()["id"]

    response = client.get("/api/v1/facilities/", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get(f"/api/v1/facilities/{facility_id}", headers=headers)
    assert response.status_code == 200

    response = client.put(
        f"/api/v1/facilities/{facility_id}",
        json={"site_name": "Rio Hospital Updated"},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/api/v1/facilities/{facility_id}", headers=headers)
    assert response.status_code == 200
