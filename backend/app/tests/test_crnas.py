from app.tests.utils import create_user, get_auth_headers


def test_crnas_crud(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    headers = get_auth_headers(client, "admin", "secret")

    response = client.post(
        "/api/v1/crnas/",
        json={"name": "CRNA Test", "pedi_qualified": True, "cv_qualified": False},
        headers=headers,
    )
    assert response.status_code == 200
    crna_id = response.json()["id"]

    response = client.get("/api/v1/crnas/", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get(f"/api/v1/crnas/{crna_id}", headers=headers)
    assert response.status_code == 200

    response = client.put(
        f"/api/v1/crnas/{crna_id}",
        json={"name": "CRNA Updated"},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/api/v1/crnas/{crna_id}", headers=headers)
    assert response.status_code == 200
