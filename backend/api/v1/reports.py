"""
The twice-daily activity report (see services/report_service.py).

Called by the scheduler (.github/workflows/daily-report.yml) at 6 pm and at
midnight, India time, with the shared secret in X-Report-Token. With
dry_run=true it returns the counts and sends nothing, for checking by hand.
"""
import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Query, status

from backend.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/send")
def send_report(
    dry_run: bool = Query(default=False),
    x_report_token: str | None = Header(default=None),
) -> dict:
    expected = (os.getenv("REPORT_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Reports are not configured.")
    if not x_report_token or not hmac.compare_digest(x_report_token.strip(), expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")

    import backend.db.mongo as mongo

    data = report_service.gather(mongo.db, report_service.report_window())
    out = report_service.summary(data)
    if dry_run:
        return {**out, "sent_to": []}
    try:
        out["sent_to"] = report_service.send(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Report not sent: {exc}") from exc
    return out
