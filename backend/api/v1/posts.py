from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.core.dependencies import get_current_user_id
from backend.schemas.integrations import PublicationResponse, PublishToRedditRequest
from backend.schemas.auth import MessageResponse
from backend.schemas.posts import (
    DailyQuotaResponse,
    PostCreateRequest,
    PostGenerateRequest,
    PostGenerateResponse,
    PostRegenerateRequest,
    PostResponse,
    PostTranslateRequest,
    PostTranslateResponse,
    PostsDashboardItem,
    PostUpdateRequest,
)
from backend.services.guest_service import refuse_guest
from backend.services.posts_service import PostsService
from backend.services.questions_service import QuestionsService


router = APIRouter(prefix="/posts", tags=["posts"])
service = PostsService()
questions = QuestionsService()


def _require_onboarding(user_id: str) -> None:
    """
    No post without a party and the preference questions answered.

    The app sends an unfinished account to profile setup and the
    questionnaire, but the app is only one client of this endpoint; the rule
    has to hold here, where the post is written.
    """
    gap = questions.onboarding_gap(user_id)
    if gap:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "onboarding_required",
                "step": gap,
                "message": "Choose your party and answer the preference questions before generating posts.",
            },
        )


def _owner_id(post) -> str | None:
    if isinstance(post, dict):
        return post.get("user_id")
    return getattr(post, "user_id", None)


@router.post("/", response_model=PostResponse)
def create_post(payload: PostCreateRequest, current_user_id: str = Depends(get_current_user_id)) -> PostResponse:
    if payload.user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create post for another user.")
    return service.create(payload)


@router.get("/daily-quota", response_model=DailyQuotaResponse)
def get_daily_quota(current_user_id: str = Depends(get_current_user_id)) -> DailyQuotaResponse:
    return service.get_daily_quota(user_id=current_user_id)


@router.post("/generate", response_model=PostGenerateResponse)
def generate_post(
    payload: PostGenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> PostGenerateResponse:
    if payload.user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot generate post for another user.")
    _require_onboarding(current_user_id)
    return service.generate_post_for_news(
        user_id=payload.user_id,
        news_id=payload.news_id,
        tone=payload.tone,
        temperature=payload.temperature,
        language=payload.language,
        profile_overrides=payload.profile_overrides,
    )


@router.post("/{post_id}/translate", response_model=PostTranslateResponse)
def translate_post(
    post_id: str,
    payload: PostTranslateRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> PostTranslateResponse:
    refuse_guest(current_user_id, "translate")
    return service.translate_post(
        post_id=post_id,
        current_user_id=current_user_id,
        target_language=payload.target_language,
    )


@router.post("/{post_id}/toggle-version", response_model=PostResponse)
def toggle_post_version(
    post_id: str,
    current_user_id: str = Depends(get_current_user_id),
) -> PostResponse:
    """Switch a refined post between its two versions, so either can be published."""
    return service.swap_post_versions(post_id=post_id, current_user_id=current_user_id)


@router.post("/{post_id}/regenerate", response_model=PostGenerateResponse)
def regenerate_post(
    post_id: str,
    payload: PostRegenerateRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> PostGenerateResponse:
    _require_onboarding(current_user_id)
    refuse_guest(current_user_id, "edit")
    return service.regenerate_from_snapshot(
        source_post_id=post_id,
        current_user_id=current_user_id,
        payload=payload,
    )


@router.get("/", response_model=list[PostResponse])
def list_posts(
    user_id: str | None = Query(default=None),
    news_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    current_user_id: str = Depends(get_current_user_id),
) -> list[PostResponse]:
    if user_id and user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot list posts for another user.")
    user_filter = user_id or current_user_id
    return service.list(user_id=user_filter, news_id=news_id, status_filter=status, limit=limit, skip=skip)


@router.get("/dashboard", response_model=list[PostsDashboardItem])
def posts_dashboard(
    user_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    current_user_id: str = Depends(get_current_user_id),
) -> list[PostsDashboardItem]:
    if user_id and user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view dashboard for another user.")
    return service.dashboard(user_id=(user_id or current_user_id), limit=limit)

@router.get("/semrag/grounding")
def get_semrag_grounding(
    query: str = Query(..., min_length=2),
    current_user_id: str = Depends(get_current_user_id),
) -> dict:
    """Query Memgraph Cloud Knowledge Graph for authentic Ambedkar writings, entities, and citations."""
    from backend.semrag.memgraph_retriever import query_semrag

    return query_semrag(query, top_chunks=6)


@router.get("/warm")
def warm_generator(current_user_id: str = Depends(get_current_user_id)) -> dict:
    """Load the retrieval stack into this container ahead of a generate.

    A container's first generate used to download ~200 MB of artifacts and
    load them before writing anything: ~40 s, past the API gateway's 30 s, so
    the browser got a 503 while the post was still being written. The
    generator page calls this when it opens, so the loading happens while the
    user is choosing a story. (A background thread at startup cannot do it:
    Lambda freezes the process as soon as a response is sent.)
    """
    import time

    from backend.core.config import settings
    from backend.pipeline_cli import ensure_rag_stack

    started = time.perf_counter()
    ensure_rag_stack(settings)
    return {"ready": True, "ms": round((time.perf_counter() - started) * 1000)}


@router.get("/{post_id}", response_model=PostResponse)
def get_post(post_id: str, current_user_id: str = Depends(get_current_user_id)) -> PostResponse:
    post = service.get(post_id)
    if _owner_id(post) != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access another user's post.")
    return post


@router.patch("/{post_id}", response_model=PostResponse)
def update_post(post_id: str, payload: PostUpdateRequest, current_user_id: str = Depends(get_current_user_id)) -> PostResponse:
    existing = service.get(post_id)
    if _owner_id(existing) != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot update another user's post.")
    # Publishing is marking the post published; a guest account cannot.
    if payload.status == "published":
        refuse_guest(current_user_id, "publish")
    return service.update(post_id, payload, current_user_id=current_user_id)


@router.post("/{post_id}/publish/reddit", response_model=PublicationResponse)
def publish_post_to_reddit(
    post_id: str,
    payload: PublishToRedditRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> PublicationResponse:
    """Post this to our subreddit under the user's own connected account."""
    existing = service.get(post_id)
    if _owner_id(existing) != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot publish another user's post.")
    refuse_guest(current_user_id, "publish")
    publication = service.publish_to_reddit(
        post_id, current_user_id, title=payload.title, body=payload.body
    )
    return PublicationResponse(**publication)


@router.delete("/{post_id}", response_model=MessageResponse)
def archive_post(post_id: str, current_user_id: str = Depends(get_current_user_id)) -> MessageResponse:
    existing = service.get(post_id)
    if _owner_id(existing) != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot archive another user's post.")
    result = service.archive(post_id)
    return MessageResponse(**result)
