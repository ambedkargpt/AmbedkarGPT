"""Build published/posts.json, the file the website's Manusmriti section reads, from published/picks.json.

picks.json is what a person chose: the topics (a title and one line, in English and Hindi) and the posts, each with
its topic, its text, the verses it cites and whether a person has read it. This tool does not trust it. Every post is
put through the same checks as a generated one (quotes word for word, numbers, strong words, tone, length, verses that
exist) against the verses of the supplied book, and one failure stops the build. The result carries the text of the
cited verses, so the website and its tests need neither the PDF nor a model.

    python3 backend/trials/manusmriti_critique/tools/publish_posts.py            # check, then write posts.json
    python3 backend/trials/manusmriti_critique/tools/publish_posts.py --check    # check only
    python3 backend/trials/manusmriti_critique/tools/publish_posts.py --only-reviewed   # leave out posts nobody has read yet

Needs sources/manusmriti_verses.json (run tools/ingest_book.py once).
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


def post_id(parts: Sequence[str]) -> str:
    """Stable while the text is, so a link to a post survives a rebuild."""
    return hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest()[:8]


def build(picks: Dict, verses: Dict[str, Verse], approved_context: Sequence[str] = (), only_reviewed: bool = False) -> Tuple[Dict, List[str]]:
    """The published document, and every problem found. Any problem means the document must not be written."""
    problems: List[str] = []
    topics = {t["id"]: t for t in picks.get("topics", [])}
    for t in topics.values():
        problems += [f"topic {t.get('id')!r}: missing {k}" for k in TOPIC_KEYS if not str(t.get(k) or "").strip()]
    posts, seen = [], set()
    for number, pick in enumerate(picks.get("posts", []), 1):
        parts = [str(s).strip() for s in pick.get("parts") or [] if str(s).strip()]
        label = f"post {number} ({', '.join(pick.get('verses') or [])})"
        if not parts:
            problems.append(f"{label}: no text")
            continue
        if pick.get("topic") not in topics:
            problems.append(f"{label}: unknown topic {pick.get('topic')!r}")
            continue
        check = {"text": "\n\n".join(parts), "parts": parts if len(parts) > 1 else [], "verses": list(pick.get("verses") or []),
                 "quotes": [], "pattern": pick.get("pattern") or "plain_rule"}
        problems += [f"{label}: {issue}" for issue in verify.errors(verify.verify_post(check, verses, approved_context=approved_context))]
        pid = post_id(parts)
        if pid in seen:
            problems.append(f"{label}: the same text is picked twice")
            continue
        seen.add(pid)
        if only_reviewed and not pick.get("reviewed"):
            continue
        posts.append({"id": pid, "topic": pick["topic"], "parts": parts, "verses": check["verses"],
                      "pattern": pick.get("pattern"), "reviewed": bool(pick.get("reviewed", False))})
    counts = {t: sum(p["topic"] == t for p in posts) for t in topics}
    used = sorted({v for p in posts for v in p["verses"] if v in verses}, key=book.verse_key)
    document = {
        "version": 1,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "translation": picks.get("translation"),
        "topics": [{**{k: t[k] for k in TOPIC_KEYS if k in t}, "count": counts[t["id"]]} for t in topics.values() if counts[t["id"]]],
        "posts": posts,
        "verses": {v: {"text": verses[v].text, "chapter": verses[v].chapter, "verse": verses[v].verse} for v in used},
    }
    return document, problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="check the picks and stop; write nothing")
    parser.add_argument("--only-reviewed", action="store_true", help="publish only the posts a person has marked reviewed")
    args = parser.parse_args()

    picks = json.loads(PICKS.read_text(encoding="utf-8"))
    approved_file = config.SOURCES_DIR / "approved_context.json"
    approved = json.loads(approved_file.read_text(encoding="utf-8")) if approved_file.exists() else []
    document, problems = build(picks, book.load_verses(), approved, args.only_reviewed)
    for problem in problems:
        print("PROBLEM:", problem)
    if problems:
        sys.exit(f"{len(problems)} problem(s): nothing written")
    unreviewed = sum(not p["reviewed"] for p in document["posts"])
    print(f"{len(document['posts'])} posts in {len(document['topics'])} topics, {len(document['verses'])} verses, {unreviewed} not yet reviewed")
    for t in document["topics"]:
        print(f"  {t['count']:>2}  {t['title']}")
    if not args.check:
        POSTS.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {POSTS}")


if __name__ == "__main__":
    main()
