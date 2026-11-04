from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit


@dataclass
class MigrationStats:
    current_count: int
    legacy_count: int
    merged_count: int
    deduped_count: int
    inserted: int
    updated: int


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_day(value: Any) -> datetime | None:
    """
    yt-dlp's YYYYMMDD upload_date, as midnight UTC.

    Only used when the precise timestamp is absent. Midnight is a real choice
    rather than a guess: within a day the sort falls back to created_at, and
    ordering stories from the same day by when we processed them beats giving
    them no date at all.
    """
    text = str(value or "").strip()
    if len(text) != 8 or not text.isdigit():
        return None
    try:
        return datetime.strptime(text, "%Y%m%d").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def normalize_source_url(raw: Any) -> str:
    """
    Canonical form of a source URL, used both for display and for deduplication.

    Only the scheme and host are lowercased. Lowercasing the whole URL breaks
    YouTube: video ids are case-sensitive, so "watch?v=HYwfi4eZ6mE" became
    "watch?v=hywfi4ez6me" and the stored link no longer resolved to the video.
    Host casing is the only part that varies in practice, so normalising just
    that keeps deduplication working while leaving the id intact.
    """
    url = str(raw or "").strip()
    if not url:
        return ""
    parts = urlsplit(url)
    if not parts.scheme and not parts.netloc:
        return url  # not a URL we recognise; leave it untouched
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, parts.fragment)
    )


# Titles that mark a broadcast even when it was filed under the videos tab.
_PRESS_TITLE_HINTS = (
    "live",
    "press conference",
    "press briefing",
    "briefing",
    "प्रेस वार्ता",
    "प्रेस कॉन्फ्रेंस",
)


def classify_content_type(item: dict[str, Any]) -> str:
    """
    "press_conference" for livestreamed briefings, "news" for regular uploads.

    The source tab is authoritative because titles are inconsistent — some
    streams never say "LIVE". Title hints are only a fallback for items
    ingested before the tab was recorded.
    """
    tab = str(item.get("source_tab") or "").strip().lower()
    if tab in {"streams", "live"}:
        return "press_conference"
    if tab == "videos":
        # An ended livestream still shows up under videos, so honour the title.
        title = str(item.get("video_title") or "").lower()
        return "press_conference" if any(h in title for h in _PRESS_TITLE_HINTS) else "news"
    title = str(item.get("video_title") or "").lower()
    return "press_conference" if any(h in title for h in _PRESS_TITLE_HINTS) else "news"


def _normalize_item(
    item: dict[str, Any],
    source: str,
    *,
    tenant_id: int = 0,
    tenant_slug: str = "general",
    source_name: str = "Ravish Kumar",
    tags: list[str] | None = None,
    scope: str = "national",
    region: str | None = None,
) -> dict[str, Any] | None:
    source_url = normalize_source_url(item.get("video_link"))
    headline = (item.get("headline") or "").strip()
    summary = (item.get("summary_text") or "").strip()
    description = (item.get("subheadline") or "").strip() or summary
    if not source_url or not headline or not summary:
        return None
    # upload_datetime_utc is the precise field, but it is not always there.
    # yt-dlp returns it for some videos and only the YYYYMMDD upload_date for
    # others, and a Samajwadi run published 25 stories where every one had a
    # correct upload_date and no upload_datetime_utc. Reading only the precise
    # field left published_at null on all of them, which sends a story to the
    # bottom of a feed sorted by that column and hides it from anything
    # selecting by date. Falling back to the day is better than having no date.
    published_at = _parse_dt(item.get("upload_datetime_utc")) or _parse_day(item.get("upload_date"))
    sort_ts = item.get("sort_timestamp")
    if sort_ts is None:
        sort_ts = item.get("upload_timestamp")
    try:
        sort_ts = float(sort_ts) if sort_ts is not None else 0.0
    except Exception:
        sort_ts = 0.0
    return {
        "source_url": source_url,
        "headline": headline,
        "description": description,
        "summary": summary,
        "source_name": source_name,
        "published_at": published_at,
        # Tenant stamp drives party vs general news segmentation in the API.
        "tenant_id": tenant_id,
        "tenant_slug": tenant_slug,
        # National, state or city politics, and where (see ChannelConfig.scope).
        "scope": scope,
        "region": region,
        # "press_conference" (livestreamed briefing) vs "news" (regular upload).
        "content_type": classify_content_type(item),
        # Keep null by default to avoid Mongo text index language override conflicts.
        "language": None,
        # Multi-story items carry their own topic; fall back to the channel tags.
        "tags": ([item["topic"].strip().lower()] if str(item.get("topic") or "").strip() else list(tags or [])),
        "embedding_ref": None,
        "legacy_source": source,
        "original_sort_timestamp": sort_ts,
    }


def load_and_dedupe_news(
    current_file: Path,
    legacy_file: Path,
    *,
    tenant: Any = None,
    tags: list[str] | None = None,
    source_name: str | None = None,
    scope: str = "national",
    region: str | None = None,
) -> tuple[list[dict[str, Any]], MigrationStats]:
    # A new channel has no legacy archive until items are first evicted, and a
    # channel can be published before either file exists. Treat both as empty
    # rather than failing the publish stage.
    def _items(path: Path) -> list[dict[str, Any]]:
        if not path.is_file():
            return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return []
        items = payload.get("items", []) if isinstance(payload, dict) else payload
        return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []

    current_items = _items(current_file)
    legacy_items = _items(legacy_file)

    # Default to the general tenant so existing Ravish runs are unchanged.
    if tenant is None:
        from backend.tenants import general_tenant

        tenant = general_tenant()
    tenant_kwargs = {
        "tenant_id": tenant.tenant_id,
        "tenant_slug": tenant.slug,
        # The channel's own name when it has one. A tenant with a single
        # channel reads the same either way; the general tenant has two, and
        # its name alone would file every Dalit Dastak story under Ravish Kumar.
        "source_name": source_name or tenant.source_name,
        "tags": tags,
        "scope": scope,
        "region": region,
    }

    merged: list[dict[str, Any]] = []
    for item in current_items:
        normalized = _normalize_item(item, "current", **tenant_kwargs)
        if normalized:
            merged.append(normalized)
    for item in legacy_items:
        normalized = _normalize_item(item, "legacy", **tenant_kwargs)
        if normalized:
            merged.append(normalized)

    dedup: dict[str, dict[str, Any]] = {}
    for item in merged:
        key = item["source_url"]
        existing = dedup.get(key)
        if not existing or item.get("original_sort_timestamp", 0.0) >= existing.get("original_sort_timestamp", 0.0):
            dedup[key] = item

    deduped = list(dedup.values())
    deduped.sort(key=lambda x: x.get("original_sort_timestamp", 0.0))
    stats = MigrationStats(
        current_count=len(current_items),
        legacy_count=len(legacy_items),
        merged_count=len(merged),
        deduped_count=len(deduped),
        inserted=0,
        updated=0,
    )
    return deduped, stats


def migrate_news(
    repo,
    current_file: Path,
    legacy_file: Path,
    *,
    tenant: Any = None,
    tags: list[str] | None = None,
    source_name: str | None = None,
    scope: str = "national",
    region: str | None = None,
) -> MigrationStats:
    deduped, stats = load_and_dedupe_news(
        current_file, legacy_file, tenant=tenant, tags=tags, source_name=source_name,
        scope=scope, region=region,
    )
    existing_ids = {
        d.get("news_id")
        for d in repo.collection.find({"news_id": {"$regex": r"^news_\d+$"}}, {"news_id": 1})
        if d.get("news_id")
    }
    max_id = 0
    for n in existing_ids:
        max_id = max(max_id, int(str(n).split("_")[-1]))

    now = datetime.now(timezone.utc)
    for item in deduped:
        existing = repo.get_by_source_url(item["source_url"])
        if existing and existing.get("news_id"):
            news_id = existing["news_id"]
        else:
            max_id += 1
            news_id = f"news_{max_id:06d}"
        payload = {
            **item,
            "news_id": news_id,
            "created_at": existing.get("created_at", now) if existing else now,
            "updated_at": now,
        }
        _, created = repo.upsert_by_source_url(item["source_url"], payload)
        if created:
            stats.inserted += 1
        else:
            stats.updated += 1

    return stats
