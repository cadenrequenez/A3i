from app.tests.utils import create_user, get_auth_headers


def test_mds_crud(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    headers = get_auth_headers(client, "admin", "secret")

    response = client.post(
        "/api/v1/mds/",
        json={"name": "Dr. Test", "pedi_qualified": True, "cv_qualified": True},
        headers=headers,
    )
    assert response.status_code == 200
    md_id = response.json()["id"]

    response = client.get("/api/v1/mds/", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    response = client.get(f"/api/v1/mds/{md_id}", headers=headers)
    assert response.status_code == 200

    response = client.put(
        f"/api/v1/mds/{md_id}",
        json={"name": "Dr. Updated"},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.delete(f"/api/v1/mds/{md_id}", headers=headers)
    assert response.status_code == 200
