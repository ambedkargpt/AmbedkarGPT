import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional

from openai import OpenAI

_log = logging.getLogger(__name__)

from backend.pipeline.video_summarizer import load_summary_cache, summary_cache_key

POST_GENERATION_SYSTEM_NAME = "post_generation_system.txt"
# A separate file, not a conditional string appended in Python: the same
# reason every other prompt in this codebase lives in prompts/*.txt rather
# than inline. It reads on its own, diffs on its own, and cannot leak into a
# Congress or general-news generation by a stray code path — only "bjp"
# selects it, in _load_post_prompts below.
POST_GENERATION_OPPOSITION_SYSTEM_NAME = "post_generation_opposition_system.txt"
# Used when a story from outside the writer's own party names that party. See
# _mentions_own_party for why the test is deliberately blunt.
POST_GENERATION_OWN_PARTY_SYSTEM_NAME = "post_generation_own_party_system.txt"
DEFAULT_SUMMARIES_PATH = Path(__file__).resolve().parents[1] / "data" / "video_summaries.json"
POST_GENERATION_USER_NAME = "post_generation_user.txt"


def _fill_template(template: str, replacements: Dict[str, str]) -> str:
    """Avoid str.format so braces inside profile/news text cannot break the prompt."""
    out = template
    for key, val in replacements.items():
        out = out.replace("{" + key + "}", val)
    return out


def _load_post_prompts(
    prompts_dir: Path, *, opposition: bool = False, own_party: bool = False
) -> tuple[str, str]:
    if opposition:
        system_name = POST_GENERATION_OPPOSITION_SYSTEM_NAME
    elif own_party:
        system_name = POST_GENERATION_OWN_PARTY_SYSTEM_NAME
    else:
        system_name = POST_GENERATION_SYSTEM_NAME
    system_path = prompts_dir / system_name
    user_path = prompts_dir / POST_GENERATION_USER_NAME
    if not system_path.is_file():
        raise FileNotFoundError(f"Missing post generation system prompt: {system_path}")
    if not user_path.is_file():
        raise FileNotFoundError(f"Missing post generation user prompt: {user_path}")
    return (
        system_path.read_text(encoding="utf-8").strip(),
        user_path.read_text(encoding="utf-8").strip(),
    )


# Party names as they appear in stories, keyed by the tenant slug the party
# publishes under. Hindi and English both, because a Ravish transcript names
# Congress in Devanagari and an English report does not.
_PARTY_ALIASES: Dict[str, tuple[str, ...]] = {
    "congress": ("congress", "कांग्रेस", "काँग्रेस", "यूपीए", "upa", "inc"),
    "samajwadi": ("samajwadi", "समाजवादी", "सपा", "अखिलेश", "akhilesh"),
    "bjp": ("bjp", "भाजपा", "बीजेपी", "भारतीय जनता"),
}


def _own_party_slug(profile: Dict[str, str]) -> str:
    """Tenant slug for the party the writer belongs to, or "" when unset."""
    raw = str(profile.get("political_party") or "").strip().lower()
    if not raw:
        return ""
    for slug, aliases in _PARTY_ALIASES.items():
        if any(a in raw for a in aliases):
            return slug
    return ""


def _mentions_own_party(news: Dict, transcript: Optional[str], slug: str) -> bool:
    """
    Does this story talk about the writer's own party?

    Deliberately blunt: any mention counts, favourable or not. Judging the
    sentiment would need another model call on every generation, and it would
    buy nothing, because a false positive here is harmless. The defensive prompt
    writes for the party either way, which is what the reader wants from a
    story about their own side whichever way it leans. A false negative is the
    only expensive mistake, so the test errs towards catching more.
    """
    if not slug:
        return False
    haystack = " ".join(
        str(news.get(k) or "") for k in ("title", "headline", "description", "summary", "content")
    )
    # The transcript is the largest and most specific source, and a charge often
    # appears only there, so it is searched too when one was supplied.
    if transcript:
        haystack += " " + transcript
    haystack = haystack.lower()
    return any(alias in haystack for alias in _PARTY_ALIASES.get(slug, ()))


def _norm_link(url: str) -> str:
    """
    Compare YouTube links by video id.

    The same video appears as youtu.be/ID, /watch?v=ID and /live/ID depending on
    which tab it was scraped from, so a string comparison would treat one video
    as several.
    """
    u = (url or "").strip()
    if not u:
        return ""
    m = re.search(r"(?:v=|youtu\.be/|/live/|/shorts/|/embed/)([A-Za-z0-9_-]{6,})", u)
    return m.group(1) if m else u.rstrip("/").lower()


def _is_own(chunk: Dict, news: Dict) -> bool:
    """Did this chunk come from the video the story was written from?"""
    story = _norm_link(str(news.get("source_url") or ""))
    if not story:
        return False
    return _norm_link(str(chunk.get("video_link") or "")) == story


def _chunk_json(chunk: Dict) -> Dict[str, str]:
    return {
        "chunk_id": chunk.get("chunk_id", ""),
        "video_title": chunk.get("video_title", ""),
        "video_link": chunk.get("video_link", ""),
        "text": chunk.get("chunk_text", ""),
    }


def _load_style_reference(prompts_dir: Path) -> str:
    """Shared with the news pipeline; a missing file is not fatal."""
    from backend.pipeline.transcript_cleaner import load_style_reference

    try:
        from backend.config import get_settings

        filename = getattr(get_settings(), "hindi_style_reference_file", "hindi_style_reference.txt")
    except Exception:
        filename = "hindi_style_reference.txt"
    return load_style_reference(prompts_dir, filename)


def _news_text(news: Dict) -> str:
    parts = [
        news.get("title", ""),
        news.get("description", ""),
        news.get("content", ""),
    ]
    return "\n".join(p for p in parts if p).strip()


def _chunks_str(retrieved_chunks: List[Dict]) -> str:
    return "\n\n".join(
        [
            f"Video Title: {c['video_title']}\nChunk ID: {c.get('chunk_id', '')}\nTranscript Chunk: {c['chunk_text']}"
            for c in retrieved_chunks
        ]
    )


def _video_summaries_str(
    full_video_contexts: List[Dict],
    summaries_path: Path,
) -> str:
    """
    Grounding aid without full transcripts: one paragraph summary per retrieved video
    from video_summaries.json (keyed by title||URL).
    """
    if not full_video_contexts:
        return "(None — use only retrieved chunks.)"
    entries = load_summary_cache(summaries_path)
    blocks: List[str] = []
    for vc in full_video_contexts:
        title = (vc.get("video_title") or "").strip()
        link = (vc.get("video_link") or "").strip()
        key = summary_cache_key(title, link)
        rec = entries.get(key)
        text = ""
        if isinstance(rec, dict):
            text = (rec.get("summary_text") or "").strip()
        if text:
            blocks.append(f"Video Title: {title}\nVideo URL: {link}\nSummary:\n{text}")
        else:
            blocks.append(
                f"Video Title: {title}\nVideo URL: {link}\n"
                f"Summary: (not in cache — use retrieved chunks from this video only.)"
            )
    return "\n\n".join(blocks)


_LANGUAGE_INSTRUCTIONS: dict[str, str] = {
    "hi": "LANGUAGE REQUIREMENT: Write the entire Social Media Post (and hashtags if included) in Hindi (Devanagari script). Do NOT write in English or Hinglish — pure Hindi only. Every hashtag is in Devanagari too, words joined with an underscore (#लोकतंत्र_बचाओ, #मतदाता_अधिकार); never an English hashtag such as #SaveDemocracy or #Congress. IMPORTANT: Keep the section labels (Headline:, Social Media Post:, Hashtags:) in English exactly as shown — do NOT translate them.\nPUNCTUATION: End every sentence in the post body with a danda (।), never a full stop. A full stop is correct only inside an abbreviation (डॉ., जे.पी.) or a decimal number. Headlines take no trailing danda. Keep कि/की and है/हैं agreement correct, and retain nuqta and chandrabindu where standard usage requires them.",
    "en": "LANGUAGE REQUIREMENT: Write the entire Social Media Post (headline, body, and hashtags) in English. The source material may be in Hindi — synthesise ideas from it but express everything in English. Do NOT write in Hindi, Devanagari script, or Hinglish.",
}


# Reasoning models count their chain-of-thought against max_tokens, so the cap
# has to cover the thinking as well as the answer. At 4096 the reasoning
# consumed nearly the whole budget and posts were cut off mid-word regardless of
# the requested length. Devanagari also costs more tokens per word than Latin,
# so a Hindi post needs noticeably more headroom than the word count suggests.
_MAX_COMPLETION_TOKENS = int(os.getenv("POST_MAX_COMPLETION_TOKENS", "24000"))
# Devanagari costs roughly a token per character or two, so an unbounded
# transcript would dominate the prompt.
#
# 12,000 did dominate it: measured on a real story the transcript was 9,024 of
# the 11,350 characters the model read, about eighty per cent, with the lens
# arriving as a couple of thousand characters of instruction. Posts came back
# reading like news, opening with a recap of the event, which is what a model
# does when the bulk of what it is handed is a speech to summarise.
#
# 4,000 is still several minutes of speech, enough to be accurate about what was
# said without the post becoming a retelling of it.
_MAX_TRANSCRIPT_CHARS = int(os.getenv("POST_TRANSCRIPT_CHARS", "4000"))

# Matches section headers in English OR Hindi (LLM sometimes translates labels when
# generating Hindi content).
#
# The label may share its line with the content. This used to require a newline
# straight after the colon, so "Hashtags: #a #b" or "Headline: text" did not
# split, the body came back empty, and the whole raw reply was saved as the post
# with its labels still in it. A prompt whose format example put label and text
# on one line made every post it wrote do this, and the model drifted into the
# same shape under the other prompts at least once. Accepting it here is what
# keeps either from reaching a reader.
_SECTION_RE = re.compile(
    r'^(Headline|शीर्षक|Social Media Post|सोशल मीडिया पोस्ट|Hashtags|हैशटेग)\s*:[ \t]*',
    re.IGNORECASE | re.MULTILINE,
)

# Normalise Hindi section keys → canonical English keys
_KEY_NORM: dict[str, str] = {
    'शीर्षक':              'headline',
    'सोशल मीडिया पोस्ट':  'social media post',
    'हैशटेग':              'hashtags',
}


# Appended to the system prompt only when a brief is present. The rules exist
# because of what the manual trial showed: research made posts polite, the model
# protected whoever it thought it was writing for, and it stamped today's date
# onto past events even when the brief carried the right one.
_RESEARCH_BRIEF_RULES = """RESEARCH BRIEF RULES (a verified brief was supplied in section 5):
- Use specific facts from the brief: names, dates, figures, or the form an official act actually took. Use as many as the chosen length carries, and at least one. Never overrun content_length to fit more facts in; pick the strongest and drop the rest.
- Where the brief contradicts the news article or the chunks, follow the brief and state the correction plainly in the post. Do not soften a correction because the speaker is on our side.
- Never present an allegation as fact. Name who alleged it and who denied it.
- If the brief marks the story's central claim unverified or misleading, say so in the post. Do not silently drop it.
- A claim repeated by several outlets is NOT verified if the brief says they were reprinting one press release or party statement. Treat it as a claim.
- Before writing any date, find the brief line that states that fact and use that date. Never attach today's date to a past event.
- Being accurate does not mean being flat. Correct the record and still hit hard."""


# Titles and honorifics that legitimately end in a full stop. A danda after any
# of these is wrong, so they are matched before the sentence rule applies.
_HINDI_ABBREVIATIONS = {
    "डॉ", "डा", "श्री", "श्रीमती", "सुश्री", "कु", "प्रो", "पं", "स्व", "मु", "सं",
}

_DEVANAGARI = r"ऀ-ॿ"


def _danda_normalise(text: str) -> str:
    """
    Convert sentence-ending full stops to the danda (।) in Hindi output.

    The news pipeline enforces this through its style reference, and posts drift
    to the Latin full stop because they never had one. As with the em dash, the
    prompt asks and the model mostly complies; this makes the last few
    deterministic.

    Deliberately conservative. A full stop is left alone when it belongs to an
    initialism (जे.पी.), an honorific (डॉ.), a decimal (4.68), or anything
    written in Latin script, because a wrongly placed danda reads worse than a
    stray full stop.
    """
    if not text:
        return text

    out = list(text)
    n = len(out)
    for i, ch in enumerate(out):
        if ch != ".":
            continue
        prev_ch = out[i - 1] if i else ""
        next_ch = out[i + 1] if i + 1 < n else ""

        # Decimals and numbered lists.
        if prev_ch.isdigit() or next_ch.isdigit():
            continue
        # The stop must close Devanagari text; Latin sentences keep their stop.
        if not re.match(rf"[{_DEVANAGARI}]", prev_ch or ""):
            continue
        # Sentence stops are followed by a break. "जे.पी" is not one.
        if next_ch and not next_ch.isspace():
            continue

        # The word this stop closes, and whether the one before it also ended in
        # a stop — that pattern means an initialism such as एस.सी.
        head = "".join(out[:i])
        token = re.search(rf"([{_DEVANAGARI}]+)$", head)
        word = token.group(1) if token else ""
        if word in _HINDI_ABBREVIATIONS:
            continue
        before_word = head[: len(head) - len(word)]
        if before_word.endswith(".") and len(word) <= 3:
            continue

        out[i] = "।"

    # Collapse a run of sentence terminators into one danda. The model sometimes
    # writes both marks, "सच।." belt and braces, and converting the full stop
    # then leaves "सच।।". Only runs containing a danda are touched, so an
    # ellipsis stays an ellipsis, "4.68" stays a decimal, and "जे.पी." stays an
    # initialism, since none of those put two terminators side by side.
    text = "".join(out)
    return re.sub(
        r"[।.](?:[ \t ]*[।.])+",
        lambda m: "।" if "।" in m.group(0) else m.group(0),
        text,
    )


# Chat models occasionally emit their own control tokens as ordinary text
# instead of stopping on them, and the token then travels all the way to a
# karyakarta's screen: a post ended "हमें इंसाफ चाहिए।</s>". Which token appears
# depends on the family behind the endpoint, and the DeepSeek endpoint has
# served more than one, so this covers the common ones rather than just the one
# that was seen. The DeepSeek marker uses fullwidth pipes and U+2581, not ASCII.
_SPECIAL_TOKEN_RE = re.compile(
    r"</?s>"                                  # Llama / Mistral
    r"|<\|(?:endoftext|im_start|im_end|eot_id|start_header_id|end_header_id"
    r"|assistant|user|system)\|>"             # GPT / Qwen / Llama 3
    r"|<｜[^｜]{0,40}｜>"                      # DeepSeek, e.g. <｜end▁of▁sentence｜>
    r"|\[/?INST\]"                            # Mistral instruction markers
)


def _strip_special_tokens(text: str) -> str:
    """
    Drop model control tokens that leaked into the visible answer.

    Runs before section parsing, not after: a stray token sitting against a
    label ("Hashtags:</s>") would otherwise be parsed as part of the value and
    survive into the post anyway.
    """
    if not text or not _SPECIAL_TOKEN_RE.search(text):
        return text
    out = _SPECIAL_TOKEN_RE.sub("", text)
    # Only tidy what removal itself created. Running these unconditionally
    # would rewrite spacing in posts that had no token to begin with, which is
    # not this function's business.
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"[ \t]+([।.!?,])", r"\1", out)
    return out.strip()


def _strip_ai_tells(text: str) -> str:
    """
    Remove the em dash habit from generated posts.

    The prompt forbids it, but instructions on punctuation are followed
    inconsistently, and a single stray dash is enough to make a post read as
    machine-written. Substituting deterministically is more reliable than
    asking again: an em dash used parenthetically reads correctly as a comma,
    and one used as a sentence break reads correctly as a full stop.
    """
    if not text:
        return text
    # " word — word "  ->  " word, word "
    out = re.sub(r"\s*[—–]\s*", ", ", text)
    # Tidy the artefacts that substitution can create.
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r"\s+,", ",", out)
    out = re.sub(r",(\s*)([.!?।])", r"\2", out)
    # A comma directly before a closing quote or bracket reads wrong. Match only
    # when the comma abuts the quote: with whitespace between them the quote is
    # opening, not closing, and stripping there welds the words together
    # (`कह दीजिए — "देश` became `कह दीजिए"देश`).
    out = re.sub(r",([\"'’”)\]])", r"\1", out)
    return out


def _extract_post_body(raw: str) -> str:
    """
    Parse the structured LLM response into:
      [Headline]\\n\\n[Post body]\\n\\n[Hashtags]

    Handles both English and Hindi section labels.
    Falls back to returning the raw text if parsing fails.
    """
    sections: dict[str, str] = {}
    parts = _SECTION_RE.split(raw)
    # split() with a capturing group returns: [pre, key1, val1, key2, val2, ...]
    i = 1
    while i + 1 < len(parts):
        raw_key = parts[i].strip()
        key = _KEY_NORM.get(raw_key, raw_key.lower())
        val = parts[i + 1].strip()
        sections[key] = val
        i += 2

    headline   = sections.get("headline", "")
    body       = sections.get("social media post", "")
    hashtags   = sections.get("hashtags", "")

    # Remove placeholder values
    hashtags = "" if hashtags.upper() in ("N/A", "NA", "") else hashtags

    if not body:
        # No body section, so the reply cannot be reassembled. It is still not
        # returned verbatim: labels are stripped from the start of every line
        # first. A reply can carry some labels without the body one - a June
        # post labelled only its hashtags - and returning it untouched saved
        # "Hashtags:" into the post. A reply with no labels at all is unchanged.
        return _SECTION_RE.sub("", raw).strip()

    pieces = [p for p in [headline, body, hashtags] if p]
    return "\n\n".join(pieces)


# What each destination will actually accept, in characters.
#
# These are not preferences. content_length is a matter of taste and the prompt
# rightly treats it as the writer's own call; this is a property of the place
# the post is going, and a post over it cannot be published at all. A 1626
# character "tweet" is not a long tweet, it is not a tweet.
#
# Kept here rather than taken from the request: the client sends which platform
# was chosen, and the limit for that platform is a fact the server should know
# rather than accept.
_PLATFORM_CHAR_LIMITS = {
    "twitter": 280,
    "twitter / x": 280,
    "x": 280,
    "instagram": 2200,
    "reddit": 40000,
    "whatsapp": 65536,
    "facebook": 63206,
    "linkedin": 3000,
}


def _platform_char_limit(profile: Dict[str, str]) -> Optional[int]:
    """The destination's hard ceiling, or None when it has no useful one."""
    label = str(profile.get("target_platform") or "").strip().lower()
    if not label:
        return None
    limit = _PLATFORM_CHAR_LIMITS.get(label)
    if limit is None:
        # An unrecognised label is not an error - a platform can reach the
        # picker before it reaches this table - but it must not silently become
        # "no limit" for a platform that has one, so it is logged.
        _log.info("post generation: no character limit known for platform %r", label)
        return None
    # Reddit's forty thousand constrains nothing a writer would produce, and
    # stating it only invites the model to fill the space.
    return limit if limit <= 5000 else None


# How long a post for each platform should be. This replaces the content
# length preference: the platform the user picks decides the length, as on
# rssgpt. Each option names a word ceiling so post validation can check it.
_PLATFORM_LENGTHS = {
    "twitter": "One tweet: at most 280 characters in total, hashtags and line breaks included (max 45 words). One sharp point with one fact, at most two hashtags.",
    "reddit": "A Reddit post: a headline line, then two to four short paragraphs that make the case plainly with the facts (150-250 words).",
    "whatsapp": "A WhatsApp forward: four to six short sentences that read well on a phone (80-120 words).",
    "facebook": "A Facebook post: a strong first line, then two or three short paragraphs that make the case with the facts (100-180 words), and two or three hashtags at the end.",
}
_PLATFORM_ALIASES = {"twitter / x": "twitter", "x": "twitter"}


def platform_content_length(platform: Optional[str]) -> Optional[str]:
    """The content_length for a platform, or None for one with no set length."""
    key = str(platform or "").strip().lower()
    return _PLATFORM_LENGTHS.get(_PLATFORM_ALIASES.get(key, key))


_SENTENCE_END = re.compile(r"[।.!?](?=\s|$)")


def _trim_to_limit(text: str, limit: int) -> str:
    """
    Cut a post to `limit` characters without leaving half a sentence.

    Hashtags go first, last tag first, since the post still reads without
    them. Then the body is cut at the last sentence end that fits. Only a post
    with no sentence end at all is cut at a word.
    """
    text = text.strip()
    if len(text) <= limit:
        return text
    lines = text.split("\n")
    while lines and len("\n".join(lines).strip()) > limit:
        words = lines[-1].split()
        if words and all(w.startswith("#") for w in words):
            lines[-1] = " ".join(words[:-1])
            if not lines[-1]:
                lines.pop()
            continue
        break
    text = "\n".join(lines).strip()
    if len(text) <= limit:
        return text
    head = text[:limit]
    ends = list(_SENTENCE_END.finditer(head))
    if ends and ends[-1].end() > limit // 3:
        return head[: ends[-1].end()].strip()
    cut = head.rsplit(" ", 1)[0].rstrip(" ,;:-")
    return cut + "…" if len(cut) < limit else cut[: limit - 1] + "…"


def _is_reddit(platform: Optional[str]) -> bool:
    return str(platform or "").strip().lower() == "reddit"


# A hashtag in Latin script only: #SaveDemocracy, #Congress, #2026.
_LATIN_HASHTAG = re.compile(r"(?<!\S)#[A-Za-z0-9_]+(?=\s|$)")


def _is_hashtag_line(line: str) -> bool:
    words = line.split()
    return bool(words) and all(w.startswith("#") for w in words)


def tidy_hashtags(text: str, platform: Optional[str], language: Optional[str]) -> str:
    """
    The post's hashtags as its platform and language want them.

    Reddit takes none: hashtag lines go and inline tags lose their #. A Hindi
    post keeps only Devanagari tags. The prompt asks for both, and the model
    still mixed in #SaveDemocracy and #VoterRights.
    """
    if not text:
        return text
    if _is_reddit(platform):
        lines = [ln for ln in text.split("\n") if not _is_hashtag_line(ln)]
        # [^\s#]+, not \w+: \w stops at Devanagari vowel signs and the virama.
        text = re.sub(r"(?<!\S)#([^\s#]+)", lambda m: m.group(1).replace("_", " "), "\n".join(lines))
    elif str(language or "").lower().startswith("hi"):
        lines = []
        for ln in text.split("\n"):
            if _is_hashtag_line(ln):
                ln = re.sub(r"[ \t]{2,}", " ", _LATIN_HASHTAG.sub("", ln)).strip()
                if not ln:
                    continue
            lines.append(ln)
        text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def fit_to_platform(text: str, platform: Optional[str], shorten=None) -> str:
    """
    Make a post fit what its platform accepts, so "Post to X" opens a tweet
    that can be sent as it is.

    The prompt asks for the limit, but a model does not count characters
    reliably. `shorten(text, limit)` gets one try at a proper rewrite; whatever
    it returns that is still over, and any failure, falls back to trimming.
    """
    limit = _platform_char_limit({"target_platform": platform})
    if not limit or not text or len(text.strip()) <= limit:
        return text
    if shorten is not None:
        try:
            shorter = (shorten(text, limit) or "").strip()
        except Exception as exc:  # noqa: BLE001
            _log.warning("post shortening failed, trimming instead: %s", exc)
            shorter = ""
        if shorter and len(shorter) <= limit:
            return shorter
        if shorter:
            text = shorter
    return _trim_to_limit(text, limit)


def generate_post(
    client: OpenAI,
    model: str,
    news: Dict,
    profile: Dict[str, str],
    retrieved_chunks: List[Dict],
    full_video_contexts: List[Dict],
    temperature: float = 0.7,
    prompts_dir: Optional[Path] = None,
    summaries_cache_path: Optional[Path] = None,
    language: Optional[str] = None,
    refinement_note: Optional[str] = None,
    research_payload: Optional[Dict] = None,
    transcript: Optional[str] = None,
    on_prompt=None,
) -> str:
    """
    Generate a social media post for a news item, profile, and retrieved chunks.

    Prompts load from prompts_dir (defaults to Settings.prompts_dir):
    post_generation_system.txt, post_generation_user.txt
    """
    if prompts_dir is None:
        from backend.config import get_settings

        prompts_dir = get_settings().prompts_dir

    cache_path = summaries_cache_path or DEFAULT_SUMMARIES_PATH

    # tenant_slug travels on the news dict from _news_doc_to_article, so this
    # needs no new parameter: the source video's own tenant already says
    # whether it is the opposition's, regardless of which party the writer
    # is speaking for. Selects the whole prompt file, not an appended
    # fragment, so a Congress or general-news generation can never pick up
    # opposition-mode instructions by a stray code path.
    news_slug = str(news.get("tenant_slug") or "").strip().lower()
    is_opposition_source = news_slug == "bjp"

    # A story from someone else's channel that names the writer's own party is
    # the case the general prompt kept losing: it read the story, found a
    # failure, and wrote against the reader's own side. The party's own feed is
    # not this case, because a party does not upload attacks on itself, and the
    # opposition file already governs the opposition's feed. So this is scoped
    # to what is left, which in practice is General news.
    own_slug = _own_party_slug(profile)
    is_own_party_story = (
        not is_opposition_source
        and bool(own_slug)
        and news_slug != own_slug
        and _mentions_own_party(news, transcript, own_slug)
    )
    if is_own_party_story:
        _log.info("post generation: own-party prompt (news tenant=%s, writer=%s)", news_slug or "?", own_slug)

    system_msg, user_tpl = _load_post_prompts(
        prompts_dir, opposition=is_opposition_source, own_party=is_own_party_story
    )

    lang_instruction = _LANGUAGE_INSTRUCTIONS.get(language or "en", "")

    # Prepend the language override BEFORE the rest of the system prompt so it
    # takes precedence over any `language` field inside the USER PROFILE.
    # (Appending it at the end loses to the "USER PROFILE is highest authority"
    # instruction already in the prompt.)
    if lang_instruction:
        system_msg = f"CRITICAL LANGUAGE OVERRIDE — This instruction supersedes any language field in the USER PROFILE:\n{lang_instruction}\n\n---\n\n{system_msg}"

    # The prompt tells the model content_length "wins over every other instinct
    # about how long a post should be", and it obeys: a writer whose length was
    # set to Extended got a 1626 character post for a 280 character
    # destination. The platform was only ever described to it as deciding
    # "format conventions", with no number attached.
    #
    # Prepended and worded as superseding for the same reason the language
    # override is: appended, it loses to the "USER PROFILE is highest authority"
    # rule already in the file.
    char_limit = _platform_char_limit(profile)
    if char_limit:
        system_msg = (
            "CRITICAL LENGTH LIMIT - This supersedes content_length and every other "
            "length instruction, including the CONTENT LENGTH section below.\n"
            f"The finished post goes to {profile.get('target_platform')}, which accepts at "
            f"most {char_limit} characters in total: body, line breaks and hashtags "
            "together.\n"
            f"Stay under {char_limit} characters. Where content_length asks for more than "
            "fits, the limit wins and you write a shorter post - fewer points made "
            "properly, not the same points cut off. Never end mid-sentence.\n\n---\n\n"
            + system_msg
        )

    # Reddit is a discussion thread, not a feed: hashtags there read as spam.
    # tidy_hashtags removes any the model writes anyway.
    if _is_reddit(profile.get("target_platform")):
        system_msg = (
            "PLATFORM FORMAT - Reddit: the headline line, then two to four short paragraphs "
            "that make the case plainly, with the facts. No hashtags anywhere in a Reddit "
            "post: leave the Hashtags section as N/A.\n\n---\n\n"
            + system_msg
        )

    # The news pipeline injects the full worked style reference here. Post
    # generation deliberately does not: it is 7.7KB of examples, and every extra
    # constraint in this prompt costs reasoning tokens, which is what emptied the
    # completion budget and returned a blank post. The concise punctuation rules
    # in _LANGUAGE_INSTRUCTIONS cover intent, and _danda_normalise() enforces the
    # danda deterministically afterwards, so the examples earn nothing here.
    # Set POST_STYLE_REFERENCE=1 to include them anyway.
    if (language or "").lower().startswith("hi") and os.getenv("POST_STYLE_REFERENCE", "").strip() in {"1", "true", "yes", "on"}:
        style_ref = _load_style_reference(prompts_dir)
        if style_ref:
            system_msg = (
                f"{system_msg}\n\n---\n\n"
                f"=== HINDI STYLE REFERENCE (ground truth, follow this punctuation and grammar) ===\n"
                f"{style_ref}\n=== END STYLE REFERENCE ==="
            )

    if refinement_note and refinement_note.strip():
        system_msg = f"{system_msg}\n\n---\n\nREFINEMENT INSTRUCTION: The user wants the following change in this post: {refinement_note.strip()}"

    # Also force the profile's language field to match so the LLM isn't confused
    # by a conflicting value (e.g. profile says "English" while language='hi').
    if language:
        lang_label_map = {"hi": "Hindi", "en": "English"}
        profile = {**profile, "language": lang_label_map.get(language, language)}

    profile_desc = "\n".join(f"{k}: {v}" for k, v in profile.items())

    if research_payload:
        system_msg = f"{system_msg}\n\n---\n\n{_RESEARCH_BRIEF_RULES}"

    semrag_grounding = [
        {
            "chunk_id": c.get("chunk_id", ""),
            "volume": c.get("volume", 1),
            "source": c.get("video_title", "Dr. B.R. Ambedkar: Writings and Speeches"),
            "matched_entity": c.get("matched_entity", ""),
            "quote_text": c.get("chunk_text") or c.get("text", ""),
        }
        for c in retrieved_chunks if c.get("is_semrag")
    ]
    if semrag_grounding:
        system_msg = (
            f"{system_msg}\n\n---\n\n"
            "AMBEDKAR SEMRAG GROUNDING (VERIFIED HISTORICAL AND PHILOSOPHICAL WORKS):\n"
            "Authentic passages from Dr. B. R. Ambedkar's Writings and Speeches (Volumes 1 & 2) "
            "have been retrieved from the Ambedkar SemRAG Knowledge Graph and provided in `ambedkar_semrag_grounding`. "
            "Use these verbatim principles, constitutional morality, and authentic quotes to ground your Ambedkarite critique of this news event."
        )

    # One JSON object carrying research, transcript, video link, preferences and
    # chunks, which is the shape the workflow calls for. Built with json.dumps
    # rather than string assembly so a quote or brace inside a transcript cannot
    # break the structure.
    payload = {
        "user_profile": profile,
        "news": {
            "title": news.get("title", ""),
            "description": news.get("description", ""),
            "content": news.get("content", ""),
        },
        # What the speaker actually said, which the workflow puts in front of
        # the writer alongside the research. Chunks are excerpts chosen by a
        # retriever and can be empty for a video that was never indexed, so
        # without this the writer could be asked to cover a video while holding
        # nothing the speaker said.
        "transcript": (transcript or "")[:_MAX_TRANSCRIPT_CHARS],
        "video": {
            "source_url": news.get("source_url", "") or "",
            "title": news.get("video_title", "") or "",
        },
        # Chunks are split by which video they came from, because they play two
        # different roles. Retrieval pulls the best passages regardless of
        # source, so a story about one video can retrieve another video's
        # transcript and the writer cannot tell them apart. That is how a post
        # about the Lucknow-Agra claim ended up citing Kanpur-Lucknow figures
        # from a different briefing. Only this story's own video may supply
        # facts; the rest are the ideological lens and nothing more.
        "source_video_chunks": [_chunk_json(c) for c in retrieved_chunks if _is_own(c, news)],
        "ideology_chunks": [_chunk_json(c) for c in retrieved_chunks if not _is_own(c, news)],
        "ambedkar_semrag_grounding": semrag_grounding,
        "video_summaries": _video_summaries_str(full_video_contexts, cache_path),
        "research": research_payload,
    }

    user_content = _fill_template(
        user_tpl,
        {"payload_json": json.dumps(payload, ensure_ascii=False, indent=2)},
    ).strip()

    if on_prompt:
        on_prompt(system_msg, user_content)
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_content},
        ],
        temperature=temperature,
        max_tokens=_MAX_COMPLETION_TOKENS,
    )

    choice = response.choices[0]
    usage = getattr(response, "usage", None)
    reasoning = getattr(getattr(usage, "completion_tokens_details", None), "reasoning_tokens", None)
    text = _strip_special_tokens((choice.message.content or "").strip())

    # Logged every time, not just on failure: an empty body from a reasoning
    # model looks identical to a refusal, and the only way to tell them apart is
    # whether the token budget went to thinking. This has now caused two
    # silent outages.
    _log.info(
        "post generation finish_reason=%s prompt_tokens=%s completion_tokens=%s "
        "reasoning_tokens=%s visible_chars=%d",
        choice.finish_reason,
        getattr(usage, "prompt_tokens", "?"),
        getattr(usage, "completion_tokens", "?"),
        reasoning if reasoning is not None else "n/a",
        len(text),
    )
    if not text:
        if choice.finish_reason == "length":
            _log.error(
                "Post generation produced no visible text: the %s token budget was "
                "consumed by reasoning. Raise POST_MAX_COMPLETION_TOKENS (currently %s) "
                "or shorten the prompt.",
                getattr(usage, "completion_tokens", "?"),
                _MAX_COMPLETION_TOKENS,
            )
        return ""
    body = _strip_ai_tells(_extract_post_body(text))
    if (language or "").lower().startswith("hi"):
        body = _danda_normalise(body)
    return body
