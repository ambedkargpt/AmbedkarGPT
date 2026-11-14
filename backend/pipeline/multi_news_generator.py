"""
Multi-story news generation: one video -> several news items.

The default pipeline produces a single headline per video, which suits a short
commentary clip. A live press conference or briefing usually covers several
unrelated subjects, so publishing one item per video throws most of it away.

This module asks the model to split one cleaned transcript into the distinct
stories it actually contains (see ``prompts/news_multi_story_*.txt``) and emits
one news row per story.

Uniqueness: every downstream dedupe key is derived from ``video_link`` — both
``_stable_news_id`` here and ``upsert_by_source_url`` in Mongo. Stories from the
same video would therefore overwrite each other, so each one is given a
``#story-N`` fragment. The fragment is ignored by YouTube, so the link still
opens the source video.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

from tqdm import tqdm

if TYPE_CHECKING:
    from backend.config import Settings

# Upper bound on transcript characters sent per request. Long briefings are
# truncated rather than chunked: splitting a transcript hides cross-references
# and makes the model emit near-duplicate stories from adjacent chunks.
_MAX_TRANSCRIPT_CHARS = 24000


def _fill_template(template: str, replacements: Dict[str, str]) -> str:
    """Avoid str.format so braces inside transcript text cannot break the prompt."""
    out = template
    for key, val in replacements.items():
        out = out.replace("{" + key + "}", val)
    return out


_LATIN_RE = re.compile(r"[A-Za-z]")


def latin_ratio(text: str) -> float:
    """Share of letters that are Latin. Published news must be Devanagari-only."""
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if _LATIN_RE.match(c)) / len(letters)


def _story_text(story: Dict[str, Any]) -> str:
    return " ".join(
        str(story.get(k, "")) for k in ("headline", "subheadline", "summary", "topic")
    )


def _strip_json_response(raw: str) -> str:
    """Tolerate ```json fences even though the prompt forbids them."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -3]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    text = text.strip()
    # Fall back to the outermost JSON object if the model added prose around it.
    if not text.startswith("{"):
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
    return text


def load_multi_story_prompts(settings: "Settings") -> tuple[str, str]:
    system_path = settings.prompts_dir / settings.news_multi_story_prompt_system
    user_path = settings.prompts_dir / settings.news_multi_story_prompt_user
    if not system_path.is_file():
        raise FileNotFoundError(f"Missing multi-story system prompt: {system_path}")
    if not user_path.is_file():
        raise FileNotFoundError(f"Missing multi-story user prompt: {user_path}")
    return (
        system_path.read_text(encoding="utf-8").strip(),
        user_path.read_text(encoding="utf-8").strip(),
    )


def story_link(video_link: str, index: int) -> str:
    """Per-story link so dedupe keys stay unique across stories of one video."""
    base = (video_link or "").strip()
    if not base:
        return ""
    return f"{base}#story-{index}"


def extract_stories(
    *,
    client,
    model: str,
    settings: "Settings",
    video_title: str,
    video_link: str,
    transcript: str,
    max_stories: int,
) -> List[Dict[str, Any]]:
    """
    Split one transcript into up to ``max_stories`` distinct stories.

    Returns raw story dicts (headline/subheadline/summary/topic). Returns an
    empty list when the model fails or returns nothing usable — the caller
    decides whether to fall back to single-story generation.
    """
    if not transcript.strip():
        return []
    system_msg, user_tpl = load_multi_story_prompts(settings)
    clipped = transcript.strip()[:_MAX_TRANSCRIPT_CHARS]

    from backend.pipeline.transcript_cleaner import load_style_reference

    user_msg = _fill_template(
        user_tpl,
        {
            "max_stories": str(max_stories),
            "style_reference": load_style_reference(
                settings.prompts_dir,
                getattr(settings, "hindi_style_reference_file", "hindi_style_reference.txt"),
            ),
            "video_title": video_title or "",
            "video_link": video_link or "",
            "transcript": clipped,
        },
    )
    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]
    try:
        response = client.chat.completions.create(model=model, messages=messages, temperature=0.5)
        raw = response.choices[0].message.content or ""
        # Published news must be Devanagari-only. English source material makes the
        # model answer in English, so a single corrective pass is cheaper and more
        # reliable than discarding the video.
        if latin_ratio(raw) > 0.15:
            messages += [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": (
                        "The output contains English/Latin text. Rewrite the SAME stories "
                        "entirely in Hindi using Devanagari script. Transliterate every name, "
                        "place and initialism (Amit Shah -> अमित शाह, MSME -> एमएसएमई). "
                        "No Latin letters anywhere. Return only the JSON object."
                    ),
                },
            ]
            response = client.chat.completions.create(model=model, messages=messages, temperature=0.3)
            raw = response.choices[0].message.content or ""
        payload = json.loads(_strip_json_response(raw))
    except Exception as exc:  # noqa: BLE001 - one bad video must not kill the run
        print(f" Multi-story extraction failed for {video_link}: {exc}")
        return []

    raw_stories = payload.get("stories") if isinstance(payload, dict) else None
    if not isinstance(raw_stories, list):
        return []

    stories: List[Dict[str, Any]] = []
    seen_headlines: set[str] = set()
    for story in raw_stories:
        if not isinstance(story, dict):
            continue
        from backend.pipeline.generator import _strip_ai_tells

        # The em dash habit, removed here as it is from posts (see _strip_ai_tells).
        headline = _strip_ai_tells(str(story.get("headline", "")).strip())
        subheadline = _strip_ai_tells(str(story.get("subheadline", "")).strip())
        summary = _strip_ai_tells(str(story.get("summary", "")).strip())
        if not headline or not summary:
            continue
        # Guard against the model repeating one story under different wording.
        key = headline.lower()
        if key in seen_headlines:
            continue
        # Last line of defence: never publish a story that is still mostly English.
        if latin_ratio(_story_text(story)) > 0.25:
            print(f" Dropping non-Devanagari story: {headline[:60]}")
            continue
        seen_headlines.add(key)
        stories.append(
            {
                "headline": headline,
                "subheadline": subheadline or summary[:200],
                "summary": summary,
                "topic": str(story.get("topic", "")).strip(),
            }
        )
        if len(stories) >= max_stories:
            break
    return stories


def build_story_rows(
    settings: "Settings",
    entries: List[Dict[str, Any]],
    *,
    max_stories: int | None = None,
    show_progress: bool = False,
    client=None,
) -> List[Dict[str, Any]]:
    """
    Turn fetched transcript entries into news rows — several per video.

    ``entries`` are the ingestion-stage records: title, url, transcript, plus
    upload metadata. The returned rows carry pre-generated headlines, so the
    rolling-news writer must not regenerate them.
    """
    if not entries:
        return []
    n = int(max_stories or settings.news_stories_per_video)
    if client is None:
        from backend.pipeline.video_summarizer import deepseek_chat_client

        client = deepseek_chat_client(settings)
    model = settings.deepseek_model

    iterable = (
        tqdm(entries, desc="Extracting stories", unit="video", dynamic_ncols=True)
        if show_progress
        else entries
    )

    rows: List[Dict[str, Any]] = []
    for item in iterable:
        title = str(item.get("title") or item.get("video_title") or "").strip()
        link = str(item.get("url") or item.get("video_link") or "").strip()
        transcript = str(item.get("transcript") or "").strip()
        if not title or not link or not transcript:
            continue

        stories = extract_stories(
            client=client,
            model=model,
            settings=settings,
            video_title=title,
            video_link=link,
            transcript=transcript,
            max_stories=n,
        )
        for idx, story in enumerate(stories, start=1):
            row: Dict[str, Any] = {
                # Keep the original video title so the source stays identifiable,
                # while the story link and headline make the item unique.
                "video_title": title,
                "video_link": story_link(link, idx),
                "source_video_link": link,
                "story_index": idx,
                "summary_text": story["summary"],
                "headline": story["headline"],
                "subheadline": story["subheadline"],
            }
            if story.get("topic"):
                row["topic"] = story["topic"]
            for key in ("upload_timestamp", "upload_datetime_utc", "upload_date", "source_tab"):
                if item.get(key) is not None:
                    row[key] = item[key]
            rows.append(row)
    return rows
