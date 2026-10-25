"""
A session is issued only after the OTP is checked.

send-phone-otp used to return a live session (and the account's details) for
any registered number, with otp_required as a hint the client was trusted to
honour. Nothing on the server enforced it, so the code was decorative. These
pin the fixed behaviour: sending a code returns nothing but "a code is on its
way", and verify-otp is the only place a code becomes a session.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException


class _Users:
    def __init__(self):
        self.rows = {}

    def _row(self, **kw):
        _id = f"u{len(self.rows) + 1}"
        row = {
            "_id": _id, "username": kw.get("username") or _id, "email": kw.get("email"), "phone": kw.get("phone"),
            "political_party": kw.get("political_party"), "party_position": "", "auth_providers": kw.get("auth_providers", []),
            "password_hash": kw.get("password_hash"), "is_email_verified": False, "is_phone_verified": False,
            "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        }
        self.rows[_id] = row
        return row

    def create_user(self, **kw):
        return self._row(**kw)

    def find_by_phone(self, phone):
        return next((u for u in self.rows.values() if u.get("phone") == phone), None)

    def find_by_email(self, email):
        return next((u for u in self.rows.values() if u.get("email") == email), None)

    def find_by_username(self, name):
        return next((u for u in self.rows.values() if u.get("username") == name), None)

    def find_by_identifier(self, ident):
        return self.find_by_email(ident) or self.find_by_phone(ident) or self.find_by_username(ident)

    def find_by_id(self, _id):
        return self.rows.get(str(_id))

    def verify_channel(self, user_id, channel):
        self.rows[str(user_id)][f"is_{channel}_verified"] = True

    def update_last_login(self, _id):
        pass


class _Otps:
    def __init__(self):
        self.docs = []

    def create_otp(self, **kw):
        kw.update(_id=len(self.docs), attempt_count=0)
        self.docs.append(kw)

    def get_active_otp(self, target, channel, purpose):
        live = [d for d in self.docs if d["target"] == target and d["purpose"] == purpose and not d.get("used")]
        return live[-1] if live else None

    def increment_attempt(self, _id):
        self.docs[_id]["attempt_count"] += 1

    def consume(self, _id):
        self.docs[_id]["used"] = True


class _Sessions:
    def __init__(self):
        self.created = 0

    def create_session(self, **_kw):
        self.created += 1


@pytest.fixture
def auth(monkeypatch):
    from backend.services import auth_service as mod

    svc = mod.AuthService.__new__(mod.AuthService)
    svc.users_repo, svc.otp_repo, svc.sessions_repo = _Users(), _Otps(), _Sessions()
    monkeypatch.setattr(mod, "build_hashed_otp", lambda: ("123456", "hash"))
    monkeypatch.setattr(mod, "verify_otp_hash", lambda code, h: code == "123456")
    monkeypatch.setattr(mod, "try_send_otp_sms", lambda *a, **k: None)
    monkeypatch.setattr(mod, "try_send_otp_email", lambda *a, **k: None)
    monkeypatch.setattr(mod, "hash_password", lambda p: "hashed:" + p)
    monkeypatch.setattr(mod, "verify_password", lambda p, h: h == "hashed:" + p)
    return svc


def _existing(auth, **kw):
    user = auth.users_repo.create_user(username="victim", email="v@example.com", political_party="Party", **kw)
    auth.users_repo.verify_channel(user["_id"], "phone" if kw.get("phone") else "email")
    return user


def test_login_code_request_returns_no_session_and_no_account_details(auth):
    _existing(auth, phone="+919876543210", auth_providers=["phone"])
    res = auth.send_phone_otp(phone="+919876543210", purpose="login_verify")
    assert res.tokens is None
    assert res.user is None
    assert res.otp_required is True
    assert auth.sessions_repo.created == 0


def test_a_wrong_code_gives_no_session(auth):
    _existing(auth, phone="+919876543210", auth_providers=["phone"])
    auth.send_phone_otp(phone="+919876543210", purpose="login_verify")
    with pytest.raises(HTTPException):
        auth.verify_otp(target="+919876543210", channel="phone", otp_code="000000", purpose="login_verify")
    assert auth.sessions_repo.created == 0


def test_the_right_code_is_what_issues_the_session(auth):
    user = _existing(auth, phone="+919876543210", auth_providers=["phone"])
    auth.send_phone_otp(phone="+919876543210", purpose="login_verify")
    res = auth.verify_otp(target="+919876543210", channel="phone", otp_code="123456", purpose="login_verify")
    assert res.tokens is not None and res.tokens.access_token
    assert res.user is not None and res.user.id == user["_id"]
    assert auth.sessions_repo.created == 1


def test_phone_signup_creates_the_account_but_no_session_until_verified(auth):
    res = auth.send_phone_otp(phone="+919800000001", purpose="signup_verify", username="new_user", state="UP", city="Lucknow")
    assert res.tokens is None and res.user is None
    assert auth.sessions_repo.created == 0
    res = auth.verify_otp(target="+919800000001", channel="phone", otp_code="123456", purpose="signup_verify")
    assert res.tokens is not None
    assert auth.users_repo.find_by_phone("+919800000001")["is_phone_verified"] is True


def test_email_signup_returns_no_session_until_verified(auth):
    res = auth.signup(username="mail_user", password="password123", email="m@example.com", phone=None,
                      political_party=None, state="UP", city="Lucknow")
    assert res.tokens is None and res.user is None and res.otp_required is True
    res = auth.verify_otp(target="m@example.com", channel="email", otp_code="123456", purpose="signup_verify")
    assert res.tokens is not None


def test_password_login_of_an_unverified_account_waits_for_the_code(auth):
    auth.users_repo.create_user(username="unverified", email="u@example.com", password_hash="hashed:password123",
                                political_party=None, auth_providers=["password"])
    res = auth.login(identifier="u@example.com", password="password123")
    assert res.tokens is None and res.otp_required is True
    assert auth.sessions_repo.created == 0


def test_a_reset_password_code_never_becomes_a_session(auth):
    user = _existing(auth, auth_providers=["password"])
    auth.otp_repo.create_otp(user_id=user["_id"], channel="email", target="v@example.com", otp_hash="hash",
                             purpose="reset_password", max_attempts=5, expires_at=None)
    res = auth.verify_otp(target="v@example.com", channel="email", otp_code="123456", purpose="reset_password")
    assert res.tokens is None
    assert auth.sessions_repo.created == 0
