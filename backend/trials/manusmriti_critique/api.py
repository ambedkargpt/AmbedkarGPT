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


def load_published() -> Dict:
    """posts.json, read again only when the file changes. A missing file is an empty section, not an error."""
    path = config.PUBLISHED_DIR / "posts.json"
    try:
        stamp = path.stat().st_mtime_ns
    except FileNotFoundError:
        return EMPTY
    if _cache["stamp"] != stamp:
        _cache.update(stamp=stamp, data=json.loads(path.read_text(encoding="utf-8")))
    return _cache["data"]


@router.get("/posts")
def get_posts(response: Response) -> Dict:
    if not config.trial_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    response.headers["Cache-Control"] = "public, max-age=300"
    return load_published()
