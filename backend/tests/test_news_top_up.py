"""
A party's feed is never short because its channel went quiet.

Party news older than three days leaves the feed. When a party has fewer than
ten stories inside that window at one level (national, state), the listing is
topped up with that party's latest older stories, newest first. SP's channels
went five days without a video and every SP reader saw no SP news at all.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import mongomock
import pytest

from backend.repositories import news_repo as nr

NOW = datetime.now(timezone.utc)
TENANT = {"congress": 1, "samajwadi": 2, "bjp": 3, "general": 0}


@pytest.fixture
def repo():
    r = nr.NewsRepository.__new__(nr.NewsRepository)
    r.collection = mongomock.MongoClient().db["news"]
    return r


def add(repo, slug, days_ago, n=1, scope="national", **extra):
    for i in range(n):
        repo.collection.insert_one({
            "headline": f"{slug}-{scope}-{days_ago}-{i}", "tenant_slug": slug, "tenant_id": TENANT[slug],
            "scope": scope, "published_at": NOW - timedelta(days=days_ago, minutes=i), "created_at": NOW, **extra,
        })


def slugs(docs, slug):
    return [d for d in docs if d["tenant_slug"] == slug]


def test_a_quiet_party_shows_its_latest_ten_older_stories(repo):
    add(repo, "samajwadi", 5, n=12)          # all older than the window
    add(repo, "bjp", 1, n=15)                # plenty fresh
    docs = repo.list(tenant_ids=[2, 3], scope="national")
    sp = slugs(docs, "samajwadi")
    assert len(sp) == nr.MIN_PER_PARTY
    # The newest of the old ones: minute 0..9 of day 5, not 10 and 11.
    assert sorted(d["headline"] for d in sp) == sorted(f"samajwadi-national-5-{i}" for i in range(10))
    assert len(slugs(docs, "bjp")) == 15     # fresh, untouched


def test_a_short_party_is_topped_up_to_ten(repo):
    add(repo, "congress", 1, n=4)
    add(repo, "congress", 6, n=20)
    docs = repo.list(tenant_ids=[1], scope="national")
    inc = slugs(docs, "congress")
    assert len(inc) == 10
    assert sum(1 for d in inc if d["headline"].startswith("congress-national-1-")) == 4


def test_a_party_with_enough_fresh_news_gets_nothing_old(repo):
    add(repo, "bjp", 1, n=10)
    add(repo, "bjp", 9, n=5)
    docs = repo.list(tenant_ids=[3], scope="national")
    assert len(docs) == 10
    assert all("-1-" in d["headline"] for d in docs)


def test_state_and_national_are_topped_up_separately(repo):
    add(repo, "congress", 1, n=2, scope="state")
    add(repo, "congress", 7, n=20, scope="state")
    add(repo, "congress", 7, n=20, scope="national")
    state = repo.list(scope="state")
    inc = slugs(state, "congress")
    assert len(inc) == 10
    assert all(d["scope"] == "state" for d in inc)


def test_a_party_the_listing_did_not_ask_for_is_not_added(repo):
    add(repo, "samajwadi", 5, n=12)
    add(repo, "congress", 1, n=12)
    docs = repo.list(tenant_ids=[1, 3], scope="national")
    assert slugs(docs, "samajwadi") == []


def test_the_top_up_keeps_the_language_and_hidden_rules(repo):
    add(repo, "samajwadi", 5, n=3, language="en")                 # wrong language
    add(repo, "samajwadi", 5, n=3, hidden_from_ui=True)           # retired from the feed
    add(repo, "samajwadi", 6, n=2)                                # untagged: matches any language
    docs = repo.list(tenant_ids=[2], scope="national", language="hi")
    sp = slugs(docs, "samajwadi")
    assert len(sp) == 2
    assert all(d.get("language") is None and not d.get("hidden_from_ui") for d in sp)


def test_later_pages_are_not_topped_up(repo):
    add(repo, "samajwadi", 5, n=12)
    assert repo.list(tenant_ids=[2], scope="national", skip=100) == []


def test_general_news_is_not_part_of_the_window_or_the_top_up(repo):
    add(repo, "general", 40, n=3)
    docs = repo.list(scope="national")
    assert len(slugs(docs, "general")) == 3


def test_the_result_is_newest_first(repo):
    add(repo, "samajwadi", 5, n=3)
    add(repo, "bjp", 1, n=3)
    add(repo, "congress", 2, n=3)
    docs = repo.list(scope="national")
    stamps = [d["published_at"] for d in docs]
    assert stamps == sorted(stamps, reverse=True)
