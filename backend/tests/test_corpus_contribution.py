"""Corpus contributions: the upload is signed for our prefix only, and a
submission is accepted only for a file that actually arrived."""
import pytest
from fastapi import HTTPException

from backend.schemas.contact import CorpusContributionRequest, CorpusUploadRequest
from backend.services import corpus_service


class _FakeS3:
    def __init__(self, existing=()):
        self.existing = set(existing)
        self.posts = []

    def generate_presigned_post(self, Bucket, Key, Fields, Conditions, ExpiresIn):
        self.posts.append({"Bucket": Bucket, "Key": Key, "Conditions": Conditions})
        return {"url": f"https://{Bucket}.s3.amazonaws.com/", "fields": {"key": Key, **Fields}}

    def head_object(self, Bucket, Key):
        if Key not in self.existing:
            raise RuntimeError("404")
        return {"ContentLength": 5 * 1024 * 1024}


@pytest.fixture
def s3(monkeypatch):
    fake = _FakeS3()
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    monkeypatch.setattr(corpus_service, "_s3", lambda: fake)
    return fake


def test_upload_is_signed_under_the_prefix_with_a_size_limit(s3):
    out = corpus_service.upload_target(
        CorpusUploadRequest(filename="../Annihilation of Caste.pdf", content_type="application/pdf", size=1000))
    assert out.key.startswith("corpus-contributions/") and out.key.endswith("/Annihilation_of_Caste.pdf")
    assert ".." not in out.key
    assert ["content-length-range", 1, corpus_service.MAX_BYTES] in s3.posts[0]["Conditions"]


@pytest.mark.parametrize("name,size,code", [("virus.exe", 10, 422), ("book.pdf", 300 * 1024 * 1024, 413)])
def test_unsuitable_files_are_refused(s3, name, size, code):
    with pytest.raises(HTTPException) as err:
        corpus_service.upload_target(CorpusUploadRequest(filename=name, size=size))
    assert err.value.status_code == code


def _contribution(key, **over):
    data = dict(name="Test Person", email="t@example.com", title="A book", file_key=key,
                file_name="book.pdf", rights_confirmed=True)
    data.update(over)
    return CorpusContributionRequest(**data)


def test_a_file_that_never_arrived_is_refused(s3):
    with pytest.raises(HTTPException) as err:
        corpus_service.record(_contribution("corpus-contributions/2026/10/x/book.pdf"))
    assert err.value.status_code == 422


def test_a_key_outside_the_prefix_is_refused(s3):
    with pytest.raises(HTTPException):
        corpus_service.record(_contribution("artifacts/current/argument_chunks.json"))


def test_an_arrived_file_is_recorded_and_mailed(s3, monkeypatch):
    key = "corpus-contributions/2026/10/abc/book.pdf"
    s3.existing.add(key)
    sent = []
    from backend.services import contact_service

    monkeypatch.setattr(contact_service, "deliver", lambda subject, body, reply_to: sent.append((subject, body)))
    # Never the real database: a stand-in module whose collection keeps what it is given.
    import sys
    import types

    stored = []
    fake_db = types.ModuleType("backend.db.mongo")
    fake_db.db = {"corpus_contributions": types.SimpleNamespace(insert_one=stored.append)}
    monkeypatch.setitem(sys.modules, "backend.db.mongo", fake_db)

    corpus_service.record(_contribution(key))
    assert sent and "A book" in sent[0][0] and key in sent[0][1]
    assert stored and stored[0]["file"]["key"] == key and stored[0]["status"] == "received"


def test_rights_must_be_confirmed(s3):
    key = "corpus-contributions/2026/10/abc/book.pdf"
    s3.existing.add(key)
    with pytest.raises(HTTPException):
        corpus_service.record(_contribution(key, rights_confirmed=False))
