"""
"Continue as guest · Congress / · Samajwadi": a ready-made account for one party.

A guest writes posts without signing up, so it is a real account with the party,
the position and the preferences already chosen. The same browser and party get
the same account back; one network address can make only a few in a day; and a
guest can write only a few posts a day.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import mongomock
import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend.services import guest_service as gs


class Answers:
    """Records what would be written to user_profile_answers."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], str] = {}

    def upsert_answer(self, user_id, question_id, answer, source):
        self.rows[(user_id, question_id)] = answer
        return {}


@pytest.fixture
def users():
    return mongomock.MongoClient().db["users"]


def _svc(users, answers=None):
    return gs.GuestService(users, answers or Answers())


def test_a_congress_guest_is_set_up_to_write_posts(users):
    answers = Answers()
    user = _svc(users, answers).find_or_create("congress", "device-abc-123", "1.2.3.4")

    assert user["is_guest"] is True
    assert user["political_party"] == "Indian National Congress (INC)"
    assert user["party_position"] == "national_spokesperson"
    assert user["auth_providers"] == ["guest"]
    # Neither the device id nor the address is stored as it came.
    assert "device-abc-123" not in str(user) and "1.2.3.4" not in str(user)
    # The three party preferences changed from the defaults are saved.
    saved = {q: a for (u, q), a in answers.rows.items() if u == str(user["_id"])}
    assert saved == gs.guest_answers("inc")
    assert len(saved) == 3


def test_the_guest_answers_are_real_options_for_both_parties():
    from backend.pipeline import party_questions as pq

    for key in ("inc", "sp"):
        picks = gs.guest_answers(key)
        assert len(picks) == 3
        for question_id, answer in picks.items():
            options = [o[0] for q in pq.OPTIONS[key] for o in q]
            assert answer in options, (key, question_id, answer)
        assert "Strongly supportive" in picks.values()


def test_the_same_device_and_party_get_the_same_account_back(users):
    svc = _svc(users)
    first = svc.find_or_create("samajwadi", "device-xyz-999", "5.6.7.8")
    again = svc.find_or_create("samajwadi", "device-xyz-999", "9.9.9.9")
    other_party = svc.find_or_create("congress", "device-xyz-999", "5.6.7.8")

    assert again["_id"] == first["_id"]
    assert other_party["_id"] != first["_id"]
    assert first["political_party"] == "Samajwadi Party (SP)"
    assert users.count_documents({"is_guest": True}) == 2


def test_one_address_can_make_only_a_few_guest_accounts_a_day(users):
    svc = _svc(users)
    for i in range(gs.GUEST_ACCOUNTS_PER_IP_PER_DAY):
        svc.find_or_create("congress", f"device-{i:04d}-abcd", "10.0.0.1")
    with pytest.raises(HTTPException) as err:
        svc.find_or_create("congress", "device-new-abcd", "10.0.0.1")
    assert err.value.status_code == 429
    assert err.value.detail["error"] == "guest_limit"
    # A returning device is not a new account, so it still gets in.
    svc.find_or_create("congress", "device-0000-abcd", "10.0.0.1")
    # Another address is unaffected.
    svc.find_or_create("congress", "device-new-abcd", "10.0.0.2")


def test_accounts_made_yesterday_do_not_count_against_today(users):
    svc = _svc(users)
    for i in range(gs.GUEST_ACCOUNTS_PER_IP_PER_DAY):
        svc.find_or_create("congress", f"device-{i:04d}-old0", "10.0.0.3")
    users.update_many({}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(days=2)}})
    svc.find_or_create("congress", "device-fresh-0001", "10.0.0.3")


def test_an_unknown_party_is_refused(users):
    with pytest.raises(HTTPException) as err:
        _svc(users).find_or_create("bjp", "device-abc-123", "1.2.3.4")
    assert err.value.status_code == 400


def test_a_guest_has_nothing_outstanding_before_writing(users, monkeypatch):
    """Party and position are set, so the onboarding gate lets a guest straight in."""
    import backend.db.mongo as mongo
    from backend.services.questions_service import QuestionsService

    db = mongomock.MongoClient().db
    monkeypatch.setattr(mongo, "db", db)
    user = gs.GuestService(db["users"], Answers()).find_or_create("congress", "device-gate-0001", "1.1.1.1")
    svc = QuestionsService.__new__(QuestionsService)
    assert svc.onboarding_gap(str(user["_id"])) is None


def test_the_public_user_says_it_is_a_guest():
    from backend.services.auth_service import AuthService

    svc = AuthService.__new__(AuthService)
    now = datetime.now(timezone.utc)
    base = {"_id": ObjectId(), "username": "guest_con_ab12cd34", "created_at": now, "auth_providers": ["guest"]}
    assert svc._to_user_public({**base, "is_guest": True}).is_guest is True
    assert svc._to_user_public(base).is_guest is False


def test_a_guest_can_write_only_a_few_posts_a_day(monkeypatch):
    import backend.services.posts_service as ps

    db = mongomock.MongoClient().db
    monkeypatch.setattr(ps, "db", db)
    guest_id = db["users"].insert_one({"is_guest": True}).inserted_id
    member_id = db["users"].insert_one({}).inserted_id

    class Repo:
        today = 0

        def count_today(self, user_id):
            return self.today

    svc = ps.PostsService.__new__(ps.PostsService)
    svc.repo = Repo()

    svc.repo.today = ps.GUEST_POSTS_PER_DAY - 1
    svc._check_guest_limit(str(guest_id))            # one left: allowed

    svc.repo.today = ps.GUEST_POSTS_PER_DAY
    with pytest.raises(HTTPException) as err:
        svc._check_guest_limit(str(guest_id))
    assert err.value.status_code == 429
    assert err.value.detail["error"] == "guest_limit"

    svc._check_guest_limit(str(member_id))           # a real account: no cap here
