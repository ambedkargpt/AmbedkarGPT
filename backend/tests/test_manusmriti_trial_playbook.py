"""The curated playbook is data the generator trusts, so its claims about where patterns came from must hold.

    pytest backend/tests/test_manusmriti_trial_playbook.py
"""

import json

import pytest

from backend.trials.manusmriti_critique import book, config, generate, taxonomy, verify

PLAYBOOK = json.loads(config.PLAYBOOK_JSON.read_text(encoding="utf-8"))
VIDEOS = {p.stem for p in config.PER_VIDEO_DIR.glob("*.json")}
# The analyses quote third-party transcripts, so they are not committed (analysis/.gitignore): a fresh
# checkout has none, and the two tests that compare the playbook with them then have nothing to compare.
needs_analyses = pytest.mark.skipif(not VIDEOS, reason="the per-video analyses are not on this machine (see the README)")


def every_seen_in():
    for key in ("findings", "objections_to_anticipate", "do_not_copy"):
        for item in PLAYBOOK[key]:
            yield key, item["seen_in"]
    for structure in PLAYBOOK["x_posts"]["structures"]:
        yield "structures", structure["seen_in"]
    for hook in PLAYBOOK["x_posts"]["hooks"]:
        yield "hooks", hook["from"]


@needs_analyses
def test_every_video_the_playbook_credits_was_actually_analysed():
    unknown = {(key, v) for key, ids in every_seen_in() for v in ids if v not in VIDEOS}
    assert unknown == set()


@needs_analyses
def test_the_playbook_is_built_from_every_analysis_on_file():
    credited = {v for _, ids in every_seen_in() for v in ids}
    assert VIDEOS - credited == set(), "an analysis exists that the playbook never draws on"


def test_every_structure_has_what_the_generator_reads():
    for s in PLAYBOOK["x_posts"]["structures"]:
        assert {"id", "name", "use_when", "steps", "seen_in"} <= set(s) and len(s["steps"]) >= 3, s["id"]
    ids = [s["id"] for s in PLAYBOOK["x_posts"]["structures"]]
    assert len(ids) == len(set(ids))
    assert set(verify.PATTERN_MIN_VERSES) <= set(ids), "a pattern the verifier knows is missing from the playbook"


def test_the_methods_listed_as_needing_outside_facts_are_real_methods():
    for item in PLAYBOOK["needs_approved_context"]:
        assert item["method"] in taxonomy.METHODS or item["method"].startswith("new:"), item["method"]


def test_the_generator_puts_every_structure_in_the_prompt():
    merged, version = generate.load_playbook()
    prompt = generate.system_prompt(merged, "single", 280)
    for s in PLAYBOOK["x_posts"]["structures"]:
        assert f"- {s['id']} (" in prompt
    assert version != "built-in"


def test_no_stale_counts_are_written_into_the_curated_text():
    text = json.dumps(PLAYBOOK)
    assert "of the eight" not in text and "123 of" not in text


@pytest.mark.skipif(not book.VERSES_FILE.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_every_example_post_in_the_playbook_passes_the_verifier_against_the_real_book():
    real = book.load_verses()
    for example in PLAYBOOK["x_posts"]["example_posts"]:
        issues = verify.verify_post(example, real)
        assert verify.passes(issues), (example["text"], [str(i) for i in issues])
