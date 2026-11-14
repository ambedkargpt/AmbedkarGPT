"""
The INC topic flow: a new video becomes one card per topic (Prompt 1), and
Generate post writes from that card's lines and next narrative frame (Prompt 2).
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import mongomock
import pytest
from bson import ObjectId

from backend.pipeline import inc_topics as it
from backend.services import inc_topic_posts as itp

BACKEND = Path(it.__file__).resolve().parents[1]
PROMPTS = BACKEND / "prompts"

TRANSCRIPT = (
    "आज 700 छात्र गिरफ्तार हुए। 11 मेट्रो स्टेशन बंद कर दिए गए।\n"
    "सरकार डर गई है।\n"
    "दूसरी बात किसानों की है। धान का दाम नहीं मिला।"
)


class _Client:
    """Answers every chat call with the next canned reply, and keeps the calls."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        content = self.replies.pop(0)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


# ── Prompt 1 ─────────────────────────────────────────────────────────────────

def test_the_transcript_is_cut_into_numbered_sentences():
    lines = it.number_lines(TRANSCRIPT)
    assert lines == ["आज 700 छात्र गिरफ्तार हुए।", "11 मेट्रो स्टेशन बंद कर दिए गए।", "सरकार डर गई है।",
                     "दूसरी बात किसानों की है।", "धान का दाम नहीं मिला।"]
    assert it.numbered_text(lines).splitlines()[1] == "[2] 11 मेट्रो स्टेशन बंद कर दिए गए।"
    assert it.number_lines(TRANSCRIPT, max_chars=30) == ["आज 700 छात्र गिरफ्तार हुए।"]


def test_line_numbers_and_ranges_expand_inside_the_transcript():
    assert it.expand_refs([3, "1-2", "2", "[5]", "9", "x", "4–4"], 5) == [1, 2, 3, 4, 5]
    assert it.expand_refs("2-1", 5) == [1, 2]


def test_topics_take_their_lines_verbatim_and_drop_incomplete_ones():
    lines = it.number_lines(TRANSCRIPT)
    raw = "```json\n" + json.dumps({"topics": [
        {"JSON_1": "राजधानी को जेल बनाया", "JSON_2": "८० शब्द", "JSON_3": ["1-3"], "JSON_4": ["डर की सरकार", "युवा"]},
        {"JSON_1": "किसान", "JSON_2": "...", "JSON_3": [], "JSON_4": ["x"]},          # no lines
        {"JSON_1": "बिना फ्रेम", "JSON_2": "...", "JSON_3": [4], "JSON_4": []},       # no frames
        {"JSON_1": "राजधानी को जेल बनाया", "JSON_2": "दोबारा", "JSON_3": [1], "JSON_4": ["y"]},  # repeat title
    ]}, ensure_ascii=False) + "\n```"
    topics = it.parse_topics(raw, lines)
    assert len(topics) == 1
    assert topics[0]["lines"] == lines[:3] and topics[0]["frames"] == ["डर की सरकार", "युवा"]
    assert it.parse_topics("not json", lines) == []


def test_each_topic_becomes_a_row_with_its_flow():
    reply = json.dumps({"topics": [
        {"JSON_1": "राजधानी को जेल बनाया", "JSON_2": "सामग्री एक", "JSON_3": [1, 2], "JSON_4": ["a", "b"]},
        {"JSON_1": "धान का दाम कहाँ", "JSON_2": "सामग्री दो", "JSON_3": ["4-5"], "JSON_4": ["c"]},
    ]}, ensure_ascii=False)
    client = _Client(reply)
    settings = SimpleNamespace(prompts_dir=PROMPTS,
                               deepseek_model="deepseek-chat")
    rows = it.build_topic_rows(settings, [{"title": "PC", "url": "https://youtu.be/abc", "transcript": TRANSCRIPT,
                                           "upload_date": "20261113", "source_tab": "streams"}], client=client)
    assert [r["video_link"] for r in rows] == ["https://youtu.be/abc#topic-1", "https://youtu.be/abc#topic-2"]
    assert rows[0]["headline"] == "राजधानी को जेल बनाया" and rows[0]["summary_text"] == "सामग्री एक"
    assert rows[1]["topic_flow"] == {"version": "inc_topics_v1", "transcript_lines": ["दूसरी बात किसानों की है।", "धान का दाम नहीं मिला।"],
                                     "narrative_frames": ["c"]}
    assert rows[0]["upload_date"] == "20261113" and rows[0]["source_tab"] == "streams"
    # Sir's Prompt 1 is the system message; the numbered transcript is the user message.
    sent = client.calls[0]["messages"]
    assert sent[0]["content"].startswith("Role:You are an Expert Political Communication Strategist")
    assert "[3] सरकार डर गई है।" in sent[1]["content"]


def test_a_failing_video_is_skipped_not_fatal():
    class Broken:
        chat = SimpleNamespace(completions=SimpleNamespace(create=lambda **k: (_ for _ in ()).throw(TimeoutError())))

    settings = SimpleNamespace(prompts_dir=PROMPTS,
                               deepseek_model="m")
    assert it.build_topic_rows(settings, [{"title": "t", "url": "u", "transcript": TRANSCRIPT}], client=Broken()) == []


def test_the_congress_channels_use_the_topic_flow_and_others_do_not():
    from backend.pipeline.orchestration.channel_config import load_channel_config

    for name in ("congress", "congress_mp", "congress_up"):
        assert load_channel_config(BACKEND, name).news_mode == "topics"
    for path in (BACKEND / "config" / "channels").glob("*.json"):
        if not path.stem.startswith("congress"):
            assert load_channel_config(BACKEND, path.stem).news_mode != "topics", path.stem


def test_the_flow_reaches_mongo_and_lists_leave_its_lines_behind():
    from backend.repositories.news_repo import LIST_PROJECTION, NewsRepository
    from backend.services.news_migration import _normalize_item
    from backend.services.news_service import NewsService

    item = {"video_link": "https://youtu.be/abc#topic-1", "headline": "शीर्षक", "summary_text": "सार",
            "upload_date": "20261113", "topic_flow": {"version": "inc_topics_v1", "transcript_lines": ["l"], "narrative_frames": ["f"]}}
    doc = _normalize_item(item, "current", tenant_id=1, tenant_slug="congress")
    assert doc["topic_flow"]["narrative_frames"] == ["f"]
    assert "topic_flow" not in _normalize_item({**item, "topic_flow": None}, "current")

    repo = NewsRepository.__new__(NewsRepository)
    repo.collection = mongomock.MongoClient().db["news"]
    saved, _ = repo.upsert_by_source_url(doc["source_url"], {**doc, "news_id": "news_000001"})
    assert saved["topic_flow"]["transcript_lines"] == ["l"]
    listed = repo.collection.find_one({}, LIST_PROJECTION)
    assert listed["topic_flow"] == {"version": "inc_topics_v1"}

    svc = NewsService.__new__(NewsService)
    assert svc._to_response(listed).post_flow == "inc_topics_v1"
    assert svc._to_response({**listed, "topic_flow": None}).post_flow is None


# ── Prompt 2 ─────────────────────────────────────────────────────────────────

def test_frames_are_taken_in_order_and_loop_back_to_the_first():
    frames = ["a", "b", "c"]
    assert [itp.frame_for(frames, n) for n in range(5)] == [(0, "a"), (1, "b"), (2, "c"), (0, "a"), (1, "b")]


@pytest.mark.parametrize("raw, tag", [
    ("#ज्ञानेशकुमार_इस्तीफा_दो", "#ज्ञानेशकुमार_इस्तीफा_दो"),
    ("ज्ञानेश कुमार इस्तीफा दो।", "#ज्ञानेश_कुमार_इस्तीफा_दो"),
    ("  ## वोट-चोरी ", "#वोट_चोरी"),
    ("", ""),
])
def test_the_last_line_is_one_hashtag(raw, tag):
    assert itp.clean_hashtag(raw) == tag


def test_the_answer_is_read_and_composed_into_the_post():
    raw = json.dumps({"JSON_5": {"couplet": "वोट कटा तो भूत बने,\nज़िंदा हैं हम ये कह दो।", "post": "करोड़ों वोटर भूत बना दिए गए।",
                                  "hashtag": "कटे वोटर ज़िंदा हैं"}}, ensure_ascii=False)
    parts = itp.parse_answer(raw)
    assert parts["hashtag"] == "#कटे_वोटर_ज़िंदा_हैं"
    assert itp.compose(parts) == "वोट कटा तो भूत बने,\nज़िंदा हैं हम ये कह दो।\n\nकरोड़ों वोटर भूत बना दिए गए।\n\n#कटे_वोटर_ज़िंदा_हैं"
    assert itp.compose(parts, ["#a", "#b"]).endswith("\n\n#a #b")
    assert itp.compose(parts, []).endswith("बना दिए गए।")
    assert itp.parse_answer(json.dumps({"couplet": "x", "post": ""})) is None
    assert itp.parse_answer("nope") is None


def test_only_the_lines_and_the_frame_go_to_the_model():
    client = _Client(json.dumps({"JSON_5": {"couplet": "c", "post": "p", "hashtag": "h"}}))
    out = itp.write_post(client=client, model="deepseek-chat", prompts_dir=PROMPTS,
                         lines=["पंक्ति एक"], frame="फ्रेम दो")
    assert out == {"couplet": "c", "post": "p", "hashtag": "#h"}
    system, user = client.calls[0]["messages"]
    assert "search" not in system["content"].lower()
    assert json.loads(user["content"].split("\n", 1)[1]) == {"JSON_3": ["पंक्ति एक"], "JSON_4": "फ्रेम दो"}


# ── The post service ─────────────────────────────────────────────────────────

USER = "64b000000000000000000001"


def _service(monkeypatch, *replies, written=0, test_account=False):
    from backend.repositories.posts_repo import PostsRepository
    from backend.services import posts_service as ps

    svc = ps.PostsService.__new__(ps.PostsService)
    svc.repo = PostsRepository.__new__(PostsRepository)
    svc.repo.collection = mongomock.MongoClient().db["posts"]
    for _ in range(written):
        svc.repo.collection.insert_one({"user_id": ObjectId(USER), "news_id": NEWS_ID, "origin": "generate"})
    svc._is_test_account = lambda user_id: test_account
    svc._check_guest_limit = lambda user_id: None
    client = _Client(*replies)
    monkeypatch.setattr(ps, "OpenAI", lambda **kw: client)
    return svc, client


NEWS_ID = ObjectId()
NEWS_DOC = {"_id": NEWS_ID, "tenant_slug": "congress",
            "topic_flow": {"version": "inc_topics_v1", "transcript_lines": ["पंक्ति"], "narrative_frames": ["पहला", "दूसरा"]}}
ANSWER = json.dumps({"JSON_5": {"couplet": "दोहा", "post": "पोस्ट", "hashtag": "#टैग"}}, ensure_ascii=False)


def test_generate_writes_from_the_next_frame_and_saves_the_parts(monkeypatch):
    svc, client = _service(monkeypatch, ANSWER, written=1)
    out = svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="WhatsApp")
    assert out.post.content == "दोहा\n\nपोस्ट\n\n#टैग" and out.post.hashtags == ["#टैग"]
    meta = out.post.generation_meta
    assert meta["narrative_frame"] == {"index": 2, "of": 2, "text": "दूसरा"}
    assert meta["profile_used"] == {"target_platform": "WhatsApp"}
    assert out.retrieval_snapshot_id.startswith("rs_")
    assert '"JSON_4": "दूसरा"' in client.calls[0]["messages"][1]["content"]
    saved = svc.repo.collection.find_one({"story_slot": 2})
    assert saved["origin"] == "generate"


def test_after_the_last_frame_it_starts_again(monkeypatch):
    svc, client = _service(monkeypatch, ANSWER, written=2)
    out = svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="")
    assert out.post.generation_meta["narrative_frame"]["index"] == 1


def test_the_story_limit_still_applies(monkeypatch):
    from fastapi import HTTPException

    svc, _ = _service(monkeypatch, ANSWER, written=5)
    with pytest.raises(HTTPException) as caught:
        svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="")
    assert caught.value.detail["error"] == "story_limit"


def test_a_bad_answer_is_retried_once_then_refused(monkeypatch):
    from fastapi import HTTPException

    svc, client = _service(monkeypatch, "garbage", ANSWER)
    assert svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="").post.content
    svc, client = _service(monkeypatch, "garbage", "still garbage")
    with pytest.raises(HTTPException) as caught:
        svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="")
    assert caught.value.status_code == 502


def test_editing_the_hashtags_rewrites_the_last_line(monkeypatch):
    from backend.schemas.posts import PostUpdateRequest

    svc, _ = _service(monkeypatch, ANSWER)
    post = svc._generate_topic_post(user_id=USER, news_id=str(NEWS_ID), news_doc=NEWS_DOC, platform="").post
    svc.repo.get_by_id = lambda pid: svc.repo.collection.find_one({"_id": ObjectId(pid)})
    svc.repo.update = lambda pid, updates: (svc.repo.collection.update_one({"_id": ObjectId(pid)}, {"$set": updates}),
                                             svc.repo.collection.find_one({"_id": ObjectId(pid)}))[1]
    out = svc.update(post.id, PostUpdateRequest(hashtags=["#टैग", "कांग्रेस", "#टैग", "#INC"]), current_user_id=USER)
    assert out.hashtags == ["#टैग", "#कांग्रेस", "#INC"]
    assert out.content == "दोहा\n\nपोस्ट\n\n#टैग #कांग्रेस #INC"
    out = svc.update(post.id, PostUpdateRequest(hashtags=[]), current_user_id=USER)
    assert out.content == "दोहा\n\nपोस्ट"
