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
    assert len(ids) == len(set(ids)) == 2684
    per_chapter = {}
    for v in verses:
        per_chapter[v["chapter"]] = per_chapter.get(v["chapter"], 0) + 1
    assert per_chapter == EXPECTED_COUNTS
    assert all(len(v["text"]) >= 15 for v in verses)
    assert not any("\x03" in v["text"] or "\x04" in v["text"] for v in verses)   # no Sanskrit-font debris


@pytest.mark.skipif(not REAL.exists(), reason="the Manusmriti has not been ingested on this machine")
def test_a_known_verse_reads_as_expected():
    verses = {v["id"]: v for v in json.loads(REAL.read_text(encoding="utf-8"))}
    assert "tongue" in verses["8.270"]["text"] and "Sudra" in verses["8.270"]["text"] or "once-born" in verses["8.270"]["text"]
