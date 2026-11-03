"""
The generator's side panel carries the five position questions, and changing
one there has to change the post it sits beside.

The party questions already worked this way; the position five read only from
saved answers, so a panel control for them would have moved and done nothing
until the next post. That is worse than no control, which is what this pins.
"""
from __future__ import annotations

import pytest


PARTY = "Indian National Congress (INC)"
POSITION = "national_vice_president"
USER = {"political_party": PARTY, "party_position": POSITION}


@pytest.fixture
def service(monkeypatch):
    """PostsService with the two repositories it reads answers through stubbed."""
    from backend.services.posts_service import PostsService
    from backend.repositories import questions_repo

    svc = PostsService.__new__(PostsService)   # no __init__: nothing else is used

    class _Answers:
        rows: list[dict] = []

        def list_by_user(self, *, user_id, question_ids, limit, skip):
            return [r for r in self.rows if r["question_id"] in set(question_ids)]

    svc.profile_answers_repo = _Answers()

    # render_preferences puts each question beside its answer, so it needs the
    # question docs; the text is irrelevant here, only that the answer arrives.
    class _Questions:
        def list_by_ids(self, ids):
            return [{"question_id": i, "question_text": f"Q {i}", "options": []} for i in ids]

    monkeypatch.setattr(questions_repo, "QuestionsRepository", _Questions)
    return svc


def _ids():
    from backend.pipeline.position_questions import (
        group_for_position,
        question_ids_for,
        question_party,
    )

    return question_ids_for(question_party(PARTY), group_for_position(POSITION))


def test_the_five_questions_exist_for_this_party_and_level(service):
    """Guards the ids this whole feature is keyed on."""
    ids = _ids()
    assert len(ids) == 5
    assert ids[0] == "pos_inc_national_q1"


def test_a_panel_answer_reaches_the_prompt(service):
    """Nothing saved, one changed in the panel: it is what the prompt carries."""
    ids = _ids()
    prose, answers = service._position_preferences(
        "user-1", USER, overrides={ids[0]: "Constitutional democracy"}
    )

    assert answers[ids[0]] == "Constitutional democracy"
    assert "Constitutional democracy" in prose


def test_the_panel_wins_over_the_saved_answer(service):
    """Changing one for a single post must not be overruled by the stored one."""
    ids = _ids()
    service.profile_answers_repo.rows = [{"question_id": ids[0], "answer": "Saved answer"}]

    _prose, answers = service._position_preferences(
        "user-1", USER, overrides={ids[0]: "Panel answer"}
    )

    assert answers[ids[0]] == "Panel answer"


def test_saved_answers_still_apply_when_the_panel_sends_nothing(service):
    """The Preferences page stays the place a lasting answer is set."""
    ids = _ids()
    service.profile_answers_repo.rows = [{"question_id": ids[1], "answer": "Saved answer"}]

    _prose, answers = service._position_preferences("user-1", USER, overrides={})

    assert answers[ids[1]] == "Saved answer"


def test_an_unanswered_writer_gets_the_defaults(service):
    """Nobody is asked these any more, so the set's defaults stand in."""
    from backend.pipeline.position_questions import defaults_for

    prose, answers = service._position_preferences("user-1", USER, overrides=None)
    assert answers == defaults_for("inc", "National")
    assert len(answers) == 5 and prose


def test_a_party_with_no_position_set_is_not_an_error(service):
    """A party with no questions written is ordinary, not a failure."""
    prose, answers = service._position_preferences(
        "user-1", {"political_party": "Aam Aadmi Party (AAP)", "party_position": POSITION},
        overrides={"pos_inc_national_q1": "ignored"},
    )
    assert (prose, answers) == ("", {})
