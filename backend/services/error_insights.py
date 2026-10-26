"""
Turns saved errors into something an admin can act on.

Two parts:
  1. explain(issue)  - plain-English "what happened / where / likely cause /
                       how to fix", from simple rules about common errors.
  2. numbers for the charts - timelines, top failing paths, error types,
                       users affected - counted from the error_events
                       collection.

The rules are a starting point, not a guarantee: they say what this kind of
error *usually* means. The traceback and the log lines leading up to the
error are the real evidence, and the page always shows those too.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone

GATEWAY_TIMEOUT_MS = 29000


def _as_utc(value: datetime) -> datetime:
    # pymongo returns UTC datetimes without a timezone attached.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _seconds(ms) -> str:
    if ms is None:
        return "?"
    return f"{ms / 1000:.1f}s"


# ── 1. explain ───────────────────────────────────────────────────────────────

def _what_happened(issue: dict, last_event: dict) -> str:
    kind = issue.get("kind")
    method = issue.get("method") or ""
    path = issue.get("path") or ""
    count = issue.get("count", 1)
    times = "once" if count == 1 else f"{count} times"

    if kind == "exception":
        where = f" while handling {method} {path}" if path else ""
        return f"{issue['error_type']} was raised in {issue.get('location') or 'our code'}{where}. It has happened {times}."
    if kind == "logged":
        return f"Our code logged an error: \"{issue.get('message')}\". It has happened {times}."
    if kind == "http_5xx":
        return f"{method} {path} answered with {issue['error_type']} but no error was logged, so the code returned it on purpose (an HTTPException). It has happened {times}."
    if kind == "slow_request":
        took = _seconds(last_event.get("duration_ms")) if last_event else "?"
        return f"{method} {path} took {took}. Behind API Gateway anything over 30s reaches the user as a 503, even though the server finished. It has happened {times}."
    if kind == "api_failure":
        return f"In visitors' browsers, {method} {path} failed with {issue['error_type']}. The server did not record this request as an error, so the failure happened in front of it (API Gateway, the network, or a killed Lambda). It has happened {times}."
    if kind == "browser_crash":
        return f"{issue['error_type']} was thrown in the browser on {issue.get('page') or issue.get('path') or 'a page'}. It has happened {times}."
    return issue.get("message", "")


def _cause_and_fixes(issue: dict, last_event: dict) -> tuple[str, list[str]]:
    """The most likely cause and what to try, from simple rules."""
    kind = issue.get("kind")
    error_type = issue.get("error_type", "")
    root_type = issue.get("root_cause_type", "")
    message = (issue.get("message") or "").lower()
    status = (last_event or {}).get("status")
    duration = (last_event or {}).get("duration_ms") or 0
    types = {error_type, root_type}

    # API Gateway's own 503 often has no CORS headers, so the browser sees it
    # as "no answer" (status 0) rather than 503. After ~30s both mean the same.
    gateway_timed_out = kind == "api_failure" and status in (503, 504, 0, None) and duration >= GATEWAY_TIMEOUT_MS
    if kind == "slow_request" and issue.get("via_function_url"):
        return (
            "Close to the Lambda's own 60-second timeout. Through the function URL there is no 30s gateway "
            "limit, but at 60s the Lambda is stopped and the user gets an error.",
            [
                "Check the log lines below for the slowest step.",
                "Move long work (web research, long model calls) to a background job, or raise the Lambda timeout.",
            ],
        )
    if kind == "slow_request" or gateway_timed_out:
        return (
            "API Gateway timeout. The request needed more than 30 seconds. The usual reasons here: a cold "
            "Lambda downloading the ~200 MB RAG files (about 40s on first use), a slow DeepSeek reply, or "
            "inline web research during post generation.",
            [
                "Check the log lines below: the step just before the long gap is the slow one.",
                "If it is the first request after a quiet period, it is a cold start. Call the warm-up route earlier (GET /posts/warm) or keep the Lambda warm.",
                "If the server finished the work, the frontend should poll for the result instead of failing (like generatePostForNews does).",
                "For work that regularly takes over 30s, use the Lambda function URL (no 30s limit) or move it to a background job.",
            ],
        )
    if kind == "api_failure" and status == 502:
        return (
            "Bad gateway. The Lambda crashed, ran out of memory, hit its own 60s timeout, or returned a response API Gateway could not read.",
            [
                "Search CloudWatch for 'Task timed out' or 'Runtime exited' around this time.",
                "Check the Lambda's memory use in the REPORT lines; raise memory if it is near the limit.",
            ],
        )
    if kind == "api_failure" and not status:
        return (
            "No answer reached the browser. Usually the visitor's connection dropped, the request was blocked by CORS, or the page was closed mid-request.",
            [
                "If many different users have it, check CORS_ORIGINS on the Lambda and that the API URL is up.",
                "If it is only a few users, it is most likely their network and can be ignored.",
            ],
        )
    if kind == "api_failure":
        return (
            f"The API answered {status} without the server recording an error for it.",
            ["Search the request id or the time in Grafana / CloudWatch to see what the Lambda did."],
        )
    if kind == "http_5xx":
        return (
            "The endpoint raised an HTTPException with a 5xx status on purpose, usually when something it depends on failed.",
            [
                "Look at the log lines below for the warning just before the response.",
                f"Search the code under the route {issue.get('path')} for 'HTTPException(status_code={status or 503}'.",
            ],
        )
    if any("Timeout" in t for t in types) or "timed out" in message:
        return (
            "A call to another service (DeepSeek, OpenAI, Pinecone, S3 or a website) took too long and was cut off.",
            [
                "Check if the service was slow or down at that time.",
                "Add a retry with a short backoff, or a fallback answer, around that call.",
            ],
        )
    if any(t in ("ServerSelectionTimeoutError", "AutoReconnect", "ConnectionFailure", "NetworkTimeout") for t in types):
        return (
            "MongoDB could not be reached.",
            ["Check Atlas status and the network access list, and that MONGODB_URI is set on the Lambda."],
        )
    if "KeyError" in types:
        return (
            "Code read a dictionary key that was not there. The data had a different shape than the code expected (a missing field in a database document, an API reply or a request).",
            [
                f"Open {issue.get('root_cause_location') or issue.get('location')} and check where that dictionary comes from.",
                "Use .get() with a default if the field can be missing, or fix the data that is missing it.",
            ],
        )
    if "AttributeError" in types or "NoneType" in message:
        return (
            "Code used a value that was None. Usually a database lookup found nothing, or an optional field was empty.",
            [f"Add a None check before {issue.get('location') or 'that line'}, and decide what should happen when the value is missing."],
        )
    if "TypeError" in types and issue.get("source") == "frontend":
        return (
            "A component read a property of undefined or null. The data from the API was missing a field the component expected, or it rendered before the data arrived.",
            [
                "Look at the React components list to find which component it was.",
                "Guard the value (data?.field ?? default) and check the API response for that page.",
            ],
        )
    if "Failed to fetch dynamically imported module" in issue.get("message", "") or "ChunkLoadError" in types:
        return (
            "The visitor had an old version of the site open while a new one was deployed, so a page chunk they asked for no longer exists.",
            ["Usually harmless; a reload fixes it. To avoid it, reload the page automatically on this error."],
        )
    if "ValidationError" in types:
        return (
            "Data did not match the expected schema (Pydantic).",
            ["The traceback lists which field failed. Check the data source or relax the schema if the value is legitimate."],
        )
    if kind == "logged":
        return (
            "Our own code decided this was an error and logged it, without raising.",
            [f"Open {issue.get('location')} to see the condition that logs it."],
        )
    return (
        "No rule matches this error yet. The traceback and log lines below are the evidence.",
        ["Start at the 'Where' line, then follow the root cause."],
    )


def explain(issue: dict, last_event: dict | None) -> dict:
    cause, fixes = _cause_and_fixes(issue, last_event or {})
    return {
        "what": _what_happened(issue, last_event or {}),
        "where": issue.get("location") or "",
        "likely_cause": cause,
        "how_to_fix": fixes,
    }


# ── 2. numbers for the charts ───────────────────────────────────────────────

def bucket_size_minutes(hours: int) -> int:
    """1-hour bars for a day, 6-hour bars for a week."""
    return 60 if hours <= 24 else 360


def timeline(events: list[dict], since: datetime, hours: int) -> list[dict]:
    """Counts per time bucket, split into backend and browser."""
    size = timedelta(minutes=bucket_size_minutes(hours))
    start = since.replace(minute=0, second=0, microsecond=0)
    buckets = []
    current = start
    end = since + timedelta(hours=hours)
    while current < end:
        buckets.append({"start": current.isoformat(), "backend": 0, "frontend": 0})
        current += size

    for event in events:
        index = int((_as_utc(event["time"]) - start) / size)
        if 0 <= index < len(buckets):
            source = "frontend" if event.get("source") == "frontend" else "backend"
            buckets[index][source] += 1
    return buckets


def sparkline(events: list[dict], since: datetime, hours: int, points: int = 24) -> list[int]:
    size = timedelta(hours=hours) / points
    counts = [0] * points
    for event in events:
        index = int((_as_utc(event["time"]) - since) / size)
        if 0 <= index < points:
            counts[index] += 1
    return counts


def overview(issues: list[dict], events: list[dict], since: datetime, hours: int) -> dict:
    """Everything the top of the Errors page shows for the chosen period."""
    users = {e["user_id"] for e in events if e.get("user_id")}
    paths = Counter(
        f"{e.get('method') or ''} {e.get('path') or e.get('page') or ''}".strip()
        for e in events if e.get("path") or e.get("page")
    )
    types = Counter(e.get("error_type") or "Unknown" for e in events)
    kinds = Counter(e.get("kind") or "unknown" for e in events)
    new_issues = [i for i in issues if i.get("first_seen") and _as_utc(i["first_seen"]) >= since]

    return {
        "hours": hours,
        "bucket_minutes": bucket_size_minutes(hours),
        "occurrences": len(events),
        "users_affected": len(users),
        "new_issues": len(new_issues),
        "timeline": timeline(events, since, hours),
        "top_paths": [{"name": name, "count": count} for name, count in paths.most_common(6)],
        "top_types": [{"name": name, "count": count} for name, count in types.most_common(6)],
        "by_kind": dict(kinds),
    }


def investigate_queries(issue: dict, events: list[dict]) -> list[dict]:
    """Ready-to-paste searches for Grafana and CloudWatch."""
    request_id = next((e.get("request_id") for e in events if e.get("request_id")), None)
    queries = []
    if request_id:
        queries.append({
            "label": "Grafana: everything this request logged",
            "query": f'{{app="ambedkargpt"}} |= "{request_id}"',
        })
        queries.append({
            "label": "CloudWatch Logs Insights: this request",
            "query": f"fields @timestamp, @message | filter @message like /{request_id}/ | sort @timestamp asc",
        })
    if issue.get("source") == "backend" and issue.get("error_type"):
        queries.append({
            "label": "Grafana: every time this error type was logged",
            "query": f'{{app="ambedkargpt"}} | json | error_type="{issue["error_type"]}"',
        })
    if issue.get("kind") in ("slow_request", "api_failure"):
        queries.append({
            "label": "CloudWatch Logs Insights: slowest Lambda runs",
            "query": "filter @type = \"REPORT\" | fields @timestamp, @duration, @maxMemoryUsed | sort @duration desc | limit 20",
        })
    return queries
