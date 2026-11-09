"""The Manusmriti section's API, and the file it serves.

The published file is checked here against the verse texts it carries itself, so these tests need neither the
PDF nor a model and run on a fresh checkout.

    pytest backend/tests/test_manusmriti_trial_api.py
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.trials.manusmriti_critique import api, config, verify, xformat
from backend.trials.manusmriti_critique.book import Verse
from backend.trials.manusmriti_critique.tools import publish_posts

POSTS_FILE = config.PUBLISHED_DIR / "posts.json"
PICKS_FILE = config.PUBLISHED_DIR / "picks.json"

VERSE_TEXT = "A once-born man (a Sudra), who insults a twice-born man with gross invective, shall have his tongue cut out; for he is of low origin."
VERSES = {"8.270": Verse("8.270", 8, 270, 1, VERSE_TEXT)}
TOPIC = {"id": "punishment", "title": "Punishment by caste", "title_hi": "जाति के आधार पर दंड", "blurb": "Penalties set by caste.", "blurb_hi": "जाति से तय दंड।"}
GOOD_PICK = {"topic": "punishment", "parts": ['A Sudra insults a twice-born man.\n\nManusmriti 8.270: "shall have his tongue cut out".'],
             "headline": "A tongue for an insult",
             "says": "A Sudra who insults a twice-born man with gross invective “shall have his tongue cut out”.",
             "critique": "The verse gives its own reason, “for he is of low origin”: the penalty rests on who he is, not on what he did.",
             "verses": ["8.270"], "pattern": "scene_hook", "reviewed": True}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "PUBLISHED_DIR", tmp_path)
    monkeypatch.setattr(api, "_cache", {"stamp": None, "data": api.EMPTY})
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    return TestClient(app), tmp_path


def write(folder, document):
    (folder / "posts.json").write_text(json.dumps(document), encoding="utf-8")


# ── the route is a trial: off unless switched on ───────────────────────────────

def test_the_route_answers_not_found_while_the_trial_is_off(client, monkeypatch):
    c, folder = client
    write(folder, {"posts": [1]})
    monkeypatch.delenv("TRIAL_MANUSMRITI_CRITIQUE", raising=False)
    assert c.get("/api/v1/manusmriti/posts").status_code == 404


def test_the_route_serves_the_published_file_when_it_is_on(client, monkeypatch):
    c, folder = client
    document = {"version": 1, "translation": None, "topics": [], "posts": [{"id": "a1"}], "verses": {}}
    write(folder, document)
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    answer = c.get("/api/v1/manusmriti/posts")
    assert answer.status_code == 200 and answer.json() == document
    assert "max-age" in answer.headers["cache-control"]


def test_a_missing_file_is_an_empty_section_not_an_error(client, monkeypatch):
    c, _ = client
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    answer = c.get("/api/v1/manusmriti/posts")
    assert answer.status_code == 200 and answer.json()["posts"] == []


def test_the_file_is_read_again_when_it_changes(client, monkeypatch):
    c, folder = client
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    write(folder, {"posts": ["old"]})
    assert c.get("/api/v1/manusmriti/posts").json()["posts"] == ["old"]
    write(folder, {"posts": ["new", "newer"]})
    import os
    os.utime(folder / "posts.json", ns=(1, 2_000_000_000_000_000_000))        # a different modification time, whatever the clock's grain
    assert c.get("/api/v1/manusmriti/posts").json()["posts"] == ["new", "newer"]


def test_there_is_nothing_to_ask_or_write(client, monkeypatch):
    c, _ = client
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    methods = {m for route in api.router.routes for m in route.methods}
    assert methods == {"GET"}                                                  # no question box, no stored input


# ── the builder refuses anything the verses do not support ─────────────────────

def picks(*posts, topics=(TOPIC,)):
    return {"translation": None, "topics": list(topics), "posts": list(posts)}


def test_a_faithful_pick_is_published_with_the_text_of_its_verse():
    document, problems = publish_posts.build(picks(GOOD_PICK), VERSES)
    assert problems == []
    assert document["posts"][0]["verses"] == ["8.270"] and document["verses"]["8.270"]["text"] == VERSE_TEXT
    assert document["topics"][0]["count"] == 1


def test_a_pick_with_an_invented_quotation_stops_the_build():
    bad = {**GOOD_PICK, "parts": ['Manusmriti 8.270: "shall be tortured and killed".']}
    _, problems = publish_posts.build(picks(bad), VERSES)
    assert any("invented_quote" in p for p in problems)


def test_a_pick_over_the_x_limit_or_with_an_unknown_topic_or_a_duplicate_is_a_problem():
    _, problems = publish_posts.build(picks({**GOOD_PICK, "parts": [GOOD_PICK["parts"][0] + " " + "x" * 300]}), VERSES)
    assert any("length" in p for p in problems)
    _, problems = publish_posts.build(picks({**GOOD_PICK, "topic": "nope"}), VERSES)
    assert any("unknown topic" in p for p in problems)
    _, problems = publish_posts.build(picks(GOOD_PICK, GOOD_PICK), VERSES)
    assert any("twice" in p for p in problems)


def test_a_topic_without_its_title_or_hindi_is_a_problem_and_an_empty_topic_is_left_out():
    _, problems = publish_posts.build(picks(GOOD_PICK, topics=({**TOPIC, "title_hi": ""},)), VERSES)
    assert any("title_hi" in p for p in problems)
    empty = {**TOPIC, "id": "empty"}
    document, _ = publish_posts.build(picks(GOOD_PICK, topics=(TOPIC, empty)), VERSES)
    assert [t["id"] for t in document["topics"]] == ["punishment"]


def test_only_reviewed_leaves_out_what_nobody_has_read():
    unread = {**GOOD_PICK, "reviewed": False}
    assert publish_posts.build(picks(unread), VERSES)[0]["posts"][0]["reviewed"] is False
    assert publish_posts.build(picks(unread), VERSES, only_reviewed=True)[0]["posts"] == []


def card_problems(**changes):
    return publish_posts.build(picks({**GOOD_PICK, **changes}), VERSES)[1]


def test_a_card_must_have_a_headline_an_explanation_and_a_critique():
    for key in ("headline", "says", "critique"):
        assert any(f"missing {key}" in p for p in card_problems(**{key: ""})), key
    assert card_problems(fair_note="") == []                                   # the note is optional


def test_the_cards_own_words_are_held_to_the_verses_too():
    assert any("invented_quote" in p for p in card_problems(critique="The verse says “must be put to the sword” and nothing else."))
    assert any("unsupported_number" in p for p in card_problems(critique="The fine of five hundred panas is far too high."))
    assert any("strong_word" in p for p in card_problems(says="A Sudra who insults is tortured."))
    assert any("outside_fact" in p for p in card_problems(critique="As Ambedkar argued, this is unjust."))
    assert any("blocked" in p or "collective_statement" in p for p in card_problems(critique="All Brahmanas wrote this for themselves."))


def test_a_claim_about_practice_in_a_card_stops_the_build_though_it_is_only_a_warning_in_a_post():
    assert any("practice_claim" in p for p in card_problems(critique="The rule was enforced for centuries and is unjust."))


def test_a_card_too_long_to_read_is_a_problem():
    assert any("critique is" in p and "over 950" in p for p in card_problems(critique="x " * 600))
    assert any("headline is" in p and "over 90" in p for p in card_problems(headline="h" * 120))


def test_the_card_may_quote_or_name_only_verses_it_cites():
    assert any("undeclared_reference" in p for p in card_problems(critique="Compare 8.999, which is cited nowhere."))
    assert card_problems(critique="Compare 8.270 itself: it names the reason.") == []


def test_a_verse_cited_twice_is_published_once_and_a_note_comes_through_as_a_note():
    document, problems = publish_posts.build(picks({**GOOD_PICK, "verses": ["8.270", "8.270"], "fair_note": "The verse names the offence."}), VERSES)
    assert problems == [] and document["posts"][0]["verses"] == ["8.270"]
    assert document["posts"][0]["fair_note"] == "The verse names the offence."
    assert publish_posts.build(picks(GOOD_PICK), VERSES)[0]["posts"][0]["fair_note"] is None


def test_a_post_id_stays_the_same_while_the_text_does():
    assert publish_posts.post_id(["a", "b"]) == publish_posts.post_id(["a", "b"]) != publish_posts.post_id(["a", "c"])


# ── the file that is committed ─────────────────────────────────────────────────

@pytest.mark.skipif(not POSTS_FILE.exists(), reason="posts.json has not been built yet")
def test_every_published_post_is_provable_from_the_verse_text_the_file_carries():
    document = json.loads(POSTS_FILE.read_text(encoding="utf-8"))
    verses = {k: Verse(k, v["chapter"], v["verse"], 1, v["text"]) for k, v in document["verses"].items()}
    topics = {t["id"] for t in document["topics"]}
    ids = [p["id"] for p in document["posts"]]
    assert document["posts"] and len(ids) == len(set(ids))
    for post in document["posts"]:
        assert post["topic"] in topics and post["verses"] and all(v in verses for v in post["verses"])
        check = {"text": "\n\n".join(post["parts"]), "parts": post["parts"] if len(post["parts"]) > 1 else [],
                 "verses": post["verses"], "quotes": [], "pattern": post.get("pattern") or "plain_rule"}
        issues = verify.errors(verify.verify_post(check, verses))
        assert issues == [], (post["parts"], [str(i) for i in issues])
        assert all(xformat.fits(part) for part in post["parts"])


@pytest.mark.skipif(not POSTS_FILE.exists(), reason="posts.json has not been built yet")
def test_every_published_card_has_its_commentary_and_that_is_provable_from_its_verses_too():
    document = json.loads(POSTS_FILE.read_text(encoding="utf-8"))
    verses = {k: Verse(k, v["chapter"], v["verse"], 1, v["text"]) for k, v in document["verses"].items()}
    for post in document["posts"]:
        for key, limit in publish_posts.LIMITS.items():
            assert len(post.get(key) or "") <= limit, (post["id"], key)
        assert all(str(post.get(k) or "").strip() for k in publish_posts.REQUIRED_TEXT), post["id"]
        text = "\n".join(str(post.get(k) or "") for k in ("headline", "says", "critique", "fair_note"))
        issues = [i for i in verify.verify_commentary(text, post["verses"], verses) if i.level in ("error", "warning")]
        assert issues == [], (post["headline"], [str(i) for i in issues])
        assert len(post["verses"]) == len(set(post["verses"]))


@pytest.mark.skipif(not POSTS_FILE.exists(), reason="posts.json has not been built yet")
def test_every_topic_has_both_languages_and_a_post_and_the_counts_are_right():
    document = json.loads(POSTS_FILE.read_text(encoding="utf-8"))
    for t in document["topics"]:
        assert all(str(t.get(k) or "").strip() for k in ("title", "title_hi", "blurb", "blurb_hi")), t["id"]
        assert t["count"] == sum(p["topic"] == t["id"] for p in document["posts"]) >= 1


@pytest.mark.skipif(not (POSTS_FILE.exists() and PICKS_FILE.exists()), reason="nothing built yet")
def test_posts_json_is_what_the_picks_build_into():
    picks_doc = json.loads(PICKS_FILE.read_text(encoding="utf-8"))
    published = json.loads(POSTS_FILE.read_text(encoding="utf-8"))
    expected = {publish_posts.post_id([s.strip() for s in p["parts"] if s.strip()]) for p in picks_doc["posts"]}
    assert {p["id"] for p in published["posts"]} == expected, "picks.json changed: run tools/publish_posts.py"
