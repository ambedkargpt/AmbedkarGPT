"""Write X posts that criticise specific Manusmriti verses, and prove each one against the text.

    # the verses you choose (a range is fine), three variants, one post each
    python3 -m backend.trials.manusmriti_critique.generate --verses 8.268 8.270 --variants 3

    # let the search propose verses on a theme and the model pick the strongest
    python3 -m backend.trials.manusmriti_critique.generate --theme punishment_by_birth --top 6

    # a thread instead of a single post; see the prompts without calling a model
    python3 -m backend.trials.manusmriti_critique.generate --verses 8.270-8.272 --format thread
    python3 -m backend.trials.manusmriti_critique.generate --verses 8.270 --dry-run

    # you edited a post by hand: run the file through the same checks (thread parts separated by a line of ---)
    python3 -m backend.trials.manusmriti_critique.generate --check-file my_post.txt

The flow, every step of which is recorded in output/runs/<time>/ :
    1. the model writes the posts from the supplied verses and the playbook (the patterns the videos use);
    2. verify.py checks each one against the verse text (quotes, numbers, strong words, tone, length);
    3. a post that fails is sent back with the exact problems, up to twice, then rejected;
    4. a second model pass fact-checks what survived against the verses, as a sceptical reader would;
    5. a post is "approved" only if nothing failed and the fact-check agrees, otherwise "needs_review".
Nothing is published: the output is a file for a person to read.
"""

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from . import book, config, llm, verify, xformat
from .book import Verse

Complete = Callable[..., Dict]

# The fact-check is the part that must not be lenient. On the first verse set a faster model approved a post
# whose last line had dropped "his Sudra (slave)" from 8.417; a Pro-class model with thinking caught it.
DEFAULT_JUDGE_MODEL = "models/gemini-pro-latest"


# ── the playbook ───────────────────────────────────────────────────────────────

# What the study of the transcripts boiled down to, in the shape the generator needs. analysis/playbook.json,
# when present, is laid over this, section by section, so a missing section falls back rather than failing.
DEFAULT_PLAYBOOK: Dict = {
    "version": "built-in",
    "principles": [
        "Let the text speak: name the verse and show its own words and details, then stop. The unfairness is in the verse.",
        "Put two rules side by side. Setting what the text says for one birth-class against what it says for another does the arguing.",
        "Be concrete. A measured amount or a named punishment lands harder than 'harsh punishments'.",
        "Say what the text says and prescribes. Never say what happened in practice unless a verse says so.",
        "Criticise the rule, not any community or religion, and say nothing about people alive today.",
    ],
    "x_posts": {
        "voice": "Plain, short, declarative sentences; line breaks for rhythm; no emoji; the verse supplies the shock.",
        "structures": [
            {"id": "asymmetry", "name": "Same act, different penalty",
             "use_when": "two verses deal with the same kind of act (an insult, a theft, a crime) but set a different penalty by birth-class",
             "steps": ["a 3-6 word opening that names the act and the unfairness (for example: Same insult. Different price.)",
                       "one line: the LIGHTEST penalty the verses give for this act (the smallest amount, or the mildest punishment), naming exactly who it applies to, with its verse reference",
                       "one line: the HARSHEST penalty the verses give for it, naming exactly who it applies to, with its verse reference. Choose the two cases that differ MOST; a post that shows only mild cases has no contrast",
                       "a closing question or one-line judgement, clearly the author's opinion"]},
            {"id": "verse_stack", "name": "It does not stop there",
             "use_when": "two or three consecutive verses that escalate a penalty",
             "steps": ["an opening line naming the offence in plain words",
                       "the rules in order, one short line each: that verse's own offence, then its penalty in the verse's own words. Move between them with a signpost about RULES (for example: Another rule:), never one that makes the penalties sound like stages of one punishment",
                       "a closing line that counts the verses it cited (the count must be right)"]},
            {"id": "reverse_the_roles", "name": "Now reverse the roles",
             "use_when": "a rule that is mild for one party and severe for the mirror-image case",
             "steps": ["state the rule for the favoured party in one line with its reference",
                       "say 'Now reverse the roles.' (or similar) and state the mirrored rule with its reference",
                       "a closing line that names what the contrast shows"]},
            {"id": "quote_first", "name": "Read it yourself",
             "use_when": "one verse whose exact words are striking",
             "steps": ["lead with the exact words in quotation marks",
                       "give the reference as the source, in a short line (for example: That is Manusmriti 8.417, not a paraphrase.)",
                       "one line saying who the rule applies to and what it allows or forbids"]},
            {"id": "plain_rule", "name": "One rule, stated plainly",
             "use_when": "a single verse that ranks, restricts or controls a group",
             "steps": ["an opening that frames what the rule governs (names, work, property, independence)",
                       "the rule in the verse's own terms, with its reference and a short exact quotation",
                       "a closing question that asks the reader to judge it"]},
        ],
        "thread": {
            "shape": ["part 1: the hook and the central contrast, no more than two verses",
                      "middle parts: one verse each, with its reference and exact detail",
                      "last part: the single judgement or question, and a note that every line cites the text"],
        },
        "closers": ["a short question (Is that justice?)", "a one-line judgement marked as opinion", "a count of the verses used"],
        "example_posts": [
            {"pattern": "plain_rule", "verses": ["2.31"],
             "text": "Even names were ranked.\n\nManusmriti 2.31: a Brahmana's name should denote \"something auspicious\"; a Sudra's should express \"something contemptible\".\n\nWho decides what a child is worth at birth?"},
            {"pattern": "plain_rule", "verses": ["5.148"],
             "text": "In childhood, under her father.\nIn youth, under her husband.\nIn old age, under her sons.\n\nManusmriti 5.148: \"a woman must never be independent.\"\n\nA rule, not an accident."},
        ],
    },
    "must": [
        "Every fact comes from the supplied verses.",
        "Name each verse you use as Manusmriti X.Y (or X.Y-Z for a range).",
        "Put anything in quotation marks word for word from a verse.",
    ],
    "must_not": [
        "No facts, dates, people, laws or history from outside the verses (no Ambedkar, no Constitution, no courts, no other texts).",
        "No statements about Hindus, Brahmins, or any community or religion as people, and nothing about politicians or parties.",
        "No numbers the verses do not give; no stronger words than the verses use.",
        "No emoji; no hashtags other than #Manusmriti.",
    ],
    "objections_to_anticipate": [
        {"objection": "Nobody follows it today.", "stay_safe_by": "Say only what the verse says. Make no claim about today."},
        {"objection": "The book also contains fairer rules.", "stay_safe_by": "Speak of 'this verse', never of 'the whole book'."},
        {"objection": "Why only this text?", "stay_safe_by": "Keep to the verse in front of you; do not compare religions."},
    ],
}


def load_playbook(path: Optional[Path] = None) -> Tuple[Dict, str]:
    """The built-in playbook with analysis/playbook.json laid over it, and a short hash saying which."""
    path = path or config.PLAYBOOK_JSON
    merged = json.loads(json.dumps(DEFAULT_PLAYBOOK))
    if path.exists():
        raw = path.read_text(encoding="utf-8")
        for key, value in json.loads(raw).items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key].update(value)
            else:
                merged[key] = value
        return merged, hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    return merged, "built-in"


# ── prompts ────────────────────────────────────────────────────────────────────

def _structures_text(playbook: Dict) -> str:
    out = []
    for s in playbook["x_posts"]["structures"]:
        steps = "\n".join(f"      {i}. {step}" for i, step in enumerate(s["steps"], 1))
        out.append(f"  - {s['id']} ({s['name']}): use when {s['use_when']}.\n{steps}")
    return "\n".join(out)


def system_prompt(playbook: Dict, fmt: str, limit: int) -> str:
    x = playbook["x_posts"]
    examples = "\n\n".join(f"(pattern: {e['pattern']})\n{e['text']}" for e in x.get("example_posts", []))
    shape = ""
    if fmt == "thread":
        shape = ("\nTHREAD: write each post as a thread of 3 to 5 parts, returned in `parts`. Start part n with \"n/N \" "
                 f"(for example 1/4). Every part is at most {limit} characters on its own. "
                 + " ".join(x.get("thread", {}).get("shape", [])))
    return f"""You write posts for X (formerly Twitter) that criticise specific rules in the Manusmriti, using ONLY the verses you are given.

WHAT MAKES THESE POSTS WORK (learned from a study of videos that criticise the text)
{chr(10).join('- ' + p for p in playbook['principles'])}

VOICE: {x['voice']}

PATTERNS to choose from, one per post (put the id in `pattern`):
{_structures_text(playbook)}

EXAMPLES OF SHAPE AND VOICE (other verses; never reuse their sentences):
{examples}

HARD RULES: a program checks every one of them, and a post that breaks one is thrown away.
1. Every fact comes from the verses below. Add no facts, dates, people, laws, courts, history, or what any other text says.
2. Anything in quotation marks is copied word for word from a verse (you may start or stop mid-sentence; use … to skip words in the middle). Use double quotes only for quotations.
3. Every number is one the verses give. Never round, add up, or turn an amount into a different one.
4. Name each verse you use as Manusmriti X.Y (or X.Y-Z for a range). Cite only verses you were given.
5. Do not use a stronger word than the verse does: no kill, death, torture, slave, mutilate and the like unless the cited verse uses that word.
6. Say what the text says or prescribes. Do not say what was done in practice, or for how long, or that anyone follows it.
7. Criticise the text and its rules. Say nothing about Hindus, Brahmins or any community, religion or believers as people, nothing about any living person, politician or party, and no insults. No emoji. The only hashtag allowed is #Manusmriti, at most once.
8. A closing question or judgement is fine, and is plainly your opinion; it adds no new fact.
9. Verses are separate rules. Give each verse's own offence its own words, and never present the penalties of different verses as stages of one punishment, or as added together, or under one label that fits only one of them. A hook or closing line may not suggest anything the verses do not say (for example, that a group receives something the verse does not give it).
10. A pattern that sets two rules side by side needs two different verses: if you cite one verse, use quote_first, plain_rule or scene_hook.
11. Each post is at most {limit} characters on X, counting line breaks, and over-long posts are thrown away: aim for 150 to {int(limit * 0.9)} characters.{shape}

Return only JSON."""


def user_prompt(verses: Sequence[Verse], request: "Request", neighbours: Dict[str, List[Verse]]) -> str:
    blocks = []
    for v in verses:
        around = "".join(f"\n    (nearby {n.id}: {n.text})" for n in neighbours.get(v.id, []))
        blocks.append(f"[{v.id}] {v.text}{around}")
    choose = (f"These verses were proposed for the theme '{request.theme}'. Choose the one to three that make the strongest post and cite only those.\n"
              if request.theme else "Use the verses below (you need not use all of them in every post).\n")
    steer = f"\nEditor's note: {request.focus}\n" if request.focus else ""
    kind = ("a single post of at most %d characters" % request.limit) if request.fmt == "single" else "a thread of 3 to 5 parts"
    field_ = '"text": "<the post>"' if request.fmt == "single" else '"parts": ["1/4 ...", "2/4 ...", "3/4 ...", "4/4 ..."]'
    return f"""{choose}
VERSES (the supplied English translation, exactly as written; words in parentheses were added by the translator):
{chr(10).join(blocks)}
{steer}
Write {request.variants} different posts, each {kind}. Use different patterns where the verses allow, and make the openings different.

Return JSON in exactly this shape:
{{"posts": [{{"pattern": "<pattern id>", "verses": ["<id>", "..."], {field_}, "quotes": [{{"verse": "<id>", "text": "<each exact quotation you used>"}}]}}]}}"""


def trimming_hint(errors: List) -> str:
    """For a post that is only too long, say by how much, so the fix is a cut and not a rewrite."""
    for issue in errors:
        if issue.code == "length":
            return " Cut the length first: drop the closing line or shorten a quotation (a short exact phrase is enough); do not add words."
    return ""


def repair_prompt(failed: List[Dict], verses: Dict[str, Verse]) -> str:
    needed = sorted({v for f in failed for v in f["verses"] if v in verses})
    verse_lines = "\n".join(f"[{i}] {verses[i].text}" for i in needed)
    items = []
    for f in failed:
        body = f["parts"] if f["parts"] else f["text"]
        items.append({"index": f["index"], "pattern": f["pattern"], "verses": f["verses"], "text_or_parts": body,
                      "problems": [str(i) for i in f["errors"]], "note": trimming_hint(f["errors"]).strip()})
    return f"""Each post below failed an automatic check against the verses. Fix ONLY what the problems name, keeping the pattern and voice. Where a number, word or quotation is unsupported, use what the verse actually says, or drop the claim.

VERSES:
{verse_lines}

POSTS TO FIX:
{json.dumps(items, ensure_ascii=False, indent=1)}

Return JSON: {{"posts": [{{"index": <same index>, "pattern": "...", "verses": ["..."], "text": "..." (or "parts": [...] for a thread), "quotes": [{{"verse": "<id>", "text": "<exact quotation>"}}]}}]}}"""


JUDGE_SYSTEM = """You are a strict fact-checker for short posts about a legal text. You are given the verses (the only source of truth) and posts that claim to describe them.

For each post decide, using ONLY the verses:
- faithful: every factual claim is stated by a cited verse. Not faithful if the post exaggerates, merges two verses into one claim, changes who is punished or what the penalty is, adds a detail, or says anything about practice, history or the present.
- tone_ok: the post criticises the text and its rules, and does not blame, insult or generalise about any community, religion or person.
- opinion_marked: any judgement or question at the end reads as the author's opinion and adds no new fact.
Also check the opening and closing lines, not only the middle: a hook or closer that implies something the verses do not say (that a group gains something the verse does not give it, that two different offences are one, that penalties add up) makes the post not faithful. Each verse's offence must be described as that verse describes it.
Check SCOPE sentence by sentence: for every sentence that is not a quotation, find the words in the verse that support it. If the post states a rule more broadly than the verse does (drops a qualifier such as who it applies to, a condition, or a word like "arrogantly", or says "it means" something the verse does not say), the post is not faithful.
Be sceptical: if in doubt, say so in problems.
Return only JSON: {"reviews": [{"index": 0, "faithful": true, "tone_ok": true, "opinion_marked": true, "problems": []}]}"""


def judge_prompt(posts: List[Dict], verses: Dict[str, Verse]) -> str:
    needed = sorted({v for p in posts for v in p["verses"] if v in verses})
    verse_lines = "\n".join(f"[{i}] {verses[i].text}" for i in needed)
    items = [{"index": p["index"], "post": p["parts"] if p["parts"] else p["text"], "cites": p["verses"]} for p in posts]
    return f"VERSES:\n{verse_lines}\n\nPOSTS:\n{json.dumps(items, ensure_ascii=False, indent=1)}"


# The text beside a post on the website is a critique, so judgement is its job; what it may not do is misstate the verses.
JUDGE_CARDS_SYSTEM = """You are a strict fact-checker for critical commentary on a legal text. You are given the verses (the only source of truth) and, for each card, a headline, a plain restatement ("says"), a critique ("critique") and sometimes a "fair_note".

For each card decide, using ONLY the verses:
- faithful: every statement of what the verses say or prescribe (in the headline, the restatement, the critique and the note) is supported by the cited verses. Not faithful if it exaggerates, merges two verses into one claim, changes who is covered or what the penalty is, drops a qualifier ("unintentionally", "virtuous", "arrogantly", "learned", "a man of a low caste"), or adds a detail. A claim that a verse "does not say" or "never asks" something must be true of the cited verses. A quotation must be a real part of a verse.
- critique_ok: the critique is an argument about the text and its rules. It may judge them unequal, disproportionate, arbitrary or unjust: that is its job and is opinion. It must NOT state a fact the verses lack, claim a motive or purpose for whoever wrote the text, say what was done in practice or in history or is done today, rely on any outside source, or compare the verses with anything not given to you. Reasoning from what the verses say to a judgement, or from a missing reason to a conclusion, is fine.
- tone_ok: it criticises the text and its rules, and does not blame, insult or generalise about any community, religion or person.
Check the headline too. Be sceptical: if in doubt, say so in problems.
Return only JSON: {"reviews": [{"index": 0, "faithful": true, "critique_ok": true, "tone_ok": true, "problems": []}]}"""


def judge_cards_prompt(cards: List[Dict], verses: Dict[str, Verse]) -> str:
    needed = sorted({v for c in cards for v in c["verses"] if v in verses})
    verse_lines = "\n".join(f"[{i}] {verses[i].text}" for i in needed)
    items = [{"index": c["index"], "cites": c["verses"], "headline": c["headline"], "says": c["says"],
              "critique": c["critique"], **({"fair_note": c["fair_note"]} if c.get("fair_note") else {})} for c in cards]
    return f"VERSES:\n{verse_lines}\n\nCARDS:\n{json.dumps(items, ensure_ascii=False, indent=1)}"


# ── data ───────────────────────────────────────────────────────────────────────

@dataclass
class Request:
    verses: List[str]
    fmt: str = "single"                  # "single" or "thread"
    variants: int = 3
    theme: Optional[str] = None
    focus: str = ""
    limit: int = xformat.X_LIMIT
    judge: bool = True
    max_repairs: int = 2


@dataclass
class Post:
    index: int
    pattern: str
    verses: List[str]
    text: str
    parts: List[str]
    quotes: List[Dict]
    issues: List[str] = field(default_factory=list)       # errors then warnings, as text
    errors: int = 0
    length: List[int] = field(default_factory=list)       # weighted length of each part
    judge: Dict = field(default_factory=dict)
    repairs: int = 0
    status: str = "rejected"                             # approved | needs_review | rejected

    def as_check_input(self) -> Dict:
        return {"index": self.index, "pattern": self.pattern, "verses": self.verses, "text": self.text, "parts": self.parts, "quotes": self.quotes}


@dataclass
class Run:
    request: Request
    playbook_version: str
    created: str
    posts: List[Post]
    notes: List[str] = field(default_factory=list)
    prompts: Dict[str, str] = field(default_factory=dict)


# ── the loop ───────────────────────────────────────────────────────────────────

def _as_post(raw: Dict, index: int, fmt: str) -> Optional[Post]:
    if not isinstance(raw, dict):
        return None
    parts = [str(p).strip() for p in raw.get("parts") or [] if str(p).strip()] if fmt == "thread" else []
    text = str(raw.get("text") or "").strip() if fmt == "single" else "\n\n".join(parts)
    if not (text or parts):
        return None
    verses = [str(v).strip() for v in raw.get("verses") or [] if str(v).strip()]
    quotes = [q for q in raw.get("quotes") or [] if isinstance(q, dict)]
    return Post(index=index, pattern=str(raw.get("pattern") or "?"), verses=verses, text=text, parts=parts, quotes=quotes)


def _check(post: Post, verses: Dict[str, Verse], approved: Sequence[str], limit: int) -> None:
    issues = verify.verify_post(post.as_check_input(), verses, approved_context=approved, limit=limit)
    ordered = verify.errors(issues) + [i for i in issues if i.level != "error"]
    post.issues = [str(i) for i in ordered]
    post.errors = len(verify.errors(issues))
    post.length = [xformat.weighted_length(p) for p in (post.parts or [post.text])]


def _dedupe(posts: List[Post]) -> List[Post]:
    seen, out = set(), []
    for p in posts:
        key = verify.norm(p.text)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def _items(reply, key: str) -> List:
    """The list a model reply holds under `key`. Models sometimes answer with the bare list (or with nothing
    usable), and that must not crash a run: a bare list counts as the list, anything else as an empty one."""
    if isinstance(reply, list):
        return reply
    if isinstance(reply, dict) and isinstance(reply.get(key), list):
        return reply[key]
    return []


def run(
    request: Request,
    complete: Complete = llm.complete_json,
    verses: Optional[Dict[str, Verse]] = None,
    approved_context: Sequence[str] = (),
    playbook: Optional[Dict] = None,
    playbook_version: str = "custom",
) -> Run:
    verses = verses or book.load_verses()
    if playbook is None:
        playbook, playbook_version = load_playbook()
    chosen = book.get_verses(request.verses, verses)
    neighbours = {v.id: [n for n in book.neighbours(v.id, 1, 1, verses) if n.id != v.id] for v in chosen} if len(chosen) <= 3 else {}
    system, user = system_prompt(playbook, request.fmt, request.limit), user_prompt(chosen, request, neighbours)
    result = Run(request=request, playbook_version=playbook_version, created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 posts=[], prompts={"system": system, "user": user})

    allowed_ids = set(request.verses)
    raw = complete(system, user, temperature=0.8)
    posts = _dedupe([p for i, r in enumerate(_items(raw, "posts")) if (p := _as_post(r, i, request.fmt))])
    if not posts:
        result.notes.append("the model returned no usable posts")
        return result
    for p in posts:
        outside = [v for v in p.verses if v not in allowed_ids]
        if outside:
            p.verses = [v for v in p.verses if v in allowed_ids]
            result.notes.append(f"post {p.index}: dropped verses that were not offered: {', '.join(outside)}")
        _check(p, verses, approved_context, request.limit)

    for round_number in range(1, request.max_repairs + 1):
        failing = [p for p in posts if p.errors]
        if not failing:
            break
        feed = [{**p.as_check_input(), "errors": [i for i in verify.verify_post(p.as_check_input(), verses, approved_context, request.limit) if i.level == "error"]} for p in failing]
        try:
            fixed = _items(complete(system, repair_prompt(feed, verses), temperature=0.4), "posts")
        except llm.LLMError as exc:
            result.notes.append(f"repair round {round_number} failed: {exc}")
            break
        by_index = {int(f.get("index", -1)): f for f in fixed if isinstance(f, dict) and str(f.get("index", "")).lstrip("-").isdigit()}
        for p in failing:
            replacement = by_index.get(p.index)
            new = _as_post(replacement, p.index, request.fmt) if replacement else None
            if new:
                new.verses = [v for v in new.verses if v in allowed_ids]
                new.repairs = p.repairs + 1
                _check(new, verses, approved_context, request.limit)
                posts[posts.index(p)] = new
            else:
                p.repairs += 1

    survivors = [p for p in posts if not p.errors]
    if request.judge and survivors:
        _fact_check(survivors, verses, complete, result.notes)
    for p in posts:
        _set_status(p)
    result.posts = posts
    return result


def _fact_check(posts: List[Post], verses: Dict[str, Verse], complete: Complete, notes: List[str]) -> None:
    """Ask the fact-check model to read each post against its verses; the answer is stored on the post."""
    reviews, used = [], None
    for model in dict.fromkeys([os.getenv("TRIAL_JUDGE_MODEL") or DEFAULT_JUDGE_MODEL, None]):   # then the writing model, so a retired model does not end the fact-check
        try:
            args = {"model": model} if model else {}
            reviews = _items(complete(JUDGE_SYSTEM, judge_prompt([p.as_check_input() for p in posts], verses), temperature=0.0,
                                      max_tokens=8000, thinking=int(os.getenv("TRIAL_JUDGE_THINKING", "2048")), **args), "reviews")
            used = model or "the writing model"
            break
        except llm.LLMError as exc:
            notes.append(f"fact-check model {model or 'default'} failed: {exc}")
    if not used:
        notes.append("fact-check unavailable: no model answered")
        return
    notes.append(f"fact-check ran on {used}")
    by_index = {int(r.get("index", -1)): r for r in reviews if isinstance(r, dict) and str(r.get("index", "")).lstrip("-").isdigit()}
    for p in posts:
        p.judge = {**(by_index.get(p.index) or {"problems": ["the fact-check returned nothing for this post"]}), "model": used}


def fact_check_cards(cards: List[Dict], verses: Dict[str, Verse], complete: Complete = llm.complete_json,
                     batch: int = 8) -> Tuple[Dict[int, Dict], List[str]]:
    """Ask the fact-check model to read each card's headline, restatement and critique against its verses.

    Returns {index: review} and notes. A card the model said nothing about gets a review that fails it, so silence is
    never taken for approval. Cards are sent in small batches: one long reply is where a model starts skipping."""
    reviews: Dict[int, Dict] = {}
    notes: List[str] = []
    for start in range(0, len(cards), batch):
        chunk = cards[start:start + batch]
        used = None
        got: List = []
        for model in dict.fromkeys([os.getenv("TRIAL_JUDGE_MODEL") or DEFAULT_JUDGE_MODEL, None]):
            try:
                args = {"model": model} if model else {}
                got = _items(complete(JUDGE_CARDS_SYSTEM, judge_cards_prompt(chunk, verses), temperature=0.0, max_tokens=8000,
                                      thinking=int(os.getenv("TRIAL_JUDGE_THINKING", "2048")), **args), "reviews")
                used = model or "the writing model"
                break
            except llm.LLMError as exc:
                notes.append(f"fact-check model {model or 'default'} failed: {exc}")
        by_index = {int(r.get("index", -1)): r for r in got if isinstance(r, dict) and str(r.get("index", "")).lstrip("-").isdigit()}
        for c in chunk:
            review = by_index.get(c["index"])
            reviews[c["index"]] = {**review, "model": used} if review else {"faithful": None, "problems": ["the fact-check returned nothing for this card"], "model": used}
    return reviews, notes


def _set_status(p: Post) -> None:
    """approved only when no check failed, no warning was raised and the fact-check agreed on every point."""
    warnings = [i for i in p.issues if i.startswith("warning:")]
    j = p.judge
    if p.errors:
        p.status = "rejected"
    elif j and j.get("faithful") is True and j.get("tone_ok") is True and j.get("opinion_marked", True) and not j.get("problems") and not warnings:
        p.status = "approved"
    else:
        p.status = "needs_review"


def check_text(
    parts: Sequence[str],
    verse_ids: Sequence[str] = (),
    complete: Complete = llm.complete_json,
    verses: Optional[Dict[str, Verse]] = None,
    approved_context: Sequence[str] = (),
    judge: bool = True,
    limit: int = xformat.X_LIMIT,
) -> Tuple[Post, List[str]]:
    """Put a post a person wrote or edited through the same checks as a generated one.

    One part is a single post, several are a thread. The verses are the ones named plus any the text cites.
    Returns the post (with its status) and the notes about the fact-check."""
    verses = verses or book.load_verses()
    parts = [p.strip() for p in parts if p.strip()]
    thread = len(parts) > 1
    text = "\n\n".join(parts)
    ids = list(dict.fromkeys([*verse_ids, *verify.find_refs(text)]))
    post = Post(index=0, pattern="edited", verses=ids, text=text, parts=parts if thread else [], quotes=[])
    notes: List[str] = []
    _check(post, verses, approved_context, limit)
    if judge and not post.errors:
        _fact_check([post], verses, complete, notes)
    _set_status(post)
    return post, notes


# ── output ─────────────────────────────────────────────────────────────────────

def render_review(result: Run, verses: Dict[str, Verse]) -> str:
    r = result.request
    lines = [f"# X posts for review ({result.created})", "",
             f"- verses offered: {', '.join(r.verses)}   - format: {r.fmt}   - playbook: {result.playbook_version}",
             f"- approved {sum(p.status == 'approved' for p in result.posts)}, needs review {sum(p.status == 'needs_review' for p in result.posts)}, "
             f"rejected {sum(p.status == 'rejected' for p in result.posts)}", ""]
    for note in result.notes:
        lines.append(f"> note: {note}")
    for p in result.posts:
        lines += ["", f"## Post {p.index + 1}: {p.status.upper()} · pattern `{p.pattern}` · {'/'.join(map(str, p.length))} of {r.limit}", ""]
        for part in (p.parts or [p.text]):
            lines += ["```", part, "```"]
        lines += ["", "Verses cited:"]
        for vid in p.verses:
            if vid in verses:
                lines.append(f"- **Manusmriti {vid}** (supplied PDF p. {verses[vid].page}): {verses[vid].text}")
        if p.issues:
            lines += ["", "Checks:"] + [f"- {i}" for i in p.issues]
        if p.judge:
            lines += ["", f"Fact-check: faithful={p.judge.get('faithful')} tone_ok={p.judge.get('tone_ok')} opinion_marked={p.judge.get('opinion_marked')}"]
            lines += [f"- {x}" for x in p.judge.get("problems") or []]
        if p.repairs:
            lines.append(f"\n(repaired {p.repairs} time(s))")
    return "\n".join(lines) + "\n"


def write_run(result: Run, verses: Dict[str, Verse], out_dir: Optional[Path] = None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base = (out_dir or config.OUTPUT_DIR / "runs") / f"{stamp}-{result.request.fmt}"
    folder, n = base, 1
    while folder.exists():          # two runs that finish in the same second (they can, in parallel) must not overwrite each other
        n += 1
        folder = base.with_name(f"{base.name}-{n}")
    folder.mkdir(parents=True)
    (folder / "run.json").write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "review.md").write_text(render_review(result, verses), encoding="utf-8")
    return folder


def load_env_file(path: Path) -> int:
    """Set variables from a .env file without overriding any already set; returns how many were set."""
    count = 0
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                if key.strip() and key.strip() not in os.environ:
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")
                    count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verses", nargs="+", help="verse ids or ranges, e.g. 8.268 8.270 or 8.267-8.272")
    parser.add_argument("--theme", choices=sorted(book.THEMES), help="propose verses on a theme instead")
    parser.add_argument("--top", type=int, default=6, help="how many candidate verses a theme offers")
    parser.add_argument("--format", dest="fmt", choices=["single", "thread"], default="single")
    parser.add_argument("--variants", type=int, default=3)
    parser.add_argument("--focus", default="", help="a note to steer the writing")
    parser.add_argument("--no-judge", action="store_true", help="skip the model fact-check")
    parser.add_argument("--provider", help="gemini, openai, or both in order (overrides TRIAL_LLM_PROVIDERS)")
    parser.add_argument("--env-file", type=Path, help="a .env with the model keys")
    parser.add_argument("--dry-run", action="store_true", help="print the prompts and stop")
    parser.add_argument("--check-file", type=Path, help="a post you wrote or edited (a thread: parts separated by a line of ---): "
                                                        "run it through the same checks instead of generating")
    args = parser.parse_args()

    if args.env_file:
        print(f"loaded {load_env_file(args.env_file)} settings from {args.env_file}")
    if args.provider:
        os.environ["TRIAL_LLM_PROVIDERS"] = args.provider
    verses = book.load_verses()
    approved = []
    approved_file = config.SOURCES_DIR / "approved_context.json"
    if approved_file.exists():
        approved = json.loads(approved_file.read_text(encoding="utf-8"))

    if args.check_file:
        parts = re.split(r"(?m)^\s*---\s*$", args.check_file.read_text(encoding="utf-8"))
        ids = [i for spec in args.verses or [] for i in book.parse_refs(spec)]
        post, notes = check_text(parts, ids, verses=verses, approved_context=approved, judge=not args.no_judge)
        print(f"[{post.status.upper()}] length={'/'.join(map(str, post.length))} verses={', '.join(post.verses) or 'none'}")
        for issue in post.issues:
            print("   ", issue)
        if post.judge:
            print(f"    fact-check: faithful={post.judge.get('faithful')} tone_ok={post.judge.get('tone_ok')} opinion_marked={post.judge.get('opinion_marked')}")
            for problem in post.judge.get("problems") or []:
                print("     -", problem)
        for note in notes:
            print("note:", note)
        return

    if args.verses:
        ids = [i for spec in args.verses for i in book.parse_refs(spec)]
        theme = None
    elif args.theme:
        ids, theme = [v.id for _, v in book.candidates(args.theme, args.top, verses)], args.theme
    else:
        parser.error("give --verses or --theme (or --check-file)")
    request = Request(verses=ids, fmt=args.fmt, variants=args.variants, theme=theme, focus=args.focus, judge=not args.no_judge)

    if args.dry_run:
        playbook, _ = load_playbook()
        chosen = book.get_verses(ids, verses)
        print(system_prompt(playbook, request.fmt, request.limit))
        print("\n" + "=" * 70 + "\n")
        print(user_prompt(chosen, request, {}))
        return
    result = run(request, verses=verses, approved_context=approved)
    folder = write_run(result, verses)
    for p in result.posts:
        print(f"\n[{p.status.upper()}] pattern={p.pattern} length={'/'.join(map(str, p.length))}")
        print("\n".join(p.parts or [p.text]))
        for issue in p.issues[:4]:
            print("   ", issue)
    for note in result.notes:
        print("note:", note)
    print(f"\nsaved: {folder}/review.md")


if __name__ == "__main__":
    main()
