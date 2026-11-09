"""Build and publish the rolling Bhim Radio bulletin.

Run every few minutes by the Batch schedule. Each run:

1. Reads the last two days of stories (every party dealt in turns, the daily
   build's own selection), newest first.
2. Stops at once if that is the same set of stories the bulletin on air was
   built from. Most runs end here, after one database read.
3. Otherwise drops repeat write-ups of one event, keeps same-subject stories
   apart, writes and fact-checks a script for each story it has not scripted
   before, voices what it has not voiced before, mixes the bulletin and puts it
   on air.

The newest story always leads: it is the first headline and the first story,
and the manifest's `starts_at` tells the player to start the bulletin from the
moment it was published, so a story that has just come in is the next thing a
listener hears.

Scripts, the same-event groups and every narrated line are kept in the bucket
under `_state/`, so a rebuild for one new story pays for that story and the
handful of lines around it (headlines, the recap), not the whole bulletin.

Exit codes for Batch: 0 published or nothing to do, 1 the build failed (the
bulletin on air stays as it was).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import pathlib
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

log = logging.getLogger("radio_live")

HERE = pathlib.Path(__file__).resolve().parent
PROMPTS = HERE / "prompts"
TENANT = "general"
PARTIES = ["congress", "bjp", "samajwadi", "general"]

BREAK_EVERY = 12 * 60          # ad break every twelve minutes of bulletin
MAX_WORDS = 125                # a script over this is sent back once to be cut
CUT_TO = "95 to 110"           # ...to this length (about a minute on air with its headline)
SAME_SUBJECT = 0.15            # word overlap above which two stories count as one subject
WINDOW_HOURS = 48              # every channel's stories from the last two days, rolling
REPEAT_FLOOR = 0.30            # word overlap two stories need before they count as one write-up
STATE_PREFIX = "_state/"       # in the radio bucket; never linked from the site
LOCK_TTL_SEC = 100 * 60        # longer than the job's own timeout

# How often the bulletin is rebuilt. Every rebuild re-mixes the whole
# bulletin (up to an hour of audio) and asks the model to regroup every
# story, so rebuilding on every small change kept the job busy most of the
# day once nine channels were feeding it. Both can be set on the job
# definition; 0 restores rebuilding on every change.
#   RADIO_MIN_REBUILD_MINUTES  a new story waits until the bulletin on air is
#                              at least this old (default 30)
#   RADIO_DROP_ONLY_HOURS      when stories have only aged out of the window
#                              and nothing is new, rebuild once the bulletin
#                              on air is this old (default 6)


# ── environment ──────────────────────────────────────────────────────────────

def _environment(local_dir: pathlib.Path | None) -> None:
    """The engine's settings for this bulletin. Set before build_radio fills in
    its defaults, which only apply to what is still unset."""
    env = os.environ
    # Ishita at 1.1x, one voice for the whole bulletin.
    env["BHEEM_TTS_VOICES"] = json.dumps({
        "minimax": {"hi": "English_Persuasive_Man", "en": "English_Persuasive_Man"},
        "selfhosted": {"hi": "agastya", "en": "agastya"},
        "gemini": {"hi": "Charon", "en": "Charon"},
        "sarvam": {"hi": "ishita", "en": "ishita"},
        "openai": {"hi": "onyx", "en": "onyx"},
        "fake": {"hi": "tone", "en": "tone"},
    })
    env["BHEEM_SARVAM_PACE"] = "1.1"
    env.pop("BHEEM_TTS_CO_ANCHOR_VOICES", None)
    env.setdefault("BHEEM_DAILY_LOOKBACK_DAYS", "2")
    if local_dir is not None:
        env["BHEEM_STORAGE_BACKEND"] = "local"
        env["BHEEM_DATA_DIR"] = str(local_dir / "radio-data")
        for k in ("S3_BUCKET", "BHEEM_S3_BUCKET"):
            env.pop(k, None)
    else:
        # The engine's own cache (scripts it wrote, every line it voiced) lives
        # in the bucket, so it survives from one Batch container to the next.
        env["BHEEM_STORAGE_BACKEND"] = "s3"
        env["BHEEM_DAILY_S3_PREFIX"] = f"{STATE_PREFIX}engine/"


def _patient_mongo() -> None:
    """Longer MongoDB timeouts. The story query pulls up to 500 full documents
    per party; on a slow link that ran past pymongo's 20 s default and the
    build died before its first story."""
    import pymongo

    original = pymongo.MongoClient.__init__

    def patient(self, *args, **kwargs):
        kwargs.setdefault("connectTimeoutMS", 120_000)
        kwargs.setdefault("socketTimeoutMS", 300_000)
        kwargs.setdefault("serverSelectionTimeoutMS", 120_000)
        original(self, *args, **kwargs)

    pymongo.MongoClient.__init__ = patient


class _WithoutResearch:
    """A collection whose find() leaves out the research brief."""

    def __init__(self, collection):
        self._collection = collection

    def find(self, query=None, projection=None, *args, **kwargs):
        return self._collection.find(query, projection or {"research": 0}, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._collection, name)


def _seconds(path: pathlib.Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


# ── state kept between runs ──────────────────────────────────────────────────

class State:
    """Small JSON documents under _state/<tenant>/ (or a local folder)."""

    def __init__(self, storage, tenant: str):
        self._storage = storage
        self._base = f"{tenant}/"

    def get(self, name: str, default):
        data = self._storage.get_bytes(self._base + name)
        return json.loads(data) if data else default

    def put(self, name: str, value) -> None:
        self._storage.put_bytes(json.dumps(value, ensure_ascii=False, indent=1).encode("utf-8"),
                                self._base + name, "application/json", "no-store")

    def delete(self, name: str) -> None:
        try:
            self._storage.delete(self._base + name)
        except Exception:  # noqa: BLE001 - a missing lock is already released
            pass


def _acquire_lock(state: State, now: datetime) -> bool:
    lock = state.get("lock.json", None)
    if lock:
        age = (now - datetime.fromisoformat(lock["at"])).total_seconds()
        if age < LOCK_TTL_SEC:
            log.info("another build holds the lock (%.0f s old); leaving it to finish", age)
            return False
    state.put("lock.json", {"at": now.isoformat()})
    return True


# ── ordering ─────────────────────────────────────────────────────────────────

def _window(now: datetime) -> tuple[datetime, datetime]:
    """
    The last WINDOW_HOURS up to now: first in, first out, for every channel.

    It used to be two calendar days, midnight to midnight. That dropped a
    whole day's stories at once at midnight and kept a story from 00:05 for
    almost two days. Rolling, a channel's story leaves when it turns 48 hours
    old, whatever the hour, and a new one comes in at the top.
    """
    return now - timedelta(hours=WINDOW_HOURS), now


def _same_channel_groups(groups, channel_of):
    """
    Same-event groups split by channel, keeping those still two or more long.

    Two channels covering one rally are two sides of it - Congress's account
    and the BJP's answer - and both belong on air. The model grouped a whole
    rally day across every channel as one event and 44 of 56 stories went.
    """
    out = []
    for group in groups:
        by_channel = {}
        for story_id in group:
            if story_id in channel_of:
                by_channel.setdefault(channel_of[story_id], []).append(story_id)
        out += [ids for ids in by_channel.values() if len(ids) > 1]
    return out


def _confirmed_repeats(groups, position, sim, floor=REPEAT_FLOOR):
    """
    The parts of each group whose stories really are the same write-up.

    The model is asked for repeats and still put Mehbooba Mufti, Farooq
    Abdullah, Tejashwi Yadav and Mamata Banerjee's speeches at one rally in a
    single group, and gave different groups on two runs over the same list.
    So it proposes and the text decides: two stories stay together only when
    their words overlap by at least `floor` (TF-IDF cosine, see subject.py),
    joined transitively. A group can split into several, or into none.
    """
    out = []
    for group in groups:
        parent = {i: i for i in group}

        def find(x):
            while parent[x] != x:
                x = parent[x]
            return x

        for a in group:
            for b in group:
                if a < b and sim[position[a]][position[b]] >= floor:
                    parent[find(a)] = find(b)
        parts = {}
        for i in group:
            parts.setdefault(find(i), []).append(i)
        out += [part for part in parts.values() if len(part) > 1]
    return out


def _newest_first(selected):
    return sorted(selected, key=lambda sel: sel.story.published_at, reverse=True)


def _spread_by_subject(selected, similarity_matrix):
    """Keep the order, but never put two stories on one subject side by side
    when a different one can go between them. The first story stays first:
    it is the newest, and it leads."""
    if len(selected) < 3:
        return selected
    sim = similarity_matrix([sel.story for sel in selected])
    index = {id(sel): i for i, sel in enumerate(selected)}

    def close(a, b):
        return sim[index[id(a)]][index[id(b)]] >= SAME_SUBJECT

    spread, pending = [selected[0]], list(selected[1:])
    while pending:
        prev = spread[-1]
        pick = next((k for k, cand in enumerate(pending[:12]) if not close(prev, cand)), 0)
        spread.append(pending.pop(pick))
    # The tail has nothing left to put between two same-subject stories, so a
    # pair still touching is fixed by moving the later one back to the latest
    # slot whose neighbours on both sides are on other subjects.
    for _ in range(len(spread)):
        pair = next((k for k in range(2, len(spread)) if close(spread[k - 1], spread[k])), None)
        if pair is None:
            break
        story = spread.pop(pair)
        slot = next((k for k in range(len(spread) - 1, 1, -1)
                     if k != pair and not close(spread[k - 1], story) and not close(spread[k], story)), None)
        if slot is None:
            spread.insert(pair, story)
            break
        spread.insert(slot, story)
    return spread


# ── when to rebuild ──────────────────────────────────────────────────────────

def _env_number(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def should_rebuild(last: dict, ids: list[str], today: str, now: datetime, force: bool = False) -> tuple[bool, str]:
    """
    Whether the bulletin on air should be rebuilt for these stories, and why.

    `last` is last_build.json: the story ids, date and time of the bulletin on
    air. A new day always rebuilds (the intro says the date); otherwise a new
    story rebuilds once the bulletin is RADIO_MIN_REBUILD_MINUTES old, and
    stories that only aged out wait for RADIO_DROP_ONLY_HOURS.
    """
    if force:
        return True, "forced"
    if not last or last.get("date") != today:
        return True, "new day or first build"

    on_air = set(last.get("story_ids", []))
    current = set(ids)
    if current == on_air:
        return False, "same stories as the bulletin on air"

    age_minutes = None
    try:
        built_at = datetime.fromisoformat(last["at"])
        age_minutes = (now - built_at).total_seconds() / 60
    except (KeyError, TypeError, ValueError):
        pass  # no usable time: treat the bulletin as old enough

    new_stories = current - on_air
    if new_stories:
        min_gap = _env_number("RADIO_MIN_REBUILD_MINUTES", 30)
        if age_minutes is not None and age_minutes < min_gap:
            return False, f"{len(new_stories)} new, but the bulletin on air is only {age_minutes:.0f} min old"
        return True, f"{len(new_stories)} new story/stories"

    drop_only_hours = _env_number("RADIO_DROP_ONLY_HOURS", 6)
    if age_minutes is not None and age_minutes < drop_only_hours * 60:
        return False, "stories only aged out; the bulletin on air is recent enough"
    return True, "stories aged out of the window"


# ── the build ────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    parser = argparse.ArgumentParser(description="Rebuild Bhim Radio's bulletin when the news changes")
    parser.add_argument("--force", action="store_true", help="rebuild even if the stories are unchanged")
    parser.add_argument("--local", metavar="DIR", help="build into DIR and upload nothing")
    args = parser.parse_args(argv)

    local_dir = pathlib.Path(args.local).resolve() if args.local else None
    if local_dir:
        local_dir.mkdir(parents=True, exist_ok=True)
    _environment(local_dir)
    _patient_mongo()

    from backend.worker import build_radio

    build_radio.prepare_environment()

    from bheem_radio.config import Settings
    from bheem_radio.storage import LocalStorage, S3Storage, build_daily_storage

    settings = Settings(_env_file=None)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    today = now.astimezone(ZoneInfo(settings.timezone)).date()

    engine_storage = build_daily_storage(settings)
    if local_dir:
        state_storage = LocalStorage(local_dir / "state", "http://localhost")
        publish_storage = LocalStorage(local_dir / "publish", "http://localhost")
    else:
        bucket = os.environ["S3_BUCKET"]
        region = settings.aws_region
        state_storage = S3Storage(bucket, STATE_PREFIX, region, "")
        publish_storage = S3Storage(bucket, "", region, os.environ.get("BHEEM_DAILY_PUBLIC_BASE_URL", ""))
    state = State(state_storage, TENANT)

    if not local_dir and not _acquire_lock(state, now):
        return 0
    try:
        return _build(args, settings, build_radio, engine_storage, state, publish_storage,
                      today, now, local_dir)
    except Exception:
        log.exception("bulletin build failed; the bulletin on air is unchanged")
        return 1
    finally:
        if not local_dir:
            state.delete("lock.json")


def _build(args, settings, build_radio, engine_storage, state, publish_storage, today, now, local_dir) -> int:
    from pydantic import BaseModel

    from backend.worker.radio_live import publish
    from backend.worker.radio_live.numbers import spell_out
    from backend.worker.radio_live.subject import similarity_matrix
    from bheem_radio.audio.mixer import Clip, Section
    from bheem_radio.daily.builder import (CO_ANCHOR, HEADLINE_BED_VOLUME, LEAD, MAX_HEADLINES,
                                           STORY_BED_VOLUME, build_daily_services)
    from bheem_radio.daily.selection import select_stories
    from bheem_radio.daily.sources import MongoStorySource
    from bheem_radio.pipeline.scripting import RadioScript, _check, story_payload, write_and_check

    # The agreed prompts, fully assembled (style guide, office-holder list and
    # length already in them), in place of the engine's generated ones.
    written = build_radio._write_prompts(110)
    (written / "script_writer.md").write_text((PROMPTS / "writer.txt").read_text(encoding="utf-8"), encoding="utf-8")
    (written / "fact_checker.md").write_text((PROMPTS / "checker.txt").read_text(encoding="utf-8"), encoding="utf-8")
    settings = settings.model_copy(update={"prompts_dir": written, "assets_dir": build_radio._write_assets()})

    # The engine reads each party's 500 newest documents in full. Two days is
    # at most a few dozen per party, and the full bodies of 500 made the read
    # slow enough to time out; 150 is still several times the window.
    MongoStorySource.SCAN_LIMIT = 150
    mongo = MongoStorySource.from_settings(settings)
    # And without each story's research brief (~21 KB), which the bulletin
    # never reads: it was most of every byte the scan pulled.
    mongo._collection = _WithoutResearch(mongo._collection)
    source = build_radio.RoundRobinSource(mongo, PARTIES)
    services = build_daily_services(settings, source, storage=engine_storage)
    lang, copy, music = settings.daily_lang, services.copy, services.assets.music
    style = services.prompts.voice_style.get(lang)
    start, end = _window(now)

    selected = _newest_first(select_stories(source, settings, TENANT, start, end))
    ids = [sel.story.id for sel in selected]
    log.info("%d stories for %s .. %s", len(ids), start, end)
    if not ids:
        log.info("no stories in the window; the bulletin on air stays")
        return 0

    last = state.get("last_build.json", {})
    rebuild, reason = should_rebuild(last, ids, today.isoformat(), now, force=args.force)
    if not rebuild:
        log.info("%d stories: %s; nothing to do", len(ids), reason)
        return 0
    log.info("rebuilding: %s", reason)

    # One event, one story. The news pipeline often writes the same press
    # conference or rally up several times. The writer model reads every
    # headline at once and groups the ones that report the same event; each
    # group keeps its fullest write-up. Asked again only when the list changes.
    class SameEvent(BaseModel):
        groups: list[list[str]]

    dedupe = state.get("same_event.json", {})
    if sorted(dedupe.get("ids", [])) != sorted(ids):
        listing = "\n".join(
            f"{sel.story.id} | {sel.story.title} | {(sel.story.summary or sel.story.body or '')[:300]}"
            for sel in selected)
        result, _ = services.llm.generate(
            "script_writer",
            system=("You are the news desk of a Hindi radio bulletin. You find stories in "
                    "today's list that are repeat write-ups of one news item, so that only one "
                    "of each is read on air. A repeat is the same speaker saying the same thing "
                    "on the same occasion, written up twice. Different leaders speaking at one "
                    "rally, press conference or protest are DIFFERENT stories, and so are two "
                    "points made by one leader, a protest and a later court hearing, or a "
                    "charge and the reply to it. When unsure, they are different. Answer only "
                    "with groups of two or more ids that are repeats; leave every other story out."),
            user="Stories, one per line as `id | headline | summary`:\n\n" + listing,
            output_model=SameEvent,
        )
        known = set(ids)
        groups = [[i for i in g if i in known] for g in result.groups]
        dedupe = {"ids": ids, "groups": [g for g in groups if len(g) > 1]}
        state.put("same_event.json", dedupe)
    by_story = {sel.story.id: sel.story for sel in selected}
    drop = set()
    channel_of = {sid: story.tenant for sid, story in by_story.items()}
    position = {sel.story.id: k for k, sel in enumerate(selected)}
    sim = similarity_matrix([sel.story for sel in selected])
    for g in _confirmed_repeats(_same_channel_groups(dedupe["groups"], channel_of), position, sim):
        keep = max(g, key=lambda i: len((by_story[i].body or "") + (by_story[i].summary or "")))
        drop |= set(g) - {keep}
    selected = _spread_by_subject([sel for sel in selected if sel.story.id not in drop], similarity_matrix)
    log.info("%d repeat write-ups dropped, %d stories left", len(drop), len(selected))

    # ── scripts: written once per story, kept in state ──
    scripts = state.get("scripts.json", {})
    for n, sel in enumerate(selected, 1):
        daily = sel.story
        if daily.id in scripts:
            continue
        for attempt in (1, 2):  # the writer now and then returns malformed JSON; once more fixes it
            try:
                result = write_and_check(daily.as_story(lang), lang, services.llm, services.prompts)
            except Exception as exc:  # noqa: BLE001 - one story must not cost the rest
                log.warning("#%d attempt %d failed: %s: %s", n, attempt, type(exc).__name__, str(exc)[:160])
                continue
            scripts[daily.id] = {"tenant": daily.tenant, "general": daily.tenant == "general",
                                 "headline": result.script.headline, "script": result.script.script,
                                 "passed": result.passed, "issues": result.fact_check.issues}
            log.info("#%d %s: %s", n, "PASS" if result.passed else "REJECTED", result.script.headline)
            break
        state.put("scripts.json", scripts)

    # The writer drifts long however the prompt asks. Anything over the ceiling
    # is sent back once to be cut, then fact-checked again; a cut that fails
    # the check keeps the longer, checked version.
    for sel in selected:
        d = scripts.get(sel.story.id)
        if not d or not d["passed"] or d.get("shortened") or len(d["script"].split()) <= MAX_WORDS:
            continue
        words = len(d["script"].split())
        story = sel.story.as_story(lang)
        try:
            draft, _ = services.llm.generate(
                "script_writer",
                system=services.prompts.script_writer_system[lang],
                user=("Write the radio script for this story.\n\n" + story_payload(story) + "\n\n"
                      f"Your draft below is {words} words; it is too long. Rewrite it at {CUT_TO} "
                      "words: keep the nine beats, the editorial line, the names and the closing "
                      "line, keep the strongest facts and drop the rest. Use only facts from the story.\n"
                      "<previous_draft>\n"
                      + json.dumps({"headline": d["headline"], "script": d["script"]}, ensure_ascii=False)
                      + "\n</previous_draft>"),
                output_model=RadioScript,
            )
            check, _ = _check(story, draft, services.llm, services.prompts)
            if check.verdict == "pass":
                d.update(headline=draft.headline, script=draft.script, shortened=True)
            else:
                d["shortened"] = "kept-long"
        except Exception as exc:  # noqa: BLE001
            log.warning("cut failed for %s: %s", sel.story.id, exc)
            continue
        state.put("scripts.json", scripts)

    items = [dict(scripts[sel.story.id], story_id=sel.story.id) for sel in selected
             if sel.story.id in scripts and scripts[sel.story.id]["passed"]]
    log.info("%d of %d stories have a checked script", len(items), len(selected))
    if not items:
        log.warning("no story passed the fact check; the bulletin on air stays")
        return 1

    # ── audio ──
    work = pathlib.Path(tempfile.mkdtemp(prefix="radio-live-"))
    wavs = work / "wav"
    wavs.mkdir()
    counter = [0]

    def voice(text, anchor=LEAD):
        counter[0] += 1
        path = wavs / f"v{counter[0]:04d}.wav"
        # A figure left as digits is read digit by digit ("2026" -> "दो शून्य दो छह").
        said = spell_out(text) if lang == "hi" else text
        path.write_bytes(services.cache.narrate(services.tts, said, lang=lang, style=style, anchor=anchor))
        return path

    plan, sections, clock = [], [], [0.0]

    def clip(path, kind, gap, label=None, k=None, text="", **extra):
        """A clip; with a label it also starts a row of the rundown."""
        c = Clip(path, kind, gap_after=gap)
        if label is not None:
            c.chapter = str(len(plan))
            plan.append(dict(k=k, label=label, text=text, **extra))
        clock[0] += _seconds(path) + gap
        return c

    assets = pathlib.Path(settings.assets_dir) / "music"
    alert = music("headline_hit")
    intro_text = copy.intro_for(TENANT, today, is_general=True)
    sections.append(Section([
        clip(music("sonic_logo"), "music", 0.2, "Theme music", "theme"),
        clip(voice(intro_text), "voice", 0.3, "Anchor intro", "intro", intro_text),
        clip(alert, "music", 0.1, "Breaking alert", "alert"),
        clip(voice(copy.headlines_intro), "voice", 0.3, "Headlines ki shuruaat", "hl_intro", copy.headlines_intro),
    ]))
    heads = []
    for i, it in enumerate(items[:MAX_HEADLINES], 1):
        heads += [clip(alert, "music", 0.1, "Breaking alert", "alert"),
                  clip(voice(it["headline"]), "voice", 0.5, f"Headline {i}", "headline", it["headline"])]
    sections.append(Section(heads, bed=music("headline_bed"), bed_volume=HEADLINE_BED_VOLUME))
    sections.append(Section([
        clip(alert, "music", 0.2, "Breaking alert", "alert"),
        clip(voice(copy.details_intro), "voice", 0.5, "'खबरें विस्तार से'", "details", copy.details_intro),
    ]))

    lines = json.loads((build_radio.RADIO_PROMPTS / "anchor_lines_hi.json").read_text(encoding="utf-8"))
    ad_names = ["Social media post", "BhimBot", "Humse judiye", "Dalit business"]
    links = [c for i, c in enumerate(lines["connectives"]) if i not in (3, 7, 11, 15)]
    back = ("आपका फिर से स्वागत है भीम रेडियो में। मैं हूँ काजल जाटव, और आप सुन रहे हैं "
            "दैनिक मध्य भारत समाचार। आइए, चलते हैं आगे की खबरों की ओर।")
    ad_files = [assets / f for f in ("ad_social.wav", "ad_bhimbot.wav", "ad_judiye.wav", "ad_business.wav")]
    break_hit, ident, ad_transition = assets / "break_hit.wav", assets / "station_ident.wav", assets / "ad_transition.wav"
    for f in (*ad_files, break_hit, ident, ad_transition):
        if not f.is_file():
            raise FileNotFoundError(f)

    next_break, breaks, in_general = BREAK_EVERY, 0, False
    for i, it in enumerate(items):
        anchor = CO_ANCHOR if i % 2 else LEAD
        if clock[0] >= next_break and i > 0:
            breaks += 1
            # A tease of what comes after the break: the next story's headline.
            tease = (f"अब वक़्त है एक छोटे से ब्रेक का। ब्रेक के बाद: {it['headline'].rstrip('।.')}। "
                     "बने रहिए भीम रेडियो के साथ।")
            brk = [clip(voice(tease, anchor), "voice", 0.4, f"Ad break {breaks}", "break", tease),
                   clip(break_hit, "music", 0.4, "Break sting", "adtx")]
            for n_ad, name in enumerate(ad_names):
                brk.append(clip(ad_files[n_ad], "music", 0.4, f"Ad: {name}", "ad", name))
                if n_ad < len(ad_names) - 1:
                    brk.append(clip(ad_transition, "music", 0.4, "Ad transition", "adtx"))
            # Back from the break: "भीम रेडियो... लंदन से लाइव", then the welcome back.
            brk += [clip(ident, "music", 0.3, "Station ident", "ident"),
                    clip(voice(back, anchor), "voice", 0.5, "Swagat / aage ki khabrein", "back", back)]
            sections.append(Section(brk))
            next_break += BREAK_EVERY
        clips = []
        first_general = it["general"] and not in_general and i > 0
        in_general = in_general or it["general"]
        if first_general:
            clips.append(clip(voice(copy.general_section, anchor), "voice", 0.45, "Desh-duniya ki or", "link",
                              copy.general_section))
        elif i > 0:
            link = links[(i - 1) % len(links)]
            clips.append(clip(voice(link, anchor), "voice", 0.35, "Link", "link", link))
        clips += [clip(voice(it["headline"], anchor), "voice", 0.5, it["headline"], "story", it["script"],
                       n=i + 1, story_id=it["story_id"], tenant=it["tenant"]),
                  clip(voice(it["script"], anchor), "voice", 0.4, "text", "text"),
                  clip(music("stinger"), "music", 0.3, "stinger", "stinger")]
        sections.append(Section(clips, bed=music("story_bed"), bed_volume=STORY_BED_VOLUME))
    log.info("voiced %d stories, about %.1f min", len(items), clock[0] / 60)

    # The headlines once more before signing off, as a news channel closes.
    recap_in = "और अब, एक बार फिर आज की मुख्य सुर्खियाँ।"
    recap = [clip(voice(recap_in), "voice", 0.3, "Headlines dobara", "recap", recap_in)]
    for i, it in enumerate(items[:MAX_HEADLINES], 1):
        recap += [clip(alert, "music", 0.1, "Breaking alert", "alert"),
                  clip(voice(it["headline"]), "voice", 0.5, f"Recap {i}", "headline", it["headline"])]
    recap.append(clip(alert, "music", 0.3, "Breaking alert", "alert"))
    sections.append(Section(recap, bed=music("headline_bed"), bed_volume=HEADLINE_BED_VOLUME))

    outro = ("ये थीं आज की बड़ी खबरें। आप सुन रहे थे दैनिक मध्य भारत समाचार, भीम रेडियो पर। "
             "खबरें अच्छी लगीं तो अंबेडकरजीपीटी डॉट इन पर जाकर इन्हें अपने साथियों तक पहुँचाइए। "
             "मैं हूँ काजल जाटव, अब आपसे विदा लेती हूँ। ये प्रसारण थोड़ी देर में फिर शुरू होगा। जय भीम।")
    sections.append(Section([clip(voice(outro), "voice", 1.5, "Outro", "outro", outro)],
                            bed=music("outro_bed"), bed_volume=0.3))

    mp3 = work / "bulletin.mp3"
    result = services.mixer.render(sections, mp3, title=f"भीम रेडियो - {today}")
    rows = []
    for i, ch in enumerate(result.chapters):
        stop = result.chapters[i + 1].start_sec if i + 1 < len(result.chapters) else result.duration_sec
        rows.append(dict(plan[int(ch.title)], t=ch.start_sec, sec=round(stop - ch.start_sec, 2)))

    manifest = publish.publish(publish_storage, TENANT, today.isoformat(), mp3, rows,
                               result.duration_sec, now, os.environ.get("BHEEM_DAILY_PUBLIC_BASE_URL", ""))
    state.put("last_build.json", {"date": today.isoformat(), "story_ids": ids,
                                  "audio_key": manifest["audio_key"], "at": now.isoformat()})
    log.info("on air: %s, %.1f min, %d stories, %d ad breaks, lead story: %s",
             manifest["audio_key"], result.duration_sec / 60, len(items), breaks, items[0]["headline"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
