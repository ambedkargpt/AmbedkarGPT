"""
The environment mapping that stands between our worker and Bheem Radio.

Bheem reads `BHEEM_*`; our Batch job holds the same secrets under our own
names. The mapping is the whole of what `build_radio` does before handing over,
so it is the whole of what can go wrong here - and every way it goes wrong is
silent. A dropped Mongo field builds four empty bulletins and exits 0.
"""
from __future__ import annotations

import json

import pytest

from backend.worker import build_radio


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """No BHEEM_* or source variable leaks in from the developer's shell."""
    import os

    for name in list(os.environ):
        if name.startswith("BHEEM_") or name in {
            "MONGODB_URI", "MONGODB_DATABASE", "DEEPSEEK_API_KEY",
            "GEMINI_API_KEY", "SARVAM_API_KEY", "S3_BUCKET",
        }:
            monkeypatch.delenv(name, raising=False)


def test_our_names_are_copied_onto_theirs(monkeypatch):
    """The point of the module. Their template aliases names we do not use."""
    monkeypatch.setenv("MONGODB_URI", "mongodb+srv://example")
    monkeypatch.setenv("MONGODB_DATABASE", "ambedkargpt")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ds-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gm-key")
    monkeypatch.setenv("S3_BUCKET", "ambedkargpt-artifacts")

    build_radio.prepare_environment()

    import os
    assert os.environ["BHEEM_MONGO_URI"] == "mongodb+srv://example"
    assert os.environ["BHEEM_MONGO_DB"] == "ambedkargpt"
    assert os.environ["BHEEM_DEEPSEEK_API_KEY"] == "ds-key"
    assert os.environ["BHEEM_GEMINI_API_KEY"] == "gm-key"
    # Theirs is ARTIFACTS_BUCKET; ours has always been S3_BUCKET.
    assert os.environ["BHEEM_S3_BUCKET"] == "ambedkargpt-artifacts"


def test_an_explicit_bheem_value_is_not_overwritten(monkeypatch):
    """Overriding one setting on the job definition must stay possible."""
    monkeypatch.setenv("MONGODB_URI", "mongodb+srv://ours")
    monkeypatch.setenv("BHEEM_MONGO_URI", "mongodb+srv://theirs")

    build_radio.prepare_environment()

    import os
    assert os.environ["BHEEM_MONGO_URI"] == "mongodb+srv://theirs"


def test_the_field_mapping_is_complete(monkeypatch):
    """
    The one that would be catastrophic and quiet.

    BHEEM_MONGO_FIELDS is a pydantic dict setting, so a value from the
    environment REPLACES the default rather than merging into it. Sending only
    our one override would drop `tenant -> tenant_slug` and `id -> news_id`
    with it, every query would match nothing, and four empty bulletins would
    be built without a single error.
    """
    build_radio.prepare_environment()

    import os
    fields = json.loads(os.environ["BHEEM_MONGO_FIELDS"])

    # Everything their default carries has to still be here.
    assert fields["id"] == "news_id"
    assert fields["tenant"] == "tenant_slug"
    assert fields["title"] == "headline"
    assert fields["story_type"] == "content_type"
    assert fields["published_at"] == "published_at"
    assert fields["source_url"] == "source_url"
    assert fields["source_name"] == "source_name"
    # And the one line that is ours: we have no `body`, but `description` is a
    # second paragraph their `summary or description` fallback never reaches.
    assert fields["body"] == "description"


def test_no_status_filter_is_set(monkeypatch):
    """
    Our documents have no status field - checked against production, 0 of 1317.

    Bheem skips the filter when the list is empty. Setting it to any guess
    would match nothing, which looks exactly like a quiet news day.
    """
    build_radio.prepare_environment()

    import os
    assert "BHEEM_MONGO_LIVE_STATUSES" not in os.environ


def test_without_a_sarvam_key_it_still_has_a_voice(monkeypatch):
    """
    The Sarvam subscription is not bought yet and the build has to run anyway.

    A stock Gemini voice is worth having while the cloned one is licensed;
    refusing to build until the key exists would block the whole integration
    on someone else's purchase order.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "gm-key")

    build_radio.prepare_environment()

    import os
    assert os.environ["BHEEM_TTS_PRIMARY"].startswith("gemini:")


def test_with_a_sarvam_key_sarvam_leads_and_gemini_catches(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "sv-key")
    monkeypatch.setenv("GEMINI_API_KEY", "gm-key")

    build_radio.prepare_environment()

    import os
    assert os.environ["BHEEM_TTS_PRIMARY"].startswith("sarvam:")
    assert os.environ["BHEEM_TTS_FALLBACK"].startswith("gemini:")


def test_the_fact_checker_is_not_the_writer(monkeypatch):
    """
    A model asked to check its own work shares its own blind spots. Bheem's
    whole fact-check step is worth nothing if both ends are the same model.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "gm-key")

    build_radio.prepare_environment()

    import os
    writer = os.environ["BHEEM_LLM_SCRIPT_WRITER"].split(":")[0]
    checker = os.environ["BHEEM_LLM_FACT_CHECKER"].split(":")[0]
    assert writer != checker, "the fact-checker must be a different provider"


def test_the_stream_is_written_under_radio(monkeypatch):
    """The prefix the player and the CloudFront origin path both assume."""
    build_radio.prepare_environment()

    import os
    assert os.environ["BHEEM_STORAGE_BACKEND"] == "s3"
    assert os.environ["BHEEM_DAILY_S3_PREFIX"] == "radio/"


# ── the anchor's voice ──────────────────────────────────────────────────────

def test_the_voice_mapping_is_sent_whole(monkeypatch):
    """
    A dict setting read from the environment REPLACES pydantic's default; it
    does not merge. Sending only {"sarvam": ...} would leave every other
    provider without a speaker, so a day when Sarvam is down would fail at the
    fallback instead of quietly carrying on - which is the whole point of
    having one.
    """
    import json

    from backend.worker import build_radio

    voices = json.loads(build_radio.DEFAULTS["BHEEM_TTS_VOICES"])

    assert voices["sarvam"] == {"hi": "ritu", "en": "ritu"}
    # The fallback provider must still have a voice of its own.
    assert voices["gemini"]["hi"], "the Gemini fallback lost its speaker"
    assert set(voices) >= {"sarvam", "gemini", "openai", "minimax", "fake"}


def test_sarvam_speaker_names_are_lowercase():
    """Sarvam's catalogue is case-sensitive; "Shreya" is a 4xx, not a voice."""
    import json

    from backend.worker import build_radio

    for lang, name in json.loads(build_radio.DEFAULTS["BHEEM_TTS_VOICES"])["sarvam"].items():
        assert name == name.lower(), f"{lang}: {name!r} must be lowercase"


def test_expressiveness_stays_inside_what_the_api_accepts():
    """
    Bheem Radio's config documents the range as 0.01-2.0. The live API answers
    400 to anything above 1.0 - measured, not read. A value over the cap would
    fail every bulletin at the first narration, so it is pinned here rather
    than discovered in a build.
    """
    from backend.worker import build_radio

    temperature = float(build_radio.DEFAULTS["BHEEM_SARVAM_TEMPERATURE"])
    assert 0.01 <= temperature <= 1.0, "Sarvam rejects expressiveness above 1.0"


# ── the bulletin's shape ────────────────────────────────────────────────────

def test_every_default_names_a_real_setting(monkeypatch):
    """
    pydantic-settings ignores an environment variable it does not recognise, so
    a misspelled name is silent: the build runs, the setting keeps its default,
    and nothing says why the bulletin is the wrong length. BHEEM_LOOKBACK_DAYS
    was exactly that typo - the field is daily_lookback_days.

    Checked against the real Settings model when it is installed, and skipped
    where it is not, because bheem_radio only lives in the radio image.
    """
    import pytest

    from backend.worker import build_radio

    Settings = pytest.importorskip("bheem_radio.config").Settings

    known = {f"BHEEM_{name.upper()}" for name in Settings.model_fields}
    ours = {k for k in build_radio.DEFAULTS if k.startswith("BHEEM_")}

    unknown = sorted(ours - known)
    assert not unknown, f"not settings on bheem_radio.Settings: {unknown}"


def test_the_bulletin_covers_one_day_of_every_party():
    """
    The shape the station was asked for: an hour, every party, dealt in turns.

    An hour comes from the number of stories, never from longer scripts. A
    story carries about 133 words of source against a 140-word target, so
    writing to the ~220 words an hour would otherwise need means inventing the
    difference - on a broadcast that loops all day. Two days of stories at
    their honest length gets there instead.
    """
    from backend.worker import build_radio

    assert build_radio.DEFAULTS["BHEEM_DAILY_LOOKBACK_DAYS"] == "2"
    pool = build_radio.DEFAULTS["RADIO_POOL"].split(",")
    assert set(pool) == {"congress", "bjp", "samajwadi", "general"}


def test_stories_are_dealt_in_turns_not_in_blocks():
    """
    One from each party in turn, so a short cap takes from everyone. Blocks
    would have put all of Congress first and cut BJP off the end.
    """
    from backend.worker import build_radio

    class Story:
        def __init__(self, sid, tenant):
            self.id, self.tenant = sid, tenant

    class Inner:
        def stories(self, tenant, start, end):
            counts = {"congress": 3, "bjp": 2, "samajwadi": 1, "general": 2}
            return [Story(f"{tenant}-{i}", tenant) for i in range(counts.get(tenant, 0))]

    source = build_radio.RoundRobinSource(Inner(), ["congress", "bjp", "samajwadi", "general"])
    dealt = [s.tenant for s in source.stories("congress", None, None)]

    # First round is one of each, in the configured order.
    assert dealt[:4] == ["congress", "bjp", "samajwadi", "general"]
    # Nothing is lost when a party runs out mid-deal.
    assert len(dealt) == 8
    assert dealt.count("congress") == 3 and dealt.count("samajwadi") == 1


def test_a_story_tagged_for_two_parties_plays_once():
    """A story can carry more than one tenant; hearing it twice is a bug."""
    from backend.worker import build_radio

    class Story:
        def __init__(self, sid, tenant):
            self.id, self.tenant = sid, tenant

    class Inner:
        def stories(self, tenant, start, end):
            return [Story("shared", tenant), Story(f"{tenant}-own", tenant)]

    source = build_radio.RoundRobinSource(Inner(), ["congress", "bjp"])
    ids = [s.id for s in source.stories("congress", None, None)]

    assert ids.count("shared") == 1
    assert sorted(ids) == ["bjp-own", "congress-own", "shared"]


# ── what keeps wrong news off the air ───────────────────────────────────────

def test_the_fact_checker_is_never_off():
    """
    A post can be corrected after it is published. A bulletin is read aloud and
    then plays on a loop all day. The checker is on by default upstream, which
    is exactly why it is pinned here: a default can change when the pinned
    commit moves, and nothing would say so.
    """
    from backend.worker import build_radio

    assert build_radio.DEFAULTS["BHEEM_DAILY_FACT_CHECK"] == "1"


def test_the_checker_is_a_different_model_from_the_writer(monkeypatch):
    """
    A model checking its own work shares its own blind spots: it will not see
    the number it just invented. The whole value of the check is that a second
    model, trained differently, reads the script against the source.
    """
    import os

    from backend.worker import build_radio

    for name in ("SARVAM_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "MONGODB_URI"):
        monkeypatch.setenv(name, "x")
    for name in list(os.environ):
        if name.startswith("BHEEM_"):
            monkeypatch.delenv(name, raising=False)

    build_radio.prepare_environment()

    writer = os.environ["BHEEM_LLM_SCRIPT_WRITER"]
    checker = os.environ["BHEEM_LLM_FACT_CHECKER"]

    assert writer and checker
    assert writer.split(":")[0] != checker.split(":")[0], (
        f"writer and checker are both {writer.split(':')[0]}; the check is worth "
        "nothing when one model marks its own work"
    )


def test_a_quiet_day_stretches_and_a_busy_one_tightens():
    """
    The bulletin aims at a length, not at a story count: with few stories each
    one runs longer, with many each runs shorter. Before this the count was
    capped and the length was whatever fell out, so a thin news day produced a
    half-length bulletin and nothing adjusted.
    """
    from backend.worker.build_radio import _story_words

    quiet = _story_words(40, 80)
    busy = _story_words(140, 80)

    assert quiet > busy, "a quiet day has to give each story more room"


def test_the_length_never_exceeds_what_a_story_can_support():
    """
    The guard that matters, and the reason a quiet day produces a SHORT
    bulletin rather than a padded one.

    A story's source carries about 133 words - headline 15, summary 88,
    description 30. Stretching past that is an instruction to invent the
    difference, on something read aloud as news that then loops all day. So
    however empty the day, the ceiling holds.
    """
    from backend.worker.build_radio import MAX_WORDS, _story_words

    SOURCE_WORDS = 133
    assert MAX_WORDS < SOURCE_WORDS, "the ceiling is above what the source carries"

    for stories in (1, 5, 20, 60):
        assert _story_words(stories, 80) <= MAX_WORDS
    assert _story_words(0, 80) <= MAX_WORDS      # no stories at all must not divide by zero


def test_a_very_busy_day_does_not_reduce_stories_to_headlines():
    """The floor: 300 stories should not turn each into a single sentence."""
    from backend.worker.build_radio import MIN_WORDS, _story_words

    assert _story_words(300, 80) >= MIN_WORDS


def test_the_target_is_a_duration_and_the_cap_is_only_a_guard():
    """
    The cap used to set the length; it is now a runaway guard, well above any
    real day. If it is ever brought back down near the real story count it
    becomes the length control again, silently.
    """
    from backend.worker import build_radio

    assert float(build_radio.DEFAULTS["RADIO_TARGET_MINUTES"]) > 0
    assert int(build_radio.DEFAULTS["BHEEM_DAILY_MAX_STORIES"]) >= 300

def test_the_prompt_still_refuses_padding():
    """The ceiling is lower now; the refusal still has to be in the prompt."""
    from backend.worker import build_radio

    replacement = " ".join(build_radio._LENGTH_LINE_TO.split())
    assert "ceiling, never a quota" in replacement
    for forbidden in ("repeating a point", "background the source does not state",
                      "Inventing a number"):
        assert forbidden in replacement, f"the padding refusal lost: {forbidden!r}"

def test_the_prompt_patch_fails_loudly_when_upstream_moves(tmp_path, monkeypatch):
    """
    The override rewrites one line of their prompt. If they reword it, a silent
    no-op would leave the bulletin at their length with nothing to say why - so
    it raises instead.
    """
    import pytest

    from backend.worker import build_radio

    (tmp_path / "script_writer.md").write_text("nothing like the line", encoding="utf-8")
    monkeypatch.setenv("BHEEM_PROMPTS_DIR", str(tmp_path))
    # Our own writer goes over theirs and carries the same line, so point the
    # override at an empty folder to test the guard against their wording.
    empty = tmp_path / "ours"
    empty.mkdir()
    monkeypatch.setattr(build_radio, "RADIO_PROMPTS", empty)

    with pytest.raises(RuntimeError, match="no longer contains"):
        build_radio._write_prompts(190)


# ── the cloned station voice ────────────────────────────────────────────────

def test_the_clone_is_off_unless_asked_for(monkeypatch):
    """
    A cloned voice costs twelve minutes of rate-limited waiting on a full
    bulletin and takes no expressiveness setting, so it is never the default.
    """
    import os

    from backend.worker import build_radio

    for name in ("SARVAM_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "MONGODB_URI"):
        monkeypatch.setenv(name, "x")
    for name in list(os.environ):
        if name.startswith(("BHEEM_", "RADIO_")):
            monkeypatch.delenv(name, raising=False)

    build_radio.prepare_environment()
    assert "BHEEM_STATION_VOICE" not in os.environ


def test_the_registry_entry_is_usable_today():
    """
    bheem_radio refuses a voice with no consent on record, a passed expiry or a
    revocation - quietly falling back to the stock voice and logging it. A
    registry that cannot be used would mean the demo runs in the wrong voice
    with only a log line to say why.
    """
    import json
    import pathlib

    registry = json.loads(
        (pathlib.Path("backend/worker/radio_voices/registry.json")).read_text(encoding="utf-8")
    )
    entry = next(v for v in registry["voices"] if v["name"] == "station")

    assert entry["consents"], "no consent on record; the voice would be refused"
    assert not entry["revoked"]
    assert entry["provider_voices"]["sarvam"].startswith("svc-"), (
        "the dispatch is on the svc- prefix; anything else is read as a stock speaker"
    )


def test_a_story_costs_more_than_its_words():
    """
    Every story carries a connective and a music bed whatever its length, so
    airtime is a line and not a ratio: seconds = overhead + rate x words.

    The first model was a single ratio, aimed at 80 minutes with 104 stories,
    and landed at 73.5 - because 104 stories spend around 24 minutes on
    furniture alone, which a ratio cannot see.
    """
    from backend.worker.build_radio import _story_seconds, _story_words

    assert _story_seconds(0) > 10, "a story with no words still costs airtime"

    # Both measured builds, reproduced within a second.
    assert abs(_story_seconds(70) - 37.4) < 1.0
    assert abs(_story_seconds(86) - 42.8) < 1.0

    # And the round trip: ask for 80 minutes, get 80 minutes.
    for stories in (104, 120, 131):
        words = _story_words(stories, 80)
        assert abs(stories * _story_seconds(words) / 60 - 80) < 6


def test_the_written_prompts_are_handed_to_the_builder(tmp_path, monkeypatch):
    """
    Settings reads BHEEM_PROMPTS_DIR once, when it is constructed. The story
    length is only known after that - it depends on how many stories the day
    has - so the new prompt directory has to be put on the settings object,
    not left in the environment.

    Missing this was silent in the worst way: the prompt was written, nothing
    read it, the build used Bheem Radio's own 140-word default, and every
    story came back from cache looking like a successful run.
    """
    from backend.worker import build_radio

    source = tmp_path / "prompts"
    source.mkdir()
    (source / "script_writer.md").write_text(build_radio._LENGTH_LINE_FROM, encoding="utf-8")
    monkeypatch.setenv("BHEEM_PROMPTS_DIR", str(source))

    written = build_radio._write_prompts(96)

    assert written is not None, "the caller cannot point settings at nothing"
    assert written != source, "it must be a copy, not an edit of their directory"
    assert "96 words" in (written / "script_writer.md").read_text(encoding="utf-8")


def test_the_reader_goes_out_as_herself():
    """
    Asked for on 11 October 2026: Ritu as she reads, not as we had been
    treating her.

    The three settings that together made her sound worked on. "energetic"
    runs the voice through rubberband at pitch 0.94 and tempo 1.07 and
    compresses it hard; pace 1.22 quickened it again on top of that, and
    expressiveness sat on the API's ceiling. Each is defensible for a news
    bulletin and all three at once stopped sounding like the voice that was
    picked.

    Pinned as a set because changing any one of them back alone would take
    her most of the way there and look like it had been done.
    """
    from backend.worker import build_radio

    assert build_radio.DEFAULTS["BHEEM_VOICE_PRESET"] == "clean"
    assert float(build_radio.DEFAULTS["BHEEM_SARVAM_PACE"]) == 1.0
    assert float(build_radio.DEFAULTS["BHEEM_SARVAM_TEMPERATURE"]) == 0.9
