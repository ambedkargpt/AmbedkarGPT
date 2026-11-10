"""
Guest accounts: "Continue as guest · Congress" / "· Samajwadi".

A guest can read the news and write posts without signing up. Writing a post is
done as somebody (a party, a position, preferences), so a guest is a real
account with those already set, flagged `is_guest`, and everything else - the
generator, post history, the daily limits - works for it unchanged.

What it is set up with is chosen to give the strongest posts for a party's own
communication:
  - position: the party's national spokesperson ("every line is quotable"),
    with a national remit, which suits national and state news alike;
  - party preferences: the defaults, except a supportive overall stance, a
    strong rebuttal on a controversy, and defending the party against
    criticism - the side-of-the-party voice the INC prompt asks for.

Two limits keep it from being a free, unlimited way to spend model calls:
  - the same browser (device id) and party get the same account back;
  - one network address can make only GUEST_ACCOUNTS_PER_IP_PER_DAY guest
    accounts in a day. The address is stored hashed, never as it came.
The posts a guest can write in a day are capped in the posts service.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from backend.core.auth_constants import AUTH_PROVIDER_GUEST
from backend.core.config import settings

GUEST_ACCOUNTS_PER_IP_PER_DAY = 5
GUEST_POSITION = "national_spokesperson"

# The party names the app stores (frontend/src/utils/politicalParties.js).
GUEST_PARTIES = {
    "congress": "Indian National Congress (INC)",
    "samajwadi": "Samajwadi Party (SP)",
}

# Party preference questions changed from their defaults for a guest, by
# question number (backend/pipeline/party_questions.py) and option number.
#   Q4  a mistake or criticism  -> defend the party
#   Q9  a major controversy     -> a strong rebuttal defending the party
#   Q10 overall attitude        -> strongly supportive
GUEST_PARTY_PICKS = {"inc": {4: 1, 9: 1, 10: 1}, "sp": {4: 1, 9: 1, 10: 1}}


def _digest(value: str) -> str:
    """A keyed hash, so a stored device id or address cannot be reversed or matched elsewhere."""
    key = (settings.jwt_secret or "ambedkargpt").encode("utf-8")
    return hmac.new(key, value.encode("utf-8"), hashlib.sha256).hexdigest()


# What a guest account cannot do with a post, by the name the app shows it.
# Copy and listening happen in the browser and are only hidden there; these
# are the ones the server does, so it refuses them too.
GUEST_LOCKED = ("publish", "translate", "edit")


def is_guest_account(user_id: str) -> bool:
    """Whether this account was made by "Continue as guest"."""
    from bson import ObjectId

    import backend.db.mongo as mongo

    try:
        user = mongo.db["users"].find_one({"_id": ObjectId(user_id)}, {"is_guest": 1})
    except Exception:
        return False
    return bool((user or {}).get("is_guest"))


def refuse_guest(user_id: str, feature: str) -> None:
    """A 403 when a guest account asks for something only a signed-up account can do."""
    if is_guest_account(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "guest_locked",
                "feature": feature,
                "message": "Sign up free to copy, publish, translate or edit a post.",
            },
        )


def guest_answers(party_key: str) -> dict[str, str]:
    """{question_id: answer} a guest of this party starts with (only the changed ones)."""
    from backend.pipeline import party_questions as pq

    out: dict[str, str] = {}
    for number, option in GUEST_PARTY_PICKS.get(party_key, {}).items():
        out[pq.question_id(party_key, number)] = pq.OPTIONS[party_key][number - 1][option - 1][0]
    return out


class GuestService:
    def __init__(self, users_collection, answers_repo) -> None:
        self.users = users_collection
        self.answers_repo = answers_repo

    def find_or_create(self, party: str, device_id: str, ip: str) -> dict:
        """The guest account for this device and party, made the first time."""
        political_party = GUEST_PARTIES.get(party)
        if not political_party:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown party.")
        device = _digest(f"device:{device_id}")
        existing = self.users.find_one({
            "is_guest": True, "guest_device": device, "political_party": political_party,
        })
        if existing:
            return existing

        address = _digest(f"ip:{ip or 'unknown'}")
        since = datetime.now(timezone.utc) - timedelta(days=1)
        made_today = self.users.count_documents({
            "is_guest": True, "guest_ip": address, "created_at": {"$gte": since},
        })
        if made_today >= GUEST_ACCOUNTS_PER_IP_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "guest_limit",
                    "message": "Too many guest accounts from this network today. Please sign up to continue.",
                },
            )

        now = datetime.now(timezone.utc)
        doc = {
            "username": f"guest_{party[:3]}_{secrets.token_hex(4)}",
            "password_hash": None,
            "email": None,
            "phone": None,
            "full_name": "Guest",
            "political_party": political_party,
            "party_position": GUEST_POSITION,
            "state": None,
            "city": None,
            "date_of_birth": None,
            "auth_providers": [AUTH_PROVIDER_GUEST],
            "is_email_verified": False,
            "is_phone_verified": False,
            "is_active": True,
            "is_guest": True,
            "guest_device": device,
            "guest_ip": address,
            "last_login_at": None,
            "created_at": now,
            "updated_at": now,
        }
        doc["_id"] = self.users.insert_one(doc).inserted_id

        from backend.pipeline.party_questions import question_party

        party_key = question_party(political_party)
        for question_id, answer in guest_answers(party_key).items():
            self.answers_repo.upsert_answer(str(doc["_id"]), question_id, answer, source="guest_default")
        return doc
