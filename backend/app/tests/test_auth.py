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


def test_user_creation_requires_admin(client, db_session):
    from app import models
    from app.tests.utils import get_auth_headers

    payload = {"username": "new-admin", "password": "example-password", "role": "admin"}
    assert client.post("/api/v1/auth/users", json=payload).status_code == 401
    create_user(db_session, "viewer", "secret", "read-only")
    viewer_headers = get_auth_headers(client, "viewer", "secret")
    assert client.post("/api/v1/auth/users", json=payload, headers=viewer_headers).status_code == 403
    assert db_session.query(models.User).filter_by(username="new-admin").first() is None

    create_user(db_session, "owner", "secret", "admin")
    owner_headers = get_auth_headers(client, "owner", "secret")
    response = client.post("/api/v1/auth/users", json=payload, headers=owner_headers)
    assert response.status_code == 200
    assert "password_hash" not in response.json()
    assert client.post("/api/v1/auth/users", json=payload, headers=owner_headers).status_code == 409


def test_bad_password_rejected(client, db_session):
    create_user(db_session, "owner", "secret", "admin")
    response = client.post("/api/v1/auth/login", data={"username": "owner", "password": "wrong"})
    assert response.status_code == 401
    assert "access_token" not in response.json()


def test_expired_session_rejected(client, db_session):
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from app.core.config import settings

    create_user(db_session, "owner", "secret", "admin")
    token = jwt.encode({"sub": "owner", "role": "admin", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    assert client.get("/api/v1/mds/", headers={"Authorization": f"Bearer {token}"}).status_code == 401
