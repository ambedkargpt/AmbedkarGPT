"""Memgraph connection: configured from the environment, bounded, and observable.

Book references come only from Memgraph, so a missing or wrong setting used to mean "no
references, silently" - or every chat message waiting on a connection that never answers.
A fake `neo4j` module stands in for the driver; nothing here touches a real database.

    pytest backend/tests/test_semrag_connection.py
"""

import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Imported here, not inside a test: importing the API loads backend/.env into the process, and
# doing that mid-test would put a developer's real Memgraph settings in front of the fixture's
# clean environment. At collection time the fixture's delenv still clears them for every test.
from backend.api.v1.health import router
from backend.semrag import memgraph_retriever as m

ENV_NAMES = ("MEMGRAPH_URI", "MEMGRAPH_USERNAME", "MEMGRAPH_PASSWORD",
             "NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD")


class FakeGraphDatabase:
    """Records every driver() call; `reachable` decides which URIs connect."""

    def __init__(self, reachable=()):
        self.reachable = set(reachable)
        self.calls = []        # (uri, auth, kwargs)
        self.closed = 0

    def driver(self, uri, auth=None, **kwargs):
        self.calls.append((uri, auth, kwargs))
        outer = self

        class Driver:
            def verify_connectivity(self_inner):
                if uri not in outer.reachable:
                    raise OSError("unreachable")

            def close(self_inner):
                outer.closed += 1

        return Driver()


@pytest.fixture
def fake(monkeypatch):
    """Clean environment and module state, with a fake driver installed."""
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(m, "_DRIVER", None)
    monkeypatch.setattr(m, "_RETRY_AFTER", 0.0)
    monkeypatch.setattr(m, "_LAST_ERROR", "")
    monkeypatch.setattr(m, "_WARNED_UNCONFIGURED", False)
    graph = FakeGraphDatabase()
    monkeypatch.setitem(sys.modules, "neo4j", types.SimpleNamespace(GraphDatabase=graph))
    return graph


def test_not_configured_means_no_connection_attempt_and_a_clear_reason(fake):
    assert m.get_memgraph_driver() is None
    assert fake.calls == []
    assert m.memgraph_status() == {
        "configured": False, "credentials_set": False, "connected": False,
        "reason": "MEMGRAPH_URI is not set",
    }


def test_settings_are_read_when_connecting_not_when_imported(fake, monkeypatch):
    # The variables did not exist when the module was imported - as when a .env is loaded late.
    monkeypatch.setenv("MEMGRAPH_URI", "bolt://db.example:7687")
    monkeypatch.setenv("MEMGRAPH_USERNAME", "reader")
    monkeypatch.setenv("MEMGRAPH_PASSWORD", "not-a-real-password")
    fake.reachable = {"bolt://db.example:7687"}
    assert m.get_memgraph_driver() is not None
    uri, auth, _ = fake.calls[0]
    assert uri == "bolt://db.example:7687" and auth == ("reader", "not-a-real-password")


def test_neo4j_names_work_as_aliases_and_stray_whitespace_is_ignored(fake, monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "  bolt://db.example:7687\n")
    fake.reachable = {"bolt://db.example:7687"}
    assert m.get_memgraph_driver() is not None


def test_self_signed_certificate_falls_back_to_ssc(fake, monkeypatch):
    monkeypatch.setenv("MEMGRAPH_URI", "bolt+s://db.example:7687")
    fake.reachable = {"bolt+ssc://db.example:7687"}
    assert m.get_memgraph_driver() is not None
    assert [c[0] for c in fake.calls] == ["bolt+s://db.example:7687", "bolt+ssc://db.example:7687"]
    assert fake.closed == 1  # the failed first driver is not leaked


def test_every_attempt_has_a_connection_timeout(fake, monkeypatch):
    monkeypatch.setenv("MEMGRAPH_URI", "bolt+s://db.example:7687")
    m.get_memgraph_driver()
    assert fake.calls and all(c[2].get("connection_timeout") == m.CONNECT_TIMEOUT_S for c in fake.calls)


def test_a_failure_is_not_retried_by_every_request(fake, monkeypatch):
    monkeypatch.setenv("MEMGRAPH_URI", "bolt+s://db.example:7687")
    assert m.get_memgraph_driver() is None
    attempts = len(fake.calls)
    assert attempts == 2
    for _ in range(5):                       # five more chat messages during the outage
        assert m.get_memgraph_driver() is None
    assert len(fake.calls) == attempts       # none of them waited on Memgraph


def test_it_reconnects_once_the_cooldown_has_passed(fake, monkeypatch):
    monkeypatch.setenv("MEMGRAPH_URI", "bolt://db.example:7687")
    assert m.get_memgraph_driver() is None
    monkeypatch.setattr(m, "_RETRY_AFTER", 0.0)          # cooldown over
    fake.reachable = {"bolt://db.example:7687"}          # and the database is back
    assert m.get_memgraph_driver() is not None


def test_status_when_unreachable_never_exposes_the_address_or_credentials(fake, monkeypatch):
    monkeypatch.setenv("MEMGRAPH_URI", "bolt+s://secret-host.example:7687")
    monkeypatch.setenv("MEMGRAPH_USERNAME", "secret-user")
    monkeypatch.setenv("MEMGRAPH_PASSWORD", "secret-password")
    status = m.memgraph_status()
    assert status["configured"] and status["credentials_set"] and not status["connected"]
    assert status["reason"]
    assert "secret" not in repr(status)


def test_health_route_is_503_until_connected_then_200(fake, monkeypatch):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    client = TestClient(app)

    assert client.get("/api/v1/health/semrag").status_code == 503   # nothing configured

    monkeypatch.setenv("MEMGRAPH_URI", "bolt://db.example:7687")
    fake.reachable = {"bolt://db.example:7687"}
    ok = client.get("/api/v1/health/semrag")
    assert ok.status_code == 200 and ok.json()["connected"] is True
