"""
Sends error monitor records to Grafana Cloud (Loki), so they can be searched
and alerted on in Grafana.

Everything the admin Errors page records goes to Grafana as well, one log
line per occurrence: crashes, logger.error lines, 5xx answers, slow requests
(the API Gateway 503s) and browser errors. error_tracker.record() calls
send_event() from the background queue, so requests never wait for Grafana.

Why the app sends them itself, instead of copying them out of CloudWatch:
  - it costs nothing on AWS (no Firehose, no extra Lambda),
  - it works the same on a laptop, so it can be tested locally first.

Switched on only when all three settings exist (in backend/.env locally, or
on the Lambda in production):

    GRAFANA_LOKI_URL    e.g. https://logs-prod-028.grafana.net/loki/api/v1/push
    GRAFANA_LOKI_USER   the numeric user id shown next to that URL
    GRAFANA_LOKI_TOKEN  a Cloud Access Policy token with the logs:write scope

Remove any one of them to switch it off. Useful searches in Grafana Explore:

    {app="ambedkargpt", env="production"}                 everything
    {app="ambedkargpt", kind="slow_request"}              API Gateway 503 risks
    {app="ambedkargpt", kind="api_failure"}               failures seen in browsers
    {app="ambedkargpt"} |= "<request id>"                 one request
"""
import json
import logging
import os
import sys
import time

import httpx

SEND_TIMEOUT_SECONDS = 2


def get_settings():
    """(url, user, token), or None when any of them is missing."""
    url = os.getenv("GRAFANA_LOKI_URL", "").strip()
    user = os.getenv("GRAFANA_LOKI_USER", "").strip()
    token = os.getenv("GRAFANA_LOKI_TOKEN", "").strip()
    if not url or not user or not token:
        return None
    return url, user, token


def is_enabled() -> bool:
    return get_settings() is not None


def build_payload(details: dict, occurrence: dict, timestamp: float) -> dict:
    """
    The JSON body Loki's push API expects, for one occurrence.

    Labels are kept few and fixed (app, service, env, source, kind, level).
    Loki is slow and expensive with many different label values, so things
    like the path or request id go inside the log line instead, where
    Grafana can still search them.
    """
    line = {
        "kind": details.get("kind"),
        "error_type": details.get("error_type"),
        "message": details.get("message"),
        "location": details.get("location"),
        "code_line": details.get("code_line"),
        "root_cause": details.get("root_cause"),
        "root_cause_location": details.get("root_cause_location"),
        "logger": details.get("logger"),
        "method": occurrence.get("method"),
        "path": occurrence.get("path"),
        "page": occurrence.get("page"),
        "status": occurrence.get("status"),
        "duration_ms": occurrence.get("duration_ms"),
        "request_id": occurrence.get("request_id"),
        "user_id": occurrence.get("user_id"),
        "traceback": details.get("traceback"),
    }
    # A slow request that still succeeded is a warning; everything else is an error.
    level = "warning" if details.get("kind") == "slow_request" else "error"
    labels = {
        "app": "ambedkargpt",
        "service": os.getenv("GRAFANA_SERVICE_NAME", "api"),
        "env": os.getenv("APP_ENV", "development"),
        "source": details.get("source") or "backend",
        "kind": details.get("kind") or "unknown",
        "level": level,
    }
    # Loki wants the time in nanoseconds, as a string.
    timestamp_ns = str(int(timestamp * 1_000_000_000))
    return {"streams": [{"stream": labels, "values": [[timestamp_ns, json.dumps(line, ensure_ascii=False)]]}]}


def send_event(details: dict, occurrence: dict, timestamp: float = None):
    """Send one occurrence. Returns Loki's HTTP status code, or None when switched off."""
    settings = get_settings()
    if settings is None:
        return None
    url, user, token = settings
    payload = build_payload(details, occurrence, timestamp or time.time())
    response = httpx.post(url, json=payload, auth=(user, token), timeout=SEND_TIMEOUT_SECONDS)
    # Loki answers 204 when it accepted the logs.
    if response.status_code >= 300:
        print(f"[grafana-logs] Loki refused the log: {response.status_code} {response.text[:200]}", file=sys.stderr)
    return response.status_code


def send_record(record: logging.LogRecord):
    """Send one log record straight away (used by the test script)."""
    from backend.services.error_tracker import build_backend_error

    _fingerprint, details, occurrence = build_backend_error(record)
    return send_event(details, occurrence, record.created)
