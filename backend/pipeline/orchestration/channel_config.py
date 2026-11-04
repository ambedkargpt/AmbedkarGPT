from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.pipeline.orchestration.contracts import ChannelConfig


def _to_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _required(payload: dict[str, Any], key: str) -> str:
    value = str(payload.get(key, "")).strip()
    if not value:
        raise ValueError(f"Missing required channel config key: {key}")
    return value


def load_channel_config(project_root: Path, channel: str) -> ChannelConfig:
    config_path = project_root / "config" / "channels" / f"{channel}.json"
    if not config_path.is_file():
        raise FileNotFoundError(f"Channel config not found: {config_path}")
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    name = _required(payload, "name")
    channel_url = _required(payload, "channel_url")
    channel_slug = _required(payload, "channel_slug")

    # Optional list of tabs to scrape (e.g. /videos and /streams). When absent,
    # ChannelConfig.source_urls falls back to the single channel_url.
    raw_urls = payload.get("channel_urls") or []
    channel_urls = tuple(str(u).strip() for u in raw_urls if str(u).strip())

    raw_lookback = payload.get("lookback_days")
    lookback_days: int | None = None
    if raw_lookback not in (None, ""):
        lookback_days = int(raw_lookback)
        if lookback_days <= 0:
            lookback_days = None

    def _opt_positive_int(key: str) -> int | None:
        raw = payload.get(key)
        if raw in (None, ""):
            return None
        value = int(raw)
        return value if value > 0 else None

    def _opt_path(key: str) -> Path | None:
        raw = str(payload.get(key, "")).strip()
        return (project_root / raw).resolve() if raw else None

    ns = str(payload.get("pinecone_namespace", "")).strip()

    return ChannelConfig(
        name=name,
        semrag_graph_path=_opt_path("semrag_graph_path"),
        semrag_chunks_path=_opt_path("semrag_chunks_path"),
        semrag_cache_path=_opt_path("semrag_cache_path"),
        rag_chunks_path=_opt_path("rag_chunks_path"),
        rag_video_context_path=_opt_path("rag_video_context_path"),
        rag_title_embeddings_path=_opt_path("rag_title_embeddings_path"),
        pinecone_namespace=ns or None,
        channel_url=channel_url,
        channel_slug=channel_slug,
        channel_urls=channel_urls,
        lookback_days=lookback_days,
        max_videos_per_run=_opt_positive_int("max_videos_per_run"),
        max_consecutive_transcript_failures=_opt_positive_int("max_consecutive_transcript_failures"),
        tenant_slug=str(payload.get("tenant_slug") or "general").strip().lower(),
        scope=(str(payload.get("scope") or "national").strip().lower()),
        region=(str(payload.get("region") or "").strip() or None),
        source_name=(str(payload.get("source_name") or "").strip() or None),
        news_mode=("multi" if str(payload.get("news_mode") or "single").strip().lower() == "multi" else "single"),
        stories_per_video=int(payload.get("stories_per_video") or 1),
        stories_per_stream=int(
            payload.get("stories_per_stream")
            # Configs written before the split used one number for both
            # tabs, and it was always tuned for streams.
            or payload.get("stories_per_video")
            or 4
        ),
        transcripts_dir=(project_root / _required(payload, "transcripts_dir")).resolve(),
        consolidated_txt_path=(project_root / _required(payload, "consolidated_txt_path")).resolve(),
        processed_json_path=(project_root / _required(payload, "processed_json_path")).resolve(),
        master_transcript_path=(project_root / _required(payload, "master_transcript_path")).resolve(),
        video_summaries_path=(project_root / _required(payload, "video_summaries_path")).resolve(),
        generated_news_path=(project_root / _required(payload, "generated_news_path")).resolve(),
        generated_news_legacy_path=(project_root / _required(payload, "generated_news_legacy_path")).resolve(),
        rebuild_rag=_to_bool(payload.get("rebuild_rag"), True),
        rebuild_semrag=_to_bool(payload.get("rebuild_semrag"), True),
        run_summarizer=_to_bool(payload.get("run_summarizer"), True),
        run_news_generator=_to_bool(payload.get("run_news_generator"), True),
        run_news_publish=_to_bool(payload.get("run_news_publish"), True),
    )
