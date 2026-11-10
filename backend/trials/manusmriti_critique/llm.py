"""The one place this trial talks to a language model.

Everything that needs a model calls `complete_json`, so changing provider, model or key handling is a
change here and nowhere else. The website's chat tries OpenAI and falls back to Gemini; here Gemini comes first, because the fact-check
runs on a Gemini Pro model and the writing was clearly better on it, and the order is a setting, because on a development machine a local OpenAI-compatible proxy is
often down and every call would otherwise wait for it to time out before moving on.

    TRIAL_LLM_PROVIDERS=gemini            # or openai, or "gemini,openai" (the default)
    TRIAL_GEMINI_MODEL=models/gemini-3.5-flash
    TRIAL_OPENAI_MODEL=gpt-4o-mini
    TRIAL_GEMINI_THINKING=1024            # thinking tokens when writing; 0 is faster but its hooks were generic
    TRIAL_JUDGE_MODEL=...                 # the model that fact-checks the posts (default: the writing model)
    TRIAL_JUDGE_THINKING=2048             # thinking budget for the fact-check (Gemini)

Keys are read from the environment (OPENAI_API_KEY, OPENAI_BASE_URL, GEMINI_API_KEY or GOOGLE_API_KEY).
"""

import json
import os
import re
from typing import Callable, Dict, List, Optional

OPENAI_TIMEOUT_S = 45.0


class LLMError(RuntimeError):
    """No provider produced a usable answer."""


def parse_json(text: str) -> Dict:
    """The JSON object in a model reply, tolerating a code fence or a sentence before and after it."""
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def _openai(system: str, user: str, temperature: float, max_tokens: int, model: Optional[str]) -> str:
    from openai import OpenAI

    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise LLMError("no OpenAI key")
    client = OpenAI(api_key=key, base_url=os.getenv("OPENAI_BASE_URL") or None, timeout=OPENAI_TIMEOUT_S, max_retries=0)
    response = client.chat.completions.create(
        model=model or os.getenv("TRIAL_OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or ""


def _gemini(system: str, user: str, temperature: float, max_tokens: int, model: Optional[str], thinking: Optional[int] = None) -> str:
    from google import genai

    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise LLMError("no Gemini key")
    client = genai.Client(api_key=key)  # kept in a variable: an inline client is closed mid-request
    response = client.models.generate_content(
        model=model or os.getenv("TRIAL_GEMINI_MODEL", "models/gemini-3.5-flash"),
        contents=user,
        config={
            "system_instruction": system,
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "response_mime_type": "application/json",
            "thinking_config": {"thinking_budget": thinking if thinking is not None else int(os.getenv("TRIAL_GEMINI_THINKING", "1024"))},
        },
    )
    return response.text or ""


PROVIDERS: Dict[str, Callable[..., str]] = {"openai": _openai, "gemini": _gemini}


def provider_order() -> List[str]:
    wanted = (os.getenv("TRIAL_LLM_PROVIDERS") or "gemini,openai").replace(" ", "").split(",")
    return [p for p in wanted if p in PROVIDERS]


def complete_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 3000,
    providers: Optional[List[str]] = None,
    model: Optional[str] = None,
    thinking: Optional[int] = None,
) -> Dict:
    """Ask for a JSON object. Tries each provider in turn; raises LLMError with every reason if none works."""
    failures = []
    for name in providers or provider_order():
        try:
            extra = {"thinking": thinking} if name == "gemini" and thinking is not None else {}
            return parse_json(PROVIDERS[name](system, user, temperature, max_tokens, model, **extra))
        except Exception as exc:  # a network error, a bad key or unparseable output: try the next provider
            failures.append(f"{name}: {type(exc).__name__}: {str(exc)[:160]}")
    raise LLMError("; ".join(failures) or "no provider is configured")
