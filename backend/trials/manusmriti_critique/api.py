"""The read-only API behind the website's Manusmriti section (trial).

    GET /api/v1/manusmriti/posts   ->   {topics, posts, verses, translation}

It serves published/posts.json as it is. There is nothing to ask and nothing to write: no question reaches a model
and no input is stored, so what a visitor can see is exactly what was checked and chosen.

backend/main.py mounts this router only when TRIAL_MANUSMRITI_CRITIQUE is on, so with the flag off the route does
not exist at all; the check inside the handler is a second lock for the case of the variable changing under a
running process. To remove the section, delete this folder and the mount in main.py (see README.md).
"""

import json
from typing import Dict

from fastapi import APIRouter, HTTPException, Response

from . import config

router = APIRouter(prefix="/manusmriti", tags=["manusmriti (trial)"])

EMPTY: Dict = {"version": 1, "generated": None, "translation": None, "topics": [], "posts": [], "verses": {}}
_cache: Dict = {"stamp": None, "data": EMPTY}


def with_hindi(data: Dict, hindi: Dict) -> Dict:
    """
    posts.json with the Hindi from posts_hi.json (tools/translate_hi.py) laid over it: a post gets "hi" (its
    headline, says, critique, fair_note and parts in Hindi) and a verse gets "text_hi". Only where the Hindi was
    made from the English as it is now: a post edited and republished since keeps its English alone until it is
    translated again, rather than showing a translation of what it used to say.
    """
    from .tools.translate_hi import fingerprint, post_source

    hi_posts, hi_verses = hindi.get("posts") or {}, hindi.get("verses") or {}
    posts = []
    for post in data.get("posts") or []:
        entry = hi_posts.get(post.get("id"))
        if entry and entry.get("source") == fingerprint(post_source(post)):
            post = {**post, "hi": {k: v for k, v in entry.items() if k != "source"}}
        posts.append(post)
    verses = {}
    for vid, verse in (data.get("verses") or {}).items():
        entry = hi_verses.get(vid)
        if entry and entry.get("source") == fingerprint(verse.get("text")):
            verse = {**verse, "text_hi": entry["text"]}
        verses[vid] = verse
    return {**data, "posts": posts, "verses": verses}


def load_published() -> Dict:
    """
    posts.json with its Hindi, read again only when either file changes. A missing posts.json is an empty
    section, not an error; a missing posts_hi.json is the section in English.
    """
    path, hi_path = config.PUBLISHED_DIR / "posts.json", config.PUBLISHED_DIR / "posts_hi.json"
    try:
        stamp = (path.stat().st_mtime_ns, hi_path.stat().st_mtime_ns if hi_path.exists() else None)
    except FileNotFoundError:
        return EMPTY
    if _cache["stamp"] != stamp:
        data = json.loads(path.read_text(encoding="utf-8"))
        if hi_path.exists():
            data = with_hindi(data, json.loads(hi_path.read_text(encoding="utf-8")))
        _cache.update(stamp=stamp, data=data)
    return _cache["data"]


@router.get("/posts")
def get_posts(response: Response) -> Dict:
    if not config.trial_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    response.headers["Cache-Control"] = "public, max-age=60"       # short: the content is under review and changes with a rebuild
    return load_published()
