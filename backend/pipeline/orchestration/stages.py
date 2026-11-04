from __future__ import annotations

import json
import random
import time
from pathlib import Path

from backend.repositories.news_repo import NewsRepository
from backend.services.news_migration import migrate_news
from backend.pipeline.multi_news_generator import build_story_rows
from backend.pipeline.news_generator import update_generated_news_rolling
from backend.pipeline.orchestration.contracts import PipelineContext, StageResult
from backend.pipeline.transcript_cleaner import clean_transcript
from backend.tenants import general_tenant, get_tenant
from backend.pipeline.video_summarizer import (
    deepseek_chat_client,
    get_or_create_video_summary,
    load_summary_cache,
    save_summary_cache,
    summary_cache_key,
)


def _fetch_module():
    import sys
    import os
    # Ensure backend/ directory is in sys.path so 'Fetch' can be imported directly.
    _backend_dir = str(Path(__file__).resolve().parent.parent.parent)  # .../backend/
    if _backend_dir not in sys.path:
        sys.path.insert(0, _backend_dir)
    import Fetch as fetch_module

    return fetch_module


def run_ingestion(context: PipelineContext) -> StageResult:
    if context.dry_run:
        return StageResult("ingestion", "skipped", warnings=["dry-run"])
    fetch = _fetch_module()
    channel = context.channel
    channel.transcripts_dir.mkdir(parents=True, exist_ok=True)

    # Date-windowed runs collect metadata up front (across every configured tab,
    # e.g. /videos and /streams) so we never enumerate a huge back catalogue.
    meta_by_url: dict[str, dict] = {}
    if channel.lookback_days:
        recent = fetch.collect_recent_videos(
            list(channel.source_urls), channel.lookback_days
        )
        meta_by_url = {m["url"]: m for m in recent}
        video_urls = list(meta_by_url.keys())
    else:
        video_urls = []
        for tab_url in channel.source_urls:
            video_urls.extend(fetch.fetch_video_urls(tab_url))
        # De-duplicate while preserving newest-first order across tabs
        video_urls = list(dict.fromkeys(video_urls))

    processed_ids, processed_records = fetch.load_processed(channel.processed_json_path)
    filtered_urls, skipped_existing = fetch.filter_already_downloaded_urls(
        video_urls, processed_records, channel.transcripts_dir
    )
    # Take the newest N when a cap is set. collect_recent_videos returns the
    # window newest-first, and filter_already_downloaded_urls preserves that
    # order, so this keeps the most current videos and defers the rest to a
    # later run rather than dropping them.
    queued_urls = len(filtered_urls)
    capped_out = 0
    if channel.max_videos_per_run and queued_urls > channel.max_videos_per_run:
        capped_out = queued_urls - channel.max_videos_per_run
        filtered_urls = filtered_urls[: channel.max_videos_per_run]
        print(
            f" Capped at {channel.max_videos_per_run} newest video(s); "
            f"{capped_out} left for the next run."
        )

    entries: list[dict] = []
    cleaned_count = 0
    transcript_failures = 0
    no_caption_count = 0
    consecutive_refusals = 0
    rate_limited = False
    for url in filtered_urls:
        meta = meta_by_url.get(url) or fetch.get_video_metadata(url)
        if not meta:
            continue
        transcript, reason = fetch.fetch_transcript_with_reason(meta["id"])
        if not transcript:
            # A video with no captions is not a refusal. It says nothing about
            # the next video, costs nothing to move past, and waiting cannot
            # produce captions that were never published. Counting it as a
            # refusal stopped a Congress run after four such videos while the
            # next channel fetched with no failures at all.
            if reason == "no_captions":
                no_caption_count += 1
                consecutive_refusals = 0
                continue

            # Everything else is throttling or a network failure. Backing off
            # matters more here than after a success: continuing straight to the
            # next request is what makes the rate limit cascade.
            transcript_failures += 1
            consecutive_refusals += 1
            limit = channel.max_consecutive_transcript_failures
            if limit and consecutive_refusals >= limit:
                # Every further request would be refused too, and each refusal
                # still pays its backoff. Leave the rest for the next run.
                rate_limited = True
                print(
                    f" {consecutive_refusals} transcript refusals in a row - "
                    f"stopping this channel and leaving the rest for a later run."
                )
                break
            time.sleep(random.uniform(20, 35))
            continue
        consecutive_refusals = 0
        # Clean once here so summaries, RAG chunks and entity extraction all
        # consume the same cleaned text rather than raw caption output.
        cleaned = clean_transcript(
            context.settings,
            video_title=meta.get("title", ""),
            video_link=url,
            raw_transcript=transcript,
        )
        if cleaned:
            if cleaned != transcript:
                cleaned_count += 1
            transcript = cleaned
        base_name = fetch.sanitize_filename(meta["title"])
        docx_path = channel.transcripts_dir / f"{base_name}.docx"
        fetch.create_docx(
            docx_path,
            meta["title"],
            url,
            transcript,
            upload_date=meta.get("upload_date"),
            upload_datetime_utc=meta.get("upload_datetime_utc"),
        )
        fetch.create_txt_from_docx(docx_path)
        entry = {
            "title": meta.get("title", ""),
            "url": url,
            "transcript": transcript,
        }
        for key in ("upload_date", "upload_timestamp", "upload_datetime_utc", "source_tab"):
            if meta.get(key) is not None:
                entry[key] = meta[key]
        entries.append(entry)
        fetch.add_processed(processed_ids, processed_records, meta, url, channel.processed_json_path)
        # Polite delay to avoid YouTube IP rate-limiting
        delay = random.uniform(10, 15)
        print(f" Sleeping {delay:.1f}s before next fetch…")
        time.sleep(delay)

    appended = fetch.append_entries_to_consolidated(channel.consolidated_txt_path, entries)
    # The RAG and knowledge-graph stages read master_transcript_path, so mirror
    # new entries into it. Without this those stages find no file and silently
    # do nothing, which is how the legacy Ravish flow kept its dataset in sync.
    mirrored = 0
    if channel.master_transcript_path != channel.consolidated_txt_path:
        mirrored = fetch.append_entries_to_consolidated(channel.master_transcript_path, entries)
    context.runtime["newly_fetched_entries"] = entries
    return StageResult(
        stage_name="ingestion",
        status="success",
        metrics={
            "queued_urls": len(video_urls),
            "filtered_pending": len(filtered_urls),
            "new_entries": len(entries),
            "appended_entries": appended,
            "mirrored_to_master": mirrored,
            "skipped_existing": skipped_existing,
            "cleaned_transcripts": cleaned_count,
            "transcript_failures": transcript_failures,
            # Separate, because they mean opposite things: refusals are worth
            # retrying later, caption-less videos never will be.
            "no_captions": no_caption_count,
            "lookback_days": channel.lookback_days or 0,
            # Both are how a caller tells "this channel is done" from "this
            # channel has more waiting", which decides whether a rerun is worth it.
            "deferred_by_cap": capped_out,
            "rate_limited": rate_limited,
        },
        artifacts_written=[str(channel.consolidated_txt_path), str(channel.processed_json_path)],
    )


def run_rag_artifacts(context: PipelineContext) -> StageResult:
    if not context.channel.rebuild_rag:
        return StageResult("rag_artifacts", "skipped", warnings=["disabled-by-channel-config"])
    if context.dry_run:
        return StageResult("rag_artifacts", "skipped", warnings=["dry-run"])
    fetch = _fetch_module()
    channel = context.channel
    fetch.rebuild_rag_artifacts_from_data_file(
        channel.master_transcript_path,
        chunks_path=channel.rag_chunks_path,
        video_context_path=channel.rag_video_context_path,
        title_emb_path=channel.rag_title_embeddings_path,
        namespace=channel.pinecone_namespace,
    )
    return StageResult(
        "rag_artifacts",
        "success",
        metrics={"namespace": channel.pinecone_namespace or "(default)"},
        artifacts_written=[str(channel.master_transcript_path)],
    )


def run_semrag_artifacts(context: PipelineContext) -> StageResult:
    if not context.channel.rebuild_semrag:
        return StageResult("semrag_artifacts", "skipped", warnings=["disabled-by-channel-config"])
    if context.dry_run:
        return StageResult("semrag_artifacts", "skipped", warnings=["dry-run"])
    fetch = _fetch_module()
    channel = context.channel
    fetch.rebuild_semrag_artifacts_from_data_file(
        channel.master_transcript_path,
        graph_path=channel.semrag_graph_path,
        cache_path=channel.semrag_cache_path,
        chunks_path=channel.semrag_chunks_path,
    )
    return StageResult(
        "semrag_artifacts",
        "success",
        artifacts_written=[
            str(channel.semrag_graph_path or context.settings.semrag_graph_path),
            str(channel.semrag_chunks_path or context.settings.semrag_chunks_path),
        ],
    )


def run_video_summaries(context: PipelineContext) -> StageResult:
    if not context.channel.run_summarizer:
        return StageResult("video_summaries", "skipped", warnings=["disabled-by-channel-config"])
    if context.dry_run:
        return StageResult("video_summaries", "skipped", warnings=["dry-run"])
    entries = context.runtime.get("newly_fetched_entries") or []
    if not entries:
        return StageResult("video_summaries", "skipped", warnings=["no-new-entries"])
    cache = load_summary_cache(context.channel.video_summaries_path)
    client = deepseek_chat_client(context.settings)
    new_rows: list[dict] = []
    new_count = 0
    for item in entries:
        title = (item.get("title") or "").strip()
        url = (item.get("url") or "").strip()
        transcript = (item.get("transcript") or "").strip()
        if not title or not url or not transcript:
            continue
        key = summary_cache_key(title, url)
        had_summary = bool(cache.get(key, {}).get("summary_text"))
        get_or_create_video_summary(
            client=client,
            model=context.settings.deepseek_summary_model,
            cache_entries=cache,
            video_title=title,
            video_link=url,
            full_text=transcript,
            target_words=190,
            prompts_dir=context.settings.prompts_dir,
        )
        if not had_summary:
            new_count += 1
            created = cache.get(key, {})
            if created.get("summary_text"):
                row = {
                    "video_title": title,
                    "video_link": url,
                    "summary_text": created["summary_text"],
                }
                for k in ("upload_timestamp", "upload_datetime_utc", "upload_date"):
                    if item.get(k) is not None:
                        row[k] = item[k]
                new_rows.append(row)
    save_summary_cache(context.channel.video_summaries_path, cache)
    context.runtime["new_summary_rows"] = new_rows
    return StageResult(
        "video_summaries",
        "success",
        metrics={"new_summaries": new_count},
        artifacts_written=[str(context.channel.video_summaries_path)],
    )


def run_news_generation(context: PipelineContext) -> StageResult:
    if not context.channel.run_news_generator:
        return StageResult("news_generation", "skipped", warnings=["disabled-by-channel-config"])
    if context.dry_run:
        return StageResult("news_generation", "skipped", warnings=["dry-run"])

    multi = context.channel.news_mode == "multi"
    if multi:
        # Multi-story works from the transcripts, not the single-summary rows,
        # because splitting a video into stories needs the full text.
        entries = context.runtime.get("newly_fetched_entries") or []
        if not entries:
            return StageResult("news_generation", "skipped", warnings=["no-new-transcripts"])
        # How many stories a video yields depends on which tab it came from,
        # so group by tab and extract each group under its own cap rather than
        # applying one channel-wide number to uploads and livestreams alike.
        by_tab: dict[str, list[dict]] = {}
        for entry in entries:
            tab = str(entry.get("source_tab") or "videos").strip().lower()
            by_tab.setdefault(tab, []).append(entry)

        rows = []
        per_tab: dict[str, int] = {}
        for tab in sorted(by_tab):
            group = by_tab[tab]
            cap = context.channel.stories_for_tab(tab)
            print(f"[news] {tab}: {len(group)} video(s), up to {cap} story/stories each")
            tab_rows = build_story_rows(
                context.settings,
                group,
                max_stories=cap,
                show_progress=True,
            )
            per_tab[f"stories_from_{tab}"] = len(tab_rows)
            rows.extend(tab_rows)
        if not rows:
            return StageResult("news_generation", "skipped", warnings=["no-stories-extracted"])
        stats = update_generated_news_rolling(
            context.settings,
            rows,
            show_progress=True,
            generated_news_path=context.channel.generated_news_path,
            generated_news_legacy_path=context.channel.generated_news_legacy_path,
            pregenerated=True,
        )
        stats = {**stats, "source_videos": len(entries), "stories_built": len(rows), **per_tab}
    else:
        rows = context.runtime.get("new_summary_rows") or []
        if not rows:
            return StageResult("news_generation", "skipped", warnings=["no-new-summaries"])
        stats = update_generated_news_rolling(
            context.settings,
            rows,
            show_progress=True,
            generated_news_path=context.channel.generated_news_path,
            generated_news_legacy_path=context.channel.generated_news_legacy_path,
        )
    return StageResult(
        "news_generation",
        "success",
        metrics={**stats, "news_mode": context.channel.news_mode},
        artifacts_written=[str(context.channel.generated_news_path), str(context.channel.generated_news_legacy_path)],
    )


def run_news_publish(context: PipelineContext) -> StageResult:
    if not context.channel.run_news_publish:
        return StageResult("news_publish", "skipped", warnings=["disabled-by-channel-config"])
    if context.dry_run:
        return StageResult("news_publish", "skipped", warnings=["dry-run"])
    repo = NewsRepository()
    tenant = get_tenant(context.channel.tenant_slug) or general_tenant()
    stats = migrate_news(
        repo,
        current_file=context.channel.generated_news_path,
        legacy_file=context.channel.generated_news_legacy_path,
        tenant=tenant,
        source_name=context.channel.source_name,
        scope=context.channel.scope,
        region=context.channel.region,
    )
    return StageResult(
        "news_publish",
        "success",
        metrics={
            "inserted": stats.inserted,
            "updated": stats.updated,
            "deduped_count": stats.deduped_count,
        },
    )


STAGE_HANDLERS = {
    "ingestion": run_ingestion,
    "rag_artifacts": run_rag_artifacts,
    "semrag_artifacts": run_semrag_artifacts,
    "video_summaries": run_video_summaries,
    "news_generation": run_news_generation,
    "news_publish": run_news_publish,
}

STAGE_DEPENDENCIES = {
    "ingestion": [],
    "rag_artifacts": ["ingestion"],
    "semrag_artifacts": ["ingestion"],
    "video_summaries": ["ingestion"],
    "news_generation": ["video_summaries"],
    "news_publish": ["news_generation"],
}


def stage_input_fingerprints(context: PipelineContext) -> dict[str, list[Path]]:
    return {
        "ingestion": [context.channel.processed_json_path],
        "rag_artifacts": [context.channel.master_transcript_path],
        "semrag_artifacts": [context.channel.master_transcript_path],
        "video_summaries": [context.channel.video_summaries_path, context.channel.master_transcript_path],
        "news_generation": [context.channel.video_summaries_path],
        "news_publish": [context.channel.generated_news_path, context.channel.generated_news_legacy_path],
    }
