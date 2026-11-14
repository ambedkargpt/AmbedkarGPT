"""
The INC topic flow, step 1 ("Prompt 1"): one call per new video.

The transcript goes in with every line numbered. The model returns the video's
Topics, each with:
  JSON_1  a 4-8 word title          -> the news card's headline
  JSON_2  about 80 words of content -> the news card's summary
  JSON_3  the original transcript lines for the topic
  JSON_4  the narrative frames (post angles)
JSON_3 and JSON_4 are stored on the news document under ``topic_flow`` and are
all that step 2 (services/inc_topic_posts.py) reads when someone presses
Generate post. The transcript is read once here, in the background, rather
than on every click.

JSON_3 comes back as line numbers, not text. The lines themselves are copied
from the numbered transcript by this module, so a line can never be reworded
or invented, and the answer stays far inside the model's output limit: a long
press conference quoted line by line for every topic would not fit.

Prompt text: prompts/inc_topics_system.txt, sir's Prompt 1 with only the
output format added.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import TYPE_CHECKING, Any, Dict, List

if TYPE_CHECKING:
    from backend.config import Settings

_log = logging.getLogger(__name__)

FLOW_VERSION = "inc_topics_v1"
SYSTEM_PROMPT_NAME = "inc_topics_system.txt"

# Prompt 1 should see the whole conversation: "cover entire transcript". A
# long press conference runs past the 24,000 characters the old story splitter
# read, so this is set higher; the line numbers add a little on top.
_MAX_TRANSCRIPT_CHARS = int(os.getenv("INC_TOPICS_TRANSCRIPT_CHARS", "48000"))
# A guard against a runaway answer, not a target: sir's prompt asks for every
# topic in the video.
_MAX_TOPICS = int(os.getenv("INC_TOPICS_MAX", "12"))
_MAX_FRAMES = 8
# Its own setting, not DEEPSEEK_MODEL: that one is the reasoner in some
# environments, and the reasoner's thinking counts against the answer's token
# budget, which left Prompt 1 with an empty answer on a 13,000 character
# transcript. The chat model answers this in well under a minute.
TOPICS_MODEL = (os.getenv("INC_TOPICS_MODEL") or "deepseek-chat").strip()

_SENTENCE_SPLIT = re.compile(r"(?<=[।?!.])\s+")


def number_lines(transcript: str, max_chars: int = _MAX_TRANSCRIPT_CHARS) -> List[str]:
    """The transcript cut into sentences, in order, up to ``max_chars``."""
    lines: List[str] = []
    used = 0
    for para in (transcript or "").splitlines():
        for sentence in _SENTENCE_SPLIT.split(para.strip()):
            sentence = sentence.strip()
            if not sentence:
                continue
            if used + len(sentence) > max_chars:
                return lines
            lines.append(sentence)
            used += len(sentence) + 1
    return lines


def numbered_text(lines: List[str]) -> str:
    return "\n".join(f"[{i}] {line}" for i, line in enumerate(lines, start=1))


def expand_refs(refs: Any, count: int) -> List[int]:
    """[3, "5-7", "9"] -> [3, 5, 6, 7, 9], inside 1..count, in order, once each."""
    out: set[int] = set()
    for ref in refs if isinstance(refs, list) else [refs]:
        text = str(ref).strip().strip("[]")
        m = re.fullmatch(r"(\d+)\s*[-–]\s*(\d+)", text)
        if m:
            lo, hi = sorted((int(m.group(1)), int(m.group(2))))
            out.update(range(lo, hi + 1))
        elif text.isdigit():
            out.add(int(text))
    return sorted(n for n in out if 1 <= n <= count)


def _strip_json(raw: str) -> str:
    from backend.pipeline.multi_news_generator import _strip_json_response

    return _strip_json_response(raw)


def parse_topics(raw: str, lines: List[str]) -> List[Dict[str, Any]]:
    """The model's answer as clean topics; a topic missing a part is dropped."""
    try:
        data = json.loads(_strip_json(raw))
    except (TypeError, ValueError):
        return []
    topics = data.get("topics") if isinstance(data, dict) else None
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for t in topics if isinstance(topics, list) else []:
        if not isinstance(t, dict):
            continue
        from backend.pipeline.generator import _strip_ai_tells

        # The em dash habit, removed as it is from posts. Not from the lines:
        # they are the transcript's own words.
        title = _strip_ai_tells(str(t.get("JSON_1") or "").strip())
        content = _strip_ai_tells(str(t.get("JSON_2") or "").strip())
        picked = [lines[n - 1] for n in expand_refs(t.get("JSON_3") or [], len(lines))]
        frames = [_strip_ai_tells(str(f).strip()) for f in (t.get("JSON_4") or []) if str(f).strip()][:_MAX_FRAMES]
        if not title or not content or not picked or not frames or title in seen:
            continue
        seen.add(title)
        out.append({"title": title, "content": content, "lines": picked, "frames": frames})
    return out[:_MAX_TOPICS]


def load_system_prompt(settings: "Settings") -> str:
    path = settings.prompts_dir / SYSTEM_PROMPT_NAME
    return path.read_text(encoding="utf-8").strip()


def extract_topics(*, client, model: str, system_msg: str, video_title: str, transcript: str) -> List[Dict[str, Any]]:
    lines = number_lines(transcript)
    if not lines:
        return []
    user_msg = f"Video title: {video_title}\n\nTranscript (each line numbered):\n{numbered_text(lines)}"
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}],
    }
    if "reasoner" in model:
        kwargs["max_tokens"] = 32000  # room for the thinking as well as the answer
    else:
        kwargs.update(temperature=0.4, max_tokens=8192, response_format={"type": "json_object"})
    resp = client.chat.completions.create(**kwargs)
    raw = resp.choices[0].message.content or ""
    topics = parse_topics(raw, lines)
    if not topics:
        _log.warning("inc topics: no usable topic for %r (answer %d chars)", video_title, len(raw))
    return topics


def topic_link(video_link: str, index: int) -> str:
    """Per-topic link: the dedupe key and the unique source_url of the card."""
    return f"{(video_link or '').strip()}#topic-{index}"


def build_topic_rows(
    settings: "Settings",
    entries: List[Dict[str, Any]],
    *,
    show_progress: bool = False,
    client=None,
) -> List[Dict[str, Any]]:
    """
    Fetched transcript entries -> news rows, one per topic. Same shape as
    multi_news_generator.build_story_rows, plus ``topic_flow``, so the rolling
    file and the publish step treat them like any pre-generated story.
    """
    if not entries:
        return []
    if client is None:
        from backend.pipeline.video_summarizer import deepseek_chat_client

        client = deepseek_chat_client(settings)
    system_msg = load_system_prompt(settings)
    rows: List[Dict[str, Any]] = []
    for item in entries:
        title = str(item.get("title") or item.get("video_title") or "").strip()
        link = str(item.get("url") or item.get("video_link") or "").strip()
        transcript = str(item.get("transcript") or "").strip()
        if not title or not link or not transcript:
            continue
        try:
            topics = extract_topics(
                client=client, model=TOPICS_MODEL, system_msg=system_msg,
                video_title=title, transcript=transcript,
            )
        except Exception as exc:  # noqa: BLE001 - one bad video must not stop the rest
            _log.warning("inc topics: %r failed: %s", title, exc)
            continue
        if show_progress:
            print(f"[news] topics: {len(topics)} from {title[:70]!r}")
        for idx, topic in enumerate(topics, start=1):
            row: Dict[str, Any] = {
                "video_title": title,
                "video_link": topic_link(link, idx),
                "source_video_link": link,
                "story_index": idx,
                "headline": topic["title"],
                "subheadline": "",
                "summary_text": topic["content"],
                "topic_flow": {
                    "version": FLOW_VERSION,
                    "transcript_lines": topic["lines"],
                    "narrative_frames": topic["frames"],
                },
            }
            for key in ("upload_timestamp", "upload_datetime_utc", "upload_date", "source_tab"):
                if item.get(key) is not None:
                    row[key] = item[key]
            rows.append(row)
    return rows
