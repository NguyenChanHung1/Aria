import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from agent.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

PLACEHOLDER_KEYS = {"", "sk-...", "sk-your-key-here", "changeme", "your-api-key-here"}


def llm_enabled() -> bool:
    key = settings.openai_api_key.strip()
    if key.lower() in PLACEHOLDER_KEYS:
        return False
    # Real keys are longer; very short values are almost certainly placeholders.
    return key.startswith("sk-") and len(key) > 20


def is_llm_auth_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    if any(token in msg for token in ("401", "invalid_api_key", "incorrect api key", "authentication")):
        return True
    return type(exc).__name__.lower() in {"authenticationerror", "permissiondeniederror"}


async def with_llm_fallback(
    llm_fn: Callable[[], Awaitable[T]],
    fallback_fn: Callable[[], T],
    *,
    label: str,
) -> T:
    if not llm_enabled():
        logger.info("%s: no valid OPENAI_API_KEY — using template", label)
        return fallback_fn()
    try:
        return await llm_fn()
    except Exception as exc:
        if is_llm_auth_error(exc):
            logger.warning("%s: OpenAI auth failed — using template fallback", label)
            return fallback_fn()
        raise
