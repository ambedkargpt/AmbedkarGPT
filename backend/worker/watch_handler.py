"""
The watcher, as a Lambda: decide whether a Batch job is worth starting.

EventBridge Scheduler invokes this every few minutes. It reads each channel's
YouTube Atom feed — public, no API key, no quota, well under a second — and
compares it against the `processed.json` the pipeline writes to S3. Channels
with nothing new cost a few HTTP requests and the Lambda exits. Channels with
something new are handed to one AWS Batch job.

The split matters. The feed is the one YouTube endpoint that answers a
datacentre IP normally — the repo's own auto_rebuild falls back to it for
exactly that reason — so the *asking* is safe to do cheaply and often from
Lambda. Everything that YouTube throttles, yt-dlp and the transcript endpoint,
stays in Batch where a run has time, a proxy, and somewhere to keep state.

Environment:
    S3_BUCKET               where channel state lives (see channel_state.py)
    BATCH_JOB_QUEUE         e.g. ambedkargpt-worker-queue
    BATCH_JOB_DEFINITION    e.g. ambedkargpt-worker
    WATCH_MAX_ATTEMPTS      default 3 — see the ledger note below
    WATCH_CHANNELS          optional subset; default is every channel config
    WATCH_JOB_VCPU          default 1    — see "Container size" below
    WATCH_JOB_MEMORY_MB     default 4096
    WATCH_MIN_GAP_MINUTES   default 30   — see "Spacing jobs out" below

Container size
--------------
The job definition is sized for auto_rebuild, the RAG rebuild: 4 vCPU and
16 GB. The pipeline this watcher starts does not rebuild RAG; it downloads
transcripts and waits on LLM APIs, so most of those 4 vCPU and 16 GB sat
idle while being paid for by the second. Each job therefore asks for its
own, smaller size. Setting WATCH_JOB_VCPU=4 and WATCH_JOB_MEMORY_MB=16384
on this Lambda puts back the old size without a redeploy.

Spacing jobs out
----------------
The schedule fires every 10 minutes, and with nine channels, several of
them party channels that post all day, something is new on almost every
tick. One job per tick kept a container running nearly all the time, and
each start pays again for pulling the image and the channel state. Waiting
at least WATCH_MIN_GAP_MINUTES after the last job lets one job take
everything that came in meanwhile. Set it to 0 for the old behaviour.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("watch_handler")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = PROJECT_ROOT / "config" / "channels"

_ACTIVE_JOB_STATES = ("SUBMITTED", "PENDING", "RUNNABLE", "STARTING", "RUNNING")

# How long to leave a video alone between attempts.
#
# YouTube writes auto-captions some time after an upload, not with it. On a
# ten-minute schedule three attempts land inside half an hour of publication,
# and a video whose captions had simply not appeared yet is retired for good.
# That is what happened on the laptop watcher: about a hundred videos orphaned,
# several of which fetch a full transcript when asked today.
_RETRY_AFTER_SECONDS = float(os.getenv("WATCH_RETRY_AFTER_HOURS", "6")) * 3600


# One function per client rather than a bare `import boto3` in the handler.
# boto3 is present in the Lambda runtime and the worker image but not in
# requirements-api.txt, so a test that patched `boto3.client` had to import a
# module CI does not install. These are the seam instead.

def _s3():
    import boto3

    return boto3.client("s3")


def _batch():
    import boto3

    return boto3.client("batch")


def _ledger_key() -> str:
    prefix = (os.getenv("S3_STATE_PREFIX") or "state").strip().strip("/")
    return f"{prefix}/watch/ledger.json"


def _load_ledger(client, bucket: str) -> dict:
    """
    How many times each video has been dispatched for without arriving.

    Ingestion records a video in processed.json only when its transcript
    actually arrives. A video with no captions never gets there — nothing is
    wrong, it simply has no captions — so comparing the feed against
    processed.json alone would rediscover it on every schedule and start a
    Batch job for it forever. Counting attempts is what ends that.
    """
    try:
        return json.loads(client.get_object(Bucket=bucket, Key=_ledger_key())["Body"].read())
    except Exception:  # noqa: BLE001 - absent on the first run
        return {}


def _save_ledger(client, bucket: str, ledger: dict) -> None:
    client.put_object(
        Bucket=bucket,
        Key=_ledger_key(),
        Body=json.dumps(ledger, indent=2, sort_keys=True).encode("utf-8"),
        ContentType="application/json",
    )


def _channel_names() -> list[str]:
    requested = (os.getenv("WATCH_CHANNELS") or "").strip()
    available = sorted({p.stem for p in CONFIG_DIR.glob("*.json")} - {"template"})
    if requested:
        return [n.strip() for n in requested.split(",") if n.strip() in available]
    return available


def _job_already_running(batch, queue: str) -> bool:
    """
    A pipeline run takes minutes and the schedule fires more often than that.

    Submitting a second job for the same channel while the first is still
    fetching would have two containers writing the same processed.json and
    racing for the same transcript budget.
    """
    for state in _ACTIVE_JOB_STATES:
        try:
            jobs = batch.list_jobs(jobQueue=queue, jobStatus=state).get("jobSummaryList", [])
        except Exception as exc:  # noqa: BLE001 - a listing failure must not block the run
            log.warning("could not list %s jobs: %s", state, exc)
            continue
        for job in jobs:
            if job.get("jobName", "").startswith("watch-"):
                log.info("job %s is %s - standing down", job.get("jobName"), state)
                return True
    return False


def _started_recently(batch, queue: str, minutes: float) -> bool:
    """
    True when a watch job was started less than `minutes` ago.

    Asks Batch for jobs created after that moment (any state). If the
    question fails, the answer is "no", so a listing problem can delay
    nothing.
    """
    if minutes <= 0:
        return False
    since_ms = int((datetime.now(UTC).timestamp() - minutes * 60) * 1000)
    try:
        jobs = batch.list_jobs(
            jobQueue=queue,
            filters=[{"name": "AFTER_CREATED_AT", "values": [str(since_ms)]}],
        ).get("jobSummaryList", [])
    except Exception as exc:  # noqa: BLE001 - a listing failure must not block the run
        log.warning("could not list recent jobs: %s", exc)
        return False
    for job in jobs:
        if job.get("jobName", "").startswith("watch-"):
            log.info("job %s started within the last %s minutes - waiting", job.get("jobName"), minutes)
            return True
    return False


# Memory sizes Fargate accepts for each vCPU size, in MB. A combination
# outside these makes Batch refuse the job, so anything else falls back to
# the job definition's own size rather than starting nothing.
_FARGATE_MEMORY_MB = {
    "1": range(2048, 8192 + 1, 1024),
    "2": range(4096, 16384 + 1, 1024),
    "4": range(8192, 30720 + 1, 1024),
}


def _job_size_overrides() -> list[dict]:
    """The container size for a pipeline job, or [] to keep the definition's size."""
    vcpu = (os.getenv("WATCH_JOB_VCPU") or "1").strip()
    memory = (os.getenv("WATCH_JOB_MEMORY_MB") or "4096").strip()
    allowed = _FARGATE_MEMORY_MB.get(vcpu)
    if allowed is None or not memory.isdigit() or int(memory) not in allowed:
        log.warning("WATCH_JOB_VCPU=%s / WATCH_JOB_MEMORY_MB=%s is not a Fargate size; using the job definition's", vcpu, memory)
        return []
    return [{"type": "VCPU", "value": vcpu}, {"type": "MEMORY", "value": memory}]


def pending_by_channel(ledger: dict, max_attempts: int) -> dict[str, list]:
    """Channel -> the uploads it has posted that the pipeline has not taken in."""
    import httpx

    from backend.pipeline import youtube_feed
    from backend.worker import channel_state

    now = datetime.now(UTC)
    found: dict[str, list] = {}

    with httpx.Client(timeout=25.0, follow_redirects=True) as client:
        cache: dict[str, str] = {}
        for name in _channel_names():
            payload = json.loads((CONFIG_DIR / f"{name}.json").read_text(encoding="utf-8"))
            processed = channel_state.read_processed_ids(name)
            seen = ledger.get(name, {})

            lookback = payload.get("lookback_days")
            lookback_days = int(lookback) if lookback not in (None, "") else None

            fresh = []
            try:
                for source in youtube_feed.feed_sources(payload):
                    channel_id = cache.get(source) or youtube_feed.resolve_channel_id(source, client=client)
                    cache[source] = channel_id
                    for upload in youtube_feed.recent_uploads(channel_id, client=client):
                        if upload.video_id in processed:
                            continue
                        # Outside the window ingestion would even look at, so it
                        # is not work — it is background that never clears.
                        if lookback_days and upload.age_days(now=now) > lookback_days:
                            continue
                        entry = seen.get(upload.video_id, {})
                        if int(entry.get("attempts", 0)) >= max_attempts:
                            continue
                        # Tried recently: leave it be. This spaces the attempts
                        # apart and stops a container being started again for a
                        # video that is not ready yet.
                        last = entry.get("last_attempt")
                        if last:
                            try:
                                if (now - datetime.fromisoformat(last)).total_seconds() < _RETRY_AFTER_SECONDS:
                                    continue
                            except ValueError:
                                pass
                        if all(upload.video_id != f.video_id for f in fresh):
                            fresh.append(upload)
            except youtube_feed.FeedUnavailable as exc:
                # The feed is read again on the next schedule and an upload does
                # not disappear in the meantime.
                log.warning("%s: feed unavailable (%s)", name, exc)
                continue

            if fresh:
                fresh.sort(key=lambda u: u.published, reverse=True)
                found[name] = fresh
    return found


def handler(event=None, context=None) -> dict:  # noqa: ARG001 - Lambda signature
    bucket = (os.getenv("S3_BUCKET") or "").strip()
    queue = (os.getenv("BATCH_JOB_QUEUE") or "").strip()
    definition = (os.getenv("BATCH_JOB_DEFINITION") or "").strip()
    max_attempts = int(os.getenv("WATCH_MAX_ATTEMPTS") or 3)

    missing = [n for n, v in
               (("S3_BUCKET", bucket), ("BATCH_JOB_QUEUE", queue), ("BATCH_JOB_DEFINITION", definition))
               if not v]
    if missing:
        log.error("not configured: %s", ", ".join(missing))
        return {"ok": False, "error": f"missing {', '.join(missing)}"}

    s3 = _s3()
    batch = _batch()

    ledger = _load_ledger(s3, bucket)
    pending = pending_by_channel(ledger, max_attempts)

    if not pending:
        log.info("nothing new")
        return {"ok": True, "channels": [], "submitted": None}

    for name, uploads in pending.items():
        log.info("%s: %d new video(s), newest %s", name, len(uploads), uploads[0].video_id)

    if _job_already_running(batch, queue):
        # Deliberately no ledger update: nothing was attempted, so nothing has
        # earned a strike.
        return {"ok": True, "channels": sorted(pending), "submitted": None, "reason": "job_running"}

    try:
        min_gap = float(os.getenv("WATCH_MIN_GAP_MINUTES") or 30)
    except ValueError:
        min_gap = 30.0
    if _started_recently(batch, queue, min_gap):
        # No ledger update here either: the videos wait for the next job.
        return {"ok": True, "channels": sorted(pending), "submitted": None, "reason": "too_soon"}

    names = sorted(pending)
    overrides = {
        # The job definition's own command runs auto_rebuild, which is the
        # Ravish-only artifact rebuild. This is the multi-channel pipeline,
        # so the command is overridden rather than a second definition kept
        # in step with the first.
        "command": ["python", "-m", "backend.worker.run_channels", "--channels", ",".join(names)],
        "environment": [{"name": "WATCH_CHANNELS", "value": ",".join(names)}],
    }
    size = _job_size_overrides()
    if size:
        overrides["resourceRequirements"] = size
    job = batch.submit_job(
        jobName=f"watch-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}",
        jobQueue=queue,
        jobDefinition=definition,
        containerOverrides=overrides,
    )
    log.info("submitted %s (%s) for %s", job["jobName"], job["jobId"], ", ".join(names))

    # A strike per video the job could actually reach. Videos the channel's
    # max_videos_per_run defers were never attempted, and striking them would
    # retire a backlog nothing has tried to fetch.
    for name, uploads in pending.items():
        payload = json.loads((CONFIG_DIR / f"{name}.json").read_text(encoding="utf-8"))
        cap = payload.get("max_videos_per_run")
        seen = ledger.setdefault(name, {})
        for upload in (uploads[: int(cap)] if cap else uploads):
            entry = seen.setdefault(upload.video_id, {"attempts": 0, "title": upload.title[:120]})
            entry["attempts"] = int(entry.get("attempts", 0)) + 1
            entry["last_attempt"] = datetime.now(UTC).isoformat()

    # Videos that did arrive no longer need an entry; processed.json holds them.
    from backend.worker import channel_state

    for name in list(ledger):
        processed = channel_state.read_processed_ids(name)
        ledger[name] = {v: e for v, e in ledger[name].items() if v not in processed}

    _save_ledger(s3, bucket, ledger)
    return {"ok": True, "channels": names, "submitted": job["jobId"]}
