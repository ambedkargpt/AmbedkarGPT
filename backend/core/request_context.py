"""
Remembers facts about the request that is running right now, for the admin
Errors page.

While a request runs we keep: method, path, the signed-in user's id, the
request id, when it started, and the last few log lines it wrote
("breadcrumbs"). When something goes wrong, error_tracker.py reads these, so
an error report can say exactly which request failed, for whom, how long it
had been running and what it logged on the way.

This file also adds the middleware that catches problems the old code could
not see, because nothing crashed:
  - a response with a 5xx status (e.g. a deliberate 503), and
  - a request slower than SLOW_REQUEST_SECONDS. API Gateway gives up at 30
    seconds and the user gets a 503, while the Lambda keeps running and
    finishes later. That is exactly how the "first generate 503" happened.

Everything here does nothing unless ERROR_TRACKING_ENABLED=true or the
Grafana settings are set (error_tracker.is_active()).
"""
import contextvars
import os
import time
import uuid
from datetime import datetime, timezone

# The current request's facts, or None outside a request (scripts, startup).
_current_request = contextvars.ContextVar("error_monitor_request", default=None)

MAX_BREADCRUMBS = 40


def get_current_request():
    return _current_request.get()


def slow_request_seconds() -> float:
    try:
        return float(os.getenv("SLOW_REQUEST_SECONDS", "25"))
    except ValueError:
        return 25.0


# Through the Lambda function URL there is no 30s gateway limit (it exists
# for ~47s post generation), only the Lambda's own 60s timeout. So a request
# there only counts as slow when it gets close to that.
FUNCTION_URL_SLOW_SECONDS = 50

# After a request that queued an error, wait at most this long for the
# background writes, so they finish inside the same Lambda invocation...
DRAIN_SECONDS = 1.0
# ...but never for a request that is already this slow, so the wait can
# never push it past API Gateway's 30 seconds.
NO_DRAIN_AFTER_SECONDS = 20


def _came_through_function_url(request) -> bool:
    # Mangum puts the Lambda event in the scope. A function URL request has
    # a domain like "abc.lambda-url.ap-south-1.on.aws".
    event = request.scope.get("aws.event") or {}
    domain = (event.get("requestContext") or {}).get("domainName") or ""
    return "lambda-url" in domain


def _user_id_from_header(authorization: str):
    """The user id inside the access token, or None. Never raises."""
    if not authorization.startswith("Bearer "):
        return None
    try:
        from backend.services.token_service import decode_token

        payload = decode_token(authorization[len("Bearer "):].strip())
        return payload.get("sub")
    except Exception:  # noqa: BLE001 - an expired or bad token just means "unknown user"
        return None


def add_breadcrumb(level: str, logger_name: str, message: str) -> None:
    info = _current_request.get()
    if info is None:
        return
    info["breadcrumbs"].append({
        "time": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "logger": logger_name,
        "message": message[:300],
    })
    # Keep only the last few; the lines just before the error matter most.
    if len(info["breadcrumbs"]) > MAX_BREADCRUMBS:
        del info["breadcrumbs"][0]


async def track_requests(request, call_next):
    """HTTP middleware. Registered in backend/main.py."""
    from backend.services import error_tracker, monitor_queue

    if not error_tracker.is_active():
        return await call_next(request)

    # Give the request an id now, so log lines written *during* the request
    # can carry it. The existing middleware in core/http.py reads this same
    # header, so both use one id.
    request_id = request.headers.get("x-request-id")
    if not request_id:
        request_id = str(uuid.uuid4())
        request.scope["headers"] = list(request.scope["headers"]) + [(b"x-request-id", request_id.encode())]

    info = {
        "method": request.method,
        "path": request.url.path,
        "request_id": request_id,
        "user_id": _user_id_from_header(request.headers.get("authorization", "")),
        "started": time.perf_counter(),
        "breadcrumbs": [],
        # Set by error_tracker when it has already saved an error for this
        # request, so the same failure is not saved twice.
        "error_saved": False,
        "via_function_url": _came_through_function_url(request),
    }
    token = _current_request.set(info)
    try:
        response = await call_next(request)
    finally:
        _current_request.reset(token)

    duration_ms = int((time.perf_counter() - info["started"]) * 1000)
    status = response.status_code
    slow_after = FUNCTION_URL_SLOW_SECONDS if info["via_function_url"] else slow_request_seconds()
    is_problem = status >= 500 or duration_ms >= slow_after * 1000
    if is_problem and request.method != "OPTIONS":
        # Only puts a job on the background queue; returns at once.
        error_tracker.save_request_problem(info, status, duration_ms)

    # If this request queued anything, give the background writes a moment
    # to finish while the Lambda is still awake. Normal requests queue
    # nothing and skip this.
    if monitor_queue.has_pending_jobs() and duration_ms < NO_DRAIN_AFTER_SECONDS * 1000:
        await monitor_queue.drain(DRAIN_SECONDS)
    return response
