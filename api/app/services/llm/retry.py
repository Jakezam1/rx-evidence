"""Shared retry/backoff helper used by all LLM providers.

Retries only on transient errors (rate-limit, server-overload, timeout). Fast-fails
on auth/bad-request errors. Single provider only — no cross-provider fallback.
"""

import logging
import random
import time
from typing import Callable, TypeVar

T = TypeVar("T")

log = logging.getLogger(__name__)

TRANSIENT_STATUS_CODES = (408, 429, 500, 502, 503, 504, 529)
MAX_ATTEMPTS = 6
BASE_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0


def _looks_transient(exc: BaseException) -> bool:
    msg = str(exc).lower()
    if any(str(code) in msg for code in TRANSIENT_STATUS_CODES):
        return True
    transient_keywords = (
        "unavailable",
        "overloaded",
        "rate limit",
        "rate_limit",
        "timeout",
        "timed out",
        "temporarily",
    )
    return any(kw in msg for kw in transient_keywords)


def with_retry(call_fn: Callable[[], T], *, label: str = "llm") -> T:
    last_exc: BaseException | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            return call_fn()
        except Exception as exc:
            last_exc = exc
            if not _looks_transient(exc) or attempt == MAX_ATTEMPTS - 1:
                raise
            wait = min(BASE_BACKOFF_SECONDS * (2 ** attempt), MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5)
            log.warning(
                "[%s] transient error on attempt %d/%d, retrying in %.2fs: %s",
                label,
                attempt + 1,
                MAX_ATTEMPTS,
                wait,
                exc,
            )
            time.sleep(wait)
    assert last_exc is not None
    raise last_exc
