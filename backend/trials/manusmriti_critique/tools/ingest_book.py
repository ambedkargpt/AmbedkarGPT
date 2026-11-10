"""Turn the supplied Manusmriti PDF into verse records the generator can quote exactly.

The PDF pairs each verse's Sanskrit (in a legacy font that extracts as garbage) with an English
rendering. Only the English is wanted, and the two are told apart by font: the English is set in
`Times-Roman`, the Sanskrit in `Sanskrit_980117`. Verses are then split on their numbers ("8.270.")
in strict sequence, so a number-like string inside a sentence is never mistaken for a verse.

    python3 backend/trials/manusmriti_critique/tools/ingest_book.py /path/to/Manu-Smriti.pdf

Writes (both stay out of git, see sources/.gitignore):
    sources/manusmriti_verses.json   [{"id": "8.270", "chapter": 8, "verse": 270, "page": 152, "text": "..."}]
    sources/ingest_report.json       what was found, and every sequence problem

Needs PyMuPDF (`pip install pymupdf`). That is only for this offline step: the generator reads the JSON.
The check at the end compares each chapter's verse count with the standard 2,685-verse numbering and
the sequence of numbers, so a missing or duplicated verse is reported, not silently absorbed.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import config  # noqa: E402

ENGLISH_FONT = "Times-Roman"
HEADING_SIZE = 13.0            # "Chapter 8" headings are 14 pt; verses are 12 pt
VERSES_FILE = config.SOURCES_DIR / "manusmriti_verses.json"
REPORT_FILE = config.SOURCES_DIR / "ingest_report.json"

# Verses per chapter in the standard numbering (12 chapters, 2,685 verses: Bühler's translation and the usual
# Sanskrit editions agree). A supplied edition that differs is not wrong, but the difference is shown so it can be
# looked at.
EXPECTED_COUNTS = {1: 119, 2: 249, 3: 286, 4: 260, 5: 169, 6: 97, 7: 226, 8: 420, 9: 336, 10: 131, 11: 266, 12: 126}

# The full stop after the number is optional because the supplied PDF drops it in places ("1.39 (Horse-faced)").
# That is safe: a number is only accepted when it is the next one in sequence (see parse()).
# A letter after the number marks a verse the PDF calls "11.51a" (with the note "Sanskrit missing" in the Sanskrit
# slot): it is a verse of its own, which the standard numbering counts as 11.52, so the PDF's labels after it are
# one lower than every other edition's. parse() gives such a verse its own entry and raises the labels after it.
VERSE_MARK = re.compile(r"(?:(?<=\s)|^)(\d{1,2})\.(\d{1,3})([a-z])?\.?(?=\s)")
SANSKRIT_NOTE = re.compile(r"^Sanskrit missing\s+\d{1,2}\.\d{1,3}[a-z]\.?\s*")
CHAPTER_MARK = re.compile(r"^\s*Chapter\s+(\d{1,2})\s*$")


def english_pages(pdf_path: Path) -> List[Tuple[int, List[str], List[int]]]:
    """[(page number, English lines, chapter numbers whose heading is on this page)]."""
    import pymupdf  # imported here: only this offline step needs it

    pages = []
    with pymupdf.open(str(pdf_path)) as doc:
        for number, page in enumerate(doc, start=1):
            rows, headings = [], []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    spans = [s for s in line["spans"] if s["font"] == ENGLISH_FONT and s["text"].strip()]
                    if not spans:
                        continue
                    text = "".join(s["text"] for s in spans)
                    if max(s["size"] for s in spans) >= HEADING_SIZE and (m := CHAPTER_MARK.match(text)):
                        headings.append(int(m.group(1)))
                        continue
                    rows.append((round(line["bbox"][1]), line["bbox"][0], text))
            rows.sort()
            pages.append((number, [t for _, _, t in rows], headings))
    return pages


def parse(pages: List[Tuple[int, List[str], List[int]]]) -> Tuple[List[Dict], List[str]]:
    """Split the English stream on verse numbers, accepting only the next expected number."""
    stream, offsets = [], []          # offsets[i] = (start index in the joined text, page number)
    position = 0
    for number, lines, _ in pages:
        chunk = " ".join(line.strip() for line in lines) + " "
        offsets.append((position, number))
        stream.append(chunk)
        position += len(chunk)
    text = "".join(stream)

    def page_at(index: int) -> int:
        page = 1
        for start, number in offsets:
            if start > index:
                break
            page = number
        return page

    problems: List[str] = []
    verses: List[Dict] = []
    chapter, verse = 1, 1                      # the next number we expect (as the PDF labels it)
    marks = list(VERSE_MARK.finditer(text))
    accepted = []                              # (match, chapter, number in the standard numbering)
    skipped_numbers = 0
    shift: Dict[int, int] = {}                 # lettered verses ("11.51a") seen so far in each chapter
    last_lettered = None                       # the PDF prints such a label twice ("11.51a Sanskrit missing 11.51a.")
    for m in marks:
        c, v, letter = int(m.group(1)), int(m.group(2)), m.group(3)
        if letter:
            if (c, v, letter) == last_lettered:
                continue                       # its second printing: the same verse
            if letter == "a" and c == chapter and v == verse - 1:
                shift[c] = shift.get(c, 0) + 1
                accepted.append((m, c, v + shift[c]))
                last_lettered = (c, v, letter)
                problems.append(f"note: {c}.{v}{letter} is a verse of its own; it is {c}.{v + shift[c]} in the standard numbering, "
                                f"so the labels after it in chapter {c} were raised by one")
            else:
                skipped_numbers += 1
            continue
        if (c, v) == (chapter, verse):
            accepted.append((m, c, v + shift.get(c, 0)))
            verse += 1
        elif c == chapter + 1 and v == 1:      # a new chapter begins
            accepted.append((m, c, v))
            chapter, verse = c, 2
        elif c == chapter and v > verse and v - verse <= 3:
            problems.append(f"gap: expected {chapter}.{verse} but found {c}.{v} (verses {verse}-{v - 1} missing from the text)")
            accepted.append((m, c, v + shift.get(c, 0)))
            verse = v + 1
        else:
            skipped_numbers += 1               # a number-like string inside a sentence, e.g. a cross-reference
            continue
        last_lettered = None
    for i, (m, c, v) in enumerate(accepted):
        end = accepted[i + 1][0].start() if i + 1 < len(accepted) else len(text)
        body = SANSKRIT_NOTE.sub("", re.sub(r"\s+", " ", text[m.end():end]).strip())
        verses.append({"id": f"{c}.{v}", "chapter": c, "verse": v, "page": page_at(m.start()), "text": body})
    if skipped_numbers:
        problems.append(f"{skipped_numbers} number-like strings were not at the expected position and were left inside the verse text")
    return verses, problems


def check(verses: List[Dict], problems: List[str]) -> Dict:
    counts: Dict[int, int] = {}
    for v in verses:
        counts[v["chapter"]] = counts.get(v["chapter"], 0) + 1
    differences = {c: {"found": counts.get(c, 0), "expected": n} for c, n in EXPECTED_COUNTS.items() if counts.get(c, 0) != n}
    empty = [v["id"] for v in verses if len(v["text"]) < 15]
    return {
        "verses": len(verses), "chapters": len(counts), "verses_per_chapter": counts,
        "differs_from_standard_count": differences, "very_short_verses": empty, "problems": problems,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, default=VERSES_FILE)
    args = parser.parse_args()

    pages = english_pages(args.pdf)
    verses, problems = parse(pages)
    report = check(verses, problems)
    report["source_file"] = args.pdf.name
    report["source_sha256"] = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    report["pages"] = len(pages)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(verses, ensure_ascii=False, indent=1), encoding="utf-8")
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{report['verses']} verses in {report['chapters']} chapters from {report['pages']} pages -> {args.out}")
    print("verses per chapter:", report["verses_per_chapter"])
    if report["differs_from_standard_count"]:
        print("DIFFERS from the standard numbering:", report["differs_from_standard_count"])
    else:
        print("every chapter matches the standard verse count")
    for line in problems[:10]:
        print("  problem:", line)
    if report["very_short_verses"]:
        print("very short verses (check):", report["very_short_verses"][:10])


if __name__ == "__main__":
    main()
