"""
No post is written for an account that has not chosen a party and answered its
preference questions.

A Google or phone sign-up that went past the profile screen had no party, and
the pending check - which starts from the party - reported nothing pending, so
the app let it straight into the generator. The rule now holds at the endpoint
as well as in the app, because the app is only one client of it.
"""
from __future__ import annotations

from datetime import datetime, timezone

import mongomock
import pytest
from bson import ObjectId
from fastapi import HTTPException

INC = "Indian National Congress (INC)"
BJP = "Bharatiya Janata Party (BJP)"
POSITION = "national_vice_president"
USER_ID = str(ObjectId())


@pytest.fixture
def users(monkeypatch):
    import backend.db.mongo as mongo

    db = mongomock.MongoClient().db
    monkeypatch.setattr(mongo, "db", db)
    return db["users"]


@pytest.fixture
def answers(monkeypatch):
    """Which question ids the user has answered."""
    from backend.repositories import profile_answers_repo

    answered: set[str] = set()

    def list_by_user(self, user_id, question_ids, limit, skip):
        return [{"question_id": q, "answer": "yes"} for q in question_ids if q in answered]

    monkeypatch.setattr(profile_answers_repo.ProfileAnswersRepository, "__init__", lambda self: None)
    monkeypatch.setattr(profile_answers_repo.ProfileAnswersRepository, "list_by_user", list_by_user)
    return answered


def _service():
    from backend.services.questions_service import QuestionsService

    svc = QuestionsService.__new__(QuestionsService)   # no repo: not used here
    return svc


def _user(users, **fields):
    users.insert_one({"_id": ObjectId(USER_ID), "created_at": datetime.now(timezone.utc), **fields})


def test_an_account_with_no_party_has_its_profile_outstanding(users, answers):
    _user(users)
    pending = _service().pending_sets(USER_ID)
    assert pending.profile is True
    assert _service().onboarding_gap(USER_ID) == "profile"


def test_a_party_with_questions_needs_a_position_first(users, answers):
    # Its preference questions are written per position: no position, nothing
    # to ask - which used to read as "all answered".
    _user(users, political_party=INC)
    assert _service().onboarding_gap(USER_ID) == "profile"


def test_a_party_with_no_questions_needs_only_the_party(users, answers):
    _user(users, political_party=BJP)
    assert _service().onboarding_gap(USER_ID) is None


def test_party_and_position_chosen_is_enough(users, answers):
    """The defaults answer every question, so nothing is outstanding."""
    _user(users, political_party=INC, party_position=POSITION)
    assert _service().onboarding_gap(USER_ID) is None


def test_with_questions_switched_on_a_position_with_no_answers_is_outstanding(users, answers, monkeypatch):
    from backend.services import questions_service

    monkeypatch.setattr(questions_service, "ASK_PREFERENCE_QUESTIONS", True)
    from backend.pipeline.position_questions import group_for_position
    from backend.pipeline.position_questions import question_ids_for as position_ids
    from backend.pipeline.position_questions import question_party

    _user(users, political_party=INC, party_position=POSITION)
    ids = position_ids(question_party(INC), group_for_position(POSITION))
    assert ids, "the test position should have a question set"
    assert _service().onboarding_gap(USER_ID) == "preferences"

    answers.add(ids[0])
    assert _service().onboarding_gap(USER_ID) is None


def test_the_endpoint_refuses_until_onboarding_is_done(monkeypatch):
    from backend.api.v1 import posts

    monkeypatch.setattr(posts.questions, "onboarding_gap", lambda user_id: "profile")
    with pytest.raises(HTTPException) as caught:
        posts._require_onboarding(USER_ID)
    assert caught.value.status_code == 403
    assert caught.value.detail["code"] == "onboarding_required"
    assert caught.value.detail["step"] == "profile"

    monkeypatch.setattr(posts.questions, "onboarding_gap", lambda user_id: None)
    posts._require_onboarding(USER_ID)   # no exception


def test_generate_and_regenerate_both_check():
    import inspect

    from backend.api.v1 import posts

    for fn in (posts.generate_post, posts.regenerate_post):
        assert "_require_onboarding(" in inspect.getsource(fn), fn.__name__
