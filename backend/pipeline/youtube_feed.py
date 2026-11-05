"""What a YouTube channel has published, cheaply enough to ask every few minutes.

Every channel publishes an Atom feed of its newest uploads at
`/feeds/videos.xml?channel_id=UC…`. It is public, needs no API key, has no
quota, and answers in well under a second. That is what makes it usable as a
poll.

yt-dlp answers the same question, but it costs seconds and a far heavier
request per channel, and asking it every few minutes is how an IP earns a rate
limit — the one thing this whole pipeline cannot afford, because the transcript
endpoint blocks by IP and there is no way to ask it to stop.

So the division is: this module decides *whether* there is work, and yt-dlp is
only woken once the answer is yes. The feed carries about the fifteen newest
uploads, newest first, and nothing else worth having — no transcript, no usable
description. It is a doorbell, not a source.
"""
from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

_FEED_URL = "https://www.youtube.com/feeds/videos.xml"
_TIMEOUT = 25.0

_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}

# The channel page is HTML meant for a browser, and YouTube serves a different,
# emptier document to something that does not look like one.
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
)

# The id is in the page as "externalId":"UC…". "channelId" appears too, but on a
# video page it can name the *uploader* of an embedded video rather than the
# channel being viewed, so externalId is tried first.
_ID_PATTERNS = (
    re.compile(r'"externalId"\s*:\s*"(UC[\w-]{22})"'),
    re.compile(r'"channelId"\s*:\s*"(UC[\w-]{22})"'),
    re.compile(r'<meta\s+itemprop="identifier"\s+content="(UC[\w-]{22})"'),
)

_HANDLE_RE = re.compile(r"youtube\.com/@([^/?#]+)")
_CHANNEL_ID_RE = re.compile(r"youtube\.com/channel/(UC[\w-]{22})")


class FeedUnavailable(RuntimeError):
    """The feed could not be read. Nearly always transient — treat as 'unknown'."""


@dataclass(frozen=True)
class Upload:
    video_id: str
    title: str
    published: datetime
    url: str

    def age_days(self, *, now: datetime | None = None) -> float:
        return ((now or datetime.now(UTC)) - self.published).total_seconds() / 86400


def channel_id_from_url(url: str) -> str | None:
    """The UC id when the URL already carries one, without touching the network."""
    found = _CHANNEL_ID_RE.search(url or "")
    return found.group(1) if found else None


def resolve_channel_id(url_or_handle: str, *, client: httpx.Client | None = None) -> str:
    """
    Turn a channel URL or @handle into the UC id the feed requires.

    The feed endpoint accepts only the UC id — the `user=` form was retired and
    handles were never supported — so this hop is unavoidable. It is also the
    one expensive call here, which is why callers are expected to cache it;
    a channel's id never changes, even when its handle does.
    """
    direct = channel_id_from_url(url_or_handle)
    if direct:
        return direct

    handle = _HANDLE_RE.search(url_or_handle or "")
    if handle:
        page_url = f"https://www.youtube.com/@{handle.group(1)}"
    elif url_or_handle.startswith("@"):
        page_url = f"https://www.youtube.com/{url_or_handle}"
    elif url_or_handle.startswith("http"):
        page_url = url_or_handle
    else:
        page_url = f"https://www.youtube.com/@{url_or_handle}"

    owns_client = client is None
    client = client or httpx.Client(timeout=_TIMEOUT, follow_redirects=True)
    try:
        response = client.get(page_url, headers={"User-Agent": _BROWSER_UA})
    except httpx.HTTPError as exc:
        raise FeedUnavailable(f"could not open {page_url}: {exc}") from exc
    finally:
        if owns_client:
            client.close()

    if response.status_code >= 400:
        raise FeedUnavailable(f"{page_url} returned {response.status_code}")

    for pattern in _ID_PATTERNS:
        found = pattern.search(response.text)
        if found:
            return found.group(1)
    raise FeedUnavailable(f"no channel id found in {page_url}")


def recent_uploads(channel_id: str, *, client: httpx.Client | None = None) -> list[Upload]:
    """
    The channel's newest uploads, newest first.

    Around fifteen entries, which is the whole feed — there is no paging and no
    way to ask for more. That is ample for a poll running every few minutes and
    is the reason this is not a backfill tool: a channel that posted twenty
    videos while the watcher was down has already pushed the oldest of them off
    the feed, and those are the pipeline's own dated window to pick up.
    """
    owns_client = client is None
    client = client or httpx.Client(timeout=_TIMEOUT)
    response = None
    last_error = None
    try:
        # YouTube's public Atom endpoint has been returning intermittent 404,
        # 500, and transport errors for valid channel ids. Retry once after a
        # short pause so one transient edge/cache error does not skip the
        # whole channel for this polling round.
        for attempt in range(2):
            try:
                response = client.get(
                    _FEED_URL,
                    params={"channel_id": channel_id},
                    headers={"User-Agent": _BROWSER_UA},
                )
                last_error = None
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt == 1:
                    raise FeedUnavailable(f"feed for {channel_id}: {exc}") from exc
                time.sleep(1.0)
                continue
            if response.status_code < 400 or attempt == 1:
                break
            time.sleep(1.0)
    finally:
        if owns_client:
            client.close()

    if response is None or response.status_code >= 400:
        status = response.status_code if response is not None else (last_error or "no response")
        raise FeedUnavailable(f"feed for {channel_id} returned {status}")

    try:
        root = ET.fromstring(response.content)
    except ET.ParseError as exc:
        raise FeedUnavailable(f"feed for {channel_id} is not valid XML: {exc}") from exc

    uploads: list[Upload] = []
    for entry in root.findall("atom:entry", _NS):
        video_id = entry.findtext("yt:videoId", namespaces=_NS)
        published = entry.findtext("atom:published", namespaces=_NS)
        if not video_id or not published:
            continue
        try:
            when = datetime.fromisoformat(published)
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=UTC)
        uploads.append(
            Upload(
                video_id=video_id,
                title=(entry.findtext("atom:title", namespaces=_NS) or "").strip(),
                published=when.astimezone(UTC),
                url=f"https://www.youtube.com/watch?v={video_id}",
            )
        )
    return uploads


def feed_sources(channel_config_payload: dict) -> list[str]:
    """
    The YouTube channels behind one pipeline channel config.

    Usually one. Samajwadi is two: its videos and its streams live on separate
    YouTube channels, so watching only the first would miss every stream.
    """
    urls = [str(u).strip() for u in (channel_config_payload.get("channel_urls") or []) if str(u).strip()]
    if not urls:
        single = str(channel_config_payload.get("channel_url") or "").strip()
        urls = [single] if single else []

    # /videos and /streams on the same channel resolve to the same id and the
    # same feed, so collapse them before paying for a lookup twice.
    seen: list[str] = []
    for url in urls:
        base = url.rstrip("/")
        for tab in ("/videos", "/streams", "/shorts", "/live", "/featured"):
            if base.endswith(tab):
                base = base[: -len(tab)]
                break
        if base not in seen:
            seen.append(base)
    return seen


def load_id_cache(path: Path) -> dict[str, str]:
    """Channel URL -> UC id, remembered across runs. Ids do not change."""
    import json

    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {str(k): str(v) for k, v in data.items() if str(v).startswith("UC")}
    except Exception:
        return {}


def save_id_cache(path: Path, cache: dict[str, str]) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
