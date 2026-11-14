"""Reader-facing presentation of SemRAG answers: no internal ids, no inline references, a small
fixed markup the chat bubble renders, and source pills for exactly the material used.

    pytest backend/tests/test_semrag_presentation.py
"""

from backend.semrag.presentation import (
    PILL_MAX, _citations, clean_passage, excerpt, pill_label, reference,
    sources_to_show, split_sources_line, to_display_text,
)


# ── Citations and pills ────────────────────────────────────────────────────────

def test_every_pill_label_fits_the_pill():
    labels = [pill_label(cid) for cid in _citations()]
    assert labels and max(len(l) for l in labels) <= PILL_MAX


def test_reference_reads_as_a_book_citation():
    assert reference("v1_chunk_0215") == "Annihilation of Caste, Vol. 1, p. 67"
    assert reference("v1_chunk_1158") == "States and Minorities, Vol. 1, pp. 428–429"


def test_unknown_chunk_falls_back_to_the_series_and_volume():
    assert reference("not_a_real_chunk", 2) == "Writings and Speeches, Vol. 2"
    assert "chunk" not in pill_label("not_a_real_chunk", 2).lower()


def test_no_label_ever_shows_an_internal_id():
    for cid in list(_citations())[:400]:
        assert "chunk" not in pill_label(cid).lower()
        assert "chunk" not in reference(cid).lower()


# ── Passage text ───────────────────────────────────────────────────────────────

def test_passage_debris_is_removed():
    raw = ("it was certainly the cinema and the 23 ON BUDGET 23 theatre. z:\\ ambedkar\\vol-02\\vol2-02.indd "
           "MK SJ+YS 21-9-2013/YS-8-11-2013 More text __ABBR_21__ here.")
    out = clean_passage(raw)
    assert "cinema and the theatre" in out
    assert "indd" not in out and "ABBR" not in out and "ON BUDGET" not in out


def test_excerpt_starts_on_a_sentence_and_never_cuts_a_word():
    text = ("the end of a previous sentence. Caste is not a physical object like a wall of bricks. "
            "Caste is a notion, it is a state of the mind. " * 4)
    out = excerpt(text, limit=120)
    assert out.startswith("Caste is not")
    assert out.endswith(".") or out.endswith("…")


# ── Reply markup ───────────────────────────────────────────────────────────────

def test_reply_keeps_only_the_renderers_markup():
    md = ("Based on the provided context, Ambedkar argued **caste is a state of mind**.\n\n"
          "### Key points\n* He said *inter-marriage* is the remedy.\n1. Second point.\n\n---\n"
          ">  \"The real remedy for breaking Caste is inter-marriage.\"")
    out = to_display_text(md)
    assert out.startswith("Ambedkar argued **caste is a state of mind**.")      # opener dropped, bold kept
    assert "\n\n**Key points**\n- He said inter-marriage is the remedy.\n- Second point." in out
    assert '> "The real remedy for breaking Caste is inter-marriage."' in out
    assert "#" not in out and "---" not in out and "*inter" not in out


def test_inline_references_are_removed_but_ordinary_brackets_stay():
    text = ('He wrote "inter-marriage is the remedy" (Annihilation of Caste, Vol. 1, p. 67). '
            "Dyarchy failed (With the Simon Commission, Vol. 2, pp. 324-325) and (Vol. 2, p. 326). "
            "Article 17 (abolition of untouchability) followed.")
    out = to_display_text(text)
    assert "Vol." not in out and "p. 67" not in out
    assert '"inter-marriage is the remedy".' in out and "Dyarchy failed and." in out
    assert "(abolition of untouchability)" in out


def test_hindi_inline_references_are_removed():
    out = to_display_text("जाति एक धारणा है। (जाति का विनाश, खंड 1, पृष्ठ 68)")
    assert "खंड" not in out and "पृष्ठ" not in out and out.startswith("जाति एक धारणा है।")


def test_internal_ids_and_material_numbers_are_removed_without_debris():
    out = to_display_text('Caste "prevents common activity" (v1_chunk_0150) [2]. See [Chunk v2_chunk_0012] and (Source 3).')
    assert out == 'Caste "prevents common activity". See and.'
    assert to_display_text("He argued this in 1936 (v1_chunk_0215, v1_chunk_0216).") == "He argued this in 1936."


# ── Hidden SOURCES line ────────────────────────────────────────────────────────

def test_sources_line_is_split_off_and_parsed():
    text, used = split_sources_line("Answer text.\n\nSOURCES: 1, 3")
    assert text == "Answer text." and used == [1, 3]
    assert split_sources_line("Not covered.\nSOURCES: none") == ("Not covered.", [])
    assert split_sources_line("No line here.") == ("No line here.", None)
    assert split_sources_line("Answer.\n**Sources:** 2")[1] == [2]


def test_sources_line_never_reaches_the_reader():
    assert "SOURCES" not in to_display_text("An answer.\nSOURCES: 1, 2")


# ── Which pills to show ────────────────────────────────────────────────────────

def _pill(name, passages):
    return {"video_title": name, "snippet": "…", "_passages": passages}


def test_pills_follow_the_material_the_answer_used():
    a, b, c = _pill("A", [1]), _pill("B", [2, 4]), _pill("C", [3])
    assert sources_to_show("…", [a, b, c], used=[4]) == [b]       # a pill covering two passages
    assert sources_to_show("…", [a, b, c], used=[1, 3]) == [a, c]
    assert sources_to_show("…", [a, b, c], used=[]) == []


def test_without_a_sources_line_a_not_covered_answer_shows_no_pills():
    a = _pill("A", [1])
    assert sources_to_show("Dr. Ambedkar's writings in this collection do not address this directly.", [a]) == []


def test_without_a_sources_line_a_grounded_answer_shows_all_pills():
    a, b = _pill("A", [1]), _pill("B", [2])
    assert sources_to_show("He held that inter-marriage is the real remedy.", [a, b]) == [a, b]


# ── Links to the scanned page ──────────────────────────────────────────────────

def test_book_link_opens_the_right_pdf_page_and_labels_it_like_the_book():
    from backend.semrag.presentation import book_link
    assert book_link("v1_chunk_0215") == "/book/1/82?p=67&t=Annihilation+of+Caste"   # printed p. 67 = PDF page 82
    assert book_link("v2_chunk_0268").startswith("/book/2/190?p=171&")   # pp. 170–171, mostly 171; offset 19


def test_a_passage_over_a_page_break_opens_the_page_holding_most_of_it():
    from backend.semrag.presentation import book_link
    # Starts on the last lines of p. 156 (about Bombay); the sentence on fundamental rights and
    # writs is on p. 157. Reported from a live answer that opened the wrong page.
    assert book_link("v1_chunk_0459").startswith("/book/1/172?p=157&")
    assert pill_label("v1_chunk_0459").endswith("Vol 1 p. 157")
    assert reference("v1_chunk_0459") == "Thoughts on Linguistic States, Vol. 1, pp. 156–157"
    # Round Table: the 'sanctions for the enforcement of fundamental rights' sentence is on p. 555.
    assert book_link("v2_chunk_0889").startswith("/book/2/576?p=555&")


def test_front_matter_gets_no_negative_page_number():
    from backend.semrag.presentation import book_link
    assert "p. -" not in pill_label("v1_chunk_0000") and "p=-" not in (book_link("v1_chunk_0000") or "")


def test_volume_three_is_cited_by_chapter_with_a_working_page_link():
    from backend.semrag.presentation import book_link
    # The Buddha-vs-Marx passage: printed p. 450 is PDF page 463 (Volume 3's front matter is 13 pages).
    assert reference("v3_chunk_0679") == "Buddha or Karl Marx, Vol. 3, pp. 450–451"
    assert book_link("v3_chunk_0679") == "/book/3/463?p=450&t=Buddha+or+Karl+Marx"
    assert pill_label("v3_chunk_0679") == "Buddha or Karl Marx · Vol 3 p. 450"
    # A chapter in the middle of the volume, and the index after the plates (offset 13 becomes 17).
    assert reference("v3_chunk_0261") == "Reformers and Their Fate, Vol. 3, pp. 173–174"
    assert book_link("v3_chunk_0707").startswith("/book/3/496?p=479&")


def test_unknown_passage_gets_no_link_rather_than_a_wrong_one():
    from backend.semrag.presentation import book_link
    assert book_link("not_a_real_chunk", 1) is None
