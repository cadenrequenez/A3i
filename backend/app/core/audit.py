from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("a3i.audit")


def log_ai_suggestion_event(payload: dict[str, Any]) -> None:
    try:
        logger.info("ai_suggest_fixes %s", json.dumps(payload, default=str))
    except Exception:
        logger.exception("Failed to write AI audit log")
