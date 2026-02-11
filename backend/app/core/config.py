import os
from pydantic_settings import BaseSettings


def normalize_db_url(url: str | None) -> str | None:
    if not url:
        return url
    # Some providers (incl. Render) may still provide postgres://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


class Settings(BaseSettings):
    database_url: str = normalize_db_url(os.getenv("DATABASE_URL")) or (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/a3i"
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_exp_minutes: int = int(os.getenv("JWT_EXP_MINUTES", "120"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")


settings = Settings()import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/a3i",
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_exp_minutes: int = int(os.getenv("JWT_EXP_MINUTES", "120"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")


settings = Settings()
