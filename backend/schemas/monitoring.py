from typing import Literal, Optional

from pydantic import BaseModel, Field


class ClientErrorReport(BaseModel):
    """One error caught in the browser. Sizes are capped because this endpoint is public."""

    message: str = Field(min_length=1, max_length=2000)
    stack: Optional[str] = Field(default=None, max_length=8000)
    component_stack: Optional[str] = Field(default=None, max_length=4000)
    page: Optional[str] = Field(default=None, max_length=500)
    user_agent: Optional[str] = Field(default=None, max_length=300)
    # Where the browser caught it: "window-error", "unhandled-rejection",
    # "react", or "api" for an API call that failed.
    kind: Optional[str] = Field(default=None, max_length=40)

    # Only for kind="api": the call that failed.
    method: Optional[str] = Field(default=None, max_length=10)
    api_path: Optional[str] = Field(default=None, max_length=300)
    status: Optional[int] = Field(default=None, ge=0, le=599)
    duration_ms: Optional[int] = Field(default=None, ge=0, le=10 * 60 * 1000)
    request_id: Optional[str] = Field(default=None, max_length=100)


class ErrorStatusUpdate(BaseModel):
    status: Literal["open", "resolved"]
