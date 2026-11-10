"""The Manusmriti ingest: verses are split on their numbers in strict sequence.

The parser is tested on made-up pages, so it needs neither the PDF nor PyMuPDF. The last tests check the
real ingested file when it is on this machine.

    pytest backend/tests/test_manusmriti_trial_ingest.py
"""

import json

import pytest

from backend.trials.manusmriti_critique import config
from backend.trials.manusmriti_critique.tools.ingest_book import EXPECTED_COUNTS, check, parse


def pages(*texts):
    return [(i + 1, [t], []) for i, t in enumerate(texts)]


def test_verses_are_split_on_their_numbers_and_keep_their_page():
    verses, problems = parse(pages("1.1. First verse text. 1.2. Second verse", "continues here. 1.3. Third."))
    assert [v["id"] for v in verses] == ["1.1", "1.2", "1.3"]
    assert verses[1]["text"] == "Second verse continues here."
    assert [v["page"] for v in verses] == [1, 1, 2]
    assert problems == []


def test_a_missing_full_stop_after_the_number_is_accepted():
    verses, problems = parse(pages("1.1. One. 1.2 (Horse-faced) beasts and birds. 1.3. Three."))
    assert [v["id"] for v in verses] == ["1.1", "1.2", "1.3"]
    assert verses[1]["text"].startswith("(Horse-faced)")
    assert problems == []


def test_a_number_inside_a_sentence_is_not_mistaken_for_a_verse():
    verses, _ = parse(pages("1.1. As taught in 8.270. and again in 2.5. it is so. 1.2. Next."))
    assert [v["id"] for v in verses] == ["1.1", "1.2"]
    assert "8.270" in verses[0]["text"]


def test_a_new_chapter_starts_a_new_numbering():
    verses, _ = parse(pages("1.1. A. 1.2. B.", "2.1. C. 2.2. D."))
    assert [v["id"] for v in verses] == ["1.1", "1.2", "2.1", "2.2"]
    assert verses[2]["chapter"] == 2


def test_a_gap_is_reported_not_hidden():
    verses, problems = parse(pages("1.1. A. 1.2. B. 1.4. D."))
    assert [v["id"] for v in verses] == ["1.1", "1.2", "1.4"]
    assert any("expected 1.3" in p for p in problems)


def test_a_lettered_verse_is_a_verse_of_its_own_and_the_labels_after_it_follow_the_standard_numbering():
    # the PDF prints "11.51a Sanskrit missing" and then "11.51a." for a verse the standard numbering counts as 11.52
    verses, problems = parse(pages("1.1. A. 1.2. B. 1.2a Sanskrit missing 1.2a. The extra verse. 1.3. C. 1.4. D.", "2.1. E. 2.2. F."))
    assert [v["id"] for v in verses] == ["1.1", "1.2", "1.3", "1.4", "1.5", "2.1", "2.2"]
    assert [v["text"] for v in verses] == ["A.", "B.", "The extra verse.", "C.", "D.", "E.", "F."]     # the note is not part of it
    assert any("1.2a" in p and "1.3" in p and "standard numbering" in p for p in problems)
    assert not any("expected" in p or "not at the expected position" in p for p in problems)           # and it is not a gap or a stray number


def test_a_lettered_number_inside_a_sentence_is_not_mistaken_for_a_verse():
    verses, _ = parse(pages("1.1. See 8.270a. for the case. 1.2. Next."))
    assert [v["id"] for v in verses] == ["1.1", "1.2"]


def test_the_check_compares_counts_with_the_standard_numbering():
    verses = [{"id": f"1.{i}", "chapter": 1, "verse": i, "page": 1, "text": "x" * 40} for i in range(1, 119)]
    report = check(verses, [])
    assert report["differs_from_standard_count"][1] == {"found": 118, "expected": EXPECTED_COUNTS[1]}
    assert report["verses"] == 118


REAL = config.SOURCES_DIR / "manusmriti_verses.json"


@pytest.mark.skipif(not REAL.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_the_ingested_book_is_complete_and_sequential():
    verses = json.loads(REAL.read_text(encoding="utf-8"))
    ids = [v["id"] for v in verses]
    assert len(ids) == len(set(ids)) == 2685
    per_chapter = {}
    for v in verses:
        per_chapter[v["chapter"]] = per_chapter.get(v["chapter"], 0) + 1
    assert per_chapter == EXPECTED_COUNTS
    assert all(len(v["text"]) >= 15 for v in verses)
    assert not any("\x03" in v["text"] or "\x04" in v["text"] for v in verses)   # no Sanskrit-font debris


@pytest.mark.skipif(not REAL.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_chapter_eleven_follows_the_standard_numbering_past_the_verse_the_pdf_labels_51a():
    verses = {v["id"]: v["text"] for v in json.loads(REAL.read_text(encoding="utf-8"))}
    assert verses["11.51"].startswith("A stealer of (cooked) food") and "lamp" not in verses["11.51"]
    assert verses["11.52"].startswith("The stealer of a lamp")                  # the verse the PDF labels 11.51a
    assert verses["11.53"].startswith("Thus in consequence of a remnant")
    assert verses["11.131"].startswith("He who has slain a Sudra")             # these two read the same in Buhler's published text
    assert verses["11.132"].startswith("Having killed a cat")
    assert "11.266" in verses and "Sanskrit missing" not in " ".join(verses.values())


@pytest.mark.skipif(not REAL.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_a_known_verse_reads_as_expected():
    verses = {v["id"]: v for v in json.loads(REAL.read_text(encoding="utf-8"))}
    assert "tongue" in verses["8.270"]["text"] and "Sudra" in verses["8.270"]["text"] or "once-born" in verses["8.270"]["text"]
