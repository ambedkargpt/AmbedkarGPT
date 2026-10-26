"""
Send one fake error to Grafana Cloud, to check the Grafana settings work.

Run from the repo root:

    python -m backend.scripts.send_test_error_to_grafana

It reads GRAFANA_LOKI_URL, GRAFANA_LOKI_USER and GRAFANA_LOKI_TOKEN from
backend/.env. Nothing in the app is touched; it only sends one log line.
Then in Grafana, open Explore, pick the Loki (logs) data source, and run:

    {app="ambedkargpt", service="local-test"}
"""
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# A separate service name, so test lines are easy to find and never mixed
# up with real errors from the live API.
os.environ["GRAFANA_SERVICE_NAME"] = "local-test"

from backend.services import grafana_logs  # noqa: E402 - needs the env loaded first


def main() -> int:
    if grafana_logs.get_settings() is None:
        print("Missing settings. Add GRAFANA_LOKI_URL, GRAFANA_LOKI_USER and GRAFANA_LOKI_TOKEN to backend/.env.")
        return 1

    try:
        raise ValueError(f"Test error from AmbedkarGPT at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    except ValueError:
        record = logging.LogRecord(
            "backend.grafana_test", logging.ERROR, __file__, 0,
            "Grafana test error request_id=test-123 path=/test", None, sys.exc_info(),
            func="main",
        )

    status = grafana_logs.send_record(record)
    if status is not None and status < 300:
        print(f"Sent. Loki answered {status}. Look for it in Grafana Explore: {{app=\"ambedkargpt\", service=\"local-test\"}}")
        return 0
    print(f"Not sent. Loki answered {status}. Check the URL, the user id and that the token has logs:write.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
