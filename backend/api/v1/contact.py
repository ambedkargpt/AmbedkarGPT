from fastapi import APIRouter, status

from backend.schemas.contact import (ContactMessageRequest, ContactMessageResponse,
                                     CorpusContributionRequest, CorpusUploadRequest,
                                     CorpusUploadResponse)
from backend.services import corpus_service
from backend.services.contact_service import send_contact_message

router = APIRouter(prefix="/contact", tags=["contact"])


@router.post("", response_model=ContactMessageResponse, status_code=status.HTTP_200_OK)
def submit_contact_message(payload: ContactMessageRequest) -> ContactMessageResponse:
    """
    Accept a landing-page contact submission and email it on.

    Public by design: the form sits above the fold for people who do not have
    an account and are deciding whether to get one.
    """
    send_contact_message(payload)
    return ContactMessageResponse(message="Thanks. We have got your message and will be in touch.")


@router.post("/corpus/upload", response_model=CorpusUploadResponse)
def corpus_upload_target(payload: CorpusUploadRequest) -> CorpusUploadResponse:
    """A presigned S3 upload for one file offered to the corpus. Public, like the form."""
    return corpus_service.upload_target(payload)


@router.post("/corpus", response_model=ContactMessageResponse)
def submit_corpus_contribution(payload: CorpusContributionRequest) -> ContactMessageResponse:
    """Record a contribution whose file has been uploaded, and tell the team."""
    corpus_service.record(payload)
    return ContactMessageResponse(message="Thank you. We have received your contribution and will review it.")

