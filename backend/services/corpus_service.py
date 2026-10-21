"""
Contributions to the Dalit corpus: books, speeches, songs, writing.

Two calls from the landing page's contribute form:

1. ``upload_target`` hands the browser a presigned S3 POST for one file, under
   ``corpus-contributions/YYYY/MM/<id>/``. The browser uploads straight to the
   bucket: a book is usually bigger than the 10 MB the API gateway accepts in
   one request, and passing it through Lambda would cost memory for nothing.
   The size limit and the key are written into the signed policy, so S3 itself
   refuses anything larger or anywhere else.
2. ``record`` checks the file really arrived under a key this API issued,
   stores the submission in ``corpus_contributions`` and emails the team.

Nothing is published from here; a person reviews each contribution.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status

from backend.schemas.contact import (CorpusContributionRequest, CorpusUploadRequest,
                                     CorpusUploadResponse)

logger = logging.getLogger(__name__)

PREFIX = "corpus-contributions/"
MAX_BYTES = 200 * 1024 * 1024          # a scanned book runs to tens of MB; 200 leaves room
UPLOAD_SECONDS = 30 * 60
ALLOWED_EXTENSIONS = {
    "pdf", "epub", "doc", "docx", "txt", "rtf", "odt",
    "jpg", "jpeg", "png", "tif", "tiff",
    "mp3", "wav", "m4a", "ogg", "mp4", "zip",
}


def _bucket() -> str:
    bucket = (os.getenv("S3_BUCKET") or "").strip()
    if not bucket:
        logger.error("[corpus] S3_BUCKET is not set; cannot take uploads")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Uploads are not available right now. Please email us instead.")
    return bucket


def _s3():
    import boto3

    return boto3.client("s3", region_name=os.getenv("AWS_REGION", "ap-south-1"))


def _safe_name(filename: str) -> str:
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^\w.\- ]+", "", base, flags=re.UNICODE).strip().replace(" ", "_")
    return base[:120] or "file"


def upload_target(payload: CorpusUploadRequest) -> CorpusUploadResponse:
    name = _safe_name(payload.filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="This file type is not accepted. Send a PDF, EPUB, Word, text, image or audio file.")
    if payload.size > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="The file is larger than 200 MB. Please email us and we will arrange it.")

    now = datetime.now(timezone.utc)
    key = f"{PREFIX}{now:%Y/%m}/{uuid.uuid4().hex}/{name}"
    content_type = payload.content_type or "application/octet-stream"
    post = _s3().generate_presigned_post(
        Bucket=_bucket(),
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, MAX_BYTES]],
        ExpiresIn=UPLOAD_SECONDS,
    )
    return CorpusUploadResponse(url=post["url"], fields=post["fields"], key=key, max_bytes=MAX_BYTES)


def record(payload: CorpusContributionRequest) -> None:
    from backend.services.contact_service import deliver

    if payload.website:                       # honeypot: a bot filled the hidden field
        logger.info("[corpus] honeypot filled, dropping submission from %s", payload.email)
        return
    if not payload.rights_confirmed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Please confirm you have the right to share this material.")
    if not payload.file_key.startswith(PREFIX) or ".." in payload.file_key:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown upload.")

    bucket = _bucket()
    try:
        head = _s3().head_object(Bucket=bucket, Key=payload.file_key)
    except Exception as exc:  # noqa: BLE001 - missing or not ours: either way, not received
        logger.warning("[corpus] upload not found: %s (%s)", payload.file_key, exc)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="The file did not arrive. Please upload it again.") from exc
    size = int(head.get("ContentLength") or 0)

    doc = {
        "name": payload.name.strip(),
        "email": str(payload.email),
        "phone": (payload.phone or "").strip() or None,
        "title": payload.title.strip(),
        "author": (payload.author or "").strip() or None,
        "language": (payload.language or "").strip() or None,
        "description": (payload.description or "").strip() or None,
        "file": {"bucket": bucket, "key": payload.file_key, "name": payload.file_name, "size": size},
        "status": "received",
        "created_at": datetime.now(timezone.utc),
    }
    try:
        from backend.db.mongo import db

        db["corpus_contributions"].insert_one(doc)
    except Exception as exc:  # noqa: BLE001 - the email below still tells the team
        logger.error("[corpus] could not store the submission: %s", exc)

    body = "\n".join([
        "A contribution to the Dalit corpus arrived through the website.",
        "",
        f"Name:        {doc['name']}",
        f"Email:       {doc['email']}",
        f"Phone:       {doc['phone'] or '-'}",
        f"Title:       {doc['title']}",
        f"Author:      {doc['author'] or '-'}",
        f"Language:    {doc['language'] or '-'}",
        f"File:        {payload.file_name} ({size / 1024 / 1024:.1f} MB)",
        f"Stored at:   s3://{bucket}/{payload.file_key}",
        "",
        "About the material:",
        doc["description"] or "-",
    ])
    deliver(f"Corpus contribution: {doc['title'][:80]}", body, doc["email"])
    logger.info("[corpus] contribution %r from %s stored at %s", doc["title"], doc["email"], payload.file_key)
