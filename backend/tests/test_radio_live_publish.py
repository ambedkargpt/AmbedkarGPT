"""The rolling bulletin's manifest: what the player reads to know where it is."""
from datetime import datetime, timezone

import pytest

from backend.worker.radio_live.publish import publish, segments_from_rows


def _rows():
    # The build's rundown, in the order it plays.
    return [
        {"k": "theme", "label": "Theme music", "text": "", "t": 0.0, "sec": 5.0},
        {"k": "intro", "label": "Anchor intro", "text": "नमस्कार", "t": 5.0, "sec": 10.0},
        {"k": "hl_intro", "label": "Headlines", "text": "सबसे पहले", "t": 15.0, "sec": 3.0},
        {"k": "headline", "label": "Headline 1", "text": "नई खबर", "t": 18.0, "sec": 4.0},
        {"k": "headline", "label": "Headline 2", "text": "पुरानी खबर", "t": 22.0, "sec": 4.0},
        {"k": "story", "label": "नई खबर", "text": "पूरी नई खबर", "story_id": "s1", "tenant": "bjp",
         "t": 30.0, "sec": 2.0},
        {"k": "text", "label": "text", "text": "", "t": 32.0, "sec": 50.0},
        {"k": "link", "label": "Link", "text": "अब आगे", "t": 85.0, "sec": 2.0},
        {"k": "story", "label": "पुरानी खबर", "text": "पूरी पुरानी खबर", "story_id": "s2",
         "tenant": "congress", "t": 87.0, "sec": 2.0},
        {"k": "text", "label": "text", "text": "", "t": 89.0, "sec": 50.0},
        {"k": "recap", "label": "Headlines dobara", "text": "एक बार फिर", "t": 140.0, "sec": 3.0},
        {"k": "headline", "label": "Recap 1", "text": "नई खबर", "t": 143.0, "sec": 4.0},
        {"k": "outro", "label": "Outro", "text": "जय भीम", "t": 150.0, "sec": 10.0},
    ]


def test_segments_follow_the_rundown():
    seg = segments_from_rows(_rows(), 160.0)
    assert [s["kind"] for s in seg] == ["intro", "headlines", "story", "story", "headlines", "outro"]
    first, second = seg[2], seg[3]
    # The newest story leads, and its words are timed separately from its music.
    assert first["story_id"] == "s1" and first["text_start_sec"] == 32.0
    # A story begins at the link that leads into it.
    assert second["start_sec"] == 85.0
    # The opening headlines do not include the recap's repeat of them.
    assert seg[1]["text"] == "नई खबर\nपुरानी खबर"
    assert seg[-1]["end_sec"] == 160.0
    assert all(a["end_sec"] == b["start_sec"] for a, b in zip(seg, seg[1:]))


class _Storage:
    def __init__(self):
        self.calls = []

    def put_file(self, path, key, content_type, cache_control):
        self.calls.append((key, cache_control))

    def put_bytes(self, data, key, content_type, cache_control):
        self.calls.append((key, cache_control))


def test_audio_goes_up_before_the_manifest_and_latest_last(tmp_path):
    mp3 = tmp_path / "bulletin.mp3"
    mp3.write_bytes(b"ID3fake")
    storage = _Storage()
    now = datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)
    manifest = publish(storage, "general", "2026-10-20", mp3, _rows(), 160.0, now,
                       "https://cdn.example")
    keys = [k for k, _ in storage.calls]
    assert keys[0].endswith(".mp3") and keys[-1] == "general/latest.json"
    assert storage.calls[0][1].endswith("immutable") and storage.calls[-1][1] == "public, max-age=60"
    # The player counts the broadcast from the moment it went on air.
    assert manifest["starts_at"] == now.isoformat()
    assert manifest["audio_url"] == f"https://cdn.example/{manifest['audio_key']}"


def test_rows_out_of_order_are_refused():
    rows = _rows()
    rows[7]["t"] = 10.0   # the second story (from its link) timed before the first
    with pytest.raises(ValueError):
        segments_from_rows(rows, 160.0)
