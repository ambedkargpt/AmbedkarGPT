from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId

from backend.db.mongo import db


def _language_clause(language: str) -> dict:
    """Match the requested language, plus documents with no language tag."""
    return {
        "$or": [
            {"language": language},
            {"language": None},
            {"language": {"$exists": False}},
        ]
    }


# How long a party story stays in the feed, and which tenants it applies to.
# Kept together so widening the window or adding a tenant is one edit.
FRESH_WINDOW = timedelta(days=3)
FRESH_WINDOW_TENANTS = ("congress", "samajwadi", "bjp")


class NewsRepository:
    def __init__(self) -> None:
        self.collection = db["news"]

    def create(self, payload: dict[str, Any]) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "news_id": payload.get("news_id"),
            "headline": payload["headline"],
            "description": payload["description"],
            "summary": payload.get("summary"),
            "source_name": payload.get("source_name"),
            "source_url": payload.get("source_url"),
            "published_at": payload.get("published_at"),
            "language": payload.get("language"),
            "tags": payload.get("tags", []),
            "embedding_ref": payload.get("embedding_ref"),
            "legacy_source": payload.get("legacy_source"),
            "original_sort_timestamp": payload.get("original_sort_timestamp"),
            "created_at": now,
            "updated_at": now,
        }
        doc = {k: v for k, v in doc.items() if v is not None}
        result = self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    def list(
        self,
        limit: int = 100,
        skip: int = 0,
        language: str | None = None,
        tenant_ids: list[int] | None = None,
    ) -> list[dict]:
        clauses: list[dict] = []
        if language:
            # Untagged documents always match. The publish path deliberately
            # stores language=None (a real value would clash with Mongo's text
            # index language override), so an exact match on any language other
            # than "en" hid every item we publish.
            clauses.append(_language_clause(language))
        if tenant_ids is not None:
            tenant_clause: dict = {"tenant_id": {"$in": tenant_ids}}
            # Documents published before tenants existed carry no tenant_id and
            # are treated as general news (tenant 0).
            if 0 in tenant_ids:
                tenant_clause = {"$or": [tenant_clause, {"tenant_id": {"$exists": False}}]}
            clauses.append(tenant_clause)

        # Retired from the feed, kept in the database.
        #
        # Superseded stories still matter: the knowledge graph is built from
        # them, and a later story that refers back to one has to be able to
        # reach it. So they are flagged rather than deleted, and only this
        # listing filters them out. Anything reading by id still finds them.
        #
        # Absent means visible, so nothing already stored changes meaning.
        clauses.append({"hidden_from_ui": {"$ne": True}})

        # Party news goes stale fast.
        #
        # A karyakarta posting about a three-day-old story is posting about
        # something the cycle has moved past, so the feed stops offering them.
        # Nothing is deleted and nothing is flagged: this is a rolling window,
        # so a story leaves on its own and comes back if the window is widened.
        #
        # Scoped to the party tenants deliberately. General news is still the
        # June import, and a blanket rule would empty that tab entirely. Add
        # "general" here once its pipeline is running fresh.
        clauses.append({
            "$or": [
                {"tenant_slug": {"$nin": list(FRESH_WINDOW_TENANTS)}},
                {"published_at": {"$gte": datetime.now(timezone.utc) - FRESH_WINDOW}},
            ]
        })

        query: dict = {"$and": clauses} if len(clauses) > 1 else (clauses[0] if clauses else {})
        # Newest news first. Order by when the story was published, not when the
        # row was written — a bulk import gives every row the same created_at,
        # which would leave the feed in arbitrary order. created_at is the
        # tiebreaker for the few documents with no published_at.
        return list(
            self.collection.find(query)
            .sort([("published_at", -1), ("created_at", -1)])
            .skip(skip)
            .limit(limit)
        )

    def count(self, language: str | None = None, tenant_ids: list[int] | None = None) -> int:
        """Total matching documents — used for paginated listings."""
        clauses: list[dict] = []
        if language:
            clauses.append(_language_clause(language))
        if tenant_ids is not None:
            tenant_clause: dict = {"tenant_id": {"$in": tenant_ids}}
            if 0 in tenant_ids:
                tenant_clause = {"$or": [tenant_clause, {"tenant_id": {"$exists": False}}]}
            clauses.append(tenant_clause)
        query: dict = {"$and": clauses} if len(clauses) > 1 else (clauses[0] if clauses else {})
        return self.collection.count_documents(query)

    def get_by_id(self, news_id: str) -> Optional[dict]:
        return self.collection.find_one({"_id": ObjectId(news_id)})

    def get_by_custom_news_id(self, news_id: str) -> Optional[dict]:
        return self.collection.find_one({"news_id": news_id})

    def get_by_source_url(self, source_url: str) -> Optional[dict]:
        return self.collection.find_one({"source_url": source_url})

    def get_latest_news_id(self) -> str | None:
        latest = self.collection.find_one(
            {"news_id": {"$regex": r"^news_\d+$"}},
            {"news_id": 1},
            sort=[("news_id", -1)],
        )
        return latest.get("news_id") if latest else None

    def update(self, news_id: str, updates: dict[str, Any]) -> Optional[dict]:
        updates = {k: v for k, v in updates.items() if v is not None}
        if not updates:
            return self.get_by_id(news_id)
        updates["updated_at"] = datetime.now(timezone.utc)
        self.collection.update_one({"_id": ObjectId(news_id)}, {"$set": updates})
        return self.get_by_id(news_id)

    def upsert_by_source_url(self, source_url: str, doc: dict[str, Any]) -> tuple[dict, bool]:
        now = datetime.now(timezone.utc)
        payload = {
            "news_id": doc["news_id"],
            "headline": doc["headline"],
            "description": doc["description"],
            "summary": doc.get("summary"),
            "source_name": doc.get("source_name"),
            "source_url": source_url,
            "published_at": doc.get("published_at"),
            "language": doc.get("language"),
            "tags": doc.get("tags", []),
            "embedding_ref": doc.get("embedding_ref"),
            # Tenant stamp drives party vs general segmentation in the API.
            "tenant_id": doc.get("tenant_id", 0),
            "tenant_slug": doc.get("tenant_slug", "general"),
            "content_type": doc.get("content_type", "news"),
            "legacy_source": doc.get("legacy_source"),
            "original_sort_timestamp": doc.get("original_sort_timestamp"),
            "updated_at": now,
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        result = self.collection.update_one(
            {"source_url": source_url},
            {"$set": payload, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        saved = self.get_by_source_url(source_url)
        return saved, bool(result.upserted_id)
