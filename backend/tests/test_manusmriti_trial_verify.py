"""A post about the Manusmriti must be provable from the Manusmriti: the deterministic checks.

The verses used here are copied from the supplied translation, so the posts below are the kind of text
the generator really produces. Nothing needs the PDF, a model or a network.

    pytest backend/tests/test_manusmriti_trial_verify.py
"""

import pytest

from backend.trials.manusmriti_critique import book, verify, xformat
from backend.trials.manusmriti_critique.book import Verse

TEXT = {
    "8.267": "A Kshatriya, having defamed a Brahmana, shall be fined one hundred (panas); a Vaisya one hundred and fifty or two hundred; a Sudra shall suffer corporal punishment.",
    "8.268": "A Brahmana shall be fined fifty (panas) for defaming a Kshatriya; in (the case of) a Vaisya the fine shall be twenty-five (panas); in (the case of) a Sudra twelve.",
    "8.270": "A once-born man (a Sudra), who insults a twice-born man with gross invective, shall have his tongue cut out; for he is of low origin.",
    "8.271": "If he mentions the names and castes (gati) of the (twice-born) with contumely, an iron nail, ten fingers long, shall be thrust red-hot into his mouth.",
    "8.272": "If he arrogantly teaches Brahmanas their duty, the king shall cause hot oil to be poured into his mouth and into his ears.",
    "5.148": "In childhood a female must be subject to her father, in youth to her husband, when her lord is dead to her sons; a woman must never be independent.",
    "8.417": "A Brahmana may confidently seize the goods of (his) Sudra (slave); for, as that (slave) can have no property, his master may take his possessions.",
}
VERSES = {k: Verse(k, int(k.split(".")[0]), int(k.split(".")[1]), 1, v) for k, v in TEXT.items()}

GOOD = {
    "text": 'Same insult. Different price.\n\nManusmriti 8.268: a Brahmana who defames a Sudra pays twelve panas.\nManusmriti 8.270: a Sudra who insults a twice-born man "shall have his tongue cut out".',
    "verses": ["8.268", "8.270"],
    "quotes": [{"verse": "8.270", "text": "shall have his tongue cut out"}],
}


def codes(post, **kw):
    return {i.code for i in verify.verify_post(post, VERSES, **kw)}


def errors(post, **kw):
    return {i.code for i in verify.errors(verify.verify_post(post, VERSES, **kw))}


# ── length on X ────────────────────────────────────────────────────────────────

def test_ordinary_text_weighs_one_per_character():
    assert xformat.weighted_length("a" * 280) == 280 and xformat.fits("a" * 280)
    assert not xformat.fits("a" * 281)


def test_emoji_and_cjk_weigh_two_and_devanagari_one():
    assert xformat.weighted_length("😀") == 2
    assert xformat.weighted_length("漢字") == 4
    assert xformat.weighted_length("जय इंसानियत") == len("जय इंसानियत")


def test_a_link_costs_twenty_three_whatever_its_length():
    assert xformat.weighted_length("see https://example.com/a/very/long/path/that/goes/on/and/on") == len("see ") + 23


# ── references, numbers, quotes ────────────────────────────────────────────────

def test_references_are_found_and_ranges_expand():
    assert verify.find_refs("Manusmriti 8.270") == ["8.270"]
    assert verify.find_refs("Manusmriti 8.267–8.269") == ["8.267", "8.268", "8.269"]
    assert verify.find_refs("verses 8.270-272 and 5.148") == ["8.270", "8.271", "8.272", "5.148"]
    assert verify.find_refs("no verse here, just 280 characters") == []


def test_number_words_are_read_as_numbers():
    assert verify.numbers_in("one hundred and fifty or two hundred") == {150, 200}
    assert verify.numbers_in("twenty-five") == {25}
    assert verify.numbers_in("an iron nail, ten fingers long") == {10}
    assert verify.numbers_in("twice-born and once-born men") == set()
    assert verify.numbers_in("fined 12 panas") == {12}
    assert verify.numbers_in("three, two, a share and a half, and one") == {3, 2, 1}        # a comma ends a number: not 3 + 2 = 5
    assert verify.numbers_in("one hundred, fifty") == {100, 50}


def test_a_quote_must_be_word_for_word_but_spacing_and_punctuation_do_not_matter():
    verse = TEXT["8.270"]
    assert verify.quote_in_verse("shall have his tongue cut out", verse)
    assert verify.quote_in_verse("Shall have his tongue, cut out!", verse)
    assert verify.quote_in_verse("A once-born man … shall have his tongue cut out", verse)
    assert not verify.quote_in_verse("shall have his tongue cut off", verse)       # one word changed


# ── the checks themselves ──────────────────────────────────────────────────────

def test_a_faithful_post_passes():
    issues = verify.verify_post(GOOD, VERSES)
    assert verify.passes(issues), [str(i) for i in issues]


def test_a_post_with_a_changed_number_is_rejected():
    bad = {**GOOD, "text": GOOD["text"].replace("twelve", "ten")}
    assert "unsupported_number" in errors(bad)


def test_a_number_written_as_digits_is_checked_too():
    ok = {**GOOD, "text": GOOD["text"].replace("twelve", "12")}
    assert verify.passes(verify.verify_post(ok, VERSES))
    bad = {**GOOD, "text": GOOD["text"].replace("twelve", "20")}
    assert "unsupported_number" in errors(bad)


def test_an_invented_quotation_is_rejected():
    bad = {**GOOD, "text": GOOD["text"].replace("shall have his tongue cut out", "must be tortured and killed")}
    assert "invented_quote" in errors(bad)


def test_a_declared_quote_that_is_not_in_the_verse_is_rejected():
    bad = {**GOOD, "quotes": [{"verse": "8.270", "text": "his tongue shall be cut off"}]}
    assert "quote_mismatch" in errors(bad)


def test_a_stronger_word_than_the_text_uses_is_rejected():
    bad = {**GOOD, "text": "Manusmriti 8.268: a Sudra who is insulted gets twelve panas; Manusmriti 8.270: the Sudra who insults is tortured.", }
    assert "strong_word" in errors(bad)
    killing = {**GOOD, "text": "Manusmriti 8.270 says a Sudra who insults is killed.", "verses": ["8.270"]}
    assert "strong_word" in errors(killing)


def test_a_strong_word_the_verse_really_uses_is_allowed():
    verses = {"x.1": Verse("x.1", 1, 1, 1, "The king shall have the thief put to death.")}
    post = {"text": "Manusmriti 1.1: the thief is put to death.", "verses": ["x.1"]}
    assert not any(i.code == "strong_word" for i in verify.verify_post(post, {**verses, "1.1": Verse("1.1", 1, 1, 1, verses["x.1"].text)}))


def test_a_post_with_no_verse_reference_is_rejected():
    bad = {**GOOD, "text": "A Sudra who insults loses his tongue."}
    assert "no_reference" in errors(bad)


def test_a_reference_to_an_undeclared_or_unknown_verse_is_rejected():
    assert "undeclared_reference" in errors({**GOOD, "text": GOOD["text"] + " Also Manusmriti 8.271."})
    assert "unknown_verse" in errors({**GOOD, "verses": ["8.268", "8.999"]})


def test_a_post_over_the_x_limit_is_rejected():
    assert "length" in errors({**GOOD, "text": GOOD["text"] + " " + "x" * 300})


@pytest.mark.parametrize("sentence,code", [
    ("All Hindus follow this.", "collective_statement"),
    ("Brahmins were the ones who wrote it for themselves.", "attribution_to_people"),
    ("Modi should answer for this.", "politics"),
    ("Only idiots defend this.", "abuse"),
    ("Burn it.", "violence"),
])
def test_a_post_that_attacks_people_or_politics_is_rejected(sentence, code):
    assert code in errors({**GOOD, "text": GOOD["text"] + " " + sentence})


def test_a_fact_from_outside_the_book_needs_approved_context():
    post = {**GOOD, "text": GOOD["text"] + " Ambedkar burned it in 1927."}
    assert "outside_fact" in errors(post)
    assert "outside_fact" not in errors(post, approved_context=["Ambedkar burned the Manusmriti at Mahad on 25 December 1927."])


def test_a_word_the_cited_verse_itself_uses_is_not_an_outside_fact():
    verse = Verse("2.168", 2, 168, 1, "A twice-born man who, not having studied the Veda, applies himself to other study, falls to the condition of a Sudra.")
    post = {"text": "Manusmriti 2.168: skip the Veda and you fall to the condition of a Sudra.", "verses": ["2.168"]}
    assert not any(i.code == "outside_fact" for i in verify.verify_post(post, {"2.168": verse}))


def test_a_claim_about_practice_is_only_a_warning():
    post = {**GOOD, "text": GOOD["text"] + " This was enforced for centuries."}
    issues = verify.verify_post(post, VERSES)
    assert any(i.code == "practice_claim" and i.level == "warning" for i in issues)


def test_only_the_allowed_hashtag_is_accepted():
    assert "hashtag" in errors({**GOOD, "text": GOOD["text"] + " #CasteSystem"})
    assert "hashtag" not in errors({**GOOD, "text": GOOD["text"] + " #Manusmriti"})


def test_a_thread_is_checked_part_by_part_for_length_and_as_a_whole_for_content():
    thread = {"parts": ["1/2 Same insult. Different price.",
                        "2/2 Manusmriti 8.268: twelve panas. Manusmriti 8.270: \"shall have his tongue cut out\"."],
              "verses": ["8.268", "8.270"]}
    assert verify.passes(verify.verify_post(thread, VERSES))
    too_long = {**thread, "parts": [thread["parts"][0], thread["parts"][1] + " " + "x" * 300]}
    assert "length" in errors(too_long)


# ── the real book, when it has been ingested on this machine ────────────────────

@pytest.mark.skipif(not book.VERSES_FILE.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_the_verses_used_in_these_tests_match_the_real_book():
    real = book.load_verses()
    assert {k: real[k].text for k in TEXT} == TEXT


def test_a_count_of_verses_must_match_the_verses_cited():
    wrong = {**GOOD, "text": GOOD["text"] + " Two verses. Three punishments.", "verses": ["8.268", "8.270"]}
    assert "verse_count" not in errors(wrong)                                   # two verses cited, "Two verses" is right
    wrong = {"text": "Manusmriti 8.270: \"shall have his tongue cut out\". Two verses. One page.", "verses": ["8.270"]}
    assert "verse_count" in errors(wrong)
    spoken = {"text": "Manusmriti 8.270: \"shall have his tongue cut out\". Manusmriti 8.271. 3 verses.", "verses": ["8.270", "8.271"]}
    assert "verse_count" in errors(spoken)


def test_style_advice_is_a_note_and_does_not_count_as_a_warning():
    issues = verify.verify_post({**GOOD, "text": GOOD["text"].replace('"shall have his tongue cut out"', "loses his tongue")}, VERSES)
    assert any(i.code == "no_quote" and i.level == "note" for i in issues)
    assert verify.passes(issues)


def test_a_side_by_side_pattern_with_one_verse_is_rejected():
    one_verse = {"pattern": "asymmetry", "verses": ["8.270"], "text": 'Same insult. Different price.\n\nManusmriti 8.270: "shall have his tongue cut out".'}
    assert "pattern_needs_verses" in errors(one_verse)
    assert "pattern_needs_verses" not in errors({**one_verse, "pattern": "plain_rule"})
    assert "pattern_needs_verses" not in errors({**GOOD, "pattern": "asymmetry"})


def test_the_playbook_files_verse_stack_does_not_suggest_the_penalties_add_up():
    import json
    pb = json.loads((__import__("backend.trials.manusmriti_critique.config", fromlist=["x"]).PLAYBOOK_JSON).read_text(encoding="utf-8"))
    steps = " ".join(next(s for s in pb["x_posts"]["structures"] if s["id"] == "verse_stack")["steps"])
    assert "And then" not in steps and "RULES" in steps


# ── the text beside a post on the website ──────────────────────────────────────

def commentary(text, ids=("8.268", "8.270"), **kw):
    return verify.verify_commentary(text, list(ids), VERSES, **kw)


def commentary_codes(text, **kw):
    return {i.code for i in commentary(text, **kw)}


def test_commentary_need_not_name_a_verse_or_quote_one():
    assert not [i for i in commentary("The penalty rests on who he is, not on what he did.") if i.level == "error"]


def test_commentary_may_quote_what_the_verses_say_and_judge_it():
    text = 'The verse gives its reason, “for he is of low origin”. A penalty justified by birth is not a penalty for wrongdoing.'
    assert not [i for i in commentary(text) if i.level in ("error", "warning")]


def test_commentary_may_not_invent_a_quotation_a_number_or_a_stronger_word():
    assert "invented_quote" in commentary_codes("The verse says “must be put to the sword”.")
    assert "unsupported_number" in commentary_codes("A fine of five hundred panas is too much.")
    assert "strong_word" in commentary_codes("A man is tortured for words.")


def test_commentary_may_not_bring_in_outside_facts_or_talk_about_people_or_practice():
    assert "outside_fact" in commentary_codes("As Ambedkar argued, this is unjust.")
    assert "outside_fact" not in commentary_codes("As Ambedkar argued, this is unjust.", approved_context=["Ambedkar argued against it."])
    assert "collective_statement" in commentary_codes("All Brahmanas wrote this for themselves.")
    assert "practice_claim" in commentary_codes("It was enforced for centuries.")


def test_commentary_may_cite_only_the_verses_the_card_cites():
    assert "undeclared_reference" in commentary_codes("Compare 8.267 as well.")
    assert "undeclared_reference" not in commentary_codes("Compare 8.268 as well.")
