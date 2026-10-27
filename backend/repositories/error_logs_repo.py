"""
Storage for the admin error monitor. Two collections:

error_logs   One document per *distinct* error (an "issue"). When the same
             error happens again we bump its count and add it to a short
             "recent" list. A bug that fires 10,000 times is still one
             document, so the page reads like a to-do list of bugs.

error_events One small document per occurrence, kept for EVENT_KEEP_DAYS.
             These feed the charts: when it happened, on which path, for
             which user, how long the request took. At most
             MAX_EVENTS_PER_HOUR are stored per issue per hour, so a bug
             stuck in a loop cannot fill the database; the issue's count
             still goes up for every occurrence.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

# How many recent occurrences we keep on each error document.
MAX_RECENT = 20

# Errors that have not happened for this long are deleted by MongoDB itself
# (TTL index on last_seen), so the collection cleans up after itself.
KEEP_DAYS = 60

EVENT_KEEP_DAYS = 7
MAX_EVENTS_PER_HOUR = 100


class ErrorLogsRepository:
    def __init__(self, collection=None) -> None:
        # Tests pass a mongomock collection. The app uses the real database.
        if collection is None:
            from backend.db.mongo import db
            collection = db["error_logs"]
        self.collection = collection
        # Always in the same database as the issues.
        self.events = collection.database["error_events"]
        self._indexes_ready = False

    def ensure_indexes(self) -> None:
        # Created here, the first time an error is saved, instead of in
        # backend/db/indexes.py, so the existing startup code is left untouched.
        if self._indexes_ready:
            return
        self.collection.create_index([("fingerprint", ASCENDING)], unique=True, name="uq_error_logs_fingerprint")
        self.collection.create_index([("status", ASCENDING), ("last_seen", DESCENDING)], name="idx_error_logs_status_last_seen")
        self.collection.create_index(
            [("last_seen", ASCENDING)],
            expireAfterSeconds=KEEP_DAYS * 24 * 60 * 60,
            name="ttl_error_logs_last_seen",
        )
        self.events.create_index([("fingerprint", ASCENDING), ("time", DESCENDING)], name="idx_error_events_fingerprint_time")
        self.events.create_index(
            [("time", ASCENDING)],
            expireAfterSeconds=EVENT_KEEP_DAYS * 24 * 60 * 60,
            name="ttl_error_events_time",
        )
        self._indexes_ready = True

    def save_occurrence(self, fingerprint: str, details: dict, occurrence: dict) -> None:
        """
        Add one occurrence of an error.

        `details` describes the error (type, message, traceback, where...) and
        is overwritten with the latest copy each time. `occurrence` is the small
        per-event record (time, path, request id) kept in the "recent" list.
        """
        self.ensure_indexes()
        now = datetime.now(timezone.utc)
        occurrence = {**occurrence, "time": now}
        update = {
            # The fingerprint itself comes from the filter below on insert.
            "$setOnInsert": {"first_seen": now},
            # A resolved error that happens again goes back to "open",
            # because the fix did not work (or the bug came back).
            "$set": {**details, "last_seen": now, "status": "open"},
            "$inc": {"count": 1},
            "$push": {"recent": {"$each": [occurrence], "$slice": -MAX_RECENT}},
        }
        try:
            self.collection.update_one({"fingerprint": fingerprint}, update, upsert=True)
        except DuplicateKeyError:
            # Two servers inserted the same new error at the same moment and
            # the other one won. The document exists now, so update it.
            self.collection.update_one({"fingerprint": fingerprint}, update, upsert=True)

    def add_event(self, fingerprint: str, event: dict) -> None:
        """Store one occurrence for the charts, unless this issue hit its hourly cap."""
        self.ensure_indexes()
        now = datetime.now(timezone.utc)
        hour_start = now.replace(minute=0, second=0, microsecond=0)
        stored_this_hour = self.events.count_documents(
            {"fingerprint": fingerprint, "time": {"$gte": hour_start}}, limit=MAX_EVENTS_PER_HOUR,
        )
        if stored_this_hour >= MAX_EVENTS_PER_HOUR:
            return
        self.events.insert_one({**event, "fingerprint": fingerprint, "time": now})

    def events_since(
        self, since: datetime, fingerprint: Optional[str] = None, limit: int = 20000, with_logs: bool = False,
    ) -> list[dict]:
        """
        Occurrences after `since`, newest first.

        The saved log lines are the big part of an event (up to ~12 KB), so
        they are only loaded when asked for, and callers that want them ask
        for a small `limit`. Counting and charting never need them.
        """
        query = {"time": {"$gte": since}}
        if fingerprint:
            query["fingerprint"] = fingerprint
        projection = None if with_logs else {"breadcrumbs": 0, "user_agent": 0}
        cursor = self.events.find(query, projection).sort("time", DESCENDING).limit(limit)
        return list(cursor)

    def exists(self, fingerprint: str) -> bool:
        return self.collection.count_documents({"fingerprint": fingerprint}, limit=1) > 0

    def count_new_since(self, source: str, since: datetime) -> int:
        """How many *new* errors from this source first appeared after `since`."""
        return self.collection.count_documents({"source": source, "first_seen": {"$gte": since}})

    def list_errors(self, status: Optional[str] = None, source: Optional[str] = None, limit: int = 100) -> list[dict]:
        query = {}
        if status:
            query["status"] = status
        if source:
            query["source"] = source
        # The list does not need the long fields; the detail view loads them.
        projection = {"traceback": 0, "recent": 0, "extra": 0, "breadcrumbs": 0}
        cursor = self.collection.find(query, projection).sort("last_seen", DESCENDING).limit(limit)
        return list(cursor)

    def get_error(self, error_id: str) -> Optional[dict]:
        if not ObjectId.is_valid(error_id):
            return None
        return self.collection.find_one({"_id": ObjectId(error_id)})

    def set_status(self, error_id: str, status: str) -> bool:
        if not ObjectId.is_valid(error_id):
            return False
        result = self.collection.update_one({"_id": ObjectId(error_id)}, {"$set": {"status": status}})
        return result.matched_count == 1

    def summary(self) -> dict:
        """Numbers for the cards at the top of the admin page."""
        last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
        return {
            "open": self.collection.count_documents({"status": "open"}),
            "resolved": self.collection.count_documents({"status": "resolved"}),
            "seen_last_24h": self.collection.count_documents({"last_seen": {"$gte": last_24h}}),
        }
