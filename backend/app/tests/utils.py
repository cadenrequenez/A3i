from app import models
from app.core.security import hash_password


def create_user(db, username: str, password: str, role: str):
    user = models.User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_auth_headers(client, username: str, password: str) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
