"""Grafana log shipping: off without settings, every kind of error reaches it
(including slow requests, the API Gateway 503 case), the request never waits
for it, and it can never break the app. No real network calls are made."""
import json
import logging
import time

import pytest

from backend.services import error_tracker, grafana_logs, monitor_queue


@pytest.fixture
def loki_settings(monkeypatch):
    monkeypatch.setenv("GRAFANA_LOKI_URL", "https://logs.example.grafana.net/loki/api/v1/push")
    monkeypatch.setenv("GRAFANA_LOKI_USER", "123456")
    monkeypatch.setenv("GRAFANA_LOKI_TOKEN", "glc_test")


@pytest.fixture
def sent(loki_settings, monkeypatch):
    """Grafana switched on, jobs run straight away, and every push is captured."""
    calls = []

    class Response:
        status_code = 204
        text = ""

    def fake_post(url, json, auth, timeout):
        calls.append({"url": url, "auth": auth, "timeout": timeout, "payload": json})
        return Response()

    monkeypatch.setattr(grafana_logs.httpx, "post", fake_post)
    monkeypatch.setattr(monitor_queue, "run_jobs_inline", True)
    return calls


def _crash_record():
    try:
        try:
            {}["profile"]
        except KeyError as err:
            raise RuntimeError("could not build the profile for ravi@gmail.com") from err
    except RuntimeError as exc:
        return logging.LogRecord(
            "backend.http", logging.ERROR, __file__, 1,
            "Unhandled request error request_id=req-42 path=/api/v1/posts/generate", None,
            (type(exc), exc, exc.__traceback__),
        )


def _line(call):
    stream = call["payload"]["streams"][0]
    return stream["stream"], json.loads(stream["values"][0][1])


def test_nothing_is_sent_without_settings(monkeypatch):
    for name in ("GRAFANA_LOKI_URL", "GRAFANA_LOKI_USER", "GRAFANA_LOKI_TOKEN"):
        monkeypatch.delenv(name, raising=False)

    def fail(*args, **kwargs):
        raise AssertionError("should not send")

    monkeypatch.setattr(grafana_logs.httpx, "post", fail)
    assert grafana_logs.send_record(_crash_record()) is None
    assert error_tracker.is_active() is False


def test_a_crash_reaches_grafana_with_where_and_why_and_masked(sent):
    error_tracker.ErrorMonitorHandler().emit(_crash_record())

    assert len(sent) == 1
    assert sent[0]["auth"] == ("123456", "glc_test")
    labels, line = _line(sent[0])
    assert labels == {"app": "ambedkargpt", "service": "api", "env": "development",
                      "source": "backend", "kind": "exception", "level": "error"}
    assert line["error_type"] == "RuntimeError"
    assert "test_grafana_logs.py" in line["location"]
    assert line["root_cause"] == "KeyError: 'profile'"
    assert line["request_id"] == "req-42" and line["path"] == "/api/v1/posts/generate"
    assert "ravi@gmail.com" not in json.dumps(line)


def test_a_slow_request_reaches_grafana_as_a_warning(sent):
    info = {"method": "POST", "path": "/api/v1/posts/generate", "request_id": "r-1",
            "user_id": "u-1", "breadcrumbs": [], "error_saved": False}
    error_tracker.save_request_problem(info, 200, 31000)

    labels, line = _line(sent[0])
    assert labels["kind"] == "slow_request" and labels["level"] == "warning"
    assert line["duration_ms"] == 31000 and line["request_id"] == "r-1"


def test_a_browser_503_reaches_grafana_without_mongodb(sent):
    from backend.schemas.monitoring import ClientErrorReport

    error_tracker.save_client_error(ClientErrorReport(
        kind="api", message="Request failed with status code 503", method="post",
        api_path="/api/v1/posts/generate", status=503, duration_ms=30040,
    ))
    labels, line = _line(sent[0])
    assert labels["source"] == "frontend" and labels["kind"] == "api_failure"
    assert line["status"] == 503 and line["duration_ms"] == 30040


def test_the_request_never_waits_for_a_slow_grafana(loki_settings, monkeypatch):
    def slow_post(*args, **kwargs):
        time.sleep(1.5)
        raise grafana_logs.httpx.ReadTimeout("grafana is slow")

    monkeypatch.setattr(grafana_logs.httpx, "post", slow_post)
    started = time.perf_counter()
    error_tracker.ErrorMonitorHandler().emit(_crash_record())
    took = time.perf_counter() - started

    # Logging an error only queues the send; it does not wait 1.5s for Grafana.
    assert took < 0.1
    monitor_queue.wait_until_done(5)


def test_a_network_failure_never_breaks_the_app(sent, monkeypatch):
    def broken_post(*args, **kwargs):
        raise grafana_logs.httpx.ConnectTimeout("grafana is down")

    monkeypatch.setattr(grafana_logs.httpx, "post", broken_post)
    # Must not raise.
    error_tracker.ErrorMonitorHandler().emit(_crash_record())
