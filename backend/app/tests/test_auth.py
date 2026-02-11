from app.tests.utils import create_user


def test_login_success(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "admin", "password": "secret"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "access_token" in payload


def test_logout_revokes_token(client, db_session):
    create_user(db_session, "admin", "secret", "admin")
    login = client.post(
        "/api/v1/auth/login",
        data={"username": "admin", "password": "secret"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 200

    response = client.get("/api/v1/mds/", headers=headers)
    assert response.status_code == 401
