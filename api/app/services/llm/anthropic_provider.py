"""Anthropic Claude provider.

Claude doesn't have a native JSON mode, so we:
  1. Tell it (in the system message) to return only JSON.
  2. Strip any stray markdown code fences before parsing.

Reads ANTHROPIC_API_KEY from env. Override the model via the LLM_MODEL env var or
by passing `model` explicitly.
"""

import json
import os
import re
from typing import Any

from app.services.llm.retry import with_retry


SYSTEM_PROMPT = (
    "You return ONLY a valid JSON value (object or array) — no preamble, no prose, "
    "no markdown code fences. If asked for an array, return an array. If asked for "
    "an object, return an object."
)


def _client():
    try:
        import anthropic
    except ImportError as exc:
        raise RuntimeError("anthropic is not installed. Run: pip install anthropic") from exc

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    return anthropic.Anthropic(api_key=api_key)


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return cleaned


def call(prompt: str, model: str) -> tuple[Any, dict]:
    client = _client()

    def _invoke():
        return client.messages.create(
            model=model,
            max_tokens=8192,
            temperature=0.2,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

    response = with_retry(_invoke, label=f"anthropic:{model}")

    blocks = getattr(response, "content", []) or []
    text_parts: list[str] = []
    for block in blocks:
        text_value = getattr(block, "text", None)
        if text_value:
            text_parts.append(text_value)
    raw_text = "".join(text_parts).strip() or "[]"
    cleaned = _strip_code_fences(raw_text)
    parsed = json.loads(cleaned)

    usage = getattr(response, "usage", None)
    metrics = {
        "input_tokens": getattr(usage, "input_tokens", None),
        "output_tokens": getattr(usage, "output_tokens", None),
    }
    return parsed, metrics
