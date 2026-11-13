"""The admin error monitor: what gets saved, that it can never break the app,
and that only admins can read it. Uses mongomock, never the real database."""
import logging

import mongomock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.api.v1 import monitoring
from backend.core.dependencies import get_current_user_id
from backend.repositories.error_logs_repo import ErrorLogsRepository
from backend.services import error_tracker, monitor_queue

REQUEST_ID = "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def collection(monkeypatch):
    """Tracking switched on, saving into an in-memory collection."""
    fake = mongomock.MongoClient().db.error_logs
    # Jobs an earlier test queued in the background finish into its own store,
    # not into this one.
    monitor_queue.wait_until_done(5)
    monkeypatch.setenv("ERROR_TRACKING_ENABLED", "true")
    monkeypatch.setattr(error_tracker, "_repo", ErrorLogsRepository(collection=fake))
    # Run background jobs straight away, so a test can check the result.
    monkeypatch.setattr(monitor_queue, "run_jobs_inline", True)
    return fake


def _load_user(user_id):
    # Stands in for a database call deep inside a service.
    raise KeyError(user_id)


def _generate_post():
    try:
        _load_user("abc")
    except KeyError as err:
        raise RuntimeError("could not build the profile") from err


def _crash_record(message=f"Unhandled request error request_id={REQUEST_ID} path=/api/v1/posts/generate"):
    try:
        _generate_post()
    except RuntimeError as exc:
        return logging.LogRecord("backend.http", logging.ERROR, __file__, 1, message, None,
                                 (type(exc), exc, exc.__traceback__))


def test_a_crash_is_saved_with_where_it_happened_and_its_root_cause(collection):
    error_tracker.ErrorMonitorHandler().emit(_crash_record())

    saved = collection.find_one()
    assert saved["source"] == "backend"
    assert saved["error_type"] == "RuntimeError"
    assert saved["message"] == "could not build the profile"
    assert "test_error_tracking.py" in saved["location"] and "_generate_post()" in saved["location"]
    assert saved["root_cause"] == "KeyError: 'abc'"
    assert "_load_user()" in saved["root_cause_location"]
    assert "Traceback" in saved["traceback"]
    assert saved["path"] == "/api/v1/posts/generate"
    assert saved["recent"][0]["request_id"] == REQUEST_ID
    assert saved["status"] == "open" and saved["count"] == 1


def test_the_same_error_twice_is_one_entry_with_a_count_of_two(collection):
    handler = error_tracker.ErrorMonitorHandler()
    handler.emit(_crash_record())
    handler.emit(_crash_record())

    assert collection.count_documents({}) == 1
    saved = collection.find_one()
    assert saved["count"] == 2
    assert len(saved["recent"]) == 2


def test_a_resolved_error_opens_again_when_it_comes_back(collection):
    handler = error_tracker.ErrorMonitorHandler()
    handler.emit(_crash_record())
    collection.update_one({}, {"$set": {"status": "resolved"}})

    handler.emit(_crash_record())
    assert collection.find_one()["status"] == "open"


def test_nothing_is_saved_when_tracking_is_switched_off(collection, monkeypatch):
    monkeypatch.delenv("ERROR_TRACKING_ENABLED")
    error_tracker.ErrorMonitorHandler().emit(_crash_record())
    assert collection.count_documents({}) == 0


def test_a_failing_database_never_breaks_the_request(monkeypatch):
    class BrokenRepo:
        def save_occurrence(self, *args):
            raise RuntimeError("database is down")

    monkeypatch.setenv("ERROR_TRACKING_ENABLED", "true")
    monkeypatch.setattr(error_tracker, "_repo", BrokenRepo())
    # Must not raise.
    error_tracker.ErrorMonitorHandler().emit(_crash_record())


def test_mongodb_errors_are_not_saved(collection):
    from pymongo.errors import ServerSelectionTimeoutError

    exc = ServerSelectionTimeoutError("no servers")
    record = logging.LogRecord("backend.http", logging.ERROR, __file__, 1, "db down", None, (type(exc), exc, None))
    error_tracker.ErrorMonitorHandler().emit(record)
    # This record, not "nothing at all": another thread (an app started by an
    # earlier test) can log an unrelated error into the store at the same time,
    # which made this test fail now and then in CI.
    assert collection.count_documents({"log_message": "db down"}) == 0
    assert collection.count_documents({"error_type": "ServerSelectionTimeoutError"}) == 0


def test_personal_data_is_masked_but_request_ids_are_kept():
    text = f"OTP for ravi.k@gmail.com +91 9876543210 Bearer abc.def.ghi request_id={REQUEST_ID}"
    masked = error_tracker.mask_personal_data(text)
    assert "ravi.k@gmail.com" not in masked and "9876543210" not in masked and "abc.def.ghi" not in masked
    assert REQUEST_ID in masked


def test_a_logged_error_without_exception_groups_by_its_message_template(collection):
    handler = error_tracker.ErrorMonitorHandler()
    for count in (2, 3):
        record = logging.LogRecord("backend.api.v1.chat", logging.ERROR, "/var/task/backend/api/v1/chat.py",
                                   264, "All %s providers failed", (count,), None, func="ask")
        handler.emit(record)

    saved = collection.find_one()
    assert collection.count_documents({}) == 1 and saved["count"] == 2
    assert saved["error_type"] == "LoggedError"
    assert saved["location"] == "backend/api/v1/chat.py:264 in ask()"


def test_the_handler_sees_errors_logged_anywhere_under_backend(collection):
    error_tracker.install_error_tracking()
    try:
        _generate_post()
    except RuntimeError:
        logging.getLogger("backend.some.service").exception("it broke")
    assert collection.count_documents({}) == 1


# â”€â”€ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _client(user_id, monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "admin-1, admin-2")
    app = FastAPI()
    app.include_router(monitoring.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    return TestClient(app)


def test_only_admins_can_read_errors(collection, monkeypatch):
    client = _client("someone-else", monkeypatch)
    assert client.get("/api/v1/admin/errors").status_code == 403
    assert client.get("/api/v1/admin/me").json()["is_admin"] is False


def test_an_admin_can_list_open_and_resolve(collection, monkeypatch):
    error_tracker.ErrorMonitorHandler().emit(_crash_record())
    client = _client("admin-2", monkeypatch)

    listing = client.get("/api/v1/admin/errors", params={"status": "open"}).json()
    assert listing["summary"]["open"] == 1
    error_id = listing["errors"][0]["id"]
    assert "traceback" not in listing["errors"][0]   # the list stays small

    detail = client.get(f"/api/v1/admin/errors/{error_id}").json()
    assert detail["root_cause"] == "KeyError: 'abc'"

    resolved = client.post(f"/api/v1/admin/errors/{error_id}/status", json={"status": "resolved"})
    assert resolved.status_code == 200
    assert client.get("/api/v1/admin/errors", params={"status": "open"}).json()["errors"] == []


def test_the_browser_can_report_an_error_without_signing_in(collection, monkeypatch):
    client = _client("anyone", monkeypatch)
    response = client.post("/api/v1/errors/report", json={
        "message": "TypeError: Cannot read properties of undefined (reading 'map')",
        "stack": "TypeError: ...\n    at PostList (index-abc.js:1:2345)",
        "page": "/posts",
        "kind": "react",
    })
    assert response.status_code == 204

    saved = collection.find_one()
    assert saved["source"] == "frontend" and saved["error_type"] == "TypeError"
    assert saved["message"] == "Cannot read properties of undefined (reading 'map')"
    assert saved["path"] == "/posts" and "PostList" in saved["location"]


def test_new_browser_errors_are_capped_per_hour(collection, monkeypatch):
    monkeypatch.setattr(error_tracker, "MAX_NEW_FRONTEND_ERRORS_PER_HOUR", 2)
    client = _client("anyone", monkeypatch)
    for word in ("alpha", "beta", "gamma"):
        assert client.post("/api/v1/errors/report", json={"message": f"Error: {word}"}).status_code == 204
    assert collection.count_documents({}) == 2

    # An error we already know about is still counted.
    client.post("/api/v1/errors/report", json={"message": "Error: alpha"})
    assert collection.find_one({"message": "alpha"})["count"] == 2
