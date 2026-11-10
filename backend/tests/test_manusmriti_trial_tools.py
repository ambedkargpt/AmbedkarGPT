"""The Manusmriti-critique trial's analysis tooling: the validator must catch anything the speaker never said.

Uses a tiny made-up transcript, so nothing here depends on the real YouTube transcripts.

    pytest backend/tests/test_manusmriti_trial_tools.py
"""

import copy
import json
import unicodedata

import pytest

from backend.trials.manusmriti_critique import config, taxonomy
from backend.trials.manusmriti_critique.tools import aggregate
from backend.trials.manusmriti_critique.tools.validate_analysis import normalise, validate

TRANSCRIPT = "यह एक परीक्षा है। अगर सच जरूरी है तो बात करो। जय इंसानियत।"
GOOD_QUOTE = "अगर सच जरूरी है तो बात करो।"


def minimal_analysis(video_id="testvid"):
    return {
        "schema_version": 1, "video_id": video_id, "language": "hi", "duration": "00:30", "genre": "short monologue",
        "speaker_persona": "narrator", "stance_on_manusmriti": "critical",
        "relevance": {"score": 3, "why": "test"}, "audience_addressed": "viewers", "one_line_thesis": "test",
        "structure": [{"beat": "hook", "start": "00:01", "end": "00:05", "summary": "s", "quote": GOOD_QUOTE} for _ in range(3)],
        "hook": {"type": "t", "verbatim": GOOD_QUOTE, "why_it_works": "w"},
        "closing": {"type": "t", "verbatim": "जय इंसानियत।", "cta": "c"},
        "methods": [{"method": "verse_citation", "description": "d", "strength": "high",
                     "examples": [{"time": "00:01", "quote": GOOD_QUOTE}]} for _ in range(3)],
        "contexts": [{"context": "legal_penal", "how_used": "h"}],
        "evidence": [{"time": "00:01", "reference_as_spoken": "8.270", "claim_made": "c", "quote": GOOD_QUOTE,
                      "kind": "verse", "needs_verification_against_text": True}],
        "authorities_cited": [], "rhetorical_devices": [{"device": "d", "example": GOOD_QUOTE, "time": "00:01", "effect": "e"}],
        "counterarguments": [], "tone": {"register": "r"}, "persuasion_strengths": ["p"], "weaknesses_or_risks": ["w"],
        "reusable_template": ["a", "b", "c", "d"], "best_quotes_for_style": [], "do_not_imitate": ["x"],
    }


@pytest.fixture
def run(tmp_path):
    (tmp_path / "testvid.txt").write_text(TRANSCRIPT, encoding="utf-8")

    def check(analysis):
        path = tmp_path / "testvid.json"
        path.write_text(json.dumps(analysis, ensure_ascii=False), encoding="utf-8")
        return validate(path, tmp_path)

    return check


def test_a_correct_analysis_passes(run):
    errors, warnings, checked = run(minimal_analysis())
    assert errors == [] and checked > 0


def test_a_quote_the_speaker_never_said_is_rejected(run):
    bad = minimal_analysis()
    bad["hook"]["verbatim"] = "यह वाक्य वीडियो में कभी नहीं बोला गया।"
    errors, _, _ = run(bad)
    assert any("not found in the transcript" in e and "hook" in e for e in errors)


def test_a_quote_buried_in_a_list_is_checked_too(run):
    bad = minimal_analysis()
    bad["methods"][1]["examples"][0]["quote"] = "मनगढ़ंत पंक्ति जो कहीं नहीं है"
    errors, _, _ = run(bad)
    assert any("methods[1]" in e for e in errors)


def test_two_pieces_of_one_sentence_may_be_joined_with_an_ellipsis(run):
    ok = minimal_analysis()
    ok["hook"]["verbatim"] = "यह एक परीक्षा है… जय इंसानियत।"
    errors, _, _ = run(ok)
    assert errors == []


def test_spacing_punctuation_and_unicode_form_do_not_matter(run):
    ok = minimal_analysis()
    # the same words, spaced and punctuated differently, with the letters in another Unicode form
    ok["hook"]["verbatim"] = unicodedata.normalize("NFD", "अगर  सच जरूरी है, तो बात करो")
    errors, _, _ = run(ok)
    assert errors == []


def test_an_unknown_method_must_be_marked_new(run):
    bad = minimal_analysis()
    bad["methods"][0]["method"] = "made_up_method"
    assert any("not in the taxonomy" in e for e in run(bad)[0])
    ok = copy.deepcopy(bad)
    ok["methods"][0]["method"] = "new:made_up_method"
    assert run(ok)[0] == []


def test_bad_times_and_missing_fields_are_errors(run):
    bad = minimal_analysis()
    bad["structure"][0]["start"] = "about a minute in"
    assert any("must look like" in e for e in run(bad)[0])
    missing = minimal_analysis()
    del missing["tone"]
    assert any("missing required field 'tone'" in e for e in run(missing)[0])


def test_a_character_offset_time_is_accepted(run):
    ok = minimal_analysis()
    ok["structure"][0]["start"] = "pos:1234"
    assert run(ok)[0] == []


def test_stance_and_evidence_kind_must_come_from_the_vocabulary(run):
    bad = minimal_analysis()
    bad["stance_on_manusmriti"] = "angry"
    bad["evidence"][0]["kind"] = "rumour"
    errors = run(bad)[0]
    assert any("stance_on_manusmriti" in e for e in errors) and any("evidence[0].kind" in e for e in errors)


def test_over_long_quotes_only_warn(tmp_path):
    long_text = " ".join(f"शब्द{i}" for i in range(60)) + "।"          # a transcript of 60 words
    (tmp_path / "testvid.txt").write_text(long_text, encoding="utf-8")
    analysis = minimal_analysis()
    analysis["hook"]["verbatim"] = long_text                          # a real quote, but far over 40 words
    analysis["structure"] = [{**analysis["structure"][0], "quote": "शब्द1 शब्द2"} for _ in range(3)]
    for m in analysis["methods"]:
        m["examples"] = [{"time": "00:01", "quote": "शब्द3 शब्द4"}]
    analysis["evidence"][0]["quote"] = "शब्द5 शब्द6"
    analysis["closing"]["verbatim"] = "शब्द9 शब्द10"
    analysis["rhetorical_devices"][0]["example"] = "शब्द7 शब्द8"
    path = tmp_path / "testvid.json"
    path.write_text(json.dumps(analysis, ensure_ascii=False), encoding="utf-8")
    errors, warnings, _ = validate(path, tmp_path)
    assert errors == [] and any("words" in w for w in warnings)


def test_normalise_ignores_case_spacing_and_punctuation():
    assert normalise("Hello,  World!") == normalise("hello world")
    assert normalise("जय इंसानियत।") == normalise("जय  इंसानियत")


# ── the vocabulary and the aggregation ─────────────────────────────────────────

def test_the_rubric_lists_every_method_in_the_taxonomy():
    rubric = (config.ANALYSIS_DIR / "rubric.md").read_text(encoding="utf-8")
    assert [m for m in taxonomy.METHODS if f"`{m}`" not in rubric] == []


def test_aggregate_counts_methods_per_video():
    a, b = minimal_analysis("one"), minimal_analysis("two")
    b["methods"][0]["method"] = "new:other"
    result = aggregate.aggregate([a, b])
    assert result["videos"] == 2
    assert result["methods"]["verse_citation"]["video_count"] == 2
    assert result["methods"]["new:other"]["in_taxonomy"] is False
    assert result["evidence_kinds"] == {"verse": 2}


def test_the_trial_is_off_unless_switched_on(monkeypatch):
    monkeypatch.delenv("TRIAL_MANUSMRITI_CRITIQUE", raising=False)
    assert config.trial_enabled() is False
    monkeypatch.setenv("TRIAL_MANUSMRITI_CRITIQUE", "true")
    assert config.trial_enabled() is True


# ── the real analyses, when the transcripts are on this machine ────────────────

@pytest.mark.skipif(not config.DEFAULT_TRANSCRIPTS_DIR.exists(), reason="the YouTube transcripts are not on this machine")
@pytest.mark.skipif(not any(config.PER_VIDEO_DIR.glob("*.json")), reason="the per-video analyses are not committed; rebuild them (see the README)")
def test_every_stored_analysis_validates_against_its_transcript():
    files = sorted(config.PER_VIDEO_DIR.glob("*.json"))
    problems = {}
    for path in files:
        errors, _, _ = validate(path, config.DEFAULT_TRANSCRIPTS_DIR)
        if errors:
            problems[path.name] = errors[:3]
    assert problems == {}


def test_aggregate_skips_a_file_that_is_not_valid_json_and_says_so(tmp_path, monkeypatch, capsys):
    (tmp_path / "good.json").write_text(json.dumps(minimal_analysis("good")), encoding="utf-8")
    (tmp_path / "half_written.json").write_text('{"video_id": "x", "methods": [', encoding="utf-8")
    monkeypatch.setattr(config, "PER_VIDEO_DIR", tmp_path)
    loaded = aggregate.load_all()
    assert [a["video_id"] for a in loaded] == ["good"]
    assert "half_written.json" in capsys.readouterr().err
