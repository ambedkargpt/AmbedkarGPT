from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal


StageStatus = Literal["success", "skipped", "failed"]


@dataclass(frozen=True)
class ChannelConfig:
    name: str
    channel_url: str
    channel_slug: str
    transcripts_dir: Path
    consolidated_txt_path: Path
    processed_json_path: Path
    master_transcript_path: Path
    video_summaries_path: Path
    generated_news_path: Path
    generated_news_legacy_path: Path
    # Every tab to scrape for this channel (e.g. /videos and /streams).
    # Falls back to [channel_url] when the config does not list any.
    channel_urls: tuple[str, ...] = ()
    # Only ingest videos published within this many days (None = no window).
    lookback_days: int | None = None
    # Most fresh videos to attempt in one run (None = every video in the window).
    #
    # YouTube's transcript budget is per IP and shared across channels, so a
    # single wide channel can spend all of it and leave the others with nothing
    # - a 27-video BJP window did exactly that, and Samajwadi and Congress were
    # then refused every request. Capping keeps one channel from starving the
    # rest. The window is newest-first, so the cap keeps the latest videos.
    max_videos_per_run: int | None = None
    # Stop a channel after this many transcript refusals in a row (None = never).
    #
    # Once the limit is hit, every further request is refused anyway, and each
    # one still costs its backoff sleep: Congress spent 48 minutes collecting 82
    # consecutive failures. Giving up early frees the run and stops extending
    # the block. Set it above the number of caption-less videos you expect in a
    # row, so a genuine gap is not mistaken for throttling.
    max_consecutive_transcript_failures: int | None = None
    # Tenant this channel publishes into (see backend/tenants.py).
    tenant_slug: str = "general"
    # Which level of politics the channel covers: "national" (the party's own
    # central channel), "state" (a state unit, such as INC MP) or "city". The
    # news page groups stories by it, and the post prompt writes for it.
    scope: str = "national"
    # For a state or city channel, where: "Madhya Pradesh", "Bhopal".
    region: str | None = None
    # What a published story says it came from. The tenant's own name by
    # default, which is right while a tenant has one channel; the general
    # tenant now carries two, and every Dalit Dastak story would otherwise be
    # filed under Ravish Kumar.
    source_name: str | None = None
    # "single" = one news item per video (default).
    # "multi"  = split each video into several stories (live/press conferences).
    news_mode: str = "single"
    # How many stories to pull out of one video, by which tab it came from.
    # An uploaded video is already an edited package on a single subject, so it
    # yields one item; a livestream or press conference runs through many
    # subjects in one sitting, so it yields several.
    stories_per_video: int = 1
    stories_per_stream: int = 4
    # Knowledge-graph and vector outputs. When unset the global settings paths
    # are used, which keeps the original single-channel behaviour. Setting them
    # gives a channel its own graph instead of merging into a shared one.
    semrag_graph_path: Path | None = None
    semrag_chunks_path: Path | None = None
    semrag_cache_path: Path | None = None
    rag_chunks_path: Path | None = None
    rag_video_context_path: Path | None = None
    rag_title_embeddings_path: Path | None = None
    # Pinecone namespace isolates a channel's vectors within the shared index.
    pinecone_namespace: str | None = None
    rebuild_rag: bool = True
    rebuild_semrag: bool = True
    run_summarizer: bool = True
    run_news_generator: bool = True
    run_news_publish: bool = True

    @property
    def source_urls(self) -> tuple[str, ...]:
        return self.channel_urls or (self.channel_url,)


    def stories_for_tab(self, source_tab: str | None) -> int:
        """
        Story cap for one video, chosen by the tab it was scraped from.

        Unknown or missing tabs fall back to the video count: a missing tab is
        far more often a plain upload than a stream, and capping low keeps a
        metadata gap from flooding the feed with near-duplicate stories.
        """
        tab = (source_tab or "").strip().lower()
        if tab in ("streams", "live"):
            return max(1, int(self.stories_per_stream))
        return max(1, int(self.stories_per_video))


@dataclass
class StageResult:
    stage_name: str
    status: StageStatus
    metrics: dict[str, Any] = field(default_factory=dict)
    artifacts_written: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class PipelineContext:
    project_root: Path
    run_id: str
    channel: ChannelConfig
    dry_run: bool
    resume: bool
    settings: Any
    state_path: Path
    selected_stages: list[str]
    runtime: dict[str, Any] = field(default_factory=dict)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
