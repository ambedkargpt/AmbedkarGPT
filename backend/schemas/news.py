from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NewsCreateRequest(BaseModel):
    news_id: Optional[str] = None
    headline: str = Field(min_length=3, max_length=500)
    description: str = Field(min_length=3)
    summary: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    language: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    embedding_ref: Optional[str] = None
    scope: str = "national"
    region: Optional[str] = None


class NewsUpdateRequest(BaseModel):
    headline: Optional[str] = Field(default=None, min_length=3, max_length=500)
    description: Optional[str] = Field(default=None, min_length=3)
    summary: Optional[str] = Field(default=None, min_length=3)
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[datetime] = None
    language: Optional[str] = None
    tags: Optional[list[str]] = None
    embedding_ref: Optional[str] = None
    scope: Optional[str] = None
    region: Optional[str] = None


class NewsResponse(BaseModel):
    id: str
    news_id: str
    headline: str
    description: str
    summary: str
    source_name: Optional[str]
    source_url: Optional[str]
    published_at: Optional[datetime]
    language: Optional[str]
    tags: list[str]
    embedding_ref: Optional[str]
    # Tenant segmentation: 0/"general" is neutral news shown to every user.
    tenant_id: int = 0
    tenant_slug: str = "general"
    # National, state or city politics, and for state/city where.
    scope: str = "national"
    region: Optional[str] = None
    # "press_conference" (livestreamed briefing) or "news" (regular upload)
    content_type: str = "news"
    legacy_source: Optional[str] = None
    original_sort_timestamp: Optional[float] = None
    created_at: datetime
    updated_at: datetime
