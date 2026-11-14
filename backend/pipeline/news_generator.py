"""
Generate headline + sub-headline JSON from the latest video summaries (DeepSeek reasoner).

Selection:
- If any summarized video has upload metadata, rank by timestamp (desc); items without
  time sort after, by position in the consolidated transcript (later = newer).
- Otherwise take the last N videos from the transcript file that have summaries.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI
from tqdm import tqdm

from backend.config import Settings
from backend.pipeline.transcript_parser import parse_transcripts
from backend.pipeline.video_summarizer import deepseek_chat_client, load_summary_cache, summary_cache_key


def _fill_template(template: str, replacements: Dict[str, str]) -> str:
    out = template
    for key, val in replacements.items():
        out = out.replace("{" + key + "}", val)
    return out


def _strip_json_response(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _parse_iso_to_ts(value: str) -> Optional[float]:
    try:
        s = value.strip().replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


def _upload_date_to_ts_yyyymmdd(value: str) -> Optional[float]:
    v = (value or "").strip()
    if len(v) != 8 or not v.isdigit():
        return None
    try:
        dt = datetime.strptime(v, "%Y%m%d").replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except ValueError:
        return None


def _meta_timestamp(meta: Dict[str, Any]) -> Optional[float]:
    ts = meta.get("upload_timestamp")
    if ts is not None:
        try:
            return float(ts)
        except (TypeError, ValueError):
            pass
    udt = meta.get("upload_datetime_utc")
    if udt:
        parsed = _parse_iso_to_ts(str(udt))
        if parsed is not None:
            return parsed
    ud = meta.get("upload_date")
    if ud:
        return _upload_date_to_ts_yyyymmdd(str(ud))
    return None


def _merge_video_meta(
    by_link_context: Dict[str, Dict[str, Any]],
    by_link_transcript: Dict[str, Dict[str, Any]],
    link: str,
) -> Dict[str, Any]:
    ctx = dict(by_link_context.get(link, {}))
    tr = by_link_transcript.get(link, {}) or {}
    for k in ("upload_timestamp", "upload_datetime_utc", "upload_date"):
        if (k not in ctx or ctx.get(k) in (None, "")) and k in tr:
            ctx[k] = tr[k]
    return ctx


def _load_video_context_by_link(path: Path) -> Dict[str, Dict[str, Any]]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and item.get("video_link"):
                out[str(item["video_link"])] = item
    return out


def _load_summaries_entries(cache_path: Path) -> Dict[str, Dict[str, Any]]:
    return load_summary_cache(cache_path)


def _summaries_to_items(entries: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for _key, row in entries.items():
        if not isinstance(row, dict):
            continue
        title = row.get("video_title")
        link = row.get("video_link")
        summary = row.get("summary_text")
        if not title or not link or not summary:
            continue
        items.append(
            {
                "video_title": str(title),
                "video_link": str(link),
                "summary_text": str(summary),
                "cache_id": summary_cache_key(str(title), str(link)),
            }
        )
    return items


@dataclass
class _RankRow:
    cache_id: str
    video_title: str
    video_link: str
    summary_text: str
    sort_ts: Optional[float]
    file_idx: int


def _rank_summaries(
    items: List[Dict[str, Any]],
    by_link_context: Dict[str, Dict[str, Any]],
    transcript_videos: List[Dict[str, str]],
) -> Tuple[List[_RankRow], str]:
    by_link_transcript = {v["video_link"]: v for v in transcript_videos if v.get("video_link")}
    file_idx_map: Dict[str, int] = {}
    for i, v in enumerate(transcript_videos):
        link = v.get("video_link")
        if link:
            file_idx_map[link] = i

    rows: List[_RankRow] = []
    for it in items:
        link = it["video_link"]
        meta = _merge_video_meta(by_link_context, by_link_transcript, link)
        ts = _meta_timestamp(meta)
        rows.append(
            _RankRow(
                cache_id=it["cache_id"],
                video_title=it["video_title"],
                video_link=link,
                summary_text=it["summary_text"],
                sort_ts=ts,
                file_idx=file_idx_map.get(link, -1),
            )
        )

    any_ts = any(r.sort_ts is not None for r in rows)
    if any_ts:
        rows.sort(
            key=lambda r: (
                0 if r.sort_ts is not None else 1,
                -(r.sort_ts or 0.0),
                -r.file_idx,
            )
        )
        return rows, "by_upload_time"

    # No usable timestamps: last N blocks in file order (newest first within tail)
    return rows, "by_file_tail"


def _select_tail_by_file_order(
    rows: List[_RankRow],
    transcript_videos: List[Dict[str, str]],
    n: int,
) -> List[_RankRow]:
    """Newest-first by consolidated file order: walk backward until n summaries are found."""
    if n <= 0 or not transcript_videos:
        return []
    by_link = {r.video_link: r for r in rows}
    chosen: List[_RankRow] = []
    seen: set[str] = set()
    for v in reversed(transcript_videos):
        link = v.get("video_link")
        if not link:
            continue
        r = by_link.get(link)
        if r and r.cache_id not in seen:
            seen.add(r.cache_id)
            chosen.append(r)
            if len(chosen) >= n:
                break
    return chosen


def _load_news_prompts(settings: Settings) -> Tuple[str, str]:
    system_path = settings.prompts_dir / settings.news_headline_prompt_system
    user_path = settings.prompts_dir / settings.news_headline_prompt_user
    if not system_path.is_file():
        raise FileNotFoundError(f"Missing news headline system prompt: {system_path}")
    if not user_path.is_file():
        raise FileNotFoundError(f"Missing news headline user prompt: {user_path}")
    return (
        system_path.read_text(encoding="utf-8").strip(),
        user_path.read_text(encoding="utf-8").strip(),
    )


def _style_reference(settings: Settings) -> str:
    """Ground-truth Hindi punctuation/grammar reference for headline prompts."""
    from backend.pipeline.transcript_cleaner import load_style_reference

    return load_style_reference(
        settings.prompts_dir,
        getattr(settings, "hindi_style_reference_file", "hindi_style_reference.txt"),
    )


def _generate_one_headline(
    client: OpenAI,
    model: str,
    system_msg: str,
    user_tpl: str,
    video_title: str,
    video_link: str,
    summary_text: str,
    style_reference: str = "",
) -> Tuple[str, str]:
    user_msg = _fill_template(
        user_tpl,
        {
            "style_reference": style_reference,
            "video_title": video_title or "",
            "video_link": video_link or "",
            "summary_text": summary_text or "",
        },
    )
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.6,
    )
    raw = (response.choices[0].message.content or "").strip()
    payload = json.loads(_strip_json_response(raw))
    headline = str(payload.get("headline", "")).strip()
    sub = str(payload.get("subheadline", "")).strip()
    if not headline or not sub:
        raise ValueError("Model returned empty headline or subheadline")
    return headline, sub


def generate_news_items(
    settings: Settings,
    *,
    top_n: Optional[int] = None,
    summaries_path: Optional[Path] = None,
    video_context_path: Optional[Path] = None,
    transcript_path: Optional[Path] = None,
    sleep_seconds: float = 0.0,
    show_progress: bool = True,
) -> Dict[str, Any]:
    n = int(top_n if top_n is not None else settings.news_generator_top_n)
    summaries_path = summaries_path or (Path(__file__).resolve().parent.parent / "data" / "video_summaries.json")
    video_context_path = video_context_path or (Path(__file__).resolve().parent.parent / "data" / "video_context.json")
    transcript_path = transcript_path or (Path(__file__).resolve().parent.parent / "data" / "ravishkumar_all_transcripts.txt")

    entries = _load_summaries_entries(summaries_path)
    items = _summaries_to_items(entries)
    if not items:
        return {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "top_n": n,
            "selection_mode": "empty",
            "model": settings.deepseek_model,
            "items": [],
        }

    transcript_raw = transcript_path.read_text(encoding="utf-8") if transcript_path.is_file() else ""
    transcript_videos = parse_transcripts(transcript_raw) if transcript_raw else []
    by_link_context = _load_video_context_by_link(video_context_path)

    ranked, mode = _rank_summaries(items, by_link_context, transcript_videos)
    if mode == "by_file_tail":
        picked = _select_tail_by_file_order(ranked, transcript_videos, n)
    else:
        picked = ranked[:n]

    client = deepseek_chat_client(settings)
    system_msg, user_tpl = _load_news_prompts(settings)
    model = settings.deepseek_model
    style_ref = _style_reference(settings)

    out_items: List[Dict[str, Any]] = []
    for row in (
        tqdm(
            picked,
            desc="Generating headlines",
            unit="video",
            dynamic_ncols=True,
        )
        if show_progress and picked
        else picked
    ):
        meta = _merge_video_meta(by_link_context, {v["video_link"]: v for v in transcript_videos}, row.video_link)
        try:
            headline, subhead = _generate_one_headline(
                client,
                model,
                system_msg,
                user_tpl,
                row.video_title,
                row.video_link,
                row.summary_text,
                style_ref,
            )
        except Exception as exc:
            headline, subhead = "", ""
            err = str(exc)
        else:
            err = ""

        rec: Dict[str, Any] = {
            "video_title": row.video_title,
            "video_link": row.video_link,
            "summary_text": row.summary_text,
            "headline": headline,
            "subheadline": subhead,
        }
        if row.sort_ts is not None:
            rec["sort_timestamp"] = row.sort_ts
        udt = meta.get("upload_datetime_utc")
        if udt:
            rec["upload_datetime_utc"] = udt
        ud = meta.get("upload_date")
        if ud:
            rec["upload_date"] = ud
        if err:
            rec["error"] = err
        out_items.append(rec)
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "top_n": n,
        "selection_mode": mode,
        "model": model,
        "items": out_items,
    }


def write_generated_news(payload: Dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_load_generated_news(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _safe_load_legacy_items(path: Path) -> List[Dict[str, Any]]:
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(data, dict):
        items = data.get("items", [])
    else:
        items = data
    if not isinstance(items, list):
        return []
    return [it for it in items if isinstance(it, dict)]


def _stable_news_id(item: Dict[str, Any]) -> str:
    return f"{(item.get('video_title') or '').strip()}||{(item.get('video_link') or '').strip()}"


def _to_sort_ts(item: Dict[str, Any], fallback_idx: int) -> float:
    ts = item.get("sort_timestamp")
    if ts is not None:
        try:
            return float(ts)
        except (TypeError, ValueError):
            pass
    for key in ("upload_datetime_utc", "upload_date"):
        if item.get(key):
            parsed = _meta_timestamp(item)
            if parsed is not None:
                return parsed
    return float(fallback_idx)


def update_generated_news_rolling(
    settings: Settings,
    new_summary_items: List[Dict[str, Any]],
    *,
    show_progress: bool = False,
    generated_news_path: Optional[Path] = None,
    generated_news_legacy_path: Optional[Path] = None,
    pregenerated: bool = False,
) -> Dict[str, int]:
    """
    Generate headlines only for new summaries, keep only latest top-N in active news,
    and move evicted items to legacy archive.

    Output paths default to the global settings paths, but per-channel callers must
    pass the channel's own paths — otherwise every channel would read and overwrite
    the same news file.

    ``pregenerated`` marks rows that already carry a headline and subheadline (the
    multi-story path writes several per video), so no headline call is made.
    """
    n = max(1, int(settings.news_generator_top_n))
    now_iso = datetime.now(timezone.utc).isoformat()
    active_path = generated_news_path or settings.generated_news_path
    legacy_path = generated_news_legacy_path or settings.generated_news_legacy_path
    active_payload = _safe_load_generated_news(active_path)
    active_items_raw = active_payload.get("items", [])
    active_items = [it for it in active_items_raw if isinstance(it, dict)]
    legacy_items = _safe_load_legacy_items(legacy_path)

    active_by_id: Dict[str, Dict[str, Any]] = {}
    for idx, rec in enumerate(active_items, start=1):
        rid = _stable_news_id(rec)
        if rid:
            rec.setdefault("sort_timestamp", _to_sort_ts(rec, idx))
            active_by_id[rid] = rec

    unique_new: List[Dict[str, Any]] = []
    seen_new_ids: set[str] = set()
    duplicates_skipped = 0
    empty_summary_skipped = 0
    existing_active_count = len(active_by_id)
    for row in new_summary_items:
        rid = _stable_news_id(row)
        if not rid or rid in active_by_id or rid in seen_new_ids:
            duplicates_skipped += 1
            continue
        if not row.get("summary_text"):
            empty_summary_skipped += 1
            continue
        seen_new_ids.add(rid)
        unique_new.append(row)

    generated_count = 0
    if unique_new:
        client = None if pregenerated else deepseek_chat_client(settings)
        system_msg, user_tpl = ("", "") if pregenerated else _load_news_prompts(settings)
        style_ref = "" if pregenerated else _style_reference(settings)
        model = settings.deepseek_model
        iterable = (
            tqdm(unique_new, desc="Generating rolling news", unit="video", dynamic_ncols=True)
            if show_progress
            else unique_new
        )
        for row in iterable:
            if pregenerated:
                # Headline/subheadline were produced upstream (multi-story path).
                headline = str(row.get("headline", "")).strip()
                subhead = str(row.get("subheadline", "")).strip()
                err = "" if headline else "missing pregenerated headline"
            else:
                try:
                    headline, subhead = _generate_one_headline(
                        client,
                        model,
                        system_msg,
                        user_tpl,
                        str(row.get("video_title", "")),
                        str(row.get("video_link", "")),
                        str(row.get("summary_text", "")),
                        style_ref,
                    )
                except Exception as exc:
                    headline, subhead = "", ""
                    err = str(exc)
                else:
                    err = ""

            rec: Dict[str, Any] = {
                "video_title": str(row.get("video_title", "")),
                "video_link": str(row.get("video_link", "")),
                "summary_text": str(row.get("summary_text", "")),
                "headline": headline,
                "subheadline": subhead,
            }
            # Carry multi-story provenance so the source video stays traceable.
            for k in ("story_index", "source_video_link", "topic", "source_tab", "video_title", "topic_flow"):
                if row.get(k) is not None:
                    rec[k] = row[k]
            for k in ("upload_timestamp", "upload_datetime_utc", "upload_date"):
                if row.get(k) is not None and row.get(k) != "":
                    rec[k] = row[k]
            rec["sort_timestamp"] = _to_sort_ts(rec, len(active_by_id) + generated_count + 1)
            if err:
                rec["error"] = err
            active_by_id[_stable_news_id(rec)] = rec
            generated_count += 1

    merged = list(active_by_id.values())
    merged.sort(key=lambda it: _to_sort_ts(it, 0))

    evicted: List[Dict[str, Any]] = []
    if len(merged) > n:
        evicted = merged[: len(merged) - n]
        merged = merged[-n:]

    if evicted:
        legacy_items.extend(evicted)
        legacy_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_path.write_text(
            json.dumps(
                {
                    "updated_at": now_iso,
                    "items": legacy_items,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    run_log = {
        "run_at": now_iso,
        "incoming_summaries": len(new_summary_items),
        "existing_active_before": existing_active_count,
        "generated_new_items": generated_count,
        "duplicates_or_existing_skipped": duplicates_skipped,
        "empty_summary_skipped": empty_summary_skipped,
        "evicted_to_legacy": len(evicted),
        "active_after": len(merged),
        "legacy_total_after": len(legacy_items),
    }

    write_generated_news(
        {
            "updated_at": now_iso,
            "top_n": n,
            "selection_mode": "rolling_latest",
            "model": settings.deepseek_model,
            "run_log": run_log,
            "items": merged,
        },
        active_path,
    )
    return {
        "generated": generated_count,
        "active_total": len(merged),
        "evicted_to_legacy": len(evicted),
    }
