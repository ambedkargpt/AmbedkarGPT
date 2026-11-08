"""
Stories carry a level of politics - national, state or city - and the news
listing filters by it.

Everything published before scopes existed came from the parties' central
channels, so a story with no scope must still read as national; otherwise the
whole existing feed would vanish from the National section the day this ships.
"""
from __future__ import annotations

import json
from pathlib import Path


def test_national_includes_stories_from_before_scopes():
    from backend.repositories.news_repo import _scope_clause

    clause = _scope_clause("national")
    assert {"scope": {"$exists": False}} in clause["$or"]
    assert {"scope": "national"} in clause["$or"]


def test_state_is_only_state():
    from backend.repositories.news_repo import _scope_clause

    assert _scope_clause("state") == {"scope": "state"}


def test_publish_stamps_the_channels_scope(tmp_path: Path):
    from backend.services.news_migration import load_and_dedupe_news
    from backend.tenants import get_tenant

    current = tmp_path / "news.json"
    current.write_text(json.dumps({"items": [{
        "video_link": "https://www.youtube.com/watch?v=abc123def45",
        "headline": "Bhopal rally", "summary_text": "A rally in Bhopal.",
    }]}), encoding="utf-8")

    items, _ = load_and_dedupe_news(
        current, tmp_path / "legacy.json", tenant=get_tenant("congress"),
        scope="state", region="Madhya Pradesh",
    )
    assert items[0]["scope"] == "state"
    assert items[0]["region"] == "Madhya Pradesh"
    assert items[0]["tenant_slug"] == "congress"


def test_the_state_channels_load_as_state_and_never_own_a_party_index():
    from backend.pipeline.multi_rag import _tenant_to_channel
    from backend.pipeline.orchestration import load_channel_config

    backend = Path(__file__).resolve().parents[1]
    for name, tenant, region in (
        ("congress_mp", "congress", "Madhya Pradesh"), ("bjp_mp", "bjp", "Madhya Pradesh"),
        ("congress_up", "congress", "Uttar Pradesh"), ("bjp_up", "bjp", "Uttar Pradesh"),
    ):
        channel = load_channel_config(backend, name)
        assert (channel.scope, channel.region, channel.tenant_slug) == ("state", region, tenant)
        assert not channel.rebuild_rag

    mapping = _tenant_to_channel()
    assert mapping["congress"] == "congress"
    assert mapping["bjp"] == "bjp"


def test_the_post_prompt_is_told_the_level():
    from backend.services.posts_service import PostsService

    svc = PostsService.__new__(PostsService)
    article = svc._news_doc_to_article({"headline": "h", "scope": "state", "region": "Madhya Pradesh"})
    assert (article["scope"], article["region"]) == ("state", "Madhya Pradesh")
    assert svc._news_doc_to_article({"headline": "h"})["scope"] == "national"
