"""OpenAI provider.

Uses Chat Completions with `response_format={type: "json_object"}` to guarantee
valid JSON output. The prompt must include the word "JSON" somewhere (it always
does in our use case via the schema instructions).

Reads OPENAI_API_KEY from env. Override the model via LLM_MODEL or by passing
`model` explicitly.
"""

import json
import os
from typing import Any

from app.services.llm.retry import with_retry


SYSTEM_PROMPT = (
    "You return ONLY a valid JSON value. Do not include any preamble, prose, or "
    "markdown fences. If the user asks for a JSON array, the top-level value of "
    "your response must be a JSON object containing a single key 'items' whose "
    "value is that array."
)


def _client():
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("openai is not installed. Run: pip install openai") from exc

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    return OpenAI(api_key=api_key)


def call(prompt: str, model: str) -> tuple[Any, dict]:
    client = _client()

    def _invoke():
        return client.chat.completions.create(
            model=model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )

    response = with_retry(_invoke, label=f"openai:{model}")
    text = (response.choices[0].message.content or "").strip() or "{}"
    parsed = json.loads(text)

    # OpenAI's json_object mode requires the top-level value to be an object.
    # Our findings prompt expects a JSON array — we wrap/unwrap via an `items` key.
    if isinstance(parsed, dict) and "items" in parsed and isinstance(parsed["items"], list):
        parsed = parsed["items"]

    usage = getattr(response, "usage", None)
    metrics = {
        "input_tokens": getattr(usage, "prompt_tokens", None),
        "output_tokens": getattr(usage, "completion_tokens", None),
    }
    return parsed, metrics
