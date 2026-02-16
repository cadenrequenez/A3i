import os
from pydantic_settings import BaseSettings


def normalize_db_url(url: str | None) -> str | None:
    if not url:
        return url
    # Some providers (including Render) may supply postgres://
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Settings(BaseSettings):
    database_url: str = normalize_db_url(os.getenv("DATABASE_URL")) or (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/a3i"
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_exp_minutes: int = int(os.getenv("JWT_EXP_MINUTES", "120"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    score_weight_first_call: float = float(os.getenv("SCORE_WEIGHT_FIRST_CALL", "1.25"))
    score_weight_second_call: float = float(os.getenv("SCORE_WEIGHT_SECOND_CALL", "1.0"))
    score_weight_weekend: float = float(os.getenv("SCORE_WEIGHT_WEEKEND", "2.0"))
    score_penalty_back_to_back_first: float = float(os.getenv("SCORE_PENALTY_BACK_TO_BACK_FIRST", "4.0"))
    score_penalty_back_to_back_weekend: float = float(os.getenv("SCORE_PENALTY_BACK_TO_BACK_WEEKEND", "4.0"))


settings = Settings()
