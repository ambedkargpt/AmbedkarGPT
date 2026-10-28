"""
Sign-up asks only for an email or a phone; the rest comes after the code.

The name, the other contact, state, city, party and role are filled in on the
details screen once the OTP is verified, so the sign-up requests must no
longer insist on state and city. Google sign-in says whether it just created
the account, which is how the client knows to show that screen.
"""
from __future__ import annotations

import pytest

from backend.schemas.auth import SendPhoneOtpRequest, SignupRequest
from backend.tests.test_otp_session_after_verify import _Users, auth  # noqa: F401  (fixture)


def test_email_signup_needs_no_state_or_city():
    req = SignupRequest(username="mail_user", email="m@example.com", password="password123")
    assert req.state is None and req.city is None


def test_phone_signup_needs_no_state_or_city():
    req = SendPhoneOtpRequest(phone="+919800000001", purpose="signup_verify")
    assert req.state is None and req.city is None


class _GoogleUsers(_Users):
    def upsert_google_user(self, email, username_seed, political_party=None, full_name=None):
        found = self.find_by_email(email)
        if found:
            return found
        row = self.create_user(username=username_seed, email=email, political_party=political_party,
                               auth_providers=["google"])
        row["full_name"] = full_name
        return row


@pytest.fixture
def google(auth, monkeypatch):  # noqa: F811
    from backend.services import auth_service as mod

    auth.users_repo = _GoogleUsers()
    monkeypatch.setattr(mod, "fetch_google_userinfo", lambda token: {"email": "g@example.com", "name": "Asha Rao"})
    return auth


def test_first_google_sign_in_is_flagged_new_and_keeps_the_name(google):
    res = google.google_login("token")
    assert res.is_new_user is True
    assert res.user.full_name == "Asha Rao"


def test_a_returning_google_user_is_not_new(google):
    google.google_login("token")
    assert google.google_login("token").is_new_user is False


def test_the_signup_route_accepts_no_state_or_city(monkeypatch):
    # The route used to call .strip() on both, which a schema test alone
    # did not catch: the request validated and then failed with a 500.
    from fastapi.testclient import TestClient

    from backend.api.v1 import auth as route
    from backend.main import app

    seen = {}
    monkeypatch.setattr(route.service, "signup", lambda **kw: seen.update(kw) or route.AuthResponse(otp_required=True))
    res = TestClient(app).post("/api/v1/auth/signup", json={
        "username": "mail_user", "email": "m@example.com", "password": "password123",
    })
    assert res.status_code == 200, res.text
    assert seen["state"] is None and seen["city"] is None
