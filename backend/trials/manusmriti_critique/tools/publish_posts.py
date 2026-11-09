"""Build published/posts.json, the file the website's Manusmriti section reads, from published/picks.json.

picks.json is what a person chose: the topics (a title and one line, in English and Hindi) and the entries. An entry
is a card on the site: a headline, the verses it is built on, a plain restatement ("says"), a critique, optionally
a "fair_note" (what the verse itself offers on the other side), and the short post for X that the visitor can copy.

This tool does not trust it. The X post goes through the same checks as a generated one (quotes word for word,
numbers, strong words, tone, length, verses that exist) and so does the card's own text: an invented quotation,
a number or a strong word the verses lack, an outside fact, a claim about practice or a remark about a community
stops the build, and so does a warning. The result carries the text of the cited verses, so the website and its
tests need neither the PDF nor a model.

    python3 backend/trials/manusmriti_critique/tools/publish_posts.py            # check, then write posts.json
    python3 backend/trials/manusmriti_critique/tools/publish_posts.py --check    # check only
    python3 backend/trials/manusmriti_critique/tools/publish_posts.py --only-reviewed   # leave out posts nobody has read yet
    python3 backend/trials/manusmriti_critique/tools/publish_posts.py --check --fact-check --env-file path/to/.env
                                                                  # also have the fact-check model read every card

Needs sources/manusmriti_verses.json (run tools/ingest_book.py once). --fact-check also needs a model key.
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import book, config, verify  # noqa: E402
from backend.trials.manusmriti_critique.book import Verse  # noqa: E402

PICKS = config.PUBLISHED_DIR / "picks.json"
POSTS = config.PUBLISHED_DIR / "posts.json"
TOPIC_KEYS = ("id", "title", "title_hi", "blurb", "blurb_hi")
REQUIRED_TEXT = ("headline", "says", "critique")
# What a card can hold and still be read: characters, so a long critique is cut by a person, not by the page.
LIMITS = {"headline": 90, "says": 650, "critique": 950, "fair_note": 420}


def post_id(parts: Sequence[str]) -> str:
    """Stable while the X post's text is, so a link to a card survives a rebuild and an edit of its commentary."""
    return hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()[:8]


def commentary_of(entry: Dict) -> str:
    """The card's own words, in one piece, for the checks that read text."""
    return "\n".join(str(entry.get(key) or "") for key in ("headline", "says", "critique", "fair_note")).strip()


def build(picks: Dict, verses: Dict[str, Verse], approved_context: Sequence[str] = (), only_reviewed: bool = False) -> Tuple[Dict, List[str]]:
    """The published document, and every problem found. Any problem means the document must not be written."""
    problems: List[str] = []
    topics = {t["id"]: t for t in picks.get("topics", [])}
    for t in topics.values():
        problems += [f"topic {t.get('id')!r}: missing {k}" for k in TOPIC_KEYS if not str(t.get(k) or "").strip()]
    posts, seen = [], set()
    for number, pick in enumerate(picks.get("posts", []), 1):
        parts = [str(s).strip() for s in pick.get("parts") or [] if str(s).strip()]
        declared = list(dict.fromkeys(pick.get("verses") or []))
        label = f"post {number} ({', '.join(declared)})"
        if not parts:
            problems.append(f"{label}: no text")
            continue
        if pick.get("topic") not in topics:
            problems.append(f"{label}: unknown topic {pick.get('topic')!r}")
            continue
        check = {"text": "\n\n".join(parts), "parts": parts if len(parts) > 1 else [], "verses": declared,
                 "quotes": [], "pattern": pick.get("pattern") or "plain_rule"}
        problems += [f"{label}: {issue}" for issue in verify.errors(verify.verify_post(check, verses, approved_context=approved_context))]

        for key in REQUIRED_TEXT:
            if not str(pick.get(key) or "").strip():
                problems.append(f"{label}: missing {key}")
        for key, limit in LIMITS.items():
            size = len(str(pick.get(key) or ""))
            if size > limit:
                problems.append(f"{label}: {key} is {size} characters, over {limit}")
        card_issues = verify.verify_commentary(commentary_of(pick), declared, verses, approved_context)
        problems += [f"{label}: card text {issue}" for issue in card_issues if issue.level in ("error", "warning")]

        pid = post_id(parts)
        if pid in seen:
            problems.append(f"{label}: the same text is picked twice")
            continue
        seen.add(pid)
        if only_reviewed and not pick.get("reviewed"):
            continue
        posts.append({"id": pid, "topic": pick["topic"], "headline": str(pick.get("headline") or "").strip(),
                      "says": str(pick.get("says") or "").strip(), "critique": str(pick.get("critique") or "").strip(),
                      "fair_note": str(pick.get("fair_note") or "").strip() or None,
                      "parts": parts, "verses": declared, "pattern": pick.get("pattern"),
                      "reviewed": bool(pick.get("reviewed", False))})
    counts = {t: sum(p["topic"] == t for p in posts) for t in topics}
    used = sorted({v for p in posts for v in p["verses"] if v in verses}, key=book.verse_key)
    document = {
        "version": 2,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "translation": picks.get("translation"),
        "topics": [{**{k: t[k] for k in TOPIC_KEYS if k in t}, "count": counts[t["id"]]} for t in topics.values() if counts[t["id"]]],
        "posts": posts,
        "verses": {v: {"text": verses[v].text, "chapter": verses[v].chapter, "verse": verses[v].verse} for v in used},
    }
    return document, problems


def fact_check(document: Dict, verses: Dict[str, Verse]) -> int:
    """Have the fact-check model read every card against its verses. Prints what it objects to; returns how many cards it did."""
    from backend.trials.manusmriti_critique import generate

    cards = [{"index": n, "verses": p["verses"], "headline": p["headline"], "says": p["says"], "critique": p["critique"],
              "fair_note": p["fair_note"]} for n, p in enumerate(document["posts"])]
    reviews, notes = generate.fact_check_cards(cards, verses)
    for note in notes:
        print("note:", note)
    failed = 0
    for n, p in enumerate(document["posts"]):
        r = reviews[n]
        if r.get("faithful") is True and r.get("critique_ok") is True and r.get("tone_ok") is True and not r.get("problems"):
            continue
        failed += 1
        print(f"\nNOT AGREED: post {n + 1} ({', '.join(p['verses'])}): {p['headline']}")
        print(f"   faithful={r.get('faithful')} critique_ok={r.get('critique_ok')} tone_ok={r.get('tone_ok')}")
        for problem in r.get("problems") or []:
            print("   -", problem)
    models = sorted({r.get("model") for r in reviews.values() if r.get("model")})
    print(f"\nfact-check by {', '.join(models) or 'no model'}: {len(cards) - failed} of {len(cards)} cards agreed")
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="check the picks and stop; write nothing")
    parser.add_argument("--only-reviewed", action="store_true", help="publish only the posts a person has marked reviewed")
    parser.add_argument("--fact-check", action="store_true", help="also have the fact-check model read every card (needs a key)")
    parser.add_argument("--env-file", type=Path, help="a .env with the model keys, for --fact-check")
    args = parser.parse_args()

    picks = json.loads(PICKS.read_text(encoding="utf-8"))
    approved_file = config.SOURCES_DIR / "approved_context.json"
    approved = json.loads(approved_file.read_text(encoding="utf-8")) if approved_file.exists() else []
    verses = book.load_verses()
    document, problems = build(picks, verses, approved, args.only_reviewed)
    for problem in problems:
        print("PROBLEM:", problem)
    if problems:
        sys.exit(f"{len(problems)} problem(s): nothing written")
    unreviewed = sum(not p["reviewed"] for p in document["posts"])
    print(f"{len(document['posts'])} posts in {len(document['topics'])} topics, {len(document['verses'])} verses, {unreviewed} not yet reviewed")
    for t in document["topics"]:
        print(f"  {t['count']:>2}  {t['title']}")
    if args.fact_check:
        if args.env_file:
            from backend.trials.manusmriti_critique.generate import load_env_file
            print(f"loaded {load_env_file(args.env_file)} settings from {args.env_file}")
        if fact_check(document, verses):
            sys.exit("the fact-check disagreed with some cards: nothing written")
    if not args.check:
        POSTS.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {POSTS}")


if __name__ == "__main__":
    main()
