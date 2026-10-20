"""
AWS Batch entry point: build one party's daily radio bulletin.

    python -m backend.worker.build_radio --tenant congress
    python -m backend.worker.build_radio --tenant congress --date 2026-10-04

Bheem Radio does the work - it reads the day's stories straight out of our own
`news` collection, has DeepSeek write them for the ear, has a second model
fact-check each script against its source, voices them, and mixes one looped
MP3 per party per day into `s3://<bucket>/radio/<tenant>/`.

This module only maps our environment onto its settings and turns the result
into an exit code Batch understands:

    0   published, or skipped because the party had no news today. A skip is
        not a failure: yesterday's bulletin stays on air, which is better than
        silence and better than a job that goes red every quiet Sunday.
    1   the build failed, so the Batch job goes FAILED and the alarm fires.

Based on `integration/ambedkargpt/build_radio.py` from the Bheem Radio repo,
with our own variable names: the names in that template are the ones it
guessed we used, and most of them are not.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

log = logging.getLogger("build_radio")


# Bheem Radio reads BHEEM_*; our worker already holds the same secrets under
# its own names, injected by the Batch job definition's `secrets` block from
# SSM. Copied across rather than duplicated in SSM under a second name, so
# there is one place to rotate a key.
#
# Their template aliases MONGO_URI and ARTIFACTS_BUCKET. We have neither: ours
# are MONGODB_URI and S3_BUCKET.
ENV_ALIASES = {
    "BHEEM_MONGO_URI": "MONGODB_URI",
    "BHEEM_MONGO_DB": "MONGODB_DATABASE",
    "BHEEM_DEEPSEEK_API_KEY": "DEEPSEEK_API_KEY",
    "BHEEM_GEMINI_API_KEY": "GEMINI_API_KEY",
    "BHEEM_SARVAM_API_KEY": "SARVAM_API_KEY",
    "BHEEM_S3_BUCKET": "S3_BUCKET",
}

# Fixed choices for this deployment. Any BHEEM_* set on the job definition
# wins, because these are only defaults.
DEFAULTS = {
    "BHEEM_STORAGE_BACKEND": "s3",
    "BHEEM_DAILY_S3_PREFIX": "radio/",
    # Same model the rest of the app writes with, so the radio sounds like
    # the product rather than like a second system. Note that deepseek-chat
    # is a retired alias (it points at V4-Flash since 24 July 2026) - the
    # whole codebase still names it, and when that is fixed project-wide
    # this line has to move with it.
    "BHEEM_LLM_SCRIPT_WRITER": "deepseek:deepseek-chat",
    "BHEEM_LLM_SCRIPT_WRITER_FALLBACK": "",
    "BHEEM_LANGUAGES": "hi",
    "BHEEM_TIMEZONE": "Asia/Kolkata",
    # Copied into the worker image by Dockerfile.worker.
    "BHEEM_ASSETS_DIR": "/opt/bheem-radio/assets",
    "BHEEM_PROMPTS_DIR": "/opt/bheem-radio/prompts",
    # Scratch space for mixing. The container disk is thrown away afterwards.
    "BHEEM_DATA_DIR": "/tmp/bheem-radio",
    # The whole mapping, not just the part we change. A dict setting read
    # from the environment REPLACES the default - pydantic does not merge -
    # so sending only the one override would drop tenant_slug and news_id
    # with it and every build would find zero stories.
    #
    # The only line that differs from their default is `body`. We have no
    # `body` field; `description` is a second, fuller paragraph that would
    # otherwise go unread, because their `summary or description` fallback
    # stops at our summary.
    "BHEEM_MONGO_FIELDS": json.dumps({
        "id": "news_id",
        "tenant": "tenant_slug",
        "status": "status",
        "title": "headline",
        "summary": "summary",
        "description": "description",
        "body": "description",          # <- ours
        "published_at": "published_at",
        "story_type": "content_type",
        "sources": "sources",
        "source_name": "source_name",
        "source_url": "source_url",
    }),
    # The anchor's voice. Whole dict again, and for the same reason as
    # BHEEM_MONGO_FIELDS above: sending only {"sarvam": ...} would drop every
    # other provider's voice, so the Gemini fallback would have no speaker and
    # a day without Sarvam would fail instead of degrading.
    #
    # The one line that differs from their default is `sarvam`: shreya rather
    # than shubh. Sarvam's speaker names are case-sensitive and lowercase.
    #
    # Pinning the rest has a cost worth naming: if Bheem Radio changes a
    # default voice upstream we keep the old one until this is edited.
    "BHEEM_TTS_VOICES": json.dumps({
        "minimax": {"hi": "English_Persuasive_Man", "en": "English_Persuasive_Man"},
        "selfhosted": {"hi": "agastya", "en": "agastya"},
        "gemini": {"hi": "Charon", "en": "Charon"},
        "sarvam": {"hi": "ritu", "en": "ritu"},         # <- ours
        "openai": {"hi": "onyx", "en": "onyx"},
        "fake": {"hi": "tone", "en": "tone"},
    }),
    # Ritu as Sarvam reads her, asked for on 11 October 2026 after a run of
    # faster and heavily processed takes.
    #
    # Pace 1.0 is her own speed: 1.22 was a TV-news quickening of ours, on top
    # of Bheem Radio's own 1.12. Expressiveness goes back to their 0.9 rather
    # than sitting on the ceiling, which was the other thing making her sound
    # worked on.
    #
    # The ceiling still matters if this is ever raised again: Bheem Radio's
    # config says the range is 0.01-2.0, and the live API answers 400 to
    # anything above 1.0 - measured, not read.
    "BHEEM_SARVAM_PACE": "1.0",
    "BHEEM_SARVAM_TEMPERATURE": "0.9",
    # One bulletin covering every party, dealt in turns - see RoundRobinSource.
    # The order is the order of the first round.
    "RADIO_POOL": "congress,bjp,samajwadi,general",

    # Two days. The hour comes from the number of stories, which is the only
    # place it can come from - see RADIO_TARGET_WORDS.
    #
    # Measured on 7 October 2026: one day is 56 stories and runs 38 minutes,
    # because a story averages 43 seconds. The station is asked for 60 minutes
    # give or take five. Writing longer scripts would have been the obvious
    # lever and the wrong one: a story carries about 133 words of source
    # (headline 15, summary 88, description 30) against a 140-word target, so
    # asking for the ~220 words an hour needs is asking the writer to invent
    # the difference. At the current length the checker already caught a script
    # reading "fourteen crore" for 140 crore.
    #
    # More stories costs nothing in truth. Two days is 131 available, the cap
    # takes the newest, and RoundRobinSource makes the cut fall evenly across
    # the parties instead of wholly on one.
    "BHEEM_DAILY_LOOKBACK_DAYS": "2",

    # Not a length control any more - the script length is, see
    # RADIO_TARGET_MINUTES. This is only a guard against a runaway day.
    "BHEEM_DAILY_MAX_STORIES": "400",
    # Not applicable here: General is dealt in turn with everyone else rather
    # than folded in afterwards, so the separate quota would cap it twice.
    "BHEEM_DAILY_MAX_GENERAL_STORIES": "400",

    # How long the whole bulletin should run, in minutes.
    #
    # The length of a story is worked out from this and from how many stories
    # the day actually has, so a quiet day stretches and a busy one tightens
    # instead of the bulletin changing length. See _story_words.
    "RADIO_TARGET_MINUTES": "80",

    # How the voice is treated before it goes out.
    #
    # "clean" is trim, a 50 Hz highpass and a loudness normalise - nothing that
    # touches how she sounds. It is what "auto" resolves to for Sarvam anyway,
    # named here so it is a decision rather than an upstream default.
    #
    # It replaced "energetic", their Hindi TV-news chain, which ran the voice
    # through rubberband at pitch 0.94 and tempo 1.07 and then compressed it
    # hard - about a semitone deeper and seven percent faster, with chest
    # warmth at 160 Hz and a presence lift at 3.5 kHz. Good treatment, and not
    # what was wanted: it no longer sounded like Ritu.
    #
    # Applied in the mixer rather than the TTS, so changing it re-mixes the
    # cached audio and costs nothing in voice. Pace and temperature above do
    # not - those are synthesis, and changing them means paying to read the
    # bulletin again.
    "BHEEM_VOICE_PRESET": "clean",

    # Never off. It is on by default upstream, but this is a broadcast: a
    # wrong number read aloud as news cannot be edited afterwards the way a
    # post can. Today's build caught a script that said "fourteen crore" where
    # the story said 140 crore, twice, and dropped another story outright.
    # Pinned here so turning it off has to be a deliberate edit with a test to
    # answer for.
    "BHEEM_DAILY_FACT_CHECK": "1",

    # BHEEM_MONGO_LIVE_STATUSES is deliberately not set. Our documents have no
    # status field, and Bheem's default of [] already means "no filter". Any
    # value here would match nothing and build four empty bulletins.
}


def _tts_defaults() -> None:
    """
    Pick the voice and the fact-checker from the keys that are actually set.

    Sarvam is the intended voice and the only one that can clone. Until that
    subscription exists the build still has to run, so it falls back to Gemini,
    whose key we already hold - a stock voice is worth having while the cloned
    one is being licensed.

    The fact-checker is deliberately a different model from the writer, so it
    does not share the writer's blind spots about what it just made up.
    """
    if os.environ.get("BHEEM_SARVAM_API_KEY"):
        os.environ.setdefault("BHEEM_TTS_PRIMARY", "sarvam:bulbul:v3")
        os.environ.setdefault("BHEEM_TTS_FALLBACK", "gemini:gemini-3.8-flash-lite-tts")
    else:
        log.warning("No Sarvam key: voicing with Gemini and a stock voice.")
        os.environ.setdefault("BHEEM_TTS_PRIMARY", "gemini:gemini-3.8-flash-lite-tts")
        os.environ.setdefault("BHEEM_TTS_FALLBACK", "")

    if os.environ.get("BHEEM_GEMINI_API_KEY"):
        os.environ.setdefault("BHEEM_LLM_FACT_CHECKER", "gemini:gemini-3.1-flash-lite")
        os.environ.setdefault("BHEEM_LLM_FACT_CHECKER_FALLBACK", "deepseek:deepseek-chat")
    else:
        os.environ.setdefault("BHEEM_LLM_FACT_CHECKER", "deepseek:deepseek-chat")
        os.environ.setdefault("BHEEM_LLM_FACT_CHECKER_FALLBACK", "")


class RoundRobinSource:
    """
    Every party's news in one bulletin, taken in turns.

    Bheem Radio builds one stream per tenant and `select_stories` concatenates
    whole tenant blocks, so a combined bulletin would have run all of Congress,
    then all of BJP, and whatever the length cap cut would have fallen entirely
    on whoever came last. On a day with 58 Congress and 65 BJP stories that is
    not an ordering problem, it is one party missing.

    So this stands in front of their Mongo source and answers the one stream we
    build with a deal: one story from each party in turn, skipping the ones
    that have run out, until everything is dealt. Each party's own stories stay
    newest-first within its own turn, and a short cap now takes proportionally
    from everyone rather than wholly from the last.

    It is a wrapper rather than an edit to their selection, so moving the
    pinned Bheem Radio commit does not have to be re-done afterwards.
    """

    def __init__(self, inner, order: list[str]) -> None:
        self._inner = inner
        self._order = order

    def stories(self, tenant: str, start, end):
        # Only the stream we actually build is combined. Anything else is
        # passed through, so building one party's own stream still works.
        if tenant not in self._order:
            return self._inner.stories(tenant, start, end)

        queues = []
        for member in self._order:
            found = self._inner.stories(member, start, end)
            if found:
                queues.append(list(found))
            log.info("pool %s: %d stories", member, len(found))

        dealt, seen = [], set()
        while queues:
            for queue in list(queues):
                story = queue.pop(0)
                # A story tagged for two tenants would otherwise play twice.
                if story.id not in seen:
                    seen.add(story.id)
                    dealt.append(story)
                if not queue:
                    queues.remove(queue)
        log.info("combined bulletin: %d stories, dealt in turns", len(dealt))
        return dealt


# The one line of Bheem Radio's writer prompt we override, and what we put in
# its place.
#
# Their TARGET_WORDS is hard-coded in Python (hi: 140), not a setting, and the
# prompt substitutes it as $target_words. So the prompt directory is copied at
# startup and this line rewritten - a copy rather than a fork, so moving the
# pinned commit keeps every other instruction theirs.
_LENGTH_LINE_FROM = """- `script`: the full story, about $target_words words (roughly $target_seconds seconds
  on air). Start with the most important fact; end on a clear closing line, not a
  question."""

# The ceiling is raised and a floor is refused in the same breath. A bulletin
# is read aloud and loops all day, so the one thing worse than a short story is
# a padded one: the words that fill the gap are the words nobody checked.
_LENGTH_LINE_TO = """- `script`: the full story, up to {words} words (roughly {seconds} seconds on
  air). Start with the most important fact; end on a clear closing line, not a
  question.
- Length is a ceiling, never a quota. Use every fact the source gives you and
  stop there. A story whose source supports sixty words is a sixty-word story.
  Do NOT reach the word count by repeating a point in other words, by adding
  background the source does not state, by describing what something "means"
  or "signals", or by naming a reaction nobody is quoted giving. Inventing a
  number, a date, a quote or a consequence to fill the line is the worst
  failure available to you: this is read on air as news."""


# The spoken furniture of the bulletin: what the anchor says before, between
# and after the stories. Bheem Radio keeps these in prompts/daily_<lang>.json
# and invites editing, so these are ours.
#
# Merged into their file, never written over it: it also holds day_words,
# months and the tenant names that turn a date into speech. Replacing the file
# would leave the anchor unable to say what day it is.
# Our own editorial material lives beside this file, as files rather than
# strings in code, so the editorial side can read and change it without
# touching Python:
#
#   radio_prompts/script_writer.md    replaces theirs: the editorial line, names
#                                     in headlines, and the hard rules
#   radio_prompts/fact_checker.md     replaces theirs: allows slant, not untruth
#   radio_prompts/anchor_lines_hi.json  merged over their daily_hi.json: intro,
#                                     the links between stories (ads included)
#                                     and the sign-off
#   radio_assets/music/*.wav          dropped over their music of the same name
#
# See radio_prompts/README.md for what each one says and why.
RADIO_PROMPTS = pathlib.Path(__file__).resolve().parent / "radio_prompts"
RADIO_ASSETS = pathlib.Path(__file__).resolve().parent / "radio_assets"


# What a story costs on air, as a straight line through two measured builds:
# 70 words gave 37.4-second stories, 86 words gave 42.8.
#
#     seconds = STORY_OVERHEAD_SEC + SECONDS_PER_WORD x words
#
# The intercept is the part a single ratio cannot see. Every story carries a
# connective and a music bed whatever its length, so a bulletin of many short
# stories spends far more on furniture than one of few long ones. Modelled as
# a ratio, the first attempt aimed at 80 minutes and landed at 73.5.
SECONDS_PER_WORD = 0.3375
STORY_OVERHEAD_SEC = 13.8


def _story_seconds(words: int) -> float:
    return STORY_OVERHEAD_SEC + SECONDS_PER_WORD * words


# What a story may be cut to, and what it may be stretched to.
#
# The ceiling is the one that matters. A story's source carries about 133
# words - headline 15, summary 88, description 30 - so a target above that is
# an instruction to invent the difference, on a bulletin that is read aloud as
# news and loops all day. A quiet day therefore produces a SHORTER bulletin,
# not a padded one; that is the trade, and it is the right way round.
#
# The floor stops a very busy day turning every story into a headline.
MIN_WORDS, MAX_WORDS = 55, 125


def _story_words(stories: int, minutes: float) -> int:
    """How long each story should be so the bulletin runs for `minutes`."""
    if stories <= 0:
        return MAX_WORDS
    seconds_each = (minutes * 60) / stories
    words = round((seconds_each - STORY_OVERHEAD_SEC) / SECONDS_PER_WORD)
    return max(MIN_WORDS, min(MAX_WORDS, words))


def _write_prompts(words: int) -> pathlib.Path | None:
    """Copy their prompt directory and lengthen the one instruction we mean to."""
    import shutil
    import tempfile

    source = pathlib.Path(os.environ["BHEEM_PROMPTS_DIR"])
    if not source.is_dir():
        # A missing directory is the wrong environment, not stale patching -
        # bheem_radio reports it with a better message a moment later. The loud
        # failure below is for the case that would otherwise be silent: the
        # directory is there and the instruction has been reworded.
        log.warning("prompts: %s is not a directory; leaving the length alone", source)
        return None
    target = pathlib.Path(tempfile.mkdtemp(prefix="bheem-prompts-"))
    shutil.copytree(source, target, dirs_exist_ok=True)

    # Ours over theirs. The length patch below then runs against our writer,
    # which carries the same length line on purpose so it still applies.
    for name in ("script_writer.md", "fact_checker.md"):
        ours = RADIO_PROMPTS / name
        if ours.is_file():
            shutil.copyfile(ours, target / name)
            log.info("prompts: %s is ours", name)

    # Who holds which office, kept by the desk: the one place a name may come
    # from that the story does not give. Both desks read the same list, or the
    # checker fails every name the writer was allowed to add.
    holders = RADIO_PROMPTS / "office_holders.md"
    if holders.is_file():
        listed = holders.read_text(encoding="utf-8").strip()
        for name in ("script_writer.md", "fact_checker.md"):
            prompt = target / name
            if not prompt.is_file():
                continue
            prompt.write_text(prompt.read_text(encoding="utf-8").rstrip() + "\n\n" + listed + "\n",
                              encoding="utf-8")
        log.info("prompts: office-holder list attached to writer and checker")

    writer = target / "script_writer.md"
    text = writer.read_text(encoding="utf-8")
    if _LENGTH_LINE_FROM not in text:
        # Loudly, not silently: upstream has reworded the instruction and this
        # patch would otherwise do nothing while the bulletin quietly came in
        # at their length instead of ours.
        raise RuntimeError(
            "script_writer.md no longer contains the length instruction this "
            "patches; re-check it against the pinned Bheem Radio commit"
        )
    writer.write_text(
        text.replace(_LENGTH_LINE_FROM,
                     _LENGTH_LINE_TO.format(words=words, seconds=round(words / 2.2))),
        encoding="utf-8",
    )
    # The anchor's own lines, merged so their date vocabulary survives.
    daily = target / "daily_hi.json"
    ours = RADIO_PROMPTS / "anchor_lines_hi.json"
    if daily.is_file() and ours.is_file():
        import json as _json

        lines = _json.loads(daily.read_text(encoding="utf-8"))
        mine = {k: v for k, v in _json.loads(ours.read_text(encoding="utf-8")).items()
                if not k.startswith("_")}
        lines.update(mine)
        daily.write_text(_json.dumps(lines, ensure_ascii=False, indent=2), encoding="utf-8")
        log.info("prompts: anchor lines replaced (%d keys, %d links between stories)",
                 len(mine), len(mine.get("connectives", [])))

    os.environ["BHEEM_PROMPTS_DIR"] = str(target)
    log.info("prompts: script target set to %d words (%s)", words, target)
    return target


# A sound effect inside a spoken line.
#
# The engine voices every line as one clip and has no way to put music in the
# middle of one - so an ad and its "back to the news" were a single breath. A
# line may now carry SFX_MARK where a sound effect belongs. Each piece on either
# side is voiced on its own (and cached on its own, so they cost the same as
# any other line), and the pieces come back joined around the effect as the
# one WAV the engine asked for. The engine never knows.
SFX_MARK = "[[sfx]]"
SFX_GAP_SEC = 0.25


def _join_with_effect(pieces: list[bytes], effect: pathlib.Path) -> bytes:
    """pieces[0] + effect + pieces[1] + effect + ..., as one WAV in the voice's format."""
    import subprocess
    import tempfile
    import wave

    with tempfile.TemporaryDirectory(prefix="bheem-sfx-") as tmp:
        tmp = pathlib.Path(tmp)
        files = []
        for i, data in enumerate(pieces):
            f = tmp / f"v{i}.wav"
            f.write_bytes(data)
            files.append(f)
        with wave.open(str(files[0]), "rb") as w:
            rate, channels = w.getframerate(), w.getnchannels()
        layout = "mono" if channels == 1 else "stereo"
        fmt = f"aformat=sample_rates={rate}:channel_layouts={layout}"

        inputs, chains, order = [], [], []
        for i, f in enumerate(files):
            inputs += ["-i", str(f)]
            chains.append(f"[{len(inputs) // 2 - 1}:a]{fmt}[v{i}]")
            order.append(f"[v{i}]")
            if i < len(files) - 1:
                inputs += ["-i", str(effect)]
                n = len(inputs) // 2 - 1
                # A breath either side, so the effect separates rather than
                # clips the words around it.
                chains.append(f"[{n}:a]{fmt},volume=0.8,"
                              f"adelay={int(SFX_GAP_SEC * 1000)}:all=1,"
                              f"apad=pad_dur={SFX_GAP_SEC}[s{i}]")
                order.append(f"[s{i}]")
        chains.append("".join(order) + f"concat=n={len(order)}:v=0:a=1[out]")
        out = tmp / "joined.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(chains),
             "-map", "[out]", "-ar", str(rate), "-ac", str(channels), str(out)],
            check=True,
        )
        return out.read_bytes()


def _with_sound_effects(narrate, effect: pathlib.Path):
    """Wrap SegmentCache.narrate so SFX_MARK in a line becomes `effect`."""
    def narrate_with_effects(self, tts, text, **kwargs):
        if SFX_MARK not in text:
            return narrate(self, tts, text, **kwargs)
        pieces = [part.strip() for part in text.split(SFX_MARK)]
        voiced = [narrate(self, tts, part, **kwargs) for part in pieces if part]
        return _join_with_effect(voiced, effect)
    return narrate_with_effects


def _write_assets() -> pathlib.Path | None:
    """Copy their assets and drop our music over theirs, file for file.

    Only the 30-second opening theme today, in place of their 5-second sonic
    logo - it is the first thing the bulletin plays, so swapping the file
    changes the opening without changing the engine. Returns the copy, which
    the caller has to put on Settings itself: like the prompts directory,
    BHEEM_ASSETS_DIR was read when Settings was constructed.
    """
    import shutil
    import tempfile

    source = pathlib.Path(os.environ["BHEEM_ASSETS_DIR"])
    ours = sorted((RADIO_ASSETS / "music").glob("*.wav"))
    if not source.is_dir() or not ours:
        return None
    target = pathlib.Path(tempfile.mkdtemp(prefix="bheem-assets-"))
    shutil.copytree(source, target, dirs_exist_ok=True)
    for wav in ours:
        shutil.copyfile(wav, target / "music" / wav.name)
    log.info("assets: ours over theirs: %s", ", ".join(w.name for w in ours))
    return target

def prepare_environment() -> None:
    """Copy our variables onto the BHEEM_* names and fill in the defaults."""
    for target, source in ENV_ALIASES.items():
        if not os.environ.get(target) and os.environ.get(source):
            os.environ[target] = os.environ[source]
    for name, value in DEFAULTS.items():
        os.environ.setdefault(name, value)
    _tts_defaults()

    # The cloned station voice, off unless asked for.
    #
    # Through the registry rather than by putting the svc- id straight into
    # BHEEM_TTS_VOICES, which also works: the registry is what makes an expiry
    # date and a revocation fall back to the stock voice instead of taking the
    # bulletin off air with them.
    #
    # Two things to know before turning it on. Cloned requests are limited to
    # ten a minute on Sarvam's starter plan, so a 120-story bulletin spends
    # twelve minutes waiting on that alone. And a cloned voice takes no
    # expressiveness setting - sarvam_temperature applies to stock voices only,
    # so the tuning above simply does not reach it.
    if os.getenv("RADIO_USE_CLONE", "").strip() in {"1", "true", "yes", "on"}:
        here = pathlib.Path(__file__).resolve().parent
        os.environ.setdefault("BHEEM_VOICES_DIR", str(here / "radio_voices"))
        os.environ.setdefault("BHEEM_STATION_VOICE", "station")
        log.info("station voice: %s from %s",
                 os.environ["BHEEM_STATION_VOICE"], os.environ["BHEEM_VOICES_DIR"])

    # The prompts are written later, in main(), because the story length
    # depends on how many stories the day turned out to have.


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build one party's daily radio bulletin")
    # Batch passes this as a job parameter (Ref::tenant in the job definition).
    parser.add_argument("--tenant", default=os.environ.get("RADIO_TENANT"))
    parser.add_argument("--date", help="YYYY-MM-DD, default today in IST")
    args = parser.parse_args(argv)

    prepare_environment()

    # Imported after the environment is prepared: Settings reads it at
    # construction, and bheem_radio is only present in the worker image, so a
    # module-level import would break every other use of this package.
    from bheem_radio.config import Settings
    from bheem_radio.daily.builder import build_daily_services, build_tenant_stream
    from bheem_radio.daily.sources import MongoStorySource
    from bheem_radio.logging_setup import configure_logging

    settings = Settings(_env_file=None)
    configure_logging(settings.log_level)

    if not args.tenant:
        parser.error("--tenant (or RADIO_TENANT) is required")
    if args.tenant not in settings.daily_tenants:
        parser.error(f"unknown tenant {args.tenant!r}; expected one of {settings.daily_tenants}")

    day = (date.fromisoformat(args.date) if args.date
           else datetime.now(ZoneInfo(settings.timezone)).date())

    source = MongoStorySource.from_settings(settings)
    pool = [t.strip() for t in (os.getenv("RADIO_POOL") or "").split(",") if t.strip()]
    if pool:
        source = RoundRobinSource(source, pool)

    # How many stories the day has decides how long each one may be, so the
    # window is counted before the prompts are written. One extra Mongo read,
    # against a build that then spends minutes on LLM and TTS calls.
    from bheem_radio.daily.sources import day_window

    minutes = float(os.getenv("RADIO_TARGET_MINUTES") or 0)
    if minutes:
        start, end = day_window(settings, day)
        available = len(source.stories(args.tenant, start, end))
        words = _story_words(available, minutes)
        predicted = available * _story_seconds(words) / 60
        log.info("length: %d stories available, %.0f min target -> %d words each "
                 "(about %.0f min)", available, minutes, words, predicted)
        if predicted < minutes - 5:
            # Said plainly rather than filled in: the stories are as long as
            # their sources allow, and there simply are not enough of them.
            log.warning("short bulletin: %d stories cannot fill %.0f minutes without "
                        "padding, so it will run short", available, minutes)
        written = _write_prompts(words)
        if written is not None:
            # Settings read BHEEM_PROMPTS_DIR when it was constructed, above,
            # so setting the variable now is too late - the prompts have to be
            # put on the object itself. Missing this wrote a new prompt that
            # nothing ever read: the build quietly used Bheem Radio's own
            # length and every story came back from cache unchanged.
            settings = settings.model_copy(update={"prompts_dir": written})

    assets = _write_assets()
    if assets is not None:
        settings = settings.model_copy(update={"assets_dir": assets})

    # The station's own transition, between an ad and the way back to the news.
    effect = pathlib.Path(settings.assets_dir) / "music" / "transition.wav"
    if effect.is_file():
        from bheem_radio.daily.segment_cache import SegmentCache
        SegmentCache.narrate = _with_sound_effects(SegmentCache.narrate, effect)
    else:
        log.warning("no %s: lines marked %s will be read straight through", effect, SFX_MARK)

    services = build_daily_services(settings, source)
    result = build_tenant_stream(args.tenant, day, services)

    stats = services.cache.stats
    log.info("radio %s %s: %s, %d stories, %.0f s; %d TTS characters, %d clips reused",
             result.tenant, result.day, result.status, result.stories, result.duration_sec,
             stats.tts_characters, stats.audio_hits)
    for problem in result.dropped:
        log.warning("dropped %s", problem)
    if result.error:
        log.log(logging.ERROR if result.status == "failed" else logging.WARNING,
                "%s", result.error)
    return 1 if result.status == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())
