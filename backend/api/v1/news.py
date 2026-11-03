from fastapi import APIRouter, Depends, Query

from backend.core.dependencies import get_current_user_id
from backend.schemas.news import NewsCreateRequest, NewsResponse, NewsUpdateRequest
from backend.services.news_service import NewsService


router = APIRouter(prefix="/news", tags=["news"])
service = NewsService()


@router.post("/", response_model=NewsResponse)
def create_news(payload: NewsCreateRequest, _: str = Depends(get_current_user_id)) -> NewsResponse:
    return service.create(payload)


@router.get("/tenants")
def list_tenants() -> dict:
    """Tenant registry for the client's party selector."""
    from backend.tenants import load_tenants

    return {
        "tenants": [
            {
                "tenant_id": t.tenant_id,
                "slug": t.slug,
                "name": t.name,
                "is_general": t.is_general,
                "is_opposition": t.is_opposition,
            }
            for t in load_tenants()
        ]
    }


@router.get("/", response_model=list[NewsResponse])
def list_news(
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
    include_summary: bool = Query(default=True),
    language: str | None = Query(default=None),
    tenant: str | None = Query(
        default=None,
        description="Party tenant id or slug. Omit for all news.",
    ),
    include_general: bool = Query(
        default=True,
        description="When a tenant is given, also include general (neutral) news.",
    ),
    include_opposition: bool = Query(
        default=True,
        description="When a tenant is given, also include the opposition's (BJP) own news.",
    ),
    scope: str = Query(
        default="national",
        pattern="^(national|state|city|all)$",
        description="Level of politics: national (the default, and every story "
        "published before scopes existed), state, city, or all.",
    ),
) -> list[NewsResponse]:
    return service.list(
        limit=limit,
        skip=skip,
        include_summary=include_summary,
        language=language,
        tenant=tenant,
        include_general=include_general,
        include_opposition=include_opposition,
        scope=None if scope == "all" else scope,
    )


@router.get("/by-news-id/{news_id}", response_model=NewsResponse)
def get_news_by_custom_news_id(news_id: str) -> NewsResponse:
    return service.get_by_custom_news_id(news_id)


@router.get("/{news_id}", response_model=NewsResponse)
def get_news(news_id: str) -> NewsResponse:
    return service.get(news_id)


@router.patch("/{news_id}", response_model=NewsResponse)
def update_news(news_id: str, payload: NewsUpdateRequest, _: str = Depends(get_current_user_id)) -> NewsResponse:
    return service.update(news_id, payload)
