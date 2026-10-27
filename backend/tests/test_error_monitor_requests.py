"""The error monitor catches failures that are not crashes: a deliberate 503,
a request slow enough for API Gateway to give up, and API calls that failed
in the browser. Also: the log lines before an error are kept, one failure is
never saved twice, and the page explains a gateway timeout. mongomock only."""
import logging
import time

import mongomock
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.api.v1 import monitoring
from backend.core.dependencies import get_current_user_id
from backend.core.http import register_http_layer
from backend.core.request_context import track_requests
from backend.repositories.error_logs_repo import ErrorLogsRepository
from backend.services import error_insights, error_tracker, monitor_queue

log = logging.getLogger("backend.services.fake_posts")


@pytest.fixture
def db(monkeypatch):
    collection = mongomock.MongoClient().db.error_logs
    monkeypatch.setenv("ERROR_TRACKING_ENABLED", "true")
    monkeypatch.setenv("ADMIN_USER_IDS", "admin-1")
    monkeypatch.setattr(error_tracker, "_repo", ErrorLogsRepository(collection=collection))
    # Run background jobs straight away, so a test can check the result.
    monkeypatch.setattr(monitor_queue, "run_jobs_inline", True)
    error_tracker.install_error_tracking()
    return collection


@pytest.fixture
def client(db):
    """A small app wired like backend/main.py, with routes that fail in different ways."""
    app = FastAPI()
    register_http_layer(app)
    app.middleware("http")(track_requests)
    app.include_router(monitoring.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user_id] = lambda: "admin-1"

    @app.post("/api/v1/posts/generate")
    def generate():
        log.warning("[generate] DeepSeek is not answering")
        raise HTTPException(status_code=503, detail="Generation is unavailable right now.")

    @app.get("/api/v1/posts/{post_id}")
    def crash(post_id: str):
        log.warning("[posts] loading %s", post_id)
        return {}["profile"]

    @app.get("/api/v1/slow")
    def slow():
        time.sleep(0.2)
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_a_deliberate_503_is_recorded_with_the_lines_logged_before_it(client, db):
    assert client.post("/api/v1/posts/generate").status_code == 503

    issue = db.find_one()
    assert issue["kind"] == "http_5xx" and issue["error_type"] == "HTTP 503"
    assert issue["path"] == "/api/v1/posts/generate" and issue["method"] == "POST"
    assert any("DeepSeek is not answering" in b["message"] for b in issue["breadcrumbs"])

    event = db.database.error_events.find_one()
    assert event["status"] == 503 and event["duration_ms"] is not None and event["request_id"]


def test_a_crash_is_saved_once_with_request_details_and_an_id_free_path(client, db):
    response = client.get("/api/v1/posts/6712ab34cd56ef7890123456")
    assert response.status_code == 500

    # The crash is saved by the log handler; the middleware must not add a
    # second "HTTP 500" issue for the same request.
    assert db.count_documents({}) == 1
    issue = db.find_one()
    assert issue["kind"] == "exception" and issue["error_type"] == "KeyError"
    assert issue["method"] == "GET"
    assert any("loading" in b["message"] for b in issue["breadcrumbs"])
    # The request id the user got back is the one stored.
    assert issue["recent"][0]["request_id"] == response.headers["X-Request-Id"]


def test_a_slow_request_is_recorded_as_a_gateway_timeout_risk(client, db, monkeypatch):
    monkeypatch.setenv("SLOW_REQUEST_SECONDS", "0.1")
    assert client.get("/api/v1/slow").status_code == 200

    issue = db.find_one()
    assert issue["kind"] == "slow_request" and issue["error_type"] == "SlowRequest"
    insight = error_insights.explain(issue, db.database.error_events.find_one())
    assert "API Gateway timeout" in insight["likely_cause"]


def test_nothing_is_recorded_when_tracking_is_off(client, db, monkeypatch):
    monkeypatch.setenv("ERROR_TRACKING_ENABLED", "")
    client.post("/api/v1/posts/generate")
    assert db.count_documents({}) == 0


def test_a_503_seen_only_by_the_browser_is_recorded_and_explained(client, db):
    report = {
        "kind": "api", "message": "Request failed with status code 503",
        "method": "post", "api_path": "/posts/generate", "status": 503, "duration_ms": 30040,
        "page": "/generate/social-media",
    }
    assert client.post("/api/v1/errors/report", json=report).status_code == 204
    assert client.post("/api/v1/errors/report", json=report).status_code == 204

    issue = db.find_one()
    assert issue["kind"] == "api_failure" and issue["error_type"] == "HTTP 503" and issue["count"] == 2

    detail = client.get(f"/api/v1/admin/errors/{issue['_id']}").json()
    assert "API Gateway timeout" in detail["insight"]["likely_cause"]
    assert detail["stats"]["events_in_period"] == 2 and detail["stats"]["slowest_ms"] == 30040
    assert len(detail["events"]) == 2


def test_the_overview_counts_occurrences_users_and_top_paths(client, db):
    client.post("/api/v1/posts/generate")
    client.post("/api/v1/posts/generate")
    client.get("/api/v1/posts/6712ab34cd56ef7890123456")

    data = client.get("/api/v1/admin/errors", params={"hours": 24}).json()
    overview = data["overview"]
    assert overview["occurrences"] == 3
    assert sum(b["backend"] for b in overview["timeline"]) == 3
    assert overview["top_paths"][0] == {"name": "POST /api/v1/posts/generate", "count": 2}

    row = next(r for r in data["errors"] if r["kind"] == "http_5xx")
    assert row["events_in_period"] == 2 and sum(row["sparkline"]) == 2


def test_a_slow_request_through_the_function_url_is_not_called_a_gateway_503():
    info = {"method": "POST", "path": "/api/v1/posts/generate", "request_id": "r", "user_id": None,
            "breadcrumbs": [], "error_saved": False, "via_function_url": True}
    _fingerprint, details, _occurrence = error_tracker.build_request_problem(info, 200, 52000)
    assert "function URL" in details["message"]
    assert "60-second" in error_insights.explain(details, None)["likely_cause"]


def test_ids_are_removed_from_paths_before_grouping():
    assert error_tracker.normalize_path("/api/v1/posts/6712ab34cd56ef7890123456/publish") == "/api/v1/posts/:id/publish"
    assert error_tracker.normalize_path("/api/v1/news/by-news-id/news_000123") == "/api/v1/news/by-news-id/:news_id"
