"""LLM provider abstraction.

Exposes a single entry point `generate_json(prompt, model=None)` that dispatches
to the configured provider based on the `LLM_PROVIDER` environment variable.

Configuration:
    LLM_PROVIDER : "gemini" | "anthropic" | "openai"   (default: "gemini")
    LLM_MODEL    : provider-specific model id           (default: provider's default)

All providers return the same contract:
    (parsed_json: Any, metrics: dict[str, Optional[int]])

`metrics` has keys: input_tokens, output_tokens.
"""

import os
from typing import Any, Optional


DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "anthropic": "claude-3-5-haiku-latest",
    "openai": "gpt-4o-mini",
}


def get_provider() -> str:
    return os.getenv("LLM_PROVIDER", "gemini").lower()


def get_model() -> str:
    provider = get_provider()
    return os.getenv("LLM_MODEL") or DEFAULT_MODELS.get(provider, "gemini-2.5-flash")


def generate_json(prompt: str, model: Optional[str] = None) -> tuple[Any, dict]:
    provider = get_provider()
    chosen_model = model or get_model()

    if provider == "gemini":
        from app.services.llm import gemini_provider as impl
    elif provider == "anthropic":
        from app.services.llm import anthropic_provider as impl
    elif provider == "openai":
        from app.services.llm import openai_provider as impl
    else:
        raise RuntimeError(
            f"Unknown LLM_PROVIDER '{provider}'. Set LLM_PROVIDER to one of: gemini, anthropic, openai."
        )

    return impl.call(prompt, chosen_model)


__all__ = ["generate_json", "get_provider", "get_model", "DEFAULT_MODELS"]
