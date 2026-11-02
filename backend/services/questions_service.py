# Load-bearing, as in questions_repo: this class has a method named `list`, and
# the `-> list[QuestionResponse]` annotations after it would resolve to that
# method and raise on import without postponed evaluation.
from __future__ import annotations

from fastapi import HTTPException, status

import os

from backend.pipeline.party_questions import CATEGORY as PARTY_CATEGORY
from backend.pipeline.position_questions import CATEGORY as POSITION_CATEGORY
from backend.pipeline.position_questions import question_party
from backend.repositories.questions_repo import QuestionsRepository
from backend.schemas.questions import (
    PendingSetsResponse,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
)


# Whether the party and position questions are ever put to the user. Off: the
# product is for senior party workers who want to write a post, not fill in a
# questionnaire, and every question has a default that stands in for an answer
# (party_questions.DEFAULT_NUMBERS, position_questions.DEFAULT_NUMBERS). Set
# ASK_PREFERENCE_QUESTIONS=true to bring the prompts back.
ASK_PREFERENCE_QUESTIONS = os.getenv("ASK_PREFERENCE_QUESTIONS", "false").strip().lower() in {"1", "true", "yes"}


class QuestionsService:
    def __init__(self) -> None:
        self.repo = QuestionsRepository()

    def create(self, payload: QuestionCreateRequest) -> QuestionResponse:
        if self.repo.get_by_question_id(payload.question_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="question_id already exists.")
        doc = self.repo.create(payload.model_dump())
        return self._to_response(doc)

    def list(self, limit: int = 100, skip: int = 0) -> list[QuestionResponse]:
        # Position and party questions are served by list_position and
        # list_party, one party at a time. Left in this listing they would reach
        # every caller that asks for "the questions": onboarding takes the first
        # 7 and the generator's panel the first 25, and both would start showing
        # someone another party's questions in place of their own profile.
        docs = self.repo.list(
            limit=limit, skip=skip, exclude_categories=[POSITION_CATEGORY, PARTY_CATEGORY]
        )
        return [self._to_response(doc) for doc in docs]

    def list_party(self, party_name: str) -> list[QuestionResponse]:
        """
        The ten party-preference questions for this party, in order.

        Empty rather than an error for a party with no set, because that is an
        ordinary state: a Samajwadi user, or someone who has not chosen a party
        yet, simply has none.
        """
        party = question_party(party_name)
        if not party:
            return []
        return [self._to_response(doc) for doc in self.repo.list_party(party, PARTY_CATEGORY)]

    def list_position(self, party_name: str, group: str) -> list[QuestionResponse]:
        """
        The five questions for this party and position group, in order.

        Empty rather than an error for a party or group with no set, because
        that is an ordinary state: a Samajwadi user or a supporter with no party
        simply has no position questions yet.
        """
        party = question_party(party_name)
        group = (group or "").strip()
        if not party or not group:
            return []
        docs = self.repo.list_position(party, group, POSITION_CATEGORY)
        return [self._to_response(doc) for doc in docs]

    def pending_sets(self, user_id: str) -> PendingSetsResponse:
        """
        Which new question sets this user has never answered.

        Answered *none of* a set, not "has a gap in it". Someone who answered
        two of the ten has seen the questionnaire and chosen to stop; sending
        them back every time they sign in would be a nag, and the eight they
        skipped already fall back to their defaults.

        The party set is only pending for an account that predates it. A newer
        account answered the position questions at sign-up and starts from the
        defaults, so asking again would put the fifteen-question sign-up back
        that the defaults exist to avoid.
        """
        from bson import ObjectId

        from backend.db.mongo import db
        from backend.pipeline.party_questions import LAUNCHED_AT
        from backend.pipeline.party_questions import question_ids_for as party_ids
        from backend.pipeline.position_questions import group_for_position
        from backend.pipeline.position_questions import question_ids_for as position_ids
        from backend.repositories.profile_answers_repo import ProfileAnswersRepository

        try:
            user = db["users"].find_one({"_id": ObjectId(user_id)}) or {}
        except Exception:
            return PendingSetsResponse()

        # An account that has never chosen a party - a Google or phone sign-up
        # that went past the profile screen - has nothing pending by the rules
        # below, which all start from the party. That read as "done" and let
        # it straight into the generator. It is the first thing outstanding.
        if not str(user.get("political_party") or "").strip():
            return PendingSetsResponse(profile=True)

        party = question_party(user.get("political_party"))
        if not party:
            return PendingSetsResponse()

        # The preference questions are written per position, so a party that
        # has them needs a position before there is anything to ask. Without
        # one the position set looked empty, which read as answered.
        if not str(user.get("party_position") or "").strip():
            return PendingSetsResponse(profile=True)

        # Party and role chosen: the defaults answer every question from here.
        if not ASK_PREFERENCE_QUESTIONS:
            return PendingSetsResponse()

        answers_repo = ProfileAnswersRepository()

        def answered_none(ids: list[str]) -> bool:
            if not ids:
                return False
            rows = answers_repo.list_by_user(
                user_id=user_id, question_ids=ids, limit=len(ids), skip=0
            )
            return not any(
                isinstance(r.get("answer"), str) and r["answer"].strip() for r in rows
            )

        created = user.get("created_at")
        if created is not None and created.tzinfo is None:
            from datetime import timezone as _tz

            created = created.replace(tzinfo=_tz.utc)
        predates_party_set = created is None or created < LAUNCHED_AT

        return PendingSetsResponse(
            party=predates_party_set and answered_none(party_ids(party)),
            position=answered_none(
                position_ids(party, group_for_position(user.get("party_position")))
            ),
        )

    def onboarding_gap(self, user_id: str) -> str | None:
        """
        What this user still has to do before a post can be written for them:
        "profile" (no party yet, or no position for a party whose preference
        questions are written per position), "preferences" (the position questions for
        their party, none answered), or None.

        The party set for accounts that predate it is not part of this: those
        accounts answered their preference questions at sign-up, and the party
        set stays the one-time prompt it was.
        """
        pending = self.pending_sets(user_id)
        if pending.profile:
            return "profile"
        if pending.position:
            return "preferences"
        return None

    def get(self, question_id: str) -> QuestionResponse:
        doc = self.repo.get_by_question_id(question_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
        return self._to_response(doc)

    def update(self, question_id: str, payload: QuestionUpdateRequest) -> QuestionResponse:
        doc = self.repo.update(question_id, payload.model_dump(exclude_unset=True))
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
        return self._to_response(doc)

    def _to_response(self, doc: dict) -> QuestionResponse:
        return QuestionResponse(
            id=str(doc["_id"]),
            question_id=doc["question_id"],
            question_text=doc["question_text"],
            category=doc.get("category"),
            answer_type=doc["answer_type"],
            options=doc.get("options", []),
            is_required=bool(doc.get("is_required", False)),
            is_active=bool(doc.get("is_active", True)),
            version=int(doc.get("version", 1)),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            party=doc.get("party"),
            position_group=doc.get("position_group"),
            display_order=doc.get("display_order"),
            question_text_hi=doc.get("question_text_hi"),
            options_hi=doc.get("options_hi") or [],
            is_compulsory=bool(doc.get("is_compulsory", False)),
            default_option=doc.get("default_option"),
        )
