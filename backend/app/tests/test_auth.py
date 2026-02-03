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
