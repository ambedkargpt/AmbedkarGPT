from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from backend.db.mongo import db


class OtpRepository:
    def __init__(self) -> None:
        self.collection = db["otp_verifications"]

    def create_otp(
        self,
        user_id: Optional[ObjectId],
        channel: str,
        target: str,
        otp_hash: str,
        purpose: str,
        max_attempts: int,
        expires_at: datetime,
    ) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "channel": channel,
            "target": target,
            "otp_hash": otp_hash,
            "purpose": purpose,
            "attempt_count": 0,
            "max_attempts": max_attempts,
            "expires_at": expires_at,
            "consumed_at": None,
            "created_at": now,
        }
        result = self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    def get_active_otp(self, target: str, channel: str, purpose: str) -> Optional[dict]:
        now = datetime.now(timezone.utc)
        return self.collection.find_one(
            {
                "target": target,
                "channel": channel,
                "purpose": purpose,
                "consumed_at": None,
                "expires_at": {"$gt": now},
            },
            sort=[("created_at", -1)],
        )

    def increment_attempt(self, otp_id: ObjectId) -> None:
        self.collection.update_one({"_id": otp_id}, {"$inc": {"attempt_count": 1}})

    def consume(self, otp_id: ObjectId) -> None:
        self.collection.update_one({"_id": otp_id}, {"$set": {"consumed_at": datetime.now(timezone.utc)}})

    def delete_for_target(self, target: str, channel: str, purpose: str) -> None:
        self.collection.delete_many({"target": target, "channel": channel, "purpose": purpose, "consumed_at": None})
