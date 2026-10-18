from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from backend.db.mongo import db


def _today_midnight_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def today_day_key() -> str:
    """The calendar day a post belongs to, as YYYY-MM-DD in UTC.

    Stored on the document rather than derived from created_at at query time so
    the one-post-per-story-per-day rule can be a unique index instead of a read
    followed by a write. UTC to match the daily publish quota above it; that
    means the day rolls over at 05:30 IST.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class PostsRepository:
    def __init__(self) -> None:
        self.collection = db["posts"]

    def create(self, payload: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": ObjectId(payload["user_id"]),
            "news_id": ObjectId(payload["news_id"]),
            "content": payload["content"],
            "hashtags": payload.get("hashtags", []),
            "status": payload.get("status", "draft"),
            "generation_meta": payload.get("generation_meta"),
            "created_at": now,
            "updated_at": now,
        }
        # Only generated posts carry these. Both unique indexes are partial on
        # origin, so a document without it is outside the rule entirely -- which
        # is what keeps every post written before this feature from colliding.
        origin = payload.get("origin")
        if origin:
            doc["origin"] = origin
            doc["created_day"] = payload.get("created_day") or today_day_key()
        fingerprint = payload.get("fingerprint")
        if fingerprint:
            # An array, appended to on refine and never rewritten: the refined
            # post must not forget the fingerprint of the generation it came
            # from, or the same settings would pass again the next day.
            doc["fingerprints"] = [fingerprint]
        result = self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    def find_same_day(self, user_id: str, news_id: str, created_day: str) -> Optional[dict]:
        """An existing generated post for this story on this day, if any."""
        return self.collection.find_one(
            {
                "user_id": ObjectId(user_id),
                "news_id": ObjectId(news_id),
                "created_day": created_day,
                "origin": "generate",
            },
            {"_id": 1, "created_at": 1, "status": 1},
        )

    def find_by_fingerprint(self, user_id: str, news_id: str, fingerprint: str) -> Optional[dict]:
        """Any earlier post for this story generated from these exact settings."""
        return self.collection.find_one(
            {
                "user_id": ObjectId(user_id),
                "news_id": ObjectId(news_id),
                "fingerprints": fingerprint,
                "origin": "generate",
            },
            {"_id": 1, "created_at": 1, "created_day": 1, "status": 1},
        )

    def refine_in_place(
        self,
        post_id: str,
        *,
        content: str,
        fingerprint: str,
        generation_meta: dict[str, Any] | None,
        allow_repeat: bool = False,
    ) -> Optional[dict]:
        """
        Replace the post's text with its one allowed refinement.

        Keeps the superseded text in previous_content so the user can compare
        the two and publish either. Returns None when the post has already been
        refined, which is also the guard against two refines racing: the filter
        requires refined_at to be absent, so only the first write can win.

        allow_repeat drops that filter for a test account, which is allowed to
        refine the same post repeatedly. Each refinement then supersedes the one
        before it, so previous_content is always the text just replaced.
        """
        now = datetime.now(timezone.utc)
        criteria: dict[str, Any] = {"_id": ObjectId(post_id)}
        if not allow_repeat:
            criteria["refined_at"] = {"$exists": False}
        return self.collection.find_one_and_update(
            criteria,
            [
                {
                    "$set": {
                        "previous_content": "$content",
                        "previous_generation_meta": "$generation_meta",
                        "content": content,
                        "generation_meta": generation_meta,
                        "refined_at": now,
                        # Which of the two the user is looking at. Stored rather
                        # than tracked in the page, so the labels are still
                        # right after a reload.
                        "refined_is_live": True,
                        "updated_at": now,
                        "fingerprints": {
                            "$concatArrays": [
                                {"$ifNull": ["$fingerprints", []]},
                                [fingerprint],
                            ]
                        },
                    }
                }
            ],
            return_document=True,
        )

    def swap_versions(self, post_id: str) -> Optional[dict]:
        """
        Swap which of the two versions is the live one.

        Only meaningful while previous_content is still there: once the post is
        published the losing version is dropped and there is nothing to swap.
        """
        return self.collection.find_one_and_update(
            {"_id": ObjectId(post_id), "previous_content": {"$exists": True}},
            [
                {
                    "$set": {
                        "content": "$previous_content",
                        "previous_content": "$content",
                        "generation_meta": "$previous_generation_meta",
                        "previous_generation_meta": "$generation_meta",
                        "refined_is_live": {"$not": ["$refined_is_live"]},
                        "updated_at": datetime.now(timezone.utc),
                    }
                }
            ],
            return_document=True,
        )

    def drop_unpublished_version(self, post_id: str) -> None:
        """
        Forget the version that was not published.

        Called once the user has committed to one of the two, so history shows
        the post that went out rather than the draft beside it. The fingerprints
        array is deliberately untouched: it records what was generated, not what
        was published, and dropping an entry would hand back a free regeneration.
        """
        self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {
                "$unset": {
                    "previous_content": "",
                    "previous_generation_meta": "",
                    "refined_is_live": "",
                },
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )

    def get_by_id(self, post_id: str) -> Optional[dict]:
        return self.collection.find_one({"_id": ObjectId(post_id)})

    def list_posts(
        self,
        user_id: str | None = None,
        news_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
        skip: int = 0,
        include_meta: bool = False,
    ) -> list[dict]:
        query: dict[str, Any] = {}
        if user_id:
            query["user_id"] = ObjectId(user_id)
        if news_id:
            query["news_id"] = ObjectId(news_id)
        if status:
            query["status"] = status
        cursor = self.collection.find(query, projection=self._list_projection(include_meta))
        return list(cursor.sort("created_at", -1).skip(skip).limit(limit))

    @staticmethod
    def _list_projection(include_meta: bool) -> dict[str, int] | None:
        """
        Leave generation_meta out of listings unless a caller asks for it.

        It is the retrieval and research record kept so a post can be
        regenerated, and it dwarfs the post: in one user's history the largest
        document was 64 KB, of which 62 KB was this field and 2 KB was the
        content anyone reads. Fifty-eight posts came to 2 MB on the wire for a
        list view that shows none of it, and on a slow link that exceeded the
        driver's socket timeout and returned a 500.

        Nothing in the listing path uses it: the regenerate flow reads the post
        by id, which is unaffected.
        """
        return None if include_meta else {"generation_meta": 0}

    def update(self, post_id: str, updates: dict[str, Any]) -> Optional[dict]:
        updates = {k: v for k, v in updates.items() if v is not None}
        if not updates:
            return self.get_by_id(post_id)
        updates["updated_at"] = datetime.now(timezone.utc)
        self.collection.update_one({"_id": ObjectId(post_id)}, {"$set": updates})
        return self.get_by_id(post_id)

    def count_today(self, user_id: str) -> int:
        """Count posts created by user since midnight UTC today."""
        return self.collection.count_documents({
            "user_id": ObjectId(user_id),
            "created_at": {"$gte": _today_midnight_utc()},
        })

    def count_published_today(self, user_id: str) -> int:
        """Count posts published by user since midnight UTC today."""
        return self.collection.count_documents({
            "user_id": ObjectId(user_id),
            "status": "published",
            "published_at": {"$gte": _today_midnight_utc()},
        })

    def set_published_at(self, post_id: str) -> None:
        """Stamp published_at on the post (called exactly once when status → published)."""
        self.collection.update_one(
            {"_id": ObjectId(post_id), "published_at": {"$exists": False}},
            {"$set": {"published_at": datetime.now(timezone.utc)}},
        )

    def try_publish_atomic(self, post_id: str, user_id: str, daily_limit: int) -> bool:
        """Atomically publish a post only if the user hasn't hit the daily limit.
        Returns True if published, False if limit already reached.
        Uses a two-phase approach: stamp published_at only if count < limit.
        """
        midnight = _today_midnight_utc()
        now = datetime.now(timezone.utc)
        # Phase 1: stamp published_at atomically (idempotent — only if not already set)
        result = self.collection.find_one_and_update(
            {
                "_id": ObjectId(post_id),
                "user_id": ObjectId(user_id),
                "published_at": {"$exists": False},
            },
            {"$set": {"published_at": now, "updated_at": now}},
            return_document=True,
        )
        if not result:
            # Already published or not found — re-check current count
            return self.count_published_today(user_id) < daily_limit
        # Phase 2: check if this publish put us over the limit
        count = self.count_published_today(user_id)
        if count > daily_limit:
            # Rollback — unset published_at
            self.collection.update_one(
                {"_id": ObjectId(post_id)},
                {"$unset": {"published_at": ""}, "$set": {"updated_at": now}},
            )
            return False
        return True

    def add_publication(self, post_id: str, publication: dict[str, Any]) -> Optional[dict]:
        """
        Record that this post actually reached a platform.

        Separate from `status: published`, which is the user saying they are
        done with a draft. This is the evidence — where it went and the link
        that proves it — and it is what a verifiable milestone should count.
        """
        self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {
                "$push": {"publications": publication},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            },
        )
        return self.get_by_id(post_id)

    def find_publication(self, post_id: str, platform: str) -> Optional[dict]:
        """An existing publication on that platform, so we never post twice."""
        doc = self.get_by_id(post_id)
        for entry in (doc or {}).get("publications") or []:
            if entry.get("platform") == platform:
                return entry
        return None

    def count_all_time(self, user_id: str) -> int:
        """Total posts ever created by user (for milestone tracking)."""
        return self.collection.count_documents({"user_id": ObjectId(user_id)})

    def save_translation(self, post_id: str, language: str, content: str) -> None:
        """Store a translation under translations.{language} on the post document."""
        self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {f"translations.{language}": content, "updated_at": datetime.now(timezone.utc)}},
        )

    def archive(self, post_id: str) -> bool:
        result = self.collection.update_one(
            {"_id": ObjectId(post_id)},
            {"$set": {"status": "archived", "updated_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0

    def dashboard_list(self, user_id: str | None = None, limit: int = 50) -> list[dict]:
        query: dict[str, Any] = {}
        if user_id:
            query["user_id"] = ObjectId(user_id)
        return list(
            self.collection.find(
                query,
                {
                    "_id": 1,
                    "user_id": 1,
                    "news_id": 1,
                    "content": 1,
                    "hashtags": 1,
                    "status": 1,
                    "created_at": 1,
                },
            )
            .sort("created_at", -1)
            .limit(limit)
        )
