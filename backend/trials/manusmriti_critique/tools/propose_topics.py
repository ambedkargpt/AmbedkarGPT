"""Ask a model which topics of the Manusmriti make the best menu for a guided (no-questions) bot.

The visitor of that bot never types a question: they see ten topics, tap one, and the bot talks through what
the text says on it. So the topics are chosen from the text itself, not from what people say about the text.
The whole supplied book (about 120,000 tokens) goes to the model in one call, which proposes ranked candidates
with the verses a talk on each would use. Nothing the model says is trusted blindly: every verse id it names
must exist in the book (unknown ones are dropped and reported), a topic needs enough valid verses to be usable,
and a topic that mostly re-uses the verses of a better-ranked one is skipped when the menu is suggested.

    python3 backend/trials/manusmriti_critique/tools/propose_topics.py --env-file path/to/.env
    python3 backend/trials/manusmriti_critique/tools/propose_topics.py --dry-run        # size of the prompt, no model call

Writes output/topics_proposed-<UTC time>.json (not committed). The menu that is finally chosen is a decision for
a person; once chosen it is saved by hand as analysis/topics.json (ids and titles only, no verse text).
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from backend.trials.manusmriti_critique import book, config, llm  # noqa: E402
from backend.trials.manusmriti_critique.book import Verse  # noqa: E402

DEFAULT_MODEL = "models/gemini-pro-latest"
MIN_ANCHORS = 6          # a talk needs at least this many valid verses to stand on
MAX_SHARED = 0.3         # a topic is skipped if more than this share of its verses belong to a better-ranked pick

SYSTEM_HEAD = """You are helping design a guided chatbot about the Manusmriti. The visitor never types a question. They see ten topics, tap one, and the bot talks them through what the text says on it, one short card at a time, using exact verses. Your job: from the full text you are given, propose the topics that would make the best menu.

"""

# What the menu is for changes which topics are best, so it is stated, not left for the model to guess.
PURPOSES = {
    "general": "The menu is for a general reader: choose the topics that are the most interesting, concrete and self-contained.\n\n",
    "critique": ("The bot is a fact-based critique of the text. On each topic it shows, in the text's own words, where the rules rank people by "
                 "birth-class or by sex, give unequal penalties, rights or honours, or restrict learning, speech, wealth, work, food, marriage or dignity, "
                 "and then asks the visitor to judge. So choose the topics where the verses themselves make that unequal rule plain, with at least 8 "
                 "verses that do. Do not pick a topic only because it is interesting or neutral, and do not pick one whose point needs outside facts. "
                 "Still cover different parts of the text.\n\n"),
}

SYSTEM_TAIL = """A good topic:
1. is about something the verses themselves state, so every card can be a verse plus a plain restatement. No topic may need history, politics, commentary, or any fact from outside the text.
2. has at least 8 verses that are self-contained: a reader understands the rule without the verses around it.
3. has concrete rules (who, what, what penalty, what is allowed or forbidden), not general advice.
4. has a plain title of 2 to 5 words that an ordinary reader understands at a glance.
5. differs from the other topics: together they cover different parts of the text (law and punishment, caste and work, women, property, education, ritual, kingship, food and purity, marriage, and so on), not ten variations on one theme.

Avoid: topics whose best verses are obscure or garbled in this translation; explicit sexual detail; anything that would need Sanskrit terms the verses do not explain.

Rank the candidates best first. For each give:
- id: snake_case
- title: 2 to 5 plain words
- one_line: what the visitor will learn, one neutral sentence
- chapters: the chapter numbers it draws on
- anchor_verses: 10 verse ids, in the order a talk would use them, from the most basic rule to the strongest
- strongest_verse: one id
- approx_verse_count: your estimate of how many verses in the text address it
- why_it_works: one sentence
- cautions: what a careless retelling could get wrong or overstate

Use only verse ids that appear in the text. Never invent or alter a verse number.
Return JSON: {"topics": [ ... ]}"""


def listing(verses: Dict[str, Verse]) -> str:
    """The whole book as `id text` lines, one chapter after another."""
    lines, chapter = [], None
    for v in sorted(verses.values(), key=lambda v: (v.chapter, v.verse)):
        if v.chapter != chapter:
            chapter = v.chapter
            lines.append(f"\n[chapter {chapter}]")
        lines.append(f"{v.id} {v.text}")
    return "\n".join(lines)


def build_prompts(verses: Dict[str, Verse], n: int, purpose: str = "critique") -> Tuple[str, str]:
    return SYSTEM_HEAD + PURPOSES[purpose] + SYSTEM_TAIL, f"Propose {n} candidate topics.\n\nTEXT:\n{listing(verses)}"


def validate(raw, verses: Dict[str, Verse], min_anchors: int = MIN_ANCHORS) -> Tuple[List[Dict], List[str]]:
    """The model's topics with unknown verse ids removed. A bare list is accepted as the list of topics."""
    items = raw if isinstance(raw, list) else (raw.get("topics") if isinstance(raw, dict) else None)
    topics, notes = [], []
    for rank, t in enumerate(items if isinstance(items, list) else [], 1):
        if not isinstance(t, dict):
            continue
        named = [str(a).strip() for a in t.get("anchor_verses") or [] if str(a).strip()]
        good = [a for a in dict.fromkeys(named) if a in verses]
        bad = [a for a in dict.fromkeys(named) if a not in verses]
        strongest = str(t.get("strongest_verse") or "").strip()
        title = str(t.get("title") or "").strip()
        if bad:
            notes.append(f"{title or t.get('id')}: dropped verse ids that are not in the book: {', '.join(bad)}")
        if strongest and strongest not in verses:
            notes.append(f"{title or t.get('id')}: strongest_verse {strongest} is not in the book")
            strongest = ""
        topics.append({**t, "rank": rank, "title": title, "anchor_verses": good, "dropped_unknown_ids": bad,
                       "strongest_verse": strongest or (good[-1] if good else ""),
                       "chapters_of_anchors": sorted({verses[a].chapter for a in good}),
                       "usable": bool(title) and len(good) >= min_anchors})
    return topics, notes


def suggest_menu(topics: List[Dict], size: int = 10, max_shared: float = MAX_SHARED) -> Tuple[List[Dict], List[str]]:
    """The first `size` usable topics, skipping one that mostly repeats the verses of a better-ranked pick."""
    chosen, used, skipped = [], set(), []
    for t in topics:
        if not t["usable"]:
            skipped.append(f"{t['title'] or t.get('id')}: fewer than {MIN_ANCHORS} valid verses")
            continue
        anchors = set(t["anchor_verses"])
        shared = len(anchors & used) / len(anchors)
        if shared > max_shared:
            skipped.append(f"{t['title']}: {round(shared * 100)}% of its verses are already used by a better-ranked topic")
            continue
        chosen.append(t)
        used |= anchors
        if len(chosen) == size:
            break
    return chosen, skipped


def propose(verses: Dict[str, Verse], n: int = 14, complete=llm.complete_json, model: Optional[str] = None, thinking: int = 4096,
            purpose: str = "critique") -> Dict:
    system, user = build_prompts(verses, n, purpose)
    raw = complete(system, user, temperature=0.3, max_tokens=16000, providers=["gemini"], model=model or os.getenv("TRIAL_TOPICS_MODEL") or DEFAULT_MODEL, thinking=thinking)
    topics, notes = validate(raw, verses)
    menu, skipped = suggest_menu(topics)
    return {"created": datetime.now(timezone.utc).isoformat(timespec="seconds"), "model": model or os.getenv("TRIAL_TOPICS_MODEL") or DEFAULT_MODEL,
            "purpose": purpose, "asked_for": n, "topics": topics, "suggested_menu": [t["id"] if t.get("id") else t["title"] for t in menu],
            "notes": notes + [f"not in the suggested menu: {s}" for s in skipped]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=14, help="how many candidate topics to ask for (the menu takes the best 10)")
    parser.add_argument("--purpose", choices=sorted(PURPOSES), default="critique",
                        help="what the menu is for: 'critique' (where the text's own rules rank or restrict people) or 'general' (most interesting)")
    parser.add_argument("--model", help=f"default {DEFAULT_MODEL}, or TRIAL_TOPICS_MODEL")
    parser.add_argument("--env-file", type=Path, help="a .env with the Gemini key")
    parser.add_argument("--dry-run", action="store_true", help="print the size of the prompt and stop")
    args = parser.parse_args()

    verses = book.load_verses()
    if args.dry_run:
        system, user = build_prompts(verses, args.n, args.purpose)
        print(f"{len(verses)} verses, prompt about {(len(system) + len(user)) // 4:,} tokens ({len(user):,} characters of book text)")
        return
    from backend.trials.manusmriti_critique.generate import load_env_file
    if args.env_file:
        print(f"loaded {load_env_file(args.env_file)} settings from {args.env_file}")
    result = propose(verses, args.n, model=args.model, purpose=args.purpose)
    out = config.OUTPUT_DIR / f"topics_proposed-{args.purpose}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(result['topics'])} candidates from {result['model']} -> {out}\n")
    print(f"{'#':>2} {'title':32} {'chapters':14} {'valid':>5} {'~verses':>7}  usable")
    for t in result["topics"]:
        print(f"{t['rank']:>2} {t['title'][:32]:32} {','.join(map(str, t['chapters_of_anchors']))[:14]:14} {len(t['anchor_verses']):>5} {str(t.get('approx_verse_count', '?')):>7}  {'yes' if t['usable'] else 'NO'}")
    print("\nsuggested menu:", ", ".join(result["suggested_menu"]))
    for note in result["notes"]:
        print("note:", note)


if __name__ == "__main__":
    main()
