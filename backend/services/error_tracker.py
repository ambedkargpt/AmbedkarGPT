"""
Error tracker for the admin Errors page.

What gets recorded ("kind" on each issue)
-----------------------------------------
  exception     a crash: logger.exception(...) with a traceback. Every
                unhandled error in a request is logged this way by
                backend/core/http.py.
  logged        logger.error("...") without an exception.
  http_5xx      a request answered 5xx without any error being logged, for
                example a deliberate HTTPException(503).
  slow_request  a request slower than SLOW_REQUEST_SECONDS. Behind API
                Gateway (30 s limit) the user got a 503 even though the
                Lambda finished. This is how the first-generate 503 looked.
  browser_crash an error thrown in a visitor's browser.
  api_failure   an API call that failed in the browser with 502/503/504 or
                no answer at all, i.e. failures the server never saw (API
                Gateway timeouts, a Lambda that was killed).

How it hooks in
---------------
Two logging handlers on the "backend" logger (install_error_tracking):
  - ErrorMonitorHandler records ERROR records.
  - BreadcrumbHandler remembers INFO/WARNING lines of the current request,
    so an error report shows what the request logged just before failing.
backend/core/request_context.py adds a middleware for http_5xx and
slow_request. The browser posts to /errors/report.

Where it goes: every occurrence goes through record(), which saves it to
MongoDB for the admin page (ERROR_TRACKING_ENABLED=true) and sends it to
Grafana (GRAFANA_LOKI_* set). Both run on a background queue
(monitor_queue.py), so the request never waits for them.

Safety rules (the site must never break because of this file)
-------------------------------------------------------------
- Does nothing when neither switch is set.
- It never raises. If saving fails we print one line to stderr and move on.
- Requests never wait for MongoDB or Grafana; writes are queued.
- Every MongoDB call is limited to SAVE_TIMEOUT_SECONDS.
- Errors that come from MongoDB itself are sent to Grafana only (the
  database is probably down).
- Emails, phone numbers and bearer tokens are masked before saving.
"""
import hashlib
import logging
import os
import re
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

import pymongo
from pymongo.errors import PyMongoError

from backend.core.request_context import add_breadcrumb, get_current_request
from backend.repositories.error_logs_repo import ErrorLogsRepository
from backend.services import grafana_logs, monitor_queue

SAVE_TIMEOUT_SECONDS = 3

# Size limits, so one huge error cannot fill the database.
MAX_MESSAGE_LENGTH = 1000
MAX_TRACEBACK_LENGTH = 12000

# Anyone can call /errors/report, so we cap how many *new* browser errors we
# accept per hour. Errors we already know about still have their count
# increased; only brand-new ones are dropped above this limit.
MAX_NEW_FRONTEND_ERRORS_PER_HOUR = 50

EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
# Indian mobile numbers: 10 digits starting 6-9, with an optional +91.
PHONE_PATTERN = re.compile(r"(?<![\w-])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\w-])")
BEARER_PATTERN = re.compile(r"Bearer\s+[\w.\-]+")

REQUEST_ID_PATTERN = re.compile(r"request_id=(\S+)")
PATH_PATTERN = re.compile(r"path=(\S+)")

_repo = None


def is_enabled() -> bool:
    value = os.getenv("ERROR_TRACKING_ENABLED", "")
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_repo() -> ErrorLogsRepository:
    # Created on first use, so importing this module never touches MongoDB.
    global _repo
    if _repo is None:
        _repo = ErrorLogsRepository()
    return _repo


def mask_personal_data(text: str) -> str:
    if not text:
        return text
    text = EMAIL_PATTERN.sub("[email]", text)
    text = PHONE_PATTERN.sub("[phone]", text)
    text = BEARER_PATTERN.sub("Bearer [token]", text)
    return text


def make_fingerprint(*parts: str) -> str:
    """The same error always gives the same fingerprint, so repeats are grouped."""
    joined = "|".join(str(part or "") for part in parts)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def _without_numbers(text: str) -> str:
    # "user 123 failed" and "user 456 failed" are the same bug, so numbers are
    # removed before making the fingerprint.
    return re.sub(r"\d+", "N", text or "")[:200]


def normalize_path(path: str) -> str:
    """
    '/api/v1/posts/6712ab34cd56ef7890123456' -> '/api/v1/posts/:id'

    Ids in the path would make every post's failure look like a different
    bug, so they are replaced before grouping and counting.
    """
    if not path:
        return ""
    path = path.split("?", 1)[0]
    path = re.sub(r"/[0-9a-fA-F]{24}(?=/|$)", "/:id", path)
    path = re.sub(r"/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}(?=/|$)", "/:id", path)
    path = re.sub(r"/news_\d+(?=/|$)", "/:news_id", path)
    path = re.sub(r"/\d+(?=/|$)", "/:n", path)
    return path


def _short_path(filename: str) -> str:
    """'/var/task/backend/services/x.py' -> 'backend/services/x.py'."""
    filename = filename.replace("\\", "/")
    index = filename.find("backend/")
    if index == -1:
        return filename
    return filename[index:]


def _is_our_code(filename: str) -> bool:
    filename = filename.replace("\\", "/")
    return "backend/" in filename and "site-packages" not in filename


def _find_our_frame(tb):
    """
    The last line of *our* code in the traceback.

    The very last frame is often inside a library (pymongo, httpx...). The
    useful answer to "where do I fix this?" is the last place in our own code
    that the error passed through.
    """
    frames = traceback.extract_tb(tb)
    if not frames:
        return None
    our_frames = [frame for frame in frames if _is_our_code(frame.filename)]
    if our_frames:
        return our_frames[-1]
    return frames[-1]


def _describe_frame(frame) -> str:
    if frame is None:
        return ""
    return f"{_short_path(frame.filename)}:{frame.lineno} in {frame.name}()"


def _find_root_cause(exc: BaseException) -> BaseException:
    """
    Follow the chain of exceptions back to the first one.

    When code does `raise HTTPException(...) from err`, or an error happens
    while handling another error, Python links them together. The first error
    in that chain is usually the real reason things went wrong.
    """
    seen = set()
    current = exc
    while id(current) not in seen:
        seen.add(id(current))
        previous = current.__cause__ or current.__context__
        if previous is None:
            break
        current = previous
    return current


def _error_text(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"


def _request_facts() -> dict:
    """What we know about the request that is running now (empty outside one)."""
    info = get_current_request()
    if info is None:
        return {}
    elapsed_ms = None
    if info.get("started") is not None:
        elapsed_ms = int((time.perf_counter() - info["started"]) * 1000)
    return {
        "method": info.get("method"),
        "path": info.get("path"),
        "request_id": info.get("request_id"),
        "user_id": info.get("user_id"),
        "duration_ms": elapsed_ms,
        "breadcrumbs": list(info.get("breadcrumbs", [])),
    }


def build_backend_error(record: logging.LogRecord):
    """
    Turn one log record into (fingerprint, details, occurrence).

    `details` describes the issue. `occurrence` is this one time it happened.
    Kept separate from saving so the tests can check exactly what would be
    stored, without a database.
    """
    message = record.getMessage()
    facts = _request_facts()
    request_id = getattr(record, "request_id", None) or facts.get("request_id")
    path = facts.get("path")

    # The request middleware writes "request_id=... path=..." into its
    # message. Read them out *before* masking, so they stay intact.
    request_match = REQUEST_ID_PATTERN.search(message)
    if request_match and not request_id:
        request_id = request_match.group(1)
    path_match = PATH_PATTERN.search(message)
    if path_match and not path:
        path = path_match.group(1)

    details = {
        "source": "backend",
        "logger": record.name,
        "log_message": mask_personal_data(message)[:MAX_MESSAGE_LENGTH],
        "path": path,
        "method": facts.get("method"),
        "breadcrumbs": facts.get("breadcrumbs", []),
    }

    if record.exc_info and record.exc_info[1] is not None:
        exc = record.exc_info[1]
        our_frame = _find_our_frame(exc.__traceback__)
        root = _find_root_cause(exc)
        root_frame = _find_our_frame(root.__traceback__) if root is not exc else None

        full_traceback = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))

        details.update({
            "kind": "exception",
            "error_type": type(exc).__name__,
            "message": mask_personal_data(str(exc))[:MAX_MESSAGE_LENGTH],
            "location": _describe_frame(our_frame),
            "code_line": mask_personal_data(our_frame.line or "") if our_frame else "",
            "root_cause": mask_personal_data(_error_text(root))[:MAX_MESSAGE_LENGTH] if root is not exc else "",
            "root_cause_type": type(root).__name__ if root is not exc else "",
            "root_cause_location": _describe_frame(root_frame),
            "traceback": mask_personal_data(full_traceback)[-MAX_TRACEBACK_LENGTH:],
        })
        fingerprint = make_fingerprint(
            "backend",
            type(exc).__name__,
            type(root).__name__,
            _short_path(our_frame.filename) if our_frame else "",
            our_frame.name if our_frame else "",
        )
    else:
        # logger.error("...") without an exception: there is no traceback, so
        # the place the log line was written is the best "where" we have.
        details.update({
            "kind": "logged",
            "error_type": "LoggedError",
            "message": details["log_message"],
            "location": f"{_short_path(record.pathname)}:{record.lineno} in {record.funcName}()",
            "code_line": "",
            "root_cause": "",
            "root_cause_type": "",
            "root_cause_location": "",
            "traceback": "",
        })
        fingerprint = make_fingerprint(
            "backend", "log", record.name, _without_numbers(str(record.msg)),
        )

    occurrence = {
        "request_id": request_id,
        "path": path,
        "method": facts.get("method"),
        # An unhandled error in a request always becomes a 500.
        "status": 500 if record.name == "backend.http" and record.exc_info else None,
        "duration_ms": facts.get("duration_ms"),
        "user_id": facts.get("user_id"),
        "message": details["message"][:300],
    }
    return fingerprint, details, occurrence


def is_active() -> bool:
    """True when errors go anywhere: MongoDB (admin page), Grafana, or both."""
    return is_enabled() or grafana_logs.is_enabled()


def _save_to_mongo(fingerprint: str, details: dict, occurrence: dict) -> None:
    repo = get_repo()
    # Index creation happens once per container and can be slow on a cold
    # Atlas connection, so it gets its own, longer limit. This runs on the
    # background queue, so no request waits for it.
    with pymongo.timeout(10):
        repo.ensure_indexes()
    with pymongo.timeout(SAVE_TIMEOUT_SECONDS):
        repo.save_occurrence(fingerprint, details, occurrence)
        repo.add_event(fingerprint, {
            **occurrence,
            "source": details["source"],
            "kind": details["kind"],
            "error_type": details["error_type"],
            "page": details.get("page"),
            "breadcrumbs": details.get("breadcrumbs", []),
            "user_agent": (details.get("extra") or {}).get("user_agent"),
        })


def record(fingerprint: str, details: dict, occurrence: dict, skip_mongo: bool = False) -> None:
    """
    Save one occurrence to MongoDB (admin page) and send it to Grafana.

    Both happen on the background queue, so the caller returns at once.
    Each part is tried on its own: Grafana still gets the error when
    MongoDB is down, and the other way round.
    """
    timestamp = time.time()

    def job():
        if is_enabled() and not skip_mongo:
            try:
                _save_to_mongo(fingerprint, details, occurrence)
            except Exception as exc:  # noqa: BLE001
                print(f"[error-tracker] could not save error: {exc!r}", file=sys.stderr)
        if grafana_logs.is_enabled():
            try:
                grafana_logs.send_event(details, occurrence, timestamp)
            except Exception as exc:  # noqa: BLE001
                print(f"[grafana-logs] could not send log: {exc!r}", file=sys.stderr)

    monitor_queue.submit(job)


def save_log_record(log_record: logging.LogRecord) -> None:
    fingerprint, details, occurrence = build_backend_error(log_record)
    # A MongoDB error means the database is probably down: writing the error
    # to it would only fail too. Grafana still gets it.
    is_mongo_error = bool(log_record.exc_info) and isinstance(log_record.exc_info[1], PyMongoError)
    record(fingerprint, details, occurrence, skip_mongo=is_mongo_error)
    info = get_current_request()
    if info is not None:
        info["error_saved"] = True


def build_request_problem(info: dict, status: int, duration_ms: int):
    """
    (fingerprint, details, occurrence) for a 5xx or slow request, or None when
    there is nothing to save (the error was already saved by the handler).
    """
    method = info.get("method") or ""
    path = info.get("path") or ""
    route = normalize_path(path)
    seconds = duration_ms / 1000

    if status >= 500:
        if info.get("error_saved"):
            return None
        kind = "http_5xx"
        error_type = f"HTTP {status}"
        message = f"{method} {path} answered {status} after {seconds:.1f}s, without logging an error"
        fingerprint = make_fingerprint("backend", "http", status, method, route)
    else:
        kind = "slow_request"
        error_type = "SlowRequest"
        if info.get("via_function_url"):
            message = f"{method} {path} took {seconds:.1f}s through the function URL (the Lambda stops at 60s)"
        else:
            message = f"{method} {path} took {seconds:.1f}s (API Gateway gives up at 30s and answers 503)"
        fingerprint = make_fingerprint("backend", "slow", method, route, bool(info.get("via_function_url")))

    details = {
        "source": "backend",
        "kind": kind,
        "logger": "backend.request",
        "error_type": error_type,
        "message": message,
        "log_message": message,
        "location": f"{method} {route}",
        "code_line": "",
        "root_cause": "",
        "root_cause_type": "",
        "root_cause_location": "",
        "traceback": "",
        "path": route,
        "method": method,
        "via_function_url": bool(info.get("via_function_url")),
        "breadcrumbs": list(info.get("breadcrumbs", [])),
    }
    occurrence = {
        "request_id": info.get("request_id"),
        "path": path,
        "method": method,
        "status": status,
        "duration_ms": duration_ms,
        "user_id": info.get("user_id"),
        "message": message[:300],
    }
    return fingerprint, details, occurrence


def save_request_problem(info: dict, status: int, duration_ms: int) -> None:
    """Called by the middleware for 5xx and slow requests. Never raises."""
    try:
        problem = build_request_problem(info, status, duration_ms)
        if problem is not None:
            record(*problem)
    except Exception as exc:  # noqa: BLE001 - this must never break the app
        print(f"[error-tracker] could not save request problem: {exc!r}", file=sys.stderr)


class ErrorMonitorHandler(logging.Handler):
    """Logging handler that records ERROR lines (admin page + Grafana)."""

    def __init__(self) -> None:
        super().__init__(level=logging.ERROR)

    def emit(self, log_record: logging.LogRecord) -> None:
        if not is_active():
            return
        try:
            save_log_record(log_record)
        except Exception as exc:  # noqa: BLE001 - this must never break the app
            # print, not logging: logging from inside a logging handler could
            # send us straight back here.
            print(f"[error-tracker] could not record error: {exc!r}", file=sys.stderr)


class BreadcrumbHandler(logging.Handler):
    """Remembers the current request's log lines, in memory only (no database)."""

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)

    def emit(self, record: logging.LogRecord) -> None:
        if get_current_request() is None:
            return
        try:
            add_breadcrumb(record.levelname, record.name, mask_personal_data(record.getMessage()))
        except Exception:  # noqa: BLE001 - a lost breadcrumb is not worth an error
            pass


_installed = False


def install_error_tracking() -> None:
    """Attach the handlers once. Safe to call more than once."""
    global _installed
    if _installed:
        return
    backend_logger = logging.getLogger("backend")
    backend_logger.addHandler(BreadcrumbHandler())
    backend_logger.addHandler(ErrorMonitorHandler())
    _installed = True


def _split_type(message: str):
    """'TypeError: x is undefined' -> ('TypeError', 'x is undefined')."""
    if ":" in message:
        first_word, rest = message.split(":", 1)
        first_word = first_word.strip()
        if first_word and " " not in first_word and rest.strip():
            return first_word, rest.strip()
    return "Error", message


def build_client_error(report) -> tuple:
    """Turn one browser report into (fingerprint, details, occurrence)."""
    page = (report.page or "")[:500]
    user_agent = (report.user_agent or "")[:300]

    if report.kind == "api":
        # An API call that failed in the browser. Status 0 means no answer at
        # all: network down, CORS, or the request was cut off.
        status = report.status or 0
        method = (report.method or "GET").upper()
        api_path = normalize_path(report.api_path or "")
        seconds = (report.duration_ms or 0) / 1000
        error_type = f"HTTP {status}" if status else "NetworkError"
        what = f"answered {status}" if status else "got no answer"
        message = f"{method} {api_path} {what} after {seconds:.1f}s in the browser"
        details = {
            "source": "frontend",
            "kind": "api_failure",
            "logger": "browser.api",
            "error_type": error_type,
            "message": message,
            "log_message": message,
            "location": f"{method} {api_path}",
            "code_line": "",
            "root_cause": mask_personal_data(report.message)[:MAX_MESSAGE_LENGTH],
            "root_cause_type": "",
            "root_cause_location": "",
            "traceback": "",
            "path": api_path,
            "method": method,
            "page": page,
            "breadcrumbs": [],
            "extra": {"component_stack": "", "user_agent": user_agent},
        }
        fingerprint = make_fingerprint("frontend", "api", method, api_path, status)
        occurrence = {
            "request_id": report.request_id,
            "path": api_path,
            "method": method,
            "status": status,
            "duration_ms": report.duration_ms,
            "user_id": None,
            "page": page,
            "message": message[:300],
        }
        return fingerprint, details, occurrence

    full_message = mask_personal_data(report.message)[:MAX_MESSAGE_LENGTH]
    stack = mask_personal_data(report.stack or "")[:MAX_TRACEBACK_LENGTH]
    error_type, message = _split_type(full_message)

    # First line of the stack that points at a file, e.g. "at f (index-abc.js:1:2)".
    location = ""
    for line in stack.splitlines():
        line = line.strip()
        if line.startswith("at ") or "@" in line:
            location = line[:300]
            break

    details = {
        "source": "frontend",
        "kind": "browser_crash",
        "logger": report.kind or "browser",
        "error_type": error_type,
        "message": message,
        "log_message": full_message,
        "location": location,
        "code_line": "",
        "root_cause": "",
        "root_cause_type": "",
        "root_cause_location": "",
        "traceback": stack,
        "path": page,
        "method": None,
        "page": page,
        "breadcrumbs": [],
        "extra": {
            "component_stack": mask_personal_data(report.component_stack or "")[:4000],
            "user_agent": user_agent,
        },
    }
    fingerprint = make_fingerprint("frontend", error_type, _without_numbers(message), location)
    occurrence = {
        "request_id": None,
        "path": page,
        "method": None,
        "status": None,
        "duration_ms": None,
        "user_id": None,
        "page": page,
        "message": message[:300],
    }
    return fingerprint, details, occurrence


def _is_over_new_error_cap(fingerprint: str) -> bool:
    """True when this is a *new* browser error and the hourly cap is used up."""
    if not is_enabled():
        return False
    repo = get_repo()
    with pymongo.timeout(SAVE_TIMEOUT_SECONDS):
        if repo.exists(fingerprint):
            return False
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        return repo.count_new_since("frontend", one_hour_ago) >= MAX_NEW_FRONTEND_ERRORS_PER_HOUR


def save_client_error(report) -> None:
    """Record one browser error (admin page + Grafana). Never raises."""
    if not is_active():
        return
    try:
        fingerprint, details, occurrence = build_client_error(report)
    except Exception as exc:  # noqa: BLE001 - this must never break the app
        print(f"[error-tracker] could not read browser error: {exc!r}", file=sys.stderr)
        return

    def job():
        # The cap check reads MongoDB, so it runs in the background as well.
        # A report over the cap is dropped everywhere, Grafana included.
        if _is_over_new_error_cap(fingerprint):
            return
        record(fingerprint, details, occurrence)

    monitor_queue.submit(job)
