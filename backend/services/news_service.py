from __future__ import annotations

from fastapi import HTTPException, status

from backend.repositories.news_repo import NewsRepository
from backend.services.news_migration import normalize_source_url
from backend.schemas.news import NewsCreateRequest, NewsResponse, NewsUpdateRequest


class NewsService:
    def __init__(self) -> None:
        self.repo = NewsRepository()

    def create(self, payload: NewsCreateRequest) -> NewsResponse:
        data = payload.model_dump()
        if not data.get("summary"):
            data["summary"] = data.get("description")
        if not data.get("news_id"):
            data["news_id"] = self._next_news_id()
        if "language" in data:
            data["language"] = self._normalize_language(data.get("language"))
        if data.get("source_url"):
            data["source_url"] = normalize_source_url(data["source_url"])
        if self.repo.get_by_custom_news_id(data["news_id"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="news_id already exists.")
        if data.get("tags"):
            data["tags"] = sorted({t.strip().lower() for t in data["tags"] if t.strip()})
        doc = self.repo.create(data)
        return self._to_response(doc)

    def list(
        self,
        limit: int = 100,
        skip: int = 0,
        include_summary: bool = True,
        language: str | None = None,
        tenant: str | int | None = None,
        include_general: bool = True,
        include_opposition: bool = True,
    ) -> list[NewsResponse]:
        tenant_ids = self._resolve_tenant_ids(tenant, include_general, include_opposition)
        docs = self.repo.list(limit=limit, skip=skip, language=language, tenant_ids=tenant_ids)
        return [self._to_response(doc, include_summary=include_summary) for doc in docs]

    def count(
        self,
        language: str | None = None,
        tenant: str | int | None = None,
        include_general: bool = True,
        include_opposition: bool = True,
    ) -> int:
        return self.repo.count(
            language=language,
            tenant_ids=self._resolve_tenant_ids(tenant, include_general, include_opposition),
        )

    def _resolve_tenant_ids(
        self, tenant: str | int | None, include_general: bool, include_opposition: bool = True
    ) -> list[int] | None:
        """
        Map a tenant selector to the ids to query.

        None            -> no tenant filter (everything)
        party           -> that party, plus general and opposition news unless opted out
        """
        if tenant is None or tenant == "":
            return None
        from backend.tenants import general_tenant, get_tenant, opposition_tenant

        resolved = get_tenant(tenant)
        if resolved is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown tenant: {tenant}",
            )
        ids = {resolved.tenant_id}
        if include_general:
            ids.add(general_tenant().tenant_id)
        if include_opposition:
            # None until an opposition tenant (BJP) is registered.
            opp = opposition_tenant()
            if opp is not None:
                ids.add(opp.tenant_id)
        return sorted(ids)

    def get(self, news_id: str) -> NewsResponse:
        doc = self.repo.get_by_id(news_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News not found.")
        return self._to_response(doc)

    def get_by_custom_news_id(self, news_id: str) -> NewsResponse:
        doc = self.repo.get_by_custom_news_id(news_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News not found.")
        return self._to_response(doc)

    def update(self, news_id: str, payload: NewsUpdateRequest) -> NewsResponse:
        updates = payload.model_dump(exclude_unset=True)
        if "summary" not in updates and "description" in updates:
            updates["summary"] = updates["description"]
        if "language" in updates:
            updates["language"] = self._normalize_language(updates.get("language"))
        if "source_url" in updates and updates["source_url"]:
            updates["source_url"] = normalize_source_url(updates["source_url"])
        if "tags" in updates and updates["tags"] is not None:
            updates["tags"] = sorted({t.strip().lower() for t in updates["tags"] if t.strip()})
        doc = self.repo.update(news_id, updates)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="News not found.")
        return self._to_response(doc)

    def _to_response(self, doc: dict, include_summary: bool = True) -> NewsResponse:
        return NewsResponse(
            id=str(doc["_id"]),
            news_id=doc["news_id"],
            headline=doc["headline"],
            description=doc["description"],
            summary=(doc.get("summary") or doc["description"]) if include_summary else "",
            source_name=doc.get("source_name"),
            source_url=doc.get("source_url"),
            published_at=doc.get("published_at"),
            language=doc.get("language"),
            tags=doc.get("tags", []),
            embedding_ref=doc.get("embedding_ref"),
            # Pre-tenant documents default to general news.
            tenant_id=int(doc.get("tenant_id") or 0),
            tenant_slug=str(doc.get("tenant_slug") or "general"),
            content_type=str(doc.get("content_type") or "news"),
            legacy_source=doc.get("legacy_source"),
            original_sort_timestamp=doc.get("original_sort_timestamp"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    def _next_news_id(self) -> str:
        latest_news_id = self.repo.get_latest_news_id() if hasattr(self.repo, "get_latest_news_id") else None
        if not latest_news_id:
            return "news_000001"
        suffix = int(str(latest_news_id).split("_")[-1])
        return f"news_{suffix + 1:06d}"

    def _normalize_language(self, value: str | None) -> str | None:
        if not value:
            return None
        token = value.strip().lower()
        if token in {"en", "english"}:
            return "english"
        # Mongo text index language override does not support short codes like hi/mr.
        if token in {"hi", "hindi", "mr", "marathi"}:
            return None
        return token
