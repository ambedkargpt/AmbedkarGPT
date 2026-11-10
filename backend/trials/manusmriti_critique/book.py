"""The supplied Manusmriti text: look verses up by number, and list candidates by theme.

Every claim a post makes has to come from here, so this is the only place the text is read. The
search is deliberately plain keyword scoring (no model): it only proposes verses worth reading, a
person or the generator chooses, and whatever is chosen is then checked verbatim against the verse.

    python3 -m backend.trials.manusmriti_critique.book --theme punishment_by_birth --top 8
    python3 -m backend.trials.manusmriti_critique.book --show 8.267-8.272
"""

import argparse
import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from . import config

VERSES_FILE = config.SOURCES_DIR / "manusmriti_verses.json"

INGEST_HINT = (
    "The Manusmriti has not been ingested. Run:\n"
    "  python3 backend/trials/manusmriti_critique/tools/ingest_book.py /path/to/Manu-Smriti.pdf"
)


@dataclass(frozen=True)
class Verse:
    id: str          # "8.270"
    chapter: int
    verse: int
    page: int        # page of the supplied PDF
    text: str        # the English rendering, as supplied


@lru_cache(maxsize=4)
def load_verses(path: Optional[Path] = None) -> Dict[str, Verse]:
    path = path or VERSES_FILE
    if not path.exists():
        raise FileNotFoundError(INGEST_HINT)
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {r["id"]: Verse(r["id"], r["chapter"], r["verse"], r["page"], r["text"]) for r in rows}


def verse_key(verse_id: str) -> Tuple[int, int]:
    chapter, number = verse_id.split(".")
    return int(chapter), int(number)


def parse_refs(spec: str) -> List[str]:
    """'8.267-8.272', '8.267-272' and '8.270, 8.271' all become lists of verse ids, in order."""
    ids: List[str] = []
    for part in re.split(r"[,\s;]+", spec.strip()):
        if not part:
            continue
        m = re.fullmatch(r"(\d{1,2})\.(\d{1,3})(?:\s*[-–—]\s*(?:(\d{1,2})\.)?(\d{1,3}))?", part)
        if not m:
            raise ValueError(f"cannot read verse reference {part!r} (use 8.270 or 8.267-8.272)")
        chapter, start, end_chapter, end = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        if end is None:
            ids.append(f"{chapter}.{start}")
            continue
        if end_chapter and int(end_chapter) != chapter:
            raise ValueError(f"a range must stay inside one chapter: {part!r}")
        if int(end) < start:
            raise ValueError(f"range runs backwards: {part!r}")
        ids.extend(f"{chapter}.{n}" for n in range(start, int(end) + 1))
    return ids


def get_verses(ids: Iterable[str], verses: Optional[Dict[str, Verse]] = None) -> List[Verse]:
    verses = verses or load_verses()
    missing = [i for i in ids if i not in verses]
    if missing:
        raise KeyError(f"not in the supplied text: {', '.join(missing)}")
    return [verses[i] for i in ids]


def neighbours(verse_id: str, before: int = 1, after: int = 1, verses: Optional[Dict[str, Verse]] = None) -> List[Verse]:
    """The verses around one, in order: a verse is often only half a sentence without them."""
    verses = verses or load_verses()
    chapter, number = verse_key(verse_id)
    wanted = [f"{chapter}.{n}" for n in range(number - before, number + after + 1)]
    return [verses[i] for i in wanted if i in verses]


# ── candidate search ───────────────────────────────────────────────────────────

CLASSES = r"(?:sudras?|vaisyas?|kshatriyas?|brahmanas?|once-born|twice-born|low(?:est)? castes?|outcastes?|chandalas?|svapakas?|nishadas?)"


@dataclass(frozen=True)
class Theme:
    description: str
    require: str                              # a verse must match this to be considered at all
    boosts: Dict[str, int]                    # pattern -> points (each counted once per verse)
    min_classes: int = 0                      # distinct class names needed (to show a comparison)


THEMES: Dict[str, Theme] = {
    "punishment_by_birth": Theme(
        "Penalties or fines that depend on the birth-class of the offender or the victim.",
        CLASSES,
        {r"\b(?:fines?|fined)\b": 3, r"\bpanas?\b": 3, r"\bpunish\w*": 2, r"\bcorporal\b": 3, r"\btongue\b": 4,
         r"\b(?:hot|red-hot|boiling)\b": 3, r"\boil\b": 3, r"\bnail\b": 3, r"\bbrand\w*": 3, r"\bbanish\w*": 2,
         r"\b(?:slay|slays|kill|killed|death)\b": 3, r"\bshav\w+": 2, r"\bconfiscat\w*": 2, r"\bmutilat\w*": 3,
         r"\b(?:cut|cutting|cut off|cut out)\b": 3, r"\bking\b": 1, r"\bdefam\w*|\binsult\w*|\babus\w*": 2},
        min_classes=2,
    ),
    "sudra_exclusion": Theme(
        "Rules that bar or restrict Sudras from learning, wealth, ritual or honour.",
        r"\bsudras?\b",
        {r"\b(?:shall not|must not|never|not be|forbidden|prohibited)\b": 3, r"\bveda\b": 3, r"\b(?:wealth|property|riches)\b": 3,
         r"\b(?:accumulat\w*|hoard\w*)\b": 4, r"\b(?:serve|service|servile|slave\w*)\b": 3, r"\b(?:study|studies|learning|read|recite)\b": 2,
         r"\b(?:sacrific\w*|sacred fire|rites?)\b": 2, r"\b(?:gift|gifts)\b": 1, r"\bseiz\w*|\btake possession\b": 3},
    ),
    "women_control": Theme(
        "Rules that place women under the control of fathers, husbands or sons.",
        r"\b(?:women|woman|wife|wives|female|females|girl|damsel|widow\w*|mother)\b",
        {r"\b(?:never|not)\b.{0,40}\b(?:independen\w*|fit for)\b": 5, r"\bindependen\w*": 4, r"\bguard\w*|\bprotect\w*": 2,
         r"\b(?:father|husband|son)\b": 2, r"\b(?:subject|obey\w*|dependen\w*|control\w*)\b": 3, r"\bday and night\b": 3,
         r"\b(?:shall|must|should)\b": 1, r"\b(?:property|wealth|inherit\w*|share)\b": 2, r"\b(?:no right|not entitled)\b": 3},
    ),
    "brahmana_privilege": Theme(
        "Rules that exempt or favour the Brahmana, in law, property or punishment.",
        r"\bbrahmanas?\b",
        {r"\b(?:never|shall not|must not|not be)\b.{0,50}\b(?:slay|kill|punish\w*|tax\w*|fine\w*)\b": 5, r"\b(?:exempt\w*|immun\w*)\b": 4,
         r"\bseiz\w*|\btake possession\b|\bappropriat\w*": 3, r"\b(?:honour|respect|worship|reverence)\w*": 2, r"\b(?:first|best|highest|greatest)\b": 1,
         r"\b(?:property|wealth|treasure)\b": 2, r"\bking\b": 1, r"\bsudras?\b": 2},
    ),
    "outcastes_and_purity": Theme(
        "Rules on contact, food, dwelling and treatment of outcastes (Chandalas and others).",
        r"\b(?:chandalas?|svapakas?|pukkasas?|outcastes?|despised|impure|impurity|pollut\w*)\b",
        {r"\b(?:touch\w*|contact)\b": 3, r"\b(?:eat\w*|food|vessels?)\b": 2, r"\b(?:dwell\w*|live\w*|villages?|outside)\b": 2,
         r"\b(?:dogs?|asses?|donkeys?)\b": 4, r"\b(?:shall not|must not|never)\b": 2, r"\b(?:rags?|cloth\w*|garments?)\b": 2},
    ),
    "birth_ranking": Theme(
        "Statements that rank people by birth, including the origin of the four classes.",
        CLASSES,
        {r"\b(?:mouth|arms|thighs|feet)\b": 4, r"\b(?:highest|lowest|best|worst|superior|inferior|excellent)\b": 3,
         r"\b(?:born|birth|origin|produced)\b": 2, r"\bservile|\bto serve\b|\bonly one duty\b": 4},
        min_classes=2,
    ),
}


def score(theme: Theme, text: str) -> int:
    lowered = text.lower()
    if not re.search(theme.require, lowered):
        return 0
    classes = set(re.findall(CLASSES, lowered))
    if len(classes) < theme.min_classes:
        return 0
    total = sum(points for pattern, points in theme.boosts.items() if re.search(pattern, lowered))
    return total + (2 * max(0, len(classes) - 1) if theme.min_classes else 0)


def candidates(theme_name: str, limit: int = 12, verses: Optional[Dict[str, Verse]] = None) -> List[Tuple[int, Verse]]:
    verses = verses or load_verses()
    theme = THEMES[theme_name]
    scored = [(score(theme, v.text), v) for v in verses.values()]
    ranked = sorted((s for s in scored if s[0] > 0), key=lambda s: (-s[0], verse_key(s[1].id)))
    return ranked[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--theme", choices=sorted(THEMES))
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--show", help="print verses, e.g. 8.267-8.272")
    args = parser.parse_args()
    if args.show:
        for v in get_verses(parse_refs(args.show)):
            print(f"{v.id} (p.{v.page}): {v.text}\n")
    elif args.theme:
        print(THEMES[args.theme].description)
        for points, v in candidates(args.theme, args.top):
            print(f"\n[{points:>2}] {v.id}: {v.text[:330]}")
    else:
        for name, theme in THEMES.items():
            print(f"{name:24} {theme.description}")


if __name__ == "__main__":
    main()
