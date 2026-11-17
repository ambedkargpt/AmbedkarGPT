"""
The INC topic flow, step 2 ("Prompt 2"): one post from one narrative frame.

Input is only what step 1 stored on the news card (pipeline/inc_topics.py):
the topic's original transcript lines (JSON_3) and one narrative frame from
JSON_4. No user profile, no preferences, no web search, no corpus passages.

Generate post on a card takes the frames in order: the first post uses
frame 1, the next frame 2, and after the last frame it starts again at 1.

The answer (JSON_5) is a couplet, a post of at most 40 words, one hashtag
about the event, and a few more hashtags the writer may add.
The post goes out with three hashtags: the event's, then the party's two
standing ones (DEFAULT_HASHTAGS). The model's extra hashtags and the party's
other common ones are offered as suggestions in the hashtag editor. The saved
post text is couplet, post and hashtags, separated by blank lines, so copy,
share and the post preview handle it like any other post; the hashtags are
also kept in the post's ``hashtags`` field, which the editor changes.

Prompt text: prompts/inc_topic_post_system.txt, sir's Prompt 2.2 with the web
search taken out, for a card from the writer's own party ("support"). A card
from the BJP's channel ("oppose") uses prompts/opposition_topic_post_system.txt,
the same prompt turned to oppose and criticize the BJP, written for the writer's
own party (Congress or Samajwadi), whose hashtags it then carries.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SYSTEM_PROMPTS = {"support": "inc_topic_post_system.txt", "oppose": "opposition_topic_post_system.txt"}
SYSTEM_PROMPT_NAME = SYSTEM_PROMPTS["support"]
# The writer's party: its name in the opposition prompt, the two hashtags every
# post carries after the event's (three in all), and the ones the editor offers.
PARTIES = {
    "congress": {"name": "Indian National Congress (INC)",
                 "defaults": ["#कांग्रेस", "#राहुल_गांधी"],
                 "suggest": ["#INC", "#मल्लिकार्जुन_खड़गे", "#संविधान_बचाओ", "#लोकतंत्र_बचाओ", "#भारत_जोड़ो"]},
    "samajwadi": {"name": "Samajwadi Party (SP)",
                  "defaults": ["#समाजवादी_पार्टी", "#अखिलेश_यादव"],
                  "suggest": ["#SP", "#PDA", "#संविधान_बचाओ", "#लोकतंत्र_बचाओ"]},
}
DEFAULT_PARTY = "congress"
DEFAULT_HASHTAGS = PARTIES[DEFAULT_PARTY]["defaults"]
PARTY_SUGGESTIONS = PARTIES[DEFAULT_PARTY]["suggest"]
_MAX_SUGGESTIONS = 10
PROMPT_VERSION = "inc_topics_v1|inc_topic_post_system.txt"


def party_of(slug: str | None) -> dict:
    return PARTIES.get(slug or "", PARTIES[DEFAULT_PARTY])


def frame_for(frames: list[str], written_before: int) -> tuple[int, str]:
    """The frame for the next post: in order, looping back to the first."""
    index = written_before % len(frames)
    return index, frames[index]


def user_message(lines: list[str], frame: str) -> str:
    payload = {"JSON_3": lines, "JSON_4": frame}
    return "INPUTS - (JSON_3) + (JSON_4):\n" + json.dumps(payload, ensure_ascii=False, indent=1)


def clean_hashtag(raw: str) -> str:
    """One hashtag: a leading #, words joined by underscores, no punctuation."""
    text = str(raw or "").strip().lstrip("#").strip()
    text = re.sub(r"[।.,!?;:\"'“”‘’()\[\]{}]", "", text)
    text = re.sub(r"[\s\-–—]+", "_", text).strip("_")
    return f"#{text}" if text else ""


def parse_answer(raw: str) -> dict[str, Any] | None:
    from backend.pipeline.multi_news_generator import _strip_json_response

    try:
        data = json.loads(_strip_json_response(raw))
    except (TypeError, ValueError):
        return None
    if isinstance(data, dict) and isinstance(data.get("JSON_5"), dict):
        data = data["JSON_5"]
    if not isinstance(data, dict):
        return None
    from backend.pipeline.generator import _strip_ai_tells

    # The em dash habit, removed as it is from every other post.
    couplet = _strip_ai_tells(str(data.get("couplet") or "").strip())
    post = _strip_ai_tells(str(data.get("post") or "").strip())
    hashtag = clean_hashtag(data.get("hashtag") or "")
    more = data.get("more_hashtags") if isinstance(data.get("more_hashtags"), list) else []
    if not couplet or not post:
        return None
    return {"couplet": couplet, "post": post, "hashtag": hashtag,
            "more_hashtags": [t for t in (clean_hashtag(x) for x in more) if t],
            "card": parse_card(data.get("card"), post)}


def parse_card(raw: Any, post: str) -> dict[str, Any]:
    """
    The image card's extra words (frontend utils/postImage.js): a kicker, a
    supporting line, up to two "A -> B" chips and the phrase to colour. Each is
    optional; anything malformed is dropped rather than failing the post. The
    highlight is kept only if it really is in the post.
    """
    from backend.pipeline.generator import _strip_ai_tells

    card = raw if isinstance(raw, dict) else {}
    chips = []
    for pair in card.get("chips") if isinstance(card.get("chips"), list) else []:
        if isinstance(pair, (list, tuple)) and len(pair) == 2 and all(str(x).strip() for x in pair):
            chips.append([str(pair[0]).strip()[:24], str(pair[1]).strip()[:24]])
    highlight = str(card.get("highlight") or "").strip()
    return {
        "kicker": _strip_ai_tells(str(card.get("kicker") or "").strip())[:28],
        "sub": _strip_ai_tells(str(card.get("sub") or "").strip())[:60],
        "chips": chips[:2],
        "highlight": highlight if highlight and highlight in post else "",
    }


def starting_hashtags(parts: dict[str, Any], party: str | None = None) -> list[str]:
    """The post's hashtags as it is first shown: the event's, then the writer's party's two."""
    return _unique([parts.get("hashtag") or "", *party_of(party)["defaults"]])


def suggested_hashtags(parts: dict[str, Any], party: str | None = None) -> list[str]:
    """
    What the editor can offer: the model's ideas for the topic, then the party's standing and common ones. The
    editor shows those not already on the post, so a default someone removed is offered back.
    """
    p = party_of(party)
    return _unique([*(parts.get("more_hashtags") or []), *p["defaults"], *p["suggest"]])[:_MAX_SUGGESTIONS]


def _unique(tags: list[str]) -> list[str]:
    out: list[str] = []
    for tag in tags:
        if tag and tag.lower() not in {t.lower() for t in out}:
            out.append(tag)
    return out


def compose(parts: dict[str, Any], hashtags: list[str] | None = None) -> str:
    """The post as shown and shared: couplet, post, hashtags."""
    tags = hashtags if hashtags is not None else ([parts["hashtag"]] if parts.get("hashtag") else [])
    blocks = [parts["couplet"], parts["post"]]
    if tags:
        blocks.append(" ".join(tags))
    return "\n\n".join(blocks)


def system_prompt(prompts_dir: Path, stance: str = "support", party: str | None = None) -> str:
    """Prompt 2 for the card's stance, with the writer's party named where the prompt asks for it."""
    text = (prompts_dir / SYSTEM_PROMPTS.get(stance, SYSTEM_PROMPT_NAME)).read_text(encoding="utf-8").strip()
    return text.replace("{party_name}", party_of(party)["name"])


def write_post(*, client, model: str, prompts_dir: Path, lines: list[str], frame: str,
               stance: str = "support", party: str | None = None) -> dict[str, Any] | None:
    system_msg = system_prompt(prompts_dir, stance, party)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system_msg}, {"role": "user", "content": user_message(lines, frame)}],
        temperature=0.8,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )
    return parse_answer(resp.choices[0].message.content or "")
