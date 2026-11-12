"""
What happens on the site, for the twice-daily report: visits, sign-ups,
logins and guest logins, each with the address it came from.

One document per event in `activity`, kept 90 days (a TTL index, see
db/indexes.py) and then deleted by Mongo itself. The privacy policy says so.

Recording never raises: a failure here must not cost anyone their login.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

ACTIVITY_RETENTION_DAYS = 90
EVENT_TYPES = ("visit", "signup", "login", "guest_login")

# Bound what a visitor's browser can make us store.
_MAX = {"path": 300, "referrer": 500, "user_agent": 400, "utm": 120}


def client_ip(request) -> str:
    """
    The visitor's address. Behind API Gateway the Lambda adapter puts the
    gateway's own record of the source address in request.client, which a
    browser cannot set, unlike an X-Forwarded-For header.
    """
    try:
        return (request.client.host if request and request.client else "") or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def _clip(value: Any, key: str) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[: _MAX.get(key, 200)] or None


def record(kind: str, request=None, user: Any = None, extra: dict | None = None, collection=None) -> None:
    """Store one event. `user` is a UserPublic, a user dict, or None (a visit)."""
    try:
        if kind not in EVENT_TYPES:
            return
        if collection is None:
            import backend.db.mongo as mongo

            collection = mongo.db["activity"]

        def get(key):
            if user is None:
                return None
            return user.get(key) if isinstance(user, dict) else getattr(user, key, None)

        user_id = get("id") or get("_id")
        headers = getattr(request, "headers", {}) or {}
        doc = {
            "type": kind,
            "created_at": datetime.now(timezone.utc),
            "ip": client_ip(request),
            "user_agent": _clip(headers.get("user-agent"), "user_agent"),
            "user_id": str(user_id) if user_id else None,
            "username": get("username"),
            "full_name": get("full_name"),
            "email": get("email"),
            "phone": get("phone"),
            "political_party": get("political_party"),
            "is_guest": bool(get("is_guest")),
        }
        for key, value in (extra or {}).items():
            doc[key] = _clip(value, key if key in _MAX else ("utm" if key.startswith("utm") else key))
        collection.insert_one(doc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[activity] could not record %s: %s", kind, exc)


def record_session(kind_if_new: str, request, response) -> None:
    """After a sign-in endpoint: record it if a session was actually issued."""
    try:
        if getattr(response, "tokens", None) is None or getattr(response, "otp_required", False):
            return
        kind = "signup" if getattr(response, "is_new_user", False) else kind_if_new
        record(kind, request, getattr(response, "user", None))
    except Exception as exc:  # noqa: BLE001
        logger.warning("[activity] could not record a session: %s", exc)
