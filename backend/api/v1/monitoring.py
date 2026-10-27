"""
Routes for the admin Errors page, and the one the browser reports errors to.

    GET  /admin/me                     -> is the signed-in user an admin?
    GET  /admin/errors?hours=24        -> overview charts + list of issues (admin)
    GET  /admin/errors/{id}?hours=168  -> one issue in depth (admin)
    POST /admin/errors/{id}/status     -> mark it resolved / open again (admin)
    POST /errors/report                -> the browser sends an error here (public)
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from backend.core.admin import is_admin, require_admin
from backend.core.dependencies import get_current_user_id
from backend.schemas.monitoring import ClientErrorReport, ErrorStatusUpdate
from backend.services import error_insights, error_tracker

router = APIRouter(tags=["monitoring"])

# The page offers "last 24 hours" and "last 7 days". Events are kept 7 days.
ALLOWED_HOURS = (24, 168)


def _to_json(doc: dict) -> dict:
    # MongoDB's ObjectId cannot be sent as JSON, so it goes out as a string "id".
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


def _since(hours: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=hours)


@router.get("/admin/me")
def admin_me(current_user_id: str = Depends(get_current_user_id)) -> dict:
    return {
        "is_admin": is_admin(current_user_id),
        # Lets the page explain an empty list when tracking is switched off.
        "tracking_enabled": error_tracker.is_enabled(),
    }


@router.get("/admin/errors")
def list_errors(
    # Called "status" in the URL (?status=open); renamed here so it does not
    # hide fastapi's `status` module imported above.
    status_filter: Optional[Literal["open", "resolved"]] = Query(default=None, alias="status"),
    source: Optional[Literal["backend", "frontend"]] = None,
    hours: int = 24,
    _admin_id: str = Depends(require_admin),
) -> dict:
    if hours not in ALLOWED_HOURS:
        hours = 24
    since = _since(hours)
    repo = error_tracker.get_repo()

    issues = repo.list_errors(status=status_filter, source=source)
    events = repo.events_since(since)
    if source:
        events = [e for e in events if e.get("source") == source]

    # Group this period's events by issue, for the per-row numbers.
    events_by_issue = {}
    for event in events:
        events_by_issue.setdefault(event["fingerprint"], []).append(event)

    rows = []
    for issue in issues:
        issue_events = events_by_issue.get(issue["fingerprint"], [])
        row = _to_json(issue)
        row["events_in_period"] = len(issue_events)
        row["users_in_period"] = len({e["user_id"] for e in issue_events if e.get("user_id")})
        row["sparkline"] = error_insights.sparkline(issue_events, since, hours)
        rows.append(row)

    return {
        "summary": repo.summary(),
        "overview": error_insights.overview(issues, events, since, hours),
        "errors": rows,
    }


@router.get("/admin/errors/{error_id}")
def get_error(error_id: str, hours: int = 168, _admin_id: str = Depends(require_admin)) -> dict:
    if hours not in ALLOWED_HOURS:
        hours = 168
    repo = error_tracker.get_repo()
    doc = repo.get_error(error_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error not found.")

    since = _since(hours)
    # Small fields of every occurrence, for the numbers and the chart...
    events = repo.events_since(since, fingerprint=doc["fingerprint"])
    # ...and the full version, with log lines, of only the 50 newest.
    latest = repo.events_since(since, fingerprint=doc["fingerprint"], limit=50, with_logs=True)
    last_event = events[0] if events else None
    durations = [e["duration_ms"] for e in events if e.get("duration_ms") is not None]

    issue = _to_json(doc)
    issue["insight"] = error_insights.explain(doc, last_event)
    issue["timeline"] = error_insights.timeline(events, since, hours)
    issue["bucket_minutes"] = error_insights.bucket_size_minutes(hours)
    issue["stats"] = {
        "hours": hours,
        "events_in_period": len(events),
        "users_affected": len({e["user_id"] for e in events if e.get("user_id")}),
        "paths": [
            {"name": name, "count": count}
            for name, count in Counter(
                f"{e.get('method') or ''} {e.get('path') or e.get('page') or ''}".strip() for e in events
            ).most_common(5)
        ],
        "slowest_ms": max(durations) if durations else None,
        "average_ms": int(sum(durations) / len(durations)) if durations else None,
    }
    # The 50 newest occurrences, each with the log lines that led up to it.
    issue["events"] = [_to_json(e) for e in latest]
    issue["investigate"] = error_insights.investigate_queries(doc, events)
    return issue


@router.post("/admin/errors/{error_id}/status")
def update_error_status(
    error_id: str,
    payload: ErrorStatusUpdate,
    _admin_id: str = Depends(require_admin),
) -> dict:
    updated = error_tracker.get_repo().set_status(error_id, payload.status)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error not found.")
    return {"id": error_id, "status": payload.status}


@router.post("/errors/report", status_code=status.HTTP_204_NO_CONTENT)
def report_client_error(report: ClientErrorReport) -> Response:
    """
    Public on purpose: a crash can happen before anyone signs in.

    Always answers 204, even if saving failed, so the browser never retries
    or shows anything to the visitor because of this call.
    """
    error_tracker.save_client_error(report)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
