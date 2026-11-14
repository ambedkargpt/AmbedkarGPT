"""
The INC topic flow, step 2 ("Prompt 2"): one post from one narrative frame.

Input is only what step 1 stored on the news card (pipeline/inc_topics.py):
the topic's original transcript lines (JSON_3) and one narrative frame from
JSON_4. No user profile, no preferences, no web search, no corpus passages.

Generate post on a card takes the frames in order: the first post uses
frame 1, the next frame 2, and after the last frame it starts again at 1.

The answer (JSON_5) is a couplet, a post of at most 40 words and one hashtag.
The saved post text is those three, separated by blank lines, so copy, share
and the post preview handle it like any other post; the hashtag is also kept
in the post's ``hashtags`` field, which the hashtag editor changes.

Prompt text: prompts/inc_topic_post_system.txt, sir's Prompt 2.2 with the web
search taken out.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SYSTEM_PROMPT_NAME = "inc_topic_post_system.txt"
PROMPT_VERSION = "inc_topics_v1|inc_topic_post_system.txt"


def frame_for(frames: list[str], written_before: int) -> tuple[int, str]:
    """The frame for the next post: in order, looping back to the first."""
    index = written_before % len(frames)
    return index, frames[index]


def user_message(lines: list[str], frame: str) -> str:
    payload = {"JSON_3": lines, "JSON_4": frame}
    return "INPUTS - (JSON_3) + (JSON_4):\n" + json.dumps(payload, ensure_ascii=False, indent=1)


def clean_hashtag(raw: str) -> str:
    """One hashtag: a leading #, words joined by underscores, no punctuation."""
    text = str(raw or "").strip().lstrip("#").strip()
    text = re.sub(r"[।.,!?;:\"'“”‘’()\[\]{}]", "", text)
    text = re.sub(r"[\s\-–—]+", "_", text).strip("_")
    return f"#{text}" if text else ""


def parse_answer(raw: str) -> dict[str, Any] | None:
    from backend.pipeline.multi_news_generator import _strip_json_response

    try:
        data = json.loads(_strip_json_response(raw))
    except (TypeError, ValueError):
        return None
    if isinstance(data, dict) and isinstance(data.get("JSON_5"), dict):
        data = data["JSON_5"]
    if not isinstance(data, dict):
        return None
    couplet = str(data.get("couplet") or "").strip()
    post = str(data.get("post") or "").strip()
    hashtag = clean_hashtag(data.get("hashtag") or "")
    if not couplet or not post:
        return None
    return {"couplet": couplet, "post": post, "hashtag": hashtag}


def compose(parts: dict[str, Any], hashtags: list[str] | None = None) -> str:
    """The post as shown and shared: couplet, post, hashtags."""
    tags = hashtags if hashtags is not None else ([parts["hashtag"]] if parts.get("hashtag") else [])
    blocks = [parts["couplet"], parts["post"]]
    if tags:
        blocks.append(" ".join(tags))
    return "\n\n".join(blocks)


def write_post(*, client, model: str, prompts_dir: Path, lines: list[str], frame: str) -> dict[str, Any] | None:
    system_msg = (prompts_dir / SYSTEM_PROMPT_NAME).read_text(encoding="utf-8").strip()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": user_message(lines, frame)}],
        temperature=0.8,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    return parse_answer(resp.choices[0].message.content or "")
