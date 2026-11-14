"""The Manusmriti section in Hindi: the translations, their checks, and how the API serves them.

    pytest backend/tests/test_manusmriti_trial_hindi.py
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.trials.manusmriti_critique import api, config
from backend.trials.manusmriti_critique.tools import translate_hi as th

POST = {"id": "p1", "topic": "t", "headline": "The same insult, at a different price",
        "says": "A Kshatriya is fined one hundred panas (8.267); a Brahmana twelve (8.268).",
        "critique": "The wrong is the same.", "fair_note": "", "parts": ["Same insult. Different price. (Manusmriti 8.268) 12 panas."],
        "verses": ["8.267"]}
VERSE = {"text": "A Kshatriya, having defamed a Brahmana, shall be fined one hundred (panas).", "chapter": 8, "verse": 267}
HI = {"headline": "वही अपमान, अलग कीमत", "says": "क्षत्रिय पर 100 पण (8.267); ब्राह्मण पर 12 (8.268)।",
      "critique": "अपराध वही है।", "parts": ["वही अपमान। अलग कीमत। (मनुस्मृति 8.268) 12 पण।"]}


def hindi_file(post=POST, verse=VERSE):
    return {"posts": {"p1": {"source": th.fingerprint(th.post_source(post)), **HI}},
            "verses": {"8.267": {"source": th.fingerprint(verse["text"]), "text": "क्षत्रिय पर 100 (पण) का जुर्माना।"}}}


# ── the checks a translation must pass ─────────────────────────────────────

def test_a_faithful_translation_passes():
    assert th.check_post(th.post_source(POST), HI) == []


@pytest.mark.parametrize("change, problem", [
    ({"says": "क्षत्रिय पर जुर्माना।"}, "numbers or verses lost: 8.267"),
    ({"parts": ["एक", "दो"]}, "2 parts for 1"),
    ({"parts": ["अ" * 281 + " 8.268 12"]}, "over 280"),
    ({"critique": ""}, "critique missing"),
    ({"headline": "The same insult", "says": "Fined 100 (8.267), 12 (8.268).", "critique": "Same.", "parts": ["Same 8.268 12"]}, "not Hindi"),
])
def test_an_unfaithful_translation_is_caught(change, problem):
    assert any(problem in p for p in th.check_post(th.post_source(POST), {**HI, **change}))


def test_a_verse_that_drops_its_number_is_caught():
    assert th.check_verses({"8.267": "fined 100 panas"}, {"8.267": "जुर्माना लगे।"}) == ["8.267 unfaithful"]
    assert th.check_verses({"8.267": "fined 100 panas"}, {"8.267": "100 पण का जुर्माना।"}) == []


# ── what the API serves ─────────────────────────────────────────────────────

def test_hindi_is_laid_over_the_english_it_was_made_from():
    out = api.with_hindi({"posts": [POST], "verses": {"8.267": VERSE}}, hindi_file())
    assert out["posts"][0]["hi"]["headline"] == "वही अपमान, अलग कीमत"
    assert out["posts"][0]["headline"] == POST["headline"]                     # the English stays
    assert out["verses"]["8.267"]["text_hi"].startswith("क्षत्रिय")


def test_a_post_changed_since_its_translation_stays_english():
    edited = {**POST, "critique": "A new critique."}
    out = api.with_hindi({"posts": [edited], "verses": {"8.267": {**VERSE, "text": "changed"}}}, hindi_file())
    assert "hi" not in out["posts"][0]
    assert "text_hi" not in out["verses"]["8.267"]


def test_the_endpoint_serves_both_and_rereads_the_hindi_when_it_changes(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "PUBLISHED_DIR", tmp_path)
    monkeypatch.setattr(api, "_cache", {"stamp": None, "data": api.EMPTY})
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    c = TestClient(app)
    (tmp_path / "posts.json").write_text(json.dumps({"posts": [POST], "verses": {"8.267": VERSE}}), encoding="utf-8")
    assert "hi" not in c.get("/api/v1/manusmriti/posts").json()["posts"][0]       # no Hindi file yet: English
    (tmp_path / "posts_hi.json").write_text(json.dumps(hindi_file(), ensure_ascii=False), encoding="utf-8")
    assert c.get("/api/v1/manusmriti/posts").json()["posts"][0]["hi"]["parts"] == HI["parts"]


# ── the committed files ─────────────────────────────────────────────────────

def test_every_published_post_and_verse_has_its_hindi():
    """Fails after a republish until tools/translate_hi.py is run, so the section is never half in English."""
    data = json.loads((config.PUBLISHED_DIR / "posts.json").read_text(encoding="utf-8"))
    hindi = json.loads((config.PUBLISHED_DIR / "posts_hi.json").read_text(encoding="utf-8"))
    out = api.with_hindi(data, hindi)
    missing = [p["id"] for p in out["posts"] if "hi" not in p] + [v for v, x in out["verses"].items() if "text_hi" not in x]
    assert not missing, f"run tools/translate_hi.py: no current Hindi for {missing}"
    for post in out["posts"]:
        assert th.check_post(th.post_source(post), post["hi"]) == [], post["id"]
