"""
A visit to the website, sent once per browser tab by the app (see
frontend/src/analytics/visitBeacon.js), for the twice-daily report: where people
come from (the address, and the page that sent them, such as Instagram).

The body is JSON sent as text/plain: navigator.sendBeacon can send that across
origins without a preflight. Nothing is returned that the page needs.
"""
import json
import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Request, Response, status

from backend.services.activity_service import client_ip, record

router = APIRouter(prefix="/track", tags=["track"])

# A visit is one per tab; more than this from one address in a minute is not
# people arriving from a link.
_WINDOW, _LIMIT = 60, 20
_seen: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def _allowed(ip: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _seen[ip] if now - t < _WINDOW]
        if len(recent) >= _LIMIT:
            _seen[ip] = recent
            return False
        recent.append(now)
        _seen[ip] = recent
        return True


@router.post("/visit", status_code=status.HTTP_204_NO_CONTENT)
async def visit(request: Request) -> Response:
    if _allowed(client_ip(request)):
        try:
            body = json.loads((await request.body())[:4000] or b"{}")
            if not isinstance(body, dict):
                body = {}
        except ValueError:
            body = {}
        extra = {k: body.get(k) for k in ("path", "referrer", "utm_source", "utm_medium", "utm_campaign", "lang")}
        record("visit", request, None, extra)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
