"""The topic finder trusts nothing the model says about the book: its verse ids are checked against the book.

    pytest backend/tests/test_manusmriti_trial_topics.py
"""

from backend.tests.test_manusmriti_trial_verify import VERSES
from backend.trials.manusmriti_critique.tools import propose_topics as pt

IDS = list(VERSES)          # 8.267 8.268 8.270 8.271 8.272 5.148 8.417


def topic(title, anchors, **kw):
    return {"id": title.lower().replace(" ", "_"), "title": title, "anchor_verses": anchors, **kw}


def test_the_prompt_carries_the_whole_book_and_the_rule_that_the_visitor_never_asks():
    system, user = pt.build_prompts(VERSES, 14)
    assert "never types a question" in system
    assert all(f"{vid} " in user for vid in IDS) and "[chapter 8]" in user and "[chapter 5]" in user
    assert "Propose 14" in user


def test_the_purpose_of_the_menu_is_stated_to_the_model_not_left_for_it_to_guess():
    critique, _ = pt.build_prompts(VERSES, 14)                         # the default, because that is what the trial is for
    general, _ = pt.build_prompts(VERSES, 14, "general")
    assert "fact-based critique" in critique and "rank people by birth-class" in critique
    assert "fact-based critique" not in general and "general reader" in general
    assert "never types a question" in critique and "never types a question" in general


def test_verse_ids_the_book_does_not_have_are_dropped_and_reported():
    topics, notes = pt.validate({"topics": [topic("Insults", ["8.267", "8.268", "8.999", "8.270"], strongest_verse="9.9")]}, VERSES, min_anchors=2)
    assert topics[0]["anchor_verses"] == ["8.267", "8.268", "8.270"]
    assert topics[0]["dropped_unknown_ids"] == ["8.999"]
    assert topics[0]["strongest_verse"] == "8.270"                    # an invented strongest verse is replaced by the last valid one
    assert any("8.999" in n for n in notes) and any("strongest_verse 9.9" in n for n in notes)


def test_a_topic_without_enough_valid_verses_is_not_usable():
    topics, _ = pt.validate({"topics": [topic("Thin", ["8.267", "1.1", "1.2"])]}, VERSES, min_anchors=3)
    assert topics[0]["usable"] is False
    assert pt.validate([topic("Enough", IDS[:3])], VERSES, min_anchors=3)[0][0]["usable"] is True      # a bare list is accepted


def test_a_reply_that_is_not_a_list_of_topics_gives_no_topics_instead_of_crashing():
    assert pt.validate({"something": 1}, VERSES) == ([], [])
    assert pt.validate("nonsense", VERSES) == ([], [])
    assert pt.validate({"topics": ["not a dict", 3]}, VERSES) == ([], [])


def test_the_menu_skips_a_topic_that_mostly_repeats_a_better_one():
    a = topic("Insults", IDS[:4])
    b = topic("Same again", IDS[:4])                                   # all of its verses are already used
    c = topic("Women", ["5.148", "8.417", "8.272"])
    topics, _ = pt.validate({"topics": [a, b, c]}, VERSES, min_anchors=3)
    menu, skipped = pt.suggest_menu(topics, size=10)
    assert [t["title"] for t in menu] == ["Insults", "Women"]
    assert any("Same again" in s for s in skipped)


def test_the_menu_has_at_most_the_requested_size_and_keeps_the_models_ranking():
    topics, _ = pt.validate([topic(f"T{i}", [IDS[i], IDS[i + 1], IDS[i + 2]]) for i in range(4)], VERSES, min_anchors=3)
    menu, _ = pt.suggest_menu(topics, size=2, max_shared=1.0)
    assert [t["title"] for t in menu] == ["T0", "T1"]


def test_propose_uses_the_model_it_is_given_and_returns_a_checked_menu():
    calls = []

    def fake(system, user, **kw):
        calls.append(kw)
        return {"topics": [topic("Insults", IDS[:4]), topic("Women", ["5.148", "8.417", "8.272"])]}

    result = pt.propose(VERSES, 2, complete=fake, model="models/test")
    assert calls[0]["model"] == "models/test" and calls[0]["providers"] == ["gemini"]
    assert result["model"] == "models/test" and len(result["topics"]) == 2
