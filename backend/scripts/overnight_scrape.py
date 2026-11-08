"""
Wait out YouTube's transcript rate limit, then scrape the window - unattended.

The transcript endpoint blocks by IP with no Retry-After header, so the only
way to know it has lifted is to ask. This probes cheaply until it clears, runs
both channels, and repeats if the run trips the limit again partway. Every pass
resumes: transcripts already on disk are skipped, so nothing is refetched and
each round only attempts what is still missing.

Safe to leave running overnight. Writes a timestamped log, and stops early once
both channels come back with nothing left to fetch.

    python -m backend.scripts.overnight_scrape
    python -m backend.scripts.overnight_scrape --probe-minutes 20 --max-rounds 8
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "backend" / "outputs" / "overnight_scrape.log"
# Smallest channel first, and this is the whole reason the order is named here.
#
# Congress has 46 videos in a 3-day window against Samajwadi's 12, and it
# exhausts YouTube's transcript budget every time. Run second, Samajwadi was
# refused all 12 on two consecutive rounds and ended with no fresh news at all
# while Congress banked 30 stories. Going first it needs a small share of a
# fresh budget, and Congress picks up its remainder on later rounds, which it
# can afford to do because it is already ahead.
#
# Ordering only. Nothing about how a channel is scraped changes.
#
# bjp is appended last with no tuning behind its position: there is no video-
# count data for it yet the way there is for the other two. Move it earlier
# once a real run shows whether it is starving the others of budget.
# dalitdastak sits after ravish: it is small, and the two of them together use
# little of the transcript budget before congress and bjp take the rest. It was
# missing from this list entirely, so every catch-up run skipped it.
CHANNELS = (
    "samajwadi", "ravish", "dalitdastak",
    "congress_mp", "bjp_mp", "congress_up", "bjp_up",
    "congress", "bjp",
)

# A video that is known to exist and to have captions. Probing one known id is
# cheaper and more honest than trying a whole run to find out.
PROBE_VIDEO = "skfnSEaUkB4"


# The watcher runs on a schedule and this runs by hand; both drive the same
# pipeline over the same processed.json, so they must not overlap. Sharing the
# watcher's lock is what keeps a catch-up run and a quarter-hourly tick from
# fetching the same videos twice.
from backend.scripts.watch_channels import claim_lock, release_lock, touch_lock  # noqa: E402


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}Z  {msg}"
    print(line, flush=True)
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        pass


def transcripts_available() -> bool:
    """One request. True when YouTube serves a transcript rather than a 429."""
    try:
        from backend.Fetch import fetch_transcript_text

        return bool(fetch_transcript_text(PROBE_VIDEO))
    except Exception as exc:
        log(f"  probe raised: {exc}")
        return False


def run_channel(channel: str) -> dict:
    """Run ingestion through publish for one channel. Returns its stage metrics."""
    log(f"  running pipeline: {channel}")
    proc = subprocess.run(
        [sys.executable, "-m", "backend.run_pipeline", "--channel", channel, "--only-stage", "news_publish"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        log(f"  {channel}: pipeline exited {proc.returncode}")

    runs = sorted((ROOT / "backend" / "outputs" / "runs" / channel).glob("*.json"), reverse=True)
    if not runs:
        return {}
    try:
        stages = json.loads(runs[0].read_text(encoding="utf-8")).get("stages", {})
    except Exception:
        return {}

    ing = stages.get("ingestion", {}).get("metrics", {}) or {}
    pub = stages.get("news_publish", {}).get("metrics", {}) or {}
    log(
        f"  {channel}: queued={ing.get('queued_urls', 0)} "
        f"fetched={ing.get('cleaned_transcripts', 0)} "
        f"failures={ing.get('transcript_failures', 0)} "
        f"deferred={ing.get('deferred_by_cap', 0)} "
        f"skipped_existing={ing.get('skipped_existing', 0)} "
        f"published={pub.get('inserted', 0)}"
    )
    return {"ingestion": ing, "publish": pub}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe-minutes", type=int, default=20, help="Gap between rate-limit probes.")
    ap.add_argument("--cool-off-minutes", type=int, default=45, help="Wait after a round that hit 429s.")
    ap.add_argument("--max-rounds", type=int, default=8, help="Give up after this many scrape rounds.")
    ap.add_argument("--max-wait-hours", type=int, default=14, help="Give up if the block never lifts.")
    args = ap.parse_args()

    log("=" * 70)
    if not claim_lock():
        log("a run is already going - nothing to do")
        return
    log(f"overnight scrape starting - probe every {args.probe_minutes}m, up to {args.max_rounds} rounds")

    deadline = time.time() + args.max_wait_hours * 3600
    for rnd in range(1, args.max_rounds + 1):
        # --- wait for the limit to lift -------------------------------------
        waited = 0
        while not transcripts_available():
            if time.time() > deadline:
                log(f"giving up: still rate limited after {args.max_wait_hours}h")
                return
            waited += args.probe_minutes
            if waited % 120 == 0:          # a line every two hours, not every probe
                log(f"  still rate limited ({waited // 60}h)")
            time.sleep(args.probe_minutes * 60)

        log(f"round {rnd}: rate limit clear, scraping")

        # --- scrape ---------------------------------------------------------
        failures = 0
        published = 0
        deferred = 0
        for channel in CHANNELS:
            m = run_channel(channel)
            ing = m.get("ingestion", {})
            failures += int(ing.get("transcript_failures", 0) or 0)
            deferred += int(ing.get("deferred_by_cap", 0) or 0)
            published += int(m.get("publish", {}).get("inserted", 0) or 0)
            touch_lock()          # a round takes many minutes; keep the lock warm

        log(f"round {rnd} done: published={published} failures={failures} deferred={deferred}")

        # Two separate reasons to go round again, and only one of them used to
        # count. A channel with a backlog hits max_videos_per_run and leaves the
        # rest for the next run with no failures at all - so "failures == 0"
        # called it finished and walked away from everything still queued.
        if failures == 0 and deferred == 0:
            log("nothing left to fetch - finished")
            break
        if failures == 0:
            log(f"  {deferred} video(s) held back by the per-run cap - going again")
            continue

        if rnd < args.max_rounds:
            log(f"  {failures} still missing, cooling off {args.cool_off_minutes}m before the next round")
            time.sleep(args.cool_off_minutes * 60)

    # --- what the feed looks like now ---------------------------------------
    try:
        from backend.db.mongo import db

        for slug in CHANNELS:
            channel_cfg = json.loads((ROOT / "backend" / "config" / "channels" / f"{slug}.json").read_text(encoding="utf-8"))
            selector = {"tenant_slug": channel_cfg.get("tenant_slug", slug)}
            if channel_cfg.get("scope"):
                selector["scope"] = channel_cfg["scope"]
            if channel_cfg.get("region"):
                selector["region"] = channel_cfg["region"]
            total = db["news"].count_documents(selector)
            fresh = db["news"].count_documents({
                **selector,
                "published_at": {"$gte": datetime(2026, 8, 28, tzinfo=timezone.utc)},
            })
            log(f"final: {slug} total={total} published_since_28_Aug={fresh}")
    except Exception as exc:
        log(f"final count failed: {exc}")

    release_lock()
    log("overnight scrape ended")


if __name__ == "__main__":
    main()
