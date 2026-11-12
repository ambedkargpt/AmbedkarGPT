"""
The twice-daily activity report: the window it covers, where visits came from,
what it gathers, the event log behind it, and the endpoint the scheduler calls.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import mongomock
import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend.services import activity_service as act
from backend.services import report_service as rs

IST = rs.IST


def at(hour, minute=0, day=12):
    return datetime(2026, 11, day, hour, minute, tzinfo=IST).astimezone(timezone.utc)


# ── The window ───────────────────────────────────────────────────────────────

def test_the_6pm_report_covers_the_day_until_6():
    w = rs.report_window(at(18, 5))
    assert w["slot"] == "evening"
    assert (w["start"], w["end"]) == (datetime(2026, 11, 12, 0, 0, tzinfo=IST), datetime(2026, 11, 12, 18, 0, tzinfo=IST))


def test_the_midnight_report_covers_6pm_to_midnight_and_the_day_that_ended():
    w = rs.report_window(at(0, 10, day=13))
    assert w["slot"] == "midnight"
    assert w["start"] == datetime(2026, 11, 12, 18, 0, tzinfo=IST)
    assert w["end"] == datetime(2026, 11, 13, 0, 0, tzinfo=IST)
    assert w["day_start"] == datetime(2026, 11, 12, 0, 0, tzinfo=IST)


def test_a_late_run_still_reports_the_window_that_ended():
    assert rs.report_window(at(19, 40))["end"] == datetime(2026, 11, 12, 18, 0, tzinfo=IST)
    assert rs.report_window(at(3, 0))["end"] == datetime(2026, 11, 12, 0, 0, tzinfo=IST)


# ── Where a visit came from ──────────────────────────────────────────────────

@pytest.mark.parametrize("doc, source", [
    ({"utm_source": "instagram"}, "Instagram"),
    ({"referrer": "https://l.instagram.com/?u=x"}, "Instagram"),
    ({"user_agent": "Mozilla/5.0 (iPhone) Instagram 321.0"}, "Instagram"),
    ({"user_agent": "Mozilla/5.0 [FBAN/FBIOS;FBAV/400]"}, "Facebook"),
    ({"referrer": "https://wa.me/"}, "WhatsApp"),
    ({"referrer": "https://t.co/abc"}, "X / Twitter"),
    ({"referrer": "https://www.google.co.in/"}, "Google"),
    ({"referrer": "https://digitalnews.example/"}, "digitalnews.example"),     # not Instagram
    ({"referrer": "https://www.ambedkargpt.in/landing"}, "Direct"),
    ({}, "Direct"),
])
def test_where_a_visit_came_from(doc, source):
    assert rs.source_of(doc) == source


# ── The event log ────────────────────────────────────────────────────────────

class Req:
    def __init__(self, ip="49.36.10.20", agent="Mozilla/5.0"):
        self.client = type("C", (), {"host": ip})()
        self.headers = {"user-agent": agent}


def test_record_keeps_who_and_from_where_and_never_raises():
    col = mongomock.MongoClient().db["activity"]
    act.record("login", Req(), {"_id": ObjectId(), "username": "krish", "phone": "+91999", "political_party": "INC"},
               {"path": "x" * 900}, collection=col)
    doc = col.find_one()
    assert doc["type"] == "login" and doc["ip"] == "49.36.10.20" and doc["username"] == "krish"
    assert len(doc["path"]) == 300
    act.record("not-a-type", Req(), None, collection=col)            # ignored
    act.record("visit", Req(), None, collection=object())   # a broken store: no exception
    assert col.count_documents({}) == 1


def test_a_session_is_recorded_only_when_one_was_issued():
    from backend.schemas.auth import AuthResponse

    col = mongomock.MongoClient().db["activity"]
    original = act.record
    act.record = lambda kind, request, user=None, extra=None, collection=None: original(kind, request, user, extra, col)
    try:
        act.record_session("login", Req(), AuthResponse(otp_required=True))          # code sent, no session yet
        assert col.count_documents({}) == 0
        user = {"id": str(ObjectId()), "username": "a", "is_email_verified": True, "is_phone_verified": False,
                "auth_providers": ["google"], "created_at": datetime.now(timezone.utc)}
        act.record_session("login", Req(), AuthResponse(user=user, tokens={"access_token": "a", "refresh_token": "r",
                           "access_expires_at": datetime.now(timezone.utc), "refresh_expires_at": datetime.now(timezone.utc)},
                           is_new_user=True))
        assert col.find_one()["type"] == "signup"                                    # a new Google account
    finally:
        act.record = original


# ── What the report gathers ──────────────────────────────────────────────────

def test_the_report_gathers_each_section_with_places():
    db = mongomock.MongoClient().db
    w = rs.report_window(at(18, 5))
    inside = at(12)
    news = db["news"].insert_one({"headline": "कांग्रेस का बड़ा दांव"}).inserted_id
    member = db["users"].insert_one({"username": "krish", "full_name": "Krish", "phone": "+91999", "political_party": "Indian National Congress (INC)",
                                     "party_position": "national_spokesperson", "auth_providers": ["phone"], "created_at": inside}).inserted_id
    guest = db["users"].insert_one({"username": "guest_con_1", "is_guest": True, "political_party": "Indian National Congress (INC)", "created_at": inside}).inserted_id
    db["users"].insert_one({"username": "old", "created_at": at(12) - timedelta(days=3)})     # outside the window
    db["activity"].insert_many([
        {"type": "signup", "user_id": str(member), "ip": "49.36.10.20", "created_at": inside},
        {"type": "login", "user_id": str(member), "username": "krish", "ip": "49.36.10.20", "created_at": inside},
        {"type": "guest_login", "user_id": str(guest), "username": "guest_con_1", "ip": "103.21.1.1", "created_at": inside},
        {"type": "visit", "ip": "49.36.10.20", "utm_source": "instagram", "path": "/", "created_at": inside},
        {"type": "visit", "ip": "103.21.1.1", "user_agent": "Instagram 300", "path": "/", "created_at": inside},
        {"type": "visit", "ip": "10.0.0.1", "path": "/", "created_at": inside},                               # private
        {"type": "visit", "ip": "49.36.10.20", "path": "/", "created_at": at(19)},                            # after the window
    ])
    db["posts"].insert_one({"user_id": guest, "news_id": news, "content": "पोस्ट का पाठ", "status": "draft",
                            "generation_meta": {"profile_used": {"target_platform": "WhatsApp"}}, "created_at": inside})

    looked_up = []

    def fetch(ips):
        looked_up.extend(ips)
        return [{"status": "success", "query": ip, "city": "Lucknow", "regionName": "Uttar Pradesh", "country": "India"} for ip in ips]

    data = rs.gather(db, w, fetch_places=fetch)
    assert [s["username"] for s in data["signups"]] == ["krish"]
    assert data["signups"][0]["from"] == "Lucknow, Uttar Pradesh, India"
    assert data["signups"][0]["role"] == "AICC Chief Spokesperson"
    assert [g["new"] for g in data["guests"]] == ["new"]
    assert data["posts"][0]["story"] == "कांग्रेस का बड़ा दांव" and data["posts"][0]["guest"] == "guest"
    assert data["visit_summary"]["total"] == 3 and data["visit_summary"]["unique"] == 3
    assert dict(data["visit_summary"]["sources"])["Instagram"] == 2
    assert sorted(looked_up) == ["103.21.1.1", "49.36.10.20"]          # private address not sent out
    assert data["day"]["signups"] == 1 and data["day"]["new_guests"] == 1 and data["day"]["posts"] == 1

    # A second report looks nothing up again: the places are cached.
    looked_up.clear()
    rs.gather(db, w, fetch_places=fetch)
    assert looked_up == []

    html = rs.to_html(data)
    assert "Sign-ups" in html and "Lucknow" in html
    assert rs.to_csv(data["posts"], ("time", "post")).startswith("﻿".encode("utf-8"))


def test_a_failed_place_lookup_does_not_stop_the_report():
    db = mongomock.MongoClient().db
    db["activity"].insert_one({"type": "visit", "ip": "49.36.10.20", "created_at": at(12)})

    def broken(ips):
        raise TimeoutError("down")

    data = rs.gather(db, rs.report_window(at(18, 5)), fetch_places=broken)
    assert data["visit_summary"]["total"] == 1 and data["visits"][0]["from"] == ""


# ── The endpoint ─────────────────────────────────────────────────────────────

def test_the_endpoint_needs_the_shared_secret(monkeypatch):
    from backend.api.v1 import reports

    monkeypatch.delenv("REPORT_TOKEN", raising=False)
    with pytest.raises(HTTPException) as err:
        reports.send_report(dry_run=True, x_report_token="x")
    assert err.value.status_code == 503

    monkeypatch.setenv("REPORT_TOKEN", "secret-token")
    with pytest.raises(HTTPException) as err:
        reports.send_report(dry_run=True, x_report_token="wrong")
    assert err.value.status_code == 403


def test_a_dry_run_counts_and_sends_nothing(monkeypatch):
    import backend.db.mongo as mongo
    from backend.api.v1 import reports

    monkeypatch.setenv("REPORT_TOKEN", "secret-token")
    monkeypatch.setattr(mongo, "db", mongomock.MongoClient().db)
    monkeypatch.setattr(rs, "_fetch_places", lambda ips: [])
    monkeypatch.setattr(rs, "send", lambda data: (_ for _ in ()).throw(AssertionError("sent on a dry run")))
    out = reports.send_report(dry_run=True, x_report_token="secret-token")
    assert out["sent_to"] == [] and out["posts"] == 0 and "day" in out
