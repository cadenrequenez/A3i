import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

# Do not inherit DATABASE_URL: it may point to production.
test_url = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg2:///a3i_test")
if make_url(test_url).get_backend_name() != "postgresql":
    raise RuntimeError("TEST_DATABASE_URL must use an isolated PostgreSQL database")
os.environ["DATABASE_URL"] = test_url
os.environ["JWT_SECRET"] = "isolated-test-secret"

from app.db.base import Base
from app.main import app
from app.core.deps import get_db
from app.core import token_blacklist


@pytest.fixture(scope="session")
def engine():
    schema = "a3i_test_" + uuid.uuid4().hex
    control = create_engine(test_url)
    with control.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    test_engine = create_engine(test_url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        Base.metadata.create_all(bind=test_engine)
        yield test_engine
    finally:
        test_engine.dispose()
        with control.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        control.dispose()


@pytest.fixture()
def db_session(engine):
    # API commits release savepoints, never the enclosing test transaction.
    with engine.connect() as connection:
        transaction = connection.begin()
        db = Session(bind=connection, join_transaction_mode="create_savepoint")
        token_blacklist._BLACKLIST.clear()
        try:
            yield db
        finally:
            db.close()
            transaction.rollback()
            token_blacklist._BLACKLIST.clear()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
