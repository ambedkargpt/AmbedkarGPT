"""Check a generated post against the Manusmriti text before anyone sees it.

A model writing about a book will, left alone, round a number, sharpen a verb or invent a phrase that
sounds like the book. These checks are deterministic and strict on purpose, so a post that reaches a
human has already passed them:

  * every verse the post cites exists, and the post names at least one
  * every piece of text in quotation marks is word-for-word in a cited verse
  * every number (digits or words) is in a cited verse
  * every strong word (kill, death, torture, slave, ...) is in a cited verse
  * the post fits X's length rule
  * it criticises the text, not people: no collective statements about communities, no party or
    leader names, no abuse
  * it states no outside fact (Ambedkar, the Constitution, a court) unless the cited verse itself uses the
    word or the fact was supplied as approved context

What these checks cannot see is meaning (a post can use only true words and still mislead), so a
second, model-based review is run after them (generate.py); neither replaces a human reading.
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set

from . import book, xformat
from .book import Verse


@dataclass(frozen=True)
class Issue:
    level: str       # "error" blocks the post; "warning" keeps it from "approved"; "note" is style advice
    code: str
    message: str

    def __str__(self) -> str:
        return f"{self.level}:{self.code}: {self.message}"


# ── normalisation ──────────────────────────────────────────────────────────────

def norm(text: str) -> str:
    """Letters and digits only, lower-case: robust to spacing, punctuation and quote style."""
    text = unicodedata.normalize("NFC", text).lower()
    return "".join(ch for ch in text if unicodedata.category(ch)[0] in "LN")


QUOTED = re.compile(r"“([^”]+)”|\"([^\"]+)\"")


def quoted_strings(text: str) -> List[str]:
    return [a or b for a, b in QUOTED.findall(text)]


def quote_in_verse(quote: str, verse_text: str) -> bool:
    """True when every piece of the quote (split at … or ...) is word-for-word in the verse."""
    pieces = [p for p in re.split(r"…|\.\.\.", quote) if len(norm(p)) >= 3]
    return bool(pieces) and all(norm(p) in norm(verse_text) for p in pieces)


# ── verse references in a post ─────────────────────────────────────────────────

REF = re.compile(r"(?<![\d.])(\d{1,2})\.(\d{1,3})(?:\s*[–—-]\s*(?:(\d{1,2})\.)?(\d{1,3}))?(?![\d.]*\d)")


def find_refs(text: str) -> List[str]:
    """Verse ids a post mentions ('8.267-272' expands to the whole range), in order of appearance."""
    ids: List[str] = []
    for m in REF.finditer(text):
        chapter, start, end_chapter, end = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
        if end is None or (end_chapter and int(end_chapter) != chapter) or int(end) < start:
            ids.append(f"{chapter}.{start}")
        else:
            ids.extend(f"{chapter}.{n}" for n in range(start, int(end) + 1))
    return ids


def strip_refs(text: str) -> str:
    return REF.sub(" ", text)


# ── numbers ────────────────────────────────────────────────────────────────────

_UNITS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen".split())}
_TENS = {w: 10 * i for i, w in enumerate("_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()) if w != "_"}
_WORDS = {**_UNITS, **_TENS, "hundred": 100, "thousand": 1000}
_TOKEN = re.compile(r"[a-z]+|\d+")


def numbers_in(text: str) -> Set[int]:
    """Every number in a text, written as digits or as words ('one hundred and fifty' -> 150)."""
    found: Set[int] = set()
    tokens = _TOKEN.findall(text.lower().replace("-", " "))
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t.isdigit():
            found.add(int(t))
            i += 1
            continue
        if t not in _WORDS:
            i += 1
            continue
        total, current, j = 0, 0, i
        while j < len(tokens):
            w = tokens[j]
            if w == "and" and j + 1 < len(tokens) and tokens[j + 1] in _WORDS and current:
                j += 1
                continue
            if w not in _WORDS:
                break
            value = _WORDS[w]
            if value == 100:
                current = max(current, 1) * 100
            elif value == 1000:
                total += max(current, 1) * 1000
                current = 0
            else:
                current += value
            j += 1
        found.add(total + current)
        i = max(j, i + 1)
    return found


# ── strong words, tone, outside facts ──────────────────────────────────────────

# A word like these in a post must be in a cited verse: they are where a summary quietly gets worse
# than the text ("fined" becoming "tortured"). Whole-word patterns, so "diet" does not match "die".
STRONG_WORDS = (
    r"kill\w*", r"slay\w*|slain", r"death|dead|die[ds]?", r"tortur\w*", r"mutilat\w*", r"behead\w*", r"burn\w*",
    r"rape[ds]?|raping", r"enslav\w*", r"slave\w*|slavery", r"lash\w*|whip\w*|flog\w*", r"brand\w*", r"blind\w*",
    r"banish\w*|exile\w*", r"imprison\w*", r"execut\w*", r"murder\w*", r"beat|beaten|beating", r"starv\w*",
    r"chain\w*", r"hang\w*|hanged", r"stone[ds]?",
)

BLOCKED_PATTERNS = {
    "collective_statement": re.compile(
        r"\b(?:all|every|most|many|these)\s+(?:hindus?|brahmins?|brahmanas?|upper[- ]castes?|savarnas?|muslims?|christians?|sikhs?|buddhists?)\b", re.I),
    "attribution_to_people": re.compile(r"\b(?:hindus?|brahmins?|brahmanas?|upper[- ]castes?|savarnas?)\s+(?:are|were|believe|follow|worship|still|always|never|want|think)\b", re.I),
    "politics": re.compile(
        r"\b(?:modi|bjp|rss|sangh|congress party|savarkar|golwalkar|rahul|gandhi|yogi|amit shah|vhp|bajrang|parliament|election|vote)\b", re.I),
    "abuse": re.compile(r"\b(?:idiots?|stupid|scum|vermin|filthy|savages?|bastards?|traitors?|terrorists?|goons?|fools?)\b", re.I),
    "violence": re.compile(r"\b(?:burn (?:it|them|the book)|destroy (?:it|them)|kill (?:them|these))\b", re.I),
}

PRACTICE_CLAIMS = re.compile(
    r"\b(?:was|were|is|are|been)\s+(?:enforced|practi[sc]ed|implemented|applied|followed|carried out|used to)\b|\bin practice\b|"
    r"\bhistorically\b|\bfor (?:centuries|millennia|ages)\b|\bto this day\b|\bstill\b", re.I)

# Facts that are not in the book. A post may use them only if they were supplied as approved context.
OUTSIDE_FACTS = re.compile(
    r"\b(?:ambedkar|phule|periyar|buddha|gita|veda?s?|constitution|article \d+|supreme court|high court|mahad|1927|ipc|law commission|"
    r"census|survey|study|studies|according to scholars|historians?)\b", re.I)

# Patterns that set rules side by side are empty with one verse ("Same insult. Different price." and then only one price).
PATTERN_MIN_VERSES = {"asymmetry": 2, "reverse_the_roles": 2, "verse_stack": 2, "protected_and_punished": 2}

ALLOWED_HASHTAGS = {"#manusmriti"}
HASHTAG = re.compile(r"#\w+")


# ── the check ──────────────────────────────────────────────────────────────────

def verify_post(post: Dict, verses: Dict[str, Verse], approved_context: Sequence[str] = (), limit: int = xformat.X_LIMIT) -> List[Issue]:
    """All problems with one post. `post` has `text` (or `parts` for a thread), `verses` and `quotes`."""
    issues: List[Issue] = []
    parts: List[str] = post.get("parts") or [post.get("text", "")]
    text = "\n".join(parts)

    def err(code: str, message: str) -> None:
        issues.append(Issue("error", code, message))

    def warn(code: str, message: str) -> None:
        issues.append(Issue("warning", code, message))

    def note(code: str, message: str) -> None:
        issues.append(Issue("note", code, message))

    if not text.strip():
        return [Issue("error", "empty", "the post is empty")]

    # length: every part of a thread has to fit on its own
    for n, part in enumerate(parts, 1):
        length = xformat.weighted_length(part)
        if length > limit:
            err("length", f"{'part ' + str(n) + ' ' if len(parts) > 1 else ''}weighs {length} on X, over the {limit} limit")

    # references
    declared = list(dict.fromkeys(post.get("verses") or []))
    unknown = [v for v in declared if v not in verses]
    if unknown:
        err("unknown_verse", f"declared verses are not in the supplied text: {', '.join(unknown)}")
    cited = [verses[v] for v in declared if v in verses]
    mentioned = list(dict.fromkeys(find_refs(text)))
    if not mentioned:
        err("no_reference", "the post names no verse (write it as, for example, Manusmriti 8.270)")
    not_declared = [m for m in mentioned if m not in declared]
    if not_declared:
        err("undeclared_reference", f"the post refers to verses it does not declare: {', '.join(not_declared)}")
    not_in_text = [v for v in declared if v in verses and v not in mentioned]
    if not_in_text:
        note("unreferenced_verse", f"declared but not named in the post: {', '.join(not_in_text)}")
    cited_text = " ".join(v.text for v in cited)
    needed = PATTERN_MIN_VERSES.get(str(post.get("pattern", "")).strip())
    if needed and len(set(mentioned)) < needed:
        err("pattern_needs_verses", f"pattern '{post.get('pattern')}' sets rules side by side and needs {needed} different verses, but the post cites {len(set(mentioned))}")

    # quotation marks: nothing in quotes may be invented
    shown = quoted_strings(text)
    for q in shown:
        if len(norm(q)) >= 3 and not any(quote_in_verse(q, v.text) for v in cited):
            err("invented_quote", f"text in quotation marks is not word-for-word in a cited verse: “{q[:80]}”")
    for q in post.get("quotes") or []:
        verse = verses.get(q.get("verse", ""))
        if verse is None or not quote_in_verse(q.get("text", ""), verse.text):
            err("quote_mismatch", f"declared quote is not word-for-word in verse {q.get('verse')}: “{str(q.get('text', ''))[:80]}”")
    if not shown:
        note("no_quote", "no exact quotation: a short quoted phrase from the verse makes a post easier to trust")

    # numbers
    allowed = numbers_in(cited_text) | {len(declared), len(parts)} | set(range(1, len(parts) + 1))
    bare = strip_refs(re.sub(r"(?m)^\s*\d+\s*/\s*\d+\s*", " ", text))          # drop references and "2/5" markers
    bare = re.sub(r"“[^”]*”|\"[^\"]*\"", " ", bare)                               # quoted text is checked word for word above
    claimed = {n for n in numbers_in(bare) if n > 3}
    claimed |= {int(d) for d in re.findall(r"\b\d+\b", bare) if int(d) not in allowed and int(d) > 3}
    unsupported = sorted(n for n in claimed if n not in allowed)
    if unsupported:
        err("unsupported_number", f"numbers not in the cited verses: {', '.join(map(str, unsupported))}")

    # a count of verses ("Two verses.") must match the verses the post actually cites
    words = {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
    for m in re.finditer(r"\b(two|three|four|five|six|\d+)\s+(?:consecutive\s+)?verses?\b", bare, re.I):
        said = words.get(m.group(1).lower()) or int(m.group(1))
        if said != len(set(mentioned)):
            err("verse_count", f"the post says “{m.group(0)}” but cites {len(set(mentioned))} verse(s)")

    # strong words
    for pattern in STRONG_WORDS:
        in_post = re.search(r"\b(?:" + pattern + r")\b", bare, re.I)
        if in_post and not re.search(r"\b(?:" + pattern + r")\b", cited_text, re.I):
            err("strong_word", f"“{in_post.group(0)}” is in the post but not in the cited verses; the text may say less than the post does")

    # tone and target
    for code, pattern in BLOCKED_PATTERNS.items():
        m = pattern.search(text)
        if m:
            err(code, f"not allowed in a post about a text: “{m.group(0)}”")
    if re.search(r"\bhindu", text, re.I):
        warn("mentions_hindu", "mentions Hindus or Hinduism: check that it is about the text, not the people")
    for tag in HASHTAG.findall(text):
        if tag.lower() not in ALLOWED_HASHTAGS:
            err("hashtag", f"hashtag {tag} is not on the allowed list ({', '.join(sorted(ALLOWED_HASHTAGS))})")

    # claims about practice, and facts from outside the book
    m = PRACTICE_CLAIMS.search(bare)
    if m:
        warn("practice_claim", f"“{m.group(0)}” reads as a claim about what happened in practice; the book only says what it prescribes")
    allowed_words = (" ".join(approved_context) + " " + cited_text).lower()
    for m in OUTSIDE_FACTS.finditer(bare):
        if m.group(0).lower() not in allowed_words:
            err("outside_fact", f"“{m.group(0)}” is not in the cited verses and was not supplied as approved context")
    return issues


def errors(issues: Iterable[Issue]) -> List[Issue]:
    return [i for i in issues if i.level == "error"]


def passes(issues: Iterable[Issue]) -> bool:
    return not errors(issues)
