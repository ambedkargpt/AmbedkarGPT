from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


PostStatus = Literal["draft", "published", "archived"]


class PostCreateRequest(BaseModel):
    user_id: str
    news_id: str
    content: str = Field(min_length=3)
    hashtags: list[str] = Field(default_factory=list)
    status: PostStatus = "draft"
    generation_meta: Optional[dict[str, Any]] = None

    @field_validator("content", mode="before")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if isinstance(v, str) and not v.strip():
            raise ValueError("Content must not be blank or whitespace only.")
        return v


class PostUpdateRequest(BaseModel):
    content: Optional[str] = Field(default=None, min_length=3)
    hashtags: Optional[list[str]] = None
    status: Optional[PostStatus] = None
    generation_meta: Optional[dict[str, Any]] = None
    # The writer's thumbs up or down on the generated post: a signal of how
    # good the model's posts are, stored on the post for later analysis.
    feedback: Optional[Literal["up", "down"]] = None


class PostResponse(BaseModel):
    id: str
    user_id: str
    news_id: str
    content: str
    hashtags: list[str]
    status: PostStatus
    generation_meta: Optional[dict[str, Any]]
    translations: dict[str, str] = {}
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # The superseded text, present only between a refine and a publish. While
    # it is set the user can switch between the two and publish either; the one
    # not published is dropped.
    previous_content: Optional[str] = None
    refined_at: Optional[datetime] = None
    feedback: Optional[Literal["up", "down"]] = None
    # True when `content` is the refinement, False when it is the text the
    # refinement replaced. Only meaningful while previous_content is set.
    refined_is_live: Optional[bool] = None


class RetrievedChunkReference(BaseModel):
    chunk_id: str
    video_title: str
    video_link: str
    chunk_text: str
    similarity_score: float = 0.0
    relevance_score: Optional[float] = None
    argument_score: float = 0.0
    final_score: float = 0.0


class PostGenerateRequest(BaseModel):
    user_id: str
    news_id: str
    tone: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    language: Optional[str] = None
    profile_overrides: Optional[dict[str, str]] = None  # preferences panel values


class PostRegenerateRequest(BaseModel):
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    language: Optional[str] = None
    profile_overrides: Optional[dict[str, str]] = None
    # Required, because it is the only thing that makes a refinement a different
    # request from the generation it came from: without it the two would be the
    # same inputs and so the same fingerprint. "make it more aggressive", "add
    # a Periyar reference", etc.
    refinement_note: str = Field(min_length=1)

    @field_validator("refinement_note")
    @classmethod
    def note_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Tell us what should be different before regenerating.")
        return v.strip()


class PostGenerateResponse(BaseModel):
    post: PostResponse
    references: list[RetrievedChunkReference] = Field(default_factory=list)
    retrieval_snapshot_id: str
    retrieval_reused: bool = False

    @model_validator(mode="after")
    def validate_snapshot_id(self):
        if not self.retrieval_snapshot_id.strip():
            raise ValueError("retrieval_snapshot_id must be non-empty.")
        return self


DAILY_POST_LIMIT = 5
MILESTONE_TARGET = 200


class DailyQuotaResponse(BaseModel):
    # Daily publish count (only published posts count toward the limit)
    daily_used: int
    daily_limit: int = DAILY_POST_LIMIT
    daily_remaining: int
    reset_at: datetime

    # All-time generated count (kept for backward compat)
    total_posts: int

    # Streak fields
    streak_days: int = 0
    streak_start_date: Optional[datetime] = None
    total_streak_posts: int = 0   # resets when streak breaks — used for milestone
    streak_at_risk: bool = False  # active streak but no publish yet today
    streak_broken: bool = False   # just broke streak (reset to 0 this session)

    milestone_target: int = MILESTONE_TARGET

    # Legacy aliases so existing frontend code still works
    @property
    def used(self) -> int: return self.daily_used
    @property
    def limit(self) -> int: return self.daily_limit
    @property
    def remaining(self) -> int: return self.daily_remaining


class PostTranslateRequest(BaseModel):
    target_language: Literal["en", "hi"] = "en"


class PostTranslateResponse(BaseModel):
    translated_content: str
    target_language: str


class PostsDashboardItem(BaseModel):
    id: str
    user_id: str
    news_id: str
    content_preview: str
    hashtags: list[str]
    status: PostStatus
    created_at: datetime
