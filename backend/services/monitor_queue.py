"""
A small background queue for the error monitor's writes.

Saving an error to MongoDB or sending it to Grafana is network I/O that can
take a while. If it ran inside logger.error(...) or before a response, every
request that logs an error would wait for it. Some existing code logs an
error and then carries on normally (web research without a search key, a
Pinecone query that falls back), so those successful requests would get
slower, and a request already close to API Gateway's 30 seconds could be
pushed over it.

So the request only puts a job in this queue, which takes microseconds, and
one background thread does the writes.

On Lambda, the thread is paused between invocations. The middleware calls
drain() at the end of a request that queued something, so the writes
normally finish inside the same invocation; anything left over finishes
when the Lambda wakes up for its next request.

Rules: the queue has a size limit (jobs are dropped when it is full, never
blocking the caller), and a failing job prints one line and the thread
carries on.
"""
import asyncio
import queue
import sys
import threading
import time

MAX_WAITING_JOBS = 500

# Tests set this to True so jobs run straight away and results can be checked.
run_jobs_inline = False

_jobs = queue.Queue(maxsize=MAX_WAITING_JOBS)
_worker = None
_worker_lock = threading.Lock()


def _work_forever() -> None:
    while True:
        job = _jobs.get()
        try:
            job()
        except Exception as exc:  # noqa: BLE001 - one bad job must not stop the thread
            print(f"[error-monitor] background job failed: {exc!r}", file=sys.stderr)
        finally:
            _jobs.task_done()


def _start_worker_once() -> None:
    global _worker
    if _worker is not None:
        return
    with _worker_lock:
        if _worker is None:
            # daemon=True: the thread never keeps the process alive on shutdown.
            _worker = threading.Thread(target=_work_forever, name="error-monitor", daemon=True)
            _worker.start()


def submit(job) -> None:
    """Run `job()` in the background. Never blocks and never raises."""
    if run_jobs_inline:
        try:
            job()
        except Exception as exc:  # noqa: BLE001
            print(f"[error-monitor] job failed: {exc!r}", file=sys.stderr)
        return
    try:
        _start_worker_once()
        _jobs.put_nowait(job)
    except queue.Full:
        print("[error-monitor] queue full, dropping one error report", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"[error-monitor] could not queue job: {exc!r}", file=sys.stderr)


def has_pending_jobs() -> bool:
    return _jobs.unfinished_tasks > 0


async def drain(max_seconds: float) -> None:
    """Wait, at most `max_seconds`, for queued jobs to finish (async, so the server keeps serving)."""
    deadline = time.monotonic() + max_seconds
    while has_pending_jobs() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)


def wait_until_done(max_seconds: float = 10) -> None:
    """Blocking version of drain(), for scripts."""
    deadline = time.monotonic() + max_seconds
    while has_pending_jobs() and time.monotonic() < deadline:
        time.sleep(0.02)
