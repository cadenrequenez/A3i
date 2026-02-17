from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app import schemas


OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"


def request_schedule_suggestions(
    *,
    model_input: dict[str, Any],
    max_suggestions: int,
) -> list[schemas.AISuggestedFixDraft]:
    if not settings.openai_api_key:
        return []

    system_prompt = (
        "You are a healthcare scheduling copilot. "
        "Return STRICT JSON only with this top-level key: suggestions. "
        "Do not include markdown. "
        "Hard rules: weekend is Fri/Sat/Sun with same two MDs each day and pattern 1-2-1 or 2-1-2; "
        "no back-to-back weekend assignments for same MD; "
        "following Thursday must map to prior weekend pattern; "
        "exactly two MDs per day, no duplicate MD in both slots; "
        "at least one CV-qualified MD nightly; "
        "avoid back-to-back weekday calls and every-other-night weekday first call; "
        "Ed and Dan max one weekend per month; "
        "never include Tim Castro. "
        "Suggestions must be weekend-block changes (Fri/Sat/Sun together)."
    )
    user_prompt = (
        "Given the schedule context, propose up to "
        f"{max_suggestions} fix options as JSON. "
        "Each suggestion must include title, rationale, expected_fairness_delta, and changes. "
        "Each change must include date, set_first_call_md_id, set_second_call_md_id."
    )

    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps({"task": user_prompt, "context": model_input}, default=str),
            },
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(timeout=25.0) as client:
            response = client.post(
                OPENAI_CHAT_COMPLETIONS_URL,
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
    except Exception:
        return []

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = schemas.AISuggestFixesRawResponse.model_validate_json(content)
        return parsed.suggestions[:max_suggestions]
    except (KeyError, TypeError, ValidationError, ValueError):
        return []
