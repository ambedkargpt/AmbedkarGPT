import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api.v1.auth import router as auth_router
from backend.api.v1.chat import router as chat_router
from backend.api.v1.contact import router as contact_router
from backend.api.v1.health import router as health_router
from backend.api.v1.integrations import router as integrations_router
from backend.api.v1.monitoring import router as monitoring_router
from backend.api.v1.news import router as news_router
from backend.api.v1.posts import router as posts_router
from backend.api.v1.profile import router as profile_router
from backend.api.v1.questions import router as questions_router
from backend.core.http import register_http_layer
from backend.core.request_context import track_requests
from backend.core.config import settings
from backend.db.indexes import ensure_auth_indexes, ensure_phase2_indexes, ensure_phase3_indexes
from backend.services.error_tracker import install_error_tracking
from backend.services.error_tracker import is_active as is_error_monitor_active

# Records errors for the admin Errors page (ERROR_TRACKING_ENABLED=true) and
# for Grafana (the three GRAFANA_LOKI_* settings). Does nothing when neither
# is set. See backend/services/error_tracker.py.
install_error_tracking()


def _warm_rag_cache() -> None:
    """Load FAISS + chunks + title embeddings into memory in the background
    so the first user request doesn't pay the ~40-50s cold-start cost."""
    try:
        from backend.pipeline_cli import ensure_rag_stack
        ensure_rag_stack(settings)
    except Exception as exc:
        # Non-fatal — first request will warm the cache instead
        import logging
        logging.getLogger(__name__).warning("RAG pre-warm failed: %s", exc)


# Guards the startup work so it happens once per process, whatever calls it.
#
# Under Gunicorn the lifespan runs once and this changes nothing. Under Mangum
# it runs on *every* invocation, so the thirty-three create_index calls below
# were round-tripping to Atlas on every single HTTP request: measured at 1.4s,
# which was most of what a warm request cost. The dashboard makes five calls,
# so a page load paid it five times over.
#
# A lock as well as a flag, because the pre-warm thread and a request can be
# inside here at once and two threads creating the same indexes is the race
# this is meant to end, not start.
_startup_done = False
_startup_lock = threading.Lock()


def _run_startup_once() -> None:
    global _startup_done
    if _startup_done:
        return
    with _startup_lock:
        if _startup_done:
            return
        try:
            ensure_auth_indexes()
            ensure_phase2_indexes()
            ensure_phase3_indexes()
        except Exception as exc:
            # Tolerated, so a request is not failed by an unreachable database -
            # but not latched: the flag stays unset and the next request tries
            # again. Latching it here would leave a container serving every
            # later request without indexes, with nothing to say so.
            import logging
            logging.getLogger(__name__).warning("MongoDB index creation skipped, will retry: %s", exc)
            return
        _startup_done = True
    # Pre-warm the RAG stack in the background so the first generate request is fast
    threading.Thread(target=_warm_rag_cache, daemon=True).start()


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    _run_startup_once()
    yield


app = FastAPI(title="AmbedkarGPT Backend", lifespan=app_lifespan)
register_http_layer(app)
# Records 5xx answers and slow requests (API Gateway 503s) for the admin
# Errors page. Only added when tracking is on, so with it off the request
# path is exactly what it was before. The Lambda reads its environment once
# at start-up, so changing the setting takes effect on the next deploy or
# configuration update.
if is_error_monitor_active():
    app.middleware("http")(track_requests)
app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(news_router, prefix="/api/v1")
app.include_router(questions_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(posts_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(contact_router, prefix="/api/v1")
app.include_router(integrations_router, prefix="/api/v1")
app.include_router(monitoring_router, prefix="/api/v1")
