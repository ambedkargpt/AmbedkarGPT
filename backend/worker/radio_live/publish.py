"""Put a mixed bulletin on air: the audio, then the manifest the player reads.

Order matters. The MP3 goes up first under a content-addressed key, then the
dated manifest, then `latest.json` - the one file the player fetches - last,
so a listener never gets a manifest whose audio is not there yet.

The manifest carries `starts_at`, the moment it was published. The player
counts the broadcast from there, so a rebuild for a new story is heard from
its top - intro, headlines, then that story - instead of joining the new file
wherever the time since midnight happens to fall.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
from datetime import datetime

LONG_CACHE = "public, max-age=31536000, immutable"
SHORT_CACHE = "public, max-age=60"


def segments_from_rows(rows: list[dict], total: float) -> list[dict]:
    """The build's rundown rows, as the player's segments: intro, headlines,
    each story (from its link line), breaks, the recap and the outro."""
    seg: list[dict] = []

    def add(kind, title, start, text="", **kw):
        seg.append({"kind": kind, "title": title, "start_sec": round(start, 2), "end_sec": None,
                    "story_id": kw.get("story_id"), "tenant": kw.get("tenant"),
                    "story_type": None, "text": text})

    intro = next(r for r in rows if r["k"] == "intro")
    add("intro", "भीम रेडियो", 0.0, intro["text"])
    first_head = next(i for i, r in enumerate(rows) if r["k"] == "headline")
    heads = [r["text"] for r in rows if r["k"] == "headline" and not r["label"].startswith("Recap")]
    add("headlines", "मुख्य खबरें", rows[first_head - 1]["t"], "\n".join(heads))

    pending_link = None
    for r in rows[first_head:]:
        if r["k"] == "link":
            pending_link = r
        elif r["k"] == "story":
            start = (pending_link or r)["t"]
            add("story", r["label"], start, r["text"], story_id=r["story_id"], tenant=r["tenant"])
            pending_link = None
        elif r["k"] == "text" and seg and seg[-1]["kind"] == "story":
            # When the narration itself starts and stops, so the transcript on
            # screen follows the voice rather than the link and the music.
            seg[-1]["text_start_sec"] = round(r["t"], 2)
            seg[-1]["text_end_sec"] = round(r["t"] + r["sec"], 2)
        elif r["k"] == "recap":
            recap = [x["text"] for x in rows if x["k"] == "headline" and x["label"].startswith("Recap")]
            add("headlines", "मुख्य खबरें, एक बार फिर", r["t"], "\n".join(recap))
        elif r["k"] == "break":
            add("break", "ब्रेक", r["t"], r["text"])
        elif r["k"] == "outro":
            add("outro", "भीम रेडियो", r["t"], r["text"])

    for i, s in enumerate(seg):
        s["end_sec"] = seg[i + 1]["start_sec"] if i + 1 < len(seg) else round(total, 2)
    bad = [s["title"] for s in seg if not s["start_sec"] < s["end_sec"]]
    if bad:
        raise ValueError(f"segments out of order: {bad[:3]}")
    return seg


def publish(storage, tenant: str, date: str, mp3: pathlib.Path, rows: list[dict],
            total: float, now: datetime, public_base: str) -> dict:
    digest = hashlib.sha256(mp3.read_bytes()).hexdigest()[:10]
    key = f"{tenant}/{date}-{digest}.mp3"
    manifest = {
        "version": 1, "tenant": tenant, "date": date, "lang": "hi",
        "title": f"भीम रेडियो - देश-दुनिया - {date}",
        "generated_at": now.isoformat(),
        # Where the loop starts: the player plays from here, not from midnight.
        "starts_at": now.isoformat(),
        "duration_sec": round(total, 2),
        "audio_key": key,
        "audio_url": f"{public_base.rstrip('/')}/{key}" if public_base else key,
        "segments": segments_from_rows(rows, total),
    }
    body = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    storage.put_file(mp3, key, "audio/mpeg", LONG_CACHE)
    storage.put_bytes(body, f"{tenant}/{date}.json", "application/json; charset=utf-8", SHORT_CACHE)
    storage.put_bytes(body, f"{tenant}/latest.json", "application/json; charset=utf-8", SHORT_CACHE)
    return manifest
