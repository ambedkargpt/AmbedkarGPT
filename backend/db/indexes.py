import logging

from pymongo import ASCENDING, DESCENDING
from pymongo.errors import OperationFailure

from backend.db.mongo import db

logger = logging.getLogger(__name__)


def _safe_create_index(collection, keys, **kwargs):
    """Create index, ignoring conflicts on pre-existing indexes with same name/keys."""
    try:
        collection.create_index(keys, **kwargs)
    except OperationFailure as exc:
        logger.warning("Index creation skipped (already exists or conflict): %s", exc)


def ensure_auth_indexes() -> None:
    users = db["users"]
    users.create_index([("username", ASCENDING)], unique=True, name="uq_users_username")
    users.create_index(
        [("email", ASCENDING)],
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
        name="uq_users_email_sparse",
    )
    users.create_index(
        [("phone", ASCENDING)],
        unique=True,
        partialFilterExpression={"phone": {"$type": "string"}},
        name="uq_users_phone_sparse",
    )
    users.create_index([("created_at", DESCENDING)], name="idx_users_created_at")

    otp = db["otp_verifications"]
    otp.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl_otp_expires")
    otp.create_index([("target", ASCENDING), ("purpose", ASCENDING), ("created_at", DESCENDING)], name="idx_otp_lookup")
    otp.create_index([("user_id", ASCENDING)], name="idx_otp_user")

    sessions = db["sessions"]
    _safe_create_index(sessions, [("user_id", ASCENDING)], name="idx_sessions_user")
    _safe_create_index(sessions,
        [("refresh_token_hash", ASCENDING)],
        unique=True,
        partialFilterExpression={"refresh_token_hash": {"$type": "string"}},
        name="uq_sessions_refresh_token_hash",
    )
    _safe_create_index(sessions, [("access_expires_at", ASCENDING)], name="idx_sessions_access_exp")
    _safe_create_index(sessions, [("refresh_expires_at", ASCENDING)], name="idx_sessions_refresh_exp")
    # Index for fast session revocation check on every authenticated request
    _safe_create_index(sessions,
        [("access_token", ASCENDING)],
        name="idx_sessions_access_token",
        partialFilterExpression={"is_revoked": False},
    )


def ensure_phase2_indexes() -> None:
    news = db["news"]
    news.create_index([("published_at", DESCENDING)], name="idx_news_published_at")
    news.create_index([("created_at", DESCENDING)], name="idx_news_created_at")
    news.create_index(
        [("news_id", ASCENDING)],
        unique=True,
        partialFilterExpression={"news_id": {"$type": "string"}},
        name="uq_news_news_id",
    )
    news.create_index(
        [("source_url", ASCENDING)],
        unique=True,
        partialFilterExpression={"source_url": {"$type": "string"}},
        name="uq_news_source_url",
    )
    news.create_index(
        [("headline", "text"), ("description", "text")],
        name="idx_news_text",
        default_language="none",
        language_override="text_search_lang",
        weights={"headline": 2, "description": 1},
    )

    questions = db["questions"]
    questions.create_index([("question_id", ASCENDING)], unique=True, name="uq_questions_question_id")
    questions.create_index([("category", ASCENDING), ("is_active", ASCENDING)], name="idx_questions_category_active")
    questions.create_index([("created_at", DESCENDING)], name="idx_questions_created_at")

    answers = db["user_profile_answers"]
    answers.create_index([("user_id", ASCENDING), ("question_id", ASCENDING)], unique=True, name="uq_answers_user_question")
    answers.create_index([("answered_at", DESCENDING)], name="idx_answers_answered_at")

    # Connected accounts. Unique per (user, provider): a user has one Reddit
    # account here, and reconnecting replaces it rather than stacking rows.
    integrations = db["user_integrations"]
    integrations.create_index(
        [("user_id", ASCENDING), ("provider", ASCENDING)],
        unique=True,
        name="uq_integrations_user_provider",
    )


def ensure_activity_indexes() -> None:
    """The report's event log, deleted by Mongo after 90 days, and its place cache."""
    from backend.services.activity_service import ACTIVITY_RETENTION_DAYS

    activity = db["activity"]
    _safe_create_index(activity, [("created_at", ASCENDING)],
                       expireAfterSeconds=ACTIVITY_RETENTION_DAYS * 86400, name="ttl_activity_created")
    _safe_create_index(activity, [("type", ASCENDING), ("created_at", DESCENDING)], name="idx_activity_type_created")
    _safe_create_index(db["ip_geo"], [("ip", ASCENDING)], unique=True, name="uq_ip_geo_ip")
    # Places go stale as addresses are reassigned: looked up again after 30 days.
    _safe_create_index(db["ip_geo"], [("at", ASCENDING)], expireAfterSeconds=30 * 86400, name="ttl_ip_geo_at")


def ensure_phase3_indexes() -> None:
    posts = db["posts"]
    _safe_create_index(posts, [("user_id", ASCENDING), ("created_at", DESCENDING)], name="idx_posts_user_created")
    _safe_create_index(posts, [("news_id", ASCENDING), ("created_at", DESCENDING)], name="idx_posts_news_created")
    _safe_create_index(posts, [("status", ASCENDING), ("created_at", DESCENDING)], name="idx_posts_status_created")
    _safe_create_index(posts, [("content", "text")], name="idx_posts_content_text")
    # Compound index for count_published_today() — queried on every publish
    _safe_create_index(posts,
        [("user_id", ASCENDING), ("published_at", DESCENDING), ("status", ASCENDING)],
        name="idx_posts_user_published_status",
        partialFilterExpression={"status": "published"},
    )
    # A story could once be written once a day. It can now be written five
    # times in all, so the old one-a-day index has to go or it would refuse the
    # second post.
    try:
        posts.drop_index("uq_posts_user_news_day")
    except OperationFailure:
        pass
    # Five generated posts per user per story: each takes a slot from 1 to 5.
    # Unique rather than a read before the write, so two requests arriving
    # together cannot both take the last slot. Partial on the slot: posts
    # written before this rule have none, so they never collide.
    _safe_create_index(posts,
        [("user_id", ASCENDING), ("news_id", ASCENDING), ("story_slot", ASCENDING)],
        name="uq_posts_user_news_slot",
        unique=True,
        partialFilterExpression={"origin": "generate", "story_slot": {"$exists": True}},
    )
    # Backs the all-time settings check. Not unique: the only way two posts
    # could race onto one fingerprint is within a single day, which the index
    # above already refuses.
    _safe_create_index(posts,
        [("user_id", ASCENDING), ("news_id", ASCENDING), ("fingerprints", ASCENDING)],
        name="idx_posts_user_news_fingerprints",
    )

    streaks = db["user_streaks"]
    _safe_create_index(streaks, "user_id", unique=True, name="uq_streak_user_id")
