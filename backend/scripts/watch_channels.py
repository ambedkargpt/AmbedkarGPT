"""
Run the pipeline when a channel posts — the local equivalent of the watcher.

    python -m backend.scripts.watch_channels              # stay up, check forever
    python -m backend.scripts.watch_channels --once       # one check, for a timer
    python -m backend.scripts.watch_channels --dry-run    # say what it would do

In production this decision is made by backend/worker/watch_handler.py running
as a Lambda, which reads the same feeds and submits an AWS Batch job instead of
starting a subprocess. This one keeps state on local disk and is what to reach
for when checking what is pending without touching AWS, or when running the
pipeline on a laptop. See backend/deploy/README.md.

Each tick reads every channel's YouTube Atom feed — public, no API key, under a
second — and compares it against what the pipeline has already ingested. A
channel with nothing new costs one small HTTP request and no more. A channel
with something new gets the same pipeline run that used to be typed by hand.

Three things make this safe to leave running unattended:

  * **A video is only new once.** Ingestion records a video in processed.json
    only when its transcript actually arrives. A video with no captions never
    gets there — nothing is wrong, it simply has no captions — so comparing the
    feed against processed.json alone would rediscover it every few minutes and
    run the pipeline forever. The ledger here counts attempts per video and
    stops asking after a few, which is also the right behaviour for the other
    case: a video whose transcript was refused because of rate limiting does
    get retried, just not immediately and not endlessly.

  * **One run at a time.** A lock file, so a watcher and a hand-run pipeline
    cannot both be writing transcripts and processed.json.

  * **Backing off beats pushing through.** YouTube's transcript endpoint blocks
    by IP with no Retry-After. After a round that was refused, the next check is
    deliberately far away rather than soon.

Nothing here decides what a story is or how it is written. It only decides
*when* the existing pipeline runs.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from backend.pipeline import ingested, youtube_feed
from backend.pipeline.youtube_feed import FeedUnavailable

ROOT = Path(__file__).resolve().parents[2]
WATCH_DIR = ROOT / "backend" / "outputs" / "watch"
STATE_PATH = WATCH_DIR / "state.json"
ID_CACHE_PATH = WATCH_DIR / "channel_ids.json"
LOCK_PATH = WATCH_DIR / "watch.lock"
LOG_PATH = WATCH_DIR / "watch.log"
CONFIG_DIR = ROOT / "backend" / "config" / "channels"

# Only the party channels requested for the local watcher. Keep the national
# and Madhya Pradesh feeds for BJP and Congress, plus Samajwadi.
CHANNEL_ORDER = (
    "bjp", "congress", "samajwadi", "congress_mp", "bjp_mp", "congress_up", "bjp_up",
)

# A lock whose holder has not been heard from in this long is assumed dead. Long
# enough to cover a full channel run, which is six to eight minutes.
LOCK_STALE_SECONDS = 30 * 60

# How long to leave a video alone between attempts.
#
# YouTube generates auto-captions some time after an upload, not with it. The
# watcher runs every fifteen minutes, so three attempts used to land inside an
# hour of publication - and a video that simply had no captions *yet* was
# retired for good before they appeared. Roughly a hundred videos were orphaned
# that way, several of which fetch a full transcript when asked today.
#
# Spacing the attempts is what makes the attempt count mean "we kept asking and
# it never came" rather than "we asked three times in forty minutes". Three
# attempts now span about a day, and lookback_days still drops a video that
# never arrives.
RETRY_AFTER_SECONDS = float(os.getenv("WATCH_RETRY_AFTER_HOURS", "6")) * 3600


# Launched from Task Scheduler through pythonw there is no console at all, and
# sys.stdout is None - printing to it raises and would take the watcher down on
# its first log line. The file is the log that matters anyway; the console is
# only for someone running this by hand.
def log(message: str) -> None:
    line = f"{datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S')}Z  {message}"
    if sys.stdout is not None:
        try:
            print(line, flush=True)
        except (ValueError, OSError):
            pass
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        # A watcher that cannot write its log should still watch.
        pass


# ── The lock ────────────────────────────────────────────────────────────────
# A heartbeat file rather than an OS lock: fcntl does not exist on Windows and
# the dev machine is Windows, so an OS lock would be a no-op exactly where a
# hand-run pipeline is most likely to collide with a watcher. A timestamp works
# the same on both, and survives a hard kill — a crashed holder simply stops
# updating it and the next watcher takes over.

def _process_alive(pid: int) -> bool:
    """
    Whether a process with this id is still running.

    os.kill with signal 0 asks without sending anything, and works on Windows
    too: a live id returns, a dead one raises. A live process owned by someone
    else raises PermissionError on POSIX, which is still alive and must not be
    read as gone.
    """
    if not pid:
        return False
    if pid == os.getpid():
        return True
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _read_lock() -> dict | None:
    try:
        return json.loads(LOCK_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def claim_lock() -> bool:
    held = _read_lock()
    if held:
        pid = int(held.get("pid") or 0)
        age = time.time() - float(held.get("heartbeat", 0))
        fresh = age < LOCK_STALE_SECONDS

        # Both have to say the lock is held. The heartbeat alone left a run that
        # was killed mid-fetch blocking every tick for the rest of the staleness
        # window - half an hour of doing nothing because the holder could not
        # run its own cleanup. Liveness alone is not enough either: process ids
        # are reused, and an unrelated program inheriting one would look like a
        # holder forever.
        if pid != os.getpid() and fresh and _process_alive(pid):
            log(f"another run holds the lock (pid {pid}, {int(age)}s ago) - standing down")
            return False
        if pid != os.getpid():
            why = "stale" if not fresh else f"pid {pid} is gone"
            log(f"taking over the lock ({why}, last touched {int(age)}s ago)")
    touch_lock()
    return True


def touch_lock() -> None:
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOCK_PATH.write_text(
        json.dumps({"pid": os.getpid(), "heartbeat": time.time()}), encoding="utf-8"
    )


def release_lock() -> None:
    held = _read_lock()
    if held and held.get("pid") == os.getpid():
        LOCK_PATH.unlink(missing_ok=True)


# ── The ledger ──────────────────────────────────────────────────────────────

def load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


# ── Channels ────────────────────────────────────────────────────────────────

def channel_names(requested: str | None) -> list[str]:
    available = {p.stem for p in CONFIG_DIR.glob("*.json")} - {"template"}
    if requested:
        asked = [c.strip() for c in requested.split(",") if c.strip()]
        unknown = [c for c in asked if c not in available]
        if unknown:
            raise SystemExit(f"Unknown channel(s): {', '.join(unknown)}")
        return asked
    return [c for c in CHANNEL_ORDER if c in available]


def _processed_path(payload: dict) -> Path:
    """Where this channel's ingestion record lives, as the config spells it."""
    return ROOT / "backend" / str(payload.get("processed_json_path") or "")


def feed_ids_for(name: str, payload: dict, cache: dict[str, str], client: httpx.Client) -> list[str]:
    """The UC ids to poll for this channel, resolving and caching what is missing."""
    ids: list[str] = []
    for source in youtube_feed.feed_sources(payload):
        cached = cache.get(source)
        if not cached:
            cached = youtube_feed.resolve_channel_id(source, client=client)
            cache[source] = cached
            log(f"  {name}: resolved {source} -> {cached}")
        if cached not in ids:
            ids.append(cached)
    return ids


def pending_uploads(name: str, payload: dict, ledger: dict, max_attempts: int, client: httpx.Client,
                    cache: dict[str, str]) -> list[youtube_feed.Upload]:
    """
    What this channel has posted that the pipeline has not taken in yet.

    Three filters, and each one exists because of a way this goes wrong without
    it: already ingested, outside the window the pipeline would even look at,
    and already tried more times than it is worth.
    """
    processed_ids = ingested.ids_from_file(_processed_path(payload))

    lookback = payload.get("lookback_days")
    lookback_days = int(lookback) if lookback not in (None, "") else None

    seen = ledger.get(name, {})
    now = datetime.now(UTC)
    fresh: list[youtube_feed.Upload] = []

    for channel_id in feed_ids_for(name, payload, cache, client):
        for upload in youtube_feed.recent_uploads(channel_id, client=client):
            if upload.video_id in processed_ids:
                continue
            # Ingestion only collects inside its dated window, so a video older
            # than that is not "pending" — it is never going to be fetched, and
            # counting it would keep the channel permanently dirty.
            if lookback_days and upload.age_days(now=now) > lookback_days:
                continue
            entry = seen.get(upload.video_id, {})
            if int(entry.get("attempts", 0)) >= max_attempts:
                continue
            # Tried recently: leave it be. This is what spaces the attempts
            # apart, and it also stops the channel being run again every tick
            # for a video that is not ready yet.
            last = entry.get("last_attempt")
            if last:
                try:
                    age = (now - datetime.fromisoformat(last)).total_seconds()
                except ValueError:
                    age = RETRY_AFTER_SECONDS
                if age < RETRY_AFTER_SECONDS:
                    continue
            if all(upload.video_id != f.video_id for f in fresh):
                fresh.append(upload)

    # Newest first, across every feed this channel watches. Ingestion takes the
    # newest N when a cap is set, so this is the order it will work through and
    # the order the caller has to assume when deciding what was actually tried.
    fresh.sort(key=lambda u: u.published, reverse=True)
    return fresh


def _push_transcript_index(name: str, payload: dict) -> None:
    """Copy this channel's master transcript to S3, when S3 is configured."""
    try:
        from backend.pipeline.orchestration import load_channel_config
        from backend.worker import channel_state

        if not channel_state.is_configured():
            return
        if channel_state.push_transcript_index(load_channel_config(ROOT / "backend", name)):
            log(f"  {name}: master transcript pushed to S3 for the API to read")
    except Exception as exc:  # noqa: BLE001 - a scrape must not fail over this
        log(f"  {name}: could not push the master transcript ({type(exc).__name__}: {exc})")


def attempted_slice(pending: list[youtube_feed.Upload], payload: dict) -> list[youtube_feed.Upload]:
    """
    Of everything pending, the part one run could actually have reached.

    Ingestion takes the newest max_videos_per_run and leaves the rest for a
    later run. Only the ones in reach may be charged an attempt: a channel with
    a backlog has most of its queue deferred by design, and striking those
    would retire videos nothing has ever tried to fetch.
    """
    cap = payload.get("max_videos_per_run")
    return pending[: int(cap)] if cap else list(pending)


# Without this the pipeline subprocess opens its own console window on every
# run, which on a quarter-hourly schedule means a black box appearing on the
# desktop all day. Only meaningful on Windows; absent elsewhere.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def run_channel(name: str) -> dict:
    """The same pipeline invocation that used to be typed by hand."""
    started = time.time()
    proc = subprocess.run(
        [sys.executable, "-m", "backend.run_pipeline", "--channel", name, "--only-stage", "news_publish"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_NO_WINDOW,
    )
    if proc.returncode != 0:
        log(f"  {name}: pipeline exited {proc.returncode}")
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-4:]
        for line in tail:
            log(f"    | {line}")

    runs = sorted((ROOT / "backend" / "outputs" / "runs" / name).glob("*.json"), reverse=True)
    if not runs:
        return {}
    try:
        stages = json.loads(runs[0].read_text(encoding="utf-8")).get("stages", {})
    except (OSError, ValueError):
        return {}

    ingestion = (stages.get("ingestion") or {}).get("metrics") or {}
    publish = (stages.get("news_publish") or {}).get("metrics") or {}
    log(
        f"  {name}: fetched={ingestion.get('cleaned_transcripts', 0)} "
        f"failures={ingestion.get('transcript_failures', 0)} "
        f"published={publish.get('inserted', 0)} "
        f"in {int(time.time() - started)}s"
    )
    return {"ingestion": ingestion, "publish": publish}


# ── One pass over every channel ─────────────────────────────────────────────

def tick(names: list[str], *, max_attempts: int, dry_run: bool) -> int:
    """Returns the number of transcript refusals, which is the backoff signal."""
    state = load_state()
    ledger = state.setdefault("videos", {})
    cache = youtube_feed.load_id_cache(ID_CACHE_PATH)
    refusals = 0

    with httpx.Client(timeout=25.0, follow_redirects=True) as client:
        for name in names:
            payload = json.loads((CONFIG_DIR / f"{name}.json").read_text(encoding="utf-8"))
            try:
                fresh = pending_uploads(name, payload, ledger, max_attempts, client, cache)
            except FeedUnavailable as exc:
                # Not an error worth stopping for. The feed is read again in a
                # few minutes and an upload does not disappear in the meantime.
                log(f"  {name}: feed unavailable ({exc})")
                continue

            if not fresh:
                continue

            log(f"{name}: {len(fresh)} new video(s)")
            for upload in fresh[:5]:
                log(f"    {upload.published:%Y-%m-%d %H:%M}Z  {upload.video_id}  {upload.title[:60]}")

            if dry_run:
                continue

            touch_lock()
            metrics = run_channel(name)
            touch_lock()
            refusals += int((metrics.get("ingestion") or {}).get("transcript_failures", 0) or 0)

            # A run that fetched something has a master transcript the API does
            # not have. The API reads transcripts baked into its image, so
            # without this the stories it can research are always the ones from
            # before the last deploy and never the ones just scraped. Only on a
            # fetch: uploading an unchanged file every quarter hour is waste.
            if int((metrics.get("ingestion") or {}).get("cleaned_transcripts", 0) or 0):
                _push_transcript_index(name, payload)

            # Whatever did not arrive gets a strike. A video that did arrive is
            # in processed.json now and will not be offered again, so its
            # entry is dropped rather than left to grow.
            processed_ids = ingested.ids_from_file(_processed_path(payload))
            seen = ledger.setdefault(name, {})

            for upload in attempted_slice(fresh, payload):
                if upload.video_id in processed_ids:
                    seen.pop(upload.video_id, None)
                    continue
                entry = seen.setdefault(upload.video_id, {"attempts": 0, "title": upload.title[:120]})
                entry["attempts"] = int(entry.get("attempts", 0)) + 1
                entry["last_attempt"] = datetime.now(UTC).isoformat()
                if entry["attempts"] >= max_attempts:
                    log(f"  {name}: giving up on {upload.video_id} after {entry['attempts']} tries")

            # After each channel rather than at the end of the tick. A pass over
            # five channels can span half an hour, and a watcher killed partway
            # through it would otherwise forget every strike it just recorded
            # and start the same failing videos over.
            state["last_tick"] = datetime.now(UTC).isoformat()
            save_state(state)

    youtube_feed.save_id_cache(ID_CACHE_PATH, cache)
    return refusals


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=int, default=300, help="Seconds between checks (default 300).")
    parser.add_argument("--channels", default="", help="Comma-separated subset; default is all of them.")
    parser.add_argument("--once", action="store_true", help="One pass, then exit. Use this from a timer.")
    parser.add_argument("--dry-run", action="store_true", help="Report what is new without running anything.")
    parser.add_argument("--max-attempts", type=int, default=3,
                        help="Stop retrying a video after this many runs fail to fetch it (default 3).")
    parser.add_argument("--backoff-minutes", type=int, default=45,
                        help="Wait this long after a round that hit transcript refusals (default 45).")
    args = parser.parse_args(argv)

    # Video titles are Hindi, and the Windows console defaults to cp1252, where
    # printing one raises rather than prints. A watcher must not die on a log
    # line.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass   # None under pythonw, or already closed

    names = channel_names(args.channels or None)

    if not args.dry_run and not claim_lock():
        # Not a failure. Standing down is what should happen when a run is
        # already going, and a non-zero exit here made every such tick show up
        # as a failed task in the scheduler's history.
        return 0
    try:
        if args.once or args.dry_run:
            tick(names, max_attempts=args.max_attempts, dry_run=args.dry_run)
            return 0

        log(f"watching {', '.join(names)} every {args.interval}s")
        while True:
            try:
                refusals = tick(names, max_attempts=args.max_attempts, dry_run=False)
            except Exception as exc:  # noqa: BLE001 - a watcher must outlive its bugs
                log(f"tick failed: {type(exc).__name__}: {exc}")
                refusals = 0
            touch_lock()
            if refusals:
                log(f"{refusals} transcript refusal(s) - backing off {args.backoff_minutes}m")
                time.sleep(args.backoff_minutes * 60)
            else:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        log("stopped")
        return 0
    finally:
        release_lock()


if __name__ == "__main__":
    raise SystemExit(main())
