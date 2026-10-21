from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class ContactMessageRequest(BaseModel):
    """One submission from the landing page contact form."""

    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    message: str = Field(min_length=10, max_length=5000)
    address: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    # Hidden field. A person never sees it, so anything here came from a bot
    # filling every input on the page. Cheaper and quieter than a captcha.
    website: Optional[str] = Field(default=None, max_length=200)


class ContactMessageResponse(BaseModel):
    message: str


# ── Corpus contributions ────────────────────────────────────────────────────
# A book (or other material) offered for the Dalit corpus. The file goes
# straight from the browser to S3 with a presigned upload, because a book is
# usually larger than the 10 MB the API gateway accepts in one request; this
# API only hands out the upload and records the submission afterwards.

class CorpusUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(default="application/octet-stream", max_length=120)
    size: int = Field(gt=0)


class CorpusUploadResponse(BaseModel):
    url: str
    fields: dict
    key: str
    max_bytes: int


class CorpusContributionRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=40)
    title: str = Field(min_length=2, max_length=300)
    author: Optional[str] = Field(default=None, max_length=200)
    language: Optional[str] = Field(default=None, max_length=60)
    description: Optional[str] = Field(default=None, max_length=3000)
    rights_confirmed: bool = False
    file_key: str = Field(min_length=10, max_length=400)
    file_name: str = Field(min_length=1, max_length=200)
    website: Optional[str] = Field(default=None, max_length=200)   # honeypot
