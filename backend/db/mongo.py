from pymongo import MongoClient
from pymongo.errors import PyMongoError

from backend.core.config import settings


_mongo_client = MongoClient(settings.mongodb_uri)
db = _mongo_client[settings.mongodb_database]


def ping_database() -> bool:
    """Return True when MongoDB is reachable."""
    try:
        _mongo_client.admin.command("ping")
        return True
    except PyMongoError:
        return False
