"""The generation loop, with a stand-in for the model so nothing here calls an API.

What matters is that no matter what the model writes, a post that is not provable from the verses never
comes out marked "approved".

    pytest backend/tests/test_manusmriti_trial_generate.py
"""

import json

import pytest

from backend.trials.manusmriti_critique import book, generate, llm, verify, xformat
from backend.trials.manusmriti_critique.book import Verse

from backend.tests.test_manusmriti_trial_verify import TEXT, VERSES

GOOD_TEXT = ('Same insult. Different price.\n\nManusmriti 8.268: a Brahmana who defames a Sudra pays twelve panas.\n'
             'Manusmriti 8.270: a Sudra who insults a twice-born man "shall have his tongue cut out".\n\nEqual?')
GOOD = {"pattern": "asymmetry", "verses": ["8.268", "8.270"], "text": GOOD_TEXT,
        "quotes": [{"verse": "8.270", "text": "shall have his tongue cut out"}]}
JUDGE_OK = {"reviews": [{"index": 0, "faithful": True, "tone_ok": True, "opinion_marked": True, "problems": []}]}


class FakeModel:
    """Returns queued answers in order and remembers every prompt it was given."""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, system, user, **kwargs):
        self.calls.append((system, user))
        if not self.answers:
            raise llm.LLMError("no more queued answers")
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def make(**kw):
    return generate.Request(**{"verses": ["8.268", "8.270"], "variants": 1, **kw})


def go(model, request=None, **kw):
    return generate.run(request or make(), complete=model, verses=VERSES, playbook=generate.DEFAULT_PLAYBOOK, playbook_version="test", **kw)


def test_a_faithful_post_that_the_fact_check_agrees_with_is_approved():
    result = go(FakeModel({"posts": [GOOD]}, JUDGE_OK))
    post = result.posts[0]
    assert post.status == "approved" and post.errors == 0 and post.length[0] <= xformat.X_LIMIT


def test_the_fact_check_is_the_second_call_and_sees_the_verse_text():
    model = FakeModel({"posts": [GOOD]}, JUDGE_OK)
    go(model)
    assert len(model.calls) == 2
    assert TEXT["8.270"] in model.calls[1][1]


def test_a_post_that_fails_a_check_is_sent_back_with_the_exact_problem_and_then_passes():
    wrong_number = {**GOOD, "text": GOOD_TEXT.replace("twelve", "ten")}
    fixed = {**GOOD, "index": 0}
    model = FakeModel({"posts": [wrong_number]}, {"posts": [fixed]}, JUDGE_OK)
    result = go(model)
    assert result.posts[0].status == "approved" and result.posts[0].repairs == 1
    assert "unsupported_number" in model.calls[1][1]                      # the repair prompt names the problem
    assert "ten" not in result.posts[0].text


def test_a_post_that_is_never_fixed_is_rejected_and_never_approved():
    bad = {**GOOD, "text": GOOD_TEXT.replace("twelve", "ten")}
    model = FakeModel({"posts": [bad]}, {"posts": [{**bad, "index": 0}]}, {"posts": [{**bad, "index": 0}]})
    result = go(model, make(max_repairs=2))
    assert result.posts[0].status == "rejected" and result.posts[0].errors > 0


def test_a_post_that_passes_the_checks_but_not_the_fact_check_needs_review():
    judge = {"reviews": [{"index": 0, "faithful": False, "tone_ok": True, "opinion_marked": True, "problems": ["merges two verses into one claim"]}]}
    result = go(FakeModel({"posts": [GOOD]}, judge))
    assert result.posts[0].status == "needs_review"
    assert result.posts[0].judge["problems"] == ["merges two verses into one claim"]


def test_when_the_fact_check_is_unavailable_nothing_is_approved():
    result = go(FakeModel({"posts": [GOOD]}, llm.LLMError("quota")))
    assert result.posts[0].status == "needs_review"
    assert any("fact-check unavailable" in n for n in result.notes)


def test_a_fact_check_that_answers_with_a_bare_list_is_read_and_does_not_crash_the_run():
    # a real run crashed on this: the judge model returned [...] instead of {"reviews": [...]}
    result = go(FakeModel({"posts": [GOOD]}, JUDGE_OK["reviews"]))
    assert result.posts[0].status == "approved"


def test_a_fact_check_with_no_usable_answer_approves_nothing():
    result = go(FakeModel({"posts": [GOOD]}, {"something_else": 1}))
    assert result.posts[0].status == "needs_review"
    assert result.posts[0].judge["problems"] == ["the fact-check returned nothing for this post"]


def test_a_model_that_answers_with_a_bare_list_of_posts_is_read():
    result = go(FakeModel([GOOD], JUDGE_OK))
    assert len(result.posts) == 1 and result.posts[0].status == "approved"


def edited(parts, model, **kw):
    return generate.check_text(parts, complete=model, verses=VERSES, **kw)


def test_a_post_a_person_edited_goes_through_the_same_checks_and_is_approved_when_all_pass():
    post, notes = edited([GOOD_TEXT], FakeModel(JUDGE_OK))
    assert post.status == "approved" and post.pattern == "edited"
    assert post.verses == ["8.268", "8.270"]                              # taken from the references in the text
    assert any("fact-check ran" in n for n in notes)


def test_an_edit_that_breaks_a_number_is_rejected_without_calling_the_model():
    model = FakeModel(JUDGE_OK)
    post, _ = edited([GOOD_TEXT.replace("twelve", "ten")], model)
    assert post.status == "rejected" and model.calls == []                # the model is only asked about posts that pass


def test_an_edited_thread_is_checked_part_by_part():
    parts = ["1/2 Same insult. Different price.", GOOD_TEXT.replace("Same insult. Different price.\n\n", "2/2 ")]
    post, _ = edited(parts, FakeModel(JUDGE_OK))
    assert post.parts == parts and post.status == "approved"
    too_long = [parts[0], parts[1] + " " + "x" * 300]
    assert edited(too_long, FakeModel(JUDGE_OK))[0].status == "rejected"


def test_an_edited_post_is_not_approved_when_the_fact_check_is_skipped():
    post, _ = edited([GOOD_TEXT], FakeModel(), judge=False)
    assert post.status == "needs_review"


def test_a_warning_alone_keeps_a_post_from_approval():
    warned = {**GOOD, "text": GOOD_TEXT + " This was enforced."}
    result = go(FakeModel({"posts": [warned]}, JUDGE_OK))
    assert result.posts[0].errors == 0 and result.posts[0].status == "needs_review"


def test_verses_the_model_was_not_offered_are_dropped_and_reported():
    sneaky = {**GOOD, "verses": ["8.268", "8.270", "8.271"]}
    result = go(FakeModel({"posts": [sneaky]}, JUDGE_OK))
    assert "8.271" not in result.posts[0].verses
    assert any("not offered" in n for n in result.notes)


def test_the_model_returning_nothing_is_reported_not_crashed_on():
    result = go(FakeModel({"posts": []}))
    assert result.posts == [] and any("no usable posts" in n for n in result.notes)


def test_duplicate_posts_are_collapsed():
    result = go(FakeModel({"posts": [GOOD, dict(GOOD)]}, JUDGE_OK), make(variants=2))
    assert len(result.posts) == 1


def test_a_thread_is_returned_in_parts_and_checked_part_by_part():
    thread = {"pattern": "verse_stack", "verses": ["8.270", "8.271", "8.272"],
              "parts": ["1/3 One insult. Three penalties.", "2/3 Manusmriti 8.270: \"shall have his tongue cut out\". Manusmriti 8.271: \"ten fingers long\".",
                        "3/3 Manusmriti 8.272: \"hot oil\" into the mouth and ears."],
              "quotes": []}
    request = generate.Request(verses=["8.270", "8.271", "8.272"], fmt="thread", variants=1)
    result = go(FakeModel({"posts": [thread]}, JUDGE_OK), request)
    post = result.posts[0]
    assert post.errors == 0, post.issues
    assert len(post.parts) == 3 and len(post.length) == 3


def test_the_playbook_file_is_laid_over_the_built_in_one(tmp_path):
    override = tmp_path / "playbook.json"
    override.write_text(json.dumps({"version": "x", "principles": ["only this"], "x_posts": {"voice": "calm"}}), encoding="utf-8")
    merged, version = generate.load_playbook(override)
    assert merged["principles"] == ["only this"] and merged["x_posts"]["voice"] == "calm"
    assert merged["x_posts"]["structures"], "sections the file does not mention keep the built-in values"
    assert version != "built-in"
    assert generate.load_playbook(tmp_path / "missing.json")[1] == "built-in"


def test_a_run_is_saved_with_a_review_file_a_person_can_read(tmp_path):
    result = go(FakeModel({"posts": [GOOD]}, JUDGE_OK))
    folder = generate.write_run(result, VERSES, tmp_path)
    review = (folder / "review.md").read_text(encoding="utf-8")
    assert "APPROVED" in review and TEXT["8.270"] in review and "Manusmriti 8.270" in review
    saved = json.loads((folder / "run.json").read_text(encoding="utf-8"))
    assert saved["posts"][0]["status"] == "approved" and saved["prompts"]["user"]


def test_two_runs_saved_in_the_same_second_do_not_overwrite_each_other(tmp_path, monkeypatch):
    class Frozen(generate.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 10, 12, 0, 0, tzinfo=tz)

    monkeypatch.setattr(generate, "datetime", Frozen)
    first = generate.write_run(go(FakeModel({"posts": [GOOD]}, JUDGE_OK)), VERSES, tmp_path)
    second = generate.write_run(go(FakeModel({"posts": [GOOD]}, JUDGE_OK)), VERSES, tmp_path)
    assert first != second and (first / "run.json").exists() and (second / "run.json").exists()


def test_model_replies_are_parsed_even_inside_a_code_fence():
    assert llm.parse_json('```json\n{"posts": []}\n```') == {"posts": []}
    assert llm.parse_json('Here you go: {"posts": [1]} thanks') == {"posts": [1]}
    with pytest.raises(ValueError):
        llm.parse_json("no json at all")


def test_the_provider_order_is_a_setting(monkeypatch):
    monkeypatch.setenv("TRIAL_LLM_PROVIDERS", "gemini")
    assert llm.provider_order() == ["gemini"]
    monkeypatch.setenv("TRIAL_LLM_PROVIDERS", "openai, gemini, nonsense")
    assert llm.provider_order() == ["openai", "gemini"]
    monkeypatch.delenv("TRIAL_LLM_PROVIDERS")
    assert llm.provider_order() == ["gemini", "openai"]


@pytest.mark.skipif(not book.VERSES_FILE.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_the_playbooks_own_example_posts_pass_the_verifier_against_the_real_book():
    real = book.load_verses()
    for example in generate.DEFAULT_PLAYBOOK["x_posts"]["example_posts"]:
        issues = verify.verify_post({"text": example["text"], "verses": example["verses"]}, real)
        assert verify.passes(issues), (example["text"], [str(i) for i in issues])


# ── the fact-check of a website card ───────────────────────────────────────────

CARD = {"index": 0, "verses": ["8.270"], "headline": "A tongue for an insult", "says": "A Sudra who insults shall have his tongue cut out.",
        "critique": "The penalty rests on who he is, not on what he did."}
CARD_OK = {"reviews": [{"index": 0, "faithful": True, "critique_ok": True, "tone_ok": True, "problems": []}]}


def test_a_card_the_fact_check_agrees_with_is_returned_with_its_review_and_the_model():
    reviews, notes = generate.fact_check_cards([CARD], VERSES, FakeModel(CARD_OK))
    assert reviews[0]["faithful"] is True and reviews[0]["critique_ok"] is True and reviews[0]["model"]


def test_the_cards_verses_and_text_are_in_the_prompt_the_model_reads():
    model = FakeModel(CARD_OK)
    generate.fact_check_cards([{**CARD, "fair_note": "The verse names the offence."}], VERSES, model)
    prompt = model.calls[0][1]
    assert TEXT["8.270"] in prompt and "A tongue for an insult" in prompt and "The verse names the offence." in prompt


def test_a_card_the_model_says_nothing_about_does_not_pass_by_silence():
    reviews, _ = generate.fact_check_cards([CARD, {**CARD, "index": 1}], VERSES, FakeModel(CARD_OK))
    assert reviews[1]["faithful"] is None and reviews[1]["problems"] == ["the fact-check returned nothing for this card"]


def test_a_fact_check_that_answers_with_a_bare_list_is_read():
    reviews, _ = generate.fact_check_cards([CARD], VERSES, FakeModel(CARD_OK["reviews"]))
    assert reviews[0]["faithful"] is True


def test_cards_go_to_the_model_in_small_batches_and_a_failed_model_is_reported_not_fatal():
    cards = [{**CARD, "index": i} for i in range(5)]
    model = FakeModel({"reviews": [{"index": i, "faithful": True, "critique_ok": True, "tone_ok": True, "problems": []} for i in range(2)]},
                      {"reviews": [{"index": i, "faithful": True, "critique_ok": True, "tone_ok": True, "problems": []} for i in range(2, 4)]},
                      llm.LLMError("quota"), llm.LLMError("quota"))
    reviews, notes = generate.fact_check_cards(cards, VERSES, model, batch=2)
    assert len(model.calls) == 4 and all(reviews[i]["faithful"] is True for i in range(4))
    assert reviews[4]["faithful"] is None and any("failed" in n for n in notes)
