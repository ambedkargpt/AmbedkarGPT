from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId

from backend.db.mongo import db


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _to_datetime(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


class StreakRepository:
    def __init__(self) -> None:
        self.collection = db["user_streaks"]

    def get(self, user_id: str) -> Optional[dict]:
        return self.collection.find_one({"user_id": ObjectId(user_id)})

    def on_publish(self, user_id: str) -> dict:
        """
        Called once per publish event. Updates streak state and returns new doc.

        Rules:
        - First publish ever → streak = 1, total_streak_posts = 1
        - Published today already → total_streak_posts += 1 (streak day already counted)
        - Published yesterday → streak += 1, total_streak_posts += 1
        - Missed ≥ 1 day → streak resets to 1, total_streak_posts resets to 1
        """
        today = _utc_today()
        yesterday = today - timedelta(days=1)
        now = datetime.now(timezone.utc)

        # Atomic upsert for first-time creation — prevents race condition duplicate inserts
        self.collection.update_one(
            {"user_id": ObjectId(user_id)},
            {"$setOnInsert": {
                "user_id": ObjectId(user_id),
                "streak_days": 0,
                "streak_start_date": _to_datetime(today),
                "total_streak_posts": 0,
                "last_publish_date": None,
                "updated_at": now,
            }},
            upsert=True,
        )
        doc = self.get(user_id)
        if doc is None:
            # Fallback — should never happen after upsert
            doc = {"streak_days": 0, "total_streak_posts": 0, "last_publish_date": None}

        last_str = doc.get("last_publish_date")
        last_date: Optional[date] = date.fromisoformat(last_str) if last_str else None

        if last_date == today:
            # Already streaked today — just add to post count
            self.collection.update_one(
                {"user_id": ObjectId(user_id)},
                {"$inc": {"total_streak_posts": 1}, "$set": {"updated_at": now}},
            )
        elif last_date == yesterday:
            # Consecutive day — extend streak
            self.collection.update_one(
                {"user_id": ObjectId(user_id)},
                {
                    "$inc": {"streak_days": 1, "total_streak_posts": 1},
                    "$set": {"last_publish_date": today.isoformat(), "updated_at": now},
                },
            )
        else:
            # Missed one or more days — full reset
            self.collection.update_one(
                {"user_id": ObjectId(user_id)},
                {
                    "$set": {
                        "streak_days": 1,
                        "streak_start_date": _to_datetime(today),
                        "total_streak_posts": 1,
                        "last_publish_date": today.isoformat(),
                        "updated_at": now,
                    }
                },
            )

        return self.get(user_id)

    def get_streak_info(self, user_id: str) -> dict:
        """
        Returns streak state + derived flags without modifying anything.
        """
        today = _utc_today()
        yesterday = today - timedelta(days=1)
        doc = self.get(user_id)

        if doc is None:
            return {
                "streak_days": 0,
                "streak_start_date": None,
                "total_streak_posts": 0,
                "last_publish_date": None,
                "streak_at_risk": False,
                "streak_broken": False,
            }

        last_str = doc.get("last_publish_date")
        last_date: Optional[date] = date.fromisoformat(last_str) if last_str else None

        # streak_at_risk: has an active streak but hasn't published today
        streak_at_risk = (doc["streak_days"] > 0) and (last_date != today)

        # streak_broken: last publish was more than 1 day ago AND had a real streak
        # (i.e. they just broke it; we detect this by streak_days == 1 and
        # last_publish_date == today but streak_start_date == today meaning the
        # streak was just reset today)
        streak_broken = False
        if last_date == today and doc["streak_days"] == 1:
            start = doc.get("streak_start_date")
            if start:
                start_d = start.date() if hasattr(start, "date") else None
                streak_broken = start_d == today and doc.get("total_streak_posts", 1) == 1

        return {
            "streak_days": doc["streak_days"],
            "streak_start_date": doc.get("streak_start_date"),
            "total_streak_posts": doc.get("total_streak_posts", 0),
            "last_publish_date": last_str,
            "streak_at_risk": streak_at_risk,
            "streak_broken": streak_broken,
        }
