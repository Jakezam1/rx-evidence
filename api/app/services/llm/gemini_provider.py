"""Gemini provider — uses google-genai SDK."""

import json
import os
from typing import Any

from app.services.llm.retry import with_retry


def _client():
    try:
        from google import genai
    except ImportError as exc:
        raise RuntimeError("google-genai is not installed. Run: pip install google-genai") from exc

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=api_key)


def call(prompt: str, model: str) -> tuple[Any, dict]:
    client = _client()

    def _invoke():
        return client.models.generate_content(
            model=model,
            contents=prompt,
            config={"temperature": 0.2, "response_mime_type": "application/json"},
        )

    response = with_retry(_invoke, label=f"gemini:{model}")
    text = response.text or "[]"
    parsed = json.loads(text)

    usage = getattr(response, "usage_metadata", None)
    metrics = {
        "input_tokens": getattr(usage, "prompt_token_count", None),
        "output_tokens": getattr(usage, "candidates_token_count", None),
    }
    return parsed, metrics
