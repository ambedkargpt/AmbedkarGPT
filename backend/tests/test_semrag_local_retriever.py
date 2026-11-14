"""Searching the book passages shipped with the backend: no database, honest about failure.

Uses a tiny synthetic bundle and a fake embedder, so nothing here calls an API or a database.
The last tests check the real shipped files are consistent.

    pytest backend/tests/test_semrag_local_retriever.py
"""

import gzip
import json

import numpy as np
import pytest

from backend.semrag import local_retriever as lr
from backend.semrag import memgraph_retriever as mr


def _unit(*xs):
    v = np.array(xs, dtype=np.float32)
    return v / np.linalg.norm(v)


def _bundle(rows):
    """rows: [(chunk_id, vector)] -> Bundle."""
    ids = [r[0] for r in rows]
    return lr.Bundle(
        ids=ids,
        volumes=np.array([int(i[1:i.index("_")]) for i in ids]),
        vectors=np.vstack([r[1] for r in rows]),
        passages={i: f"text of {i}" for i in ids},
        model="fake-model",
        dimension=len(rows[0][1]),
    )


@pytest.fixture
def fake_bundle(monkeypatch):
    def install(rows):
        monkeypatch.setattr(lr, "load_bundle", lambda: _bundle(rows))
    return install


def _embedder(vec):
    return lambda q, model, dim: _unit(*vec)


# ── search ─────────────────────────────────────────────────────────────────────

def test_best_matches_come_first_with_their_volume_and_text(fake_bundle):
    fake_bundle([("v1_chunk_0001", _unit(1, 0)), ("v2_chunk_0002", _unit(1, 0.2)), ("v1_chunk_0003", _unit(0, 1))])
    hits = lr.search("q", top_k=5, min_similarity=0.5, embed=_embedder((1, 0)))
    assert [h["chunk_id"] for h in hits] == ["v1_chunk_0001", "v2_chunk_0002"]
    assert hits[0]["volume"] == 1 and hits[0]["text"] == "text of v1_chunk_0001" and hits[0]["score"] == 1.0


def test_nothing_close_is_an_empty_list_not_a_failure(fake_bundle):
    fake_bundle([("v1_chunk_0001", _unit(0, 1))])
    assert lr.search("q", embed=_embedder((1, 0)), min_similarity=0.62) == []


def test_one_volume_cannot_take_every_slot(fake_bundle):
    # Volume 2 sits closer to the question throughout; Volume 1's best must still appear.
    rows = [(f"v2_chunk_{i:04d}", _unit(1, 0.01 * i)) for i in range(6)] + [("v1_chunk_0001", _unit(1, 0.5))]
    fake_bundle(rows)
    hits = lr.search("q", top_k=5, per_volume=3, min_similarity=0.5, embed=_embedder((1, 0)))
    assert len(hits) == 4                                  # 3 from volume 2 + the 1 from volume 1
    assert sum(h["volume"] == 2 for h in hits) == 3 and any(h["volume"] == 1 for h in hits)


def test_top_k_caps_the_result(fake_bundle):
    fake_bundle([(f"v{1 + i % 3}_chunk_{i:04d}", _unit(1, 0.01 * i)) for i in range(12)])
    assert len(lr.search("q", top_k=4, min_similarity=0.5, embed=_embedder((1, 0)))) == 4


# ── failure is reported as None, never as "nothing found" ──────────────────────

def test_missing_bundle_is_none(monkeypatch):
    monkeypatch.setattr(lr, "load_bundle", lambda: None)
    assert lr.search("q", embed=_embedder((1, 0))) is None


def test_embedding_failure_is_none(fake_bundle):
    fake_bundle([("v1_chunk_0001", _unit(1, 0))])

    def boom(q, model, dim):
        raise RuntimeError("quota exceeded")

    assert lr.search("q", embed=boom) is None


def test_blank_question_is_none(fake_bundle):
    fake_bundle([("v1_chunk_0001", _unit(1, 0))])
    assert lr.search("   ", embed=_embedder((1, 0))) is None


def test_damaged_bundle_loads_as_none(monkeypatch, tmp_path):
    (tmp_path / "passages.json.gz").write_bytes(b"not gzip")
    monkeypatch.setattr(lr, "PASSAGES_FILE", tmp_path / "passages.json.gz")
    monkeypatch.setattr(lr, "EMBEDDINGS_FILE", tmp_path / "embeddings.npz")
    lr.load_bundle.cache_clear()
    try:
        assert lr.load_bundle() is None
    finally:
        lr.load_bundle.cache_clear()


def test_mismatched_files_are_rejected(monkeypatch, tmp_path):
    with gzip.open(tmp_path / "passages.json.gz", "wt", encoding="utf-8") as f:
        json.dump({"v1_chunk_0001": "a"}, f)
    np.savez(tmp_path / "embeddings.npz", ids=np.array(["v1_chunk_0001", "v1_chunk_0002"]),
             vectors=np.zeros((2, 4), dtype=np.float16), model=np.array("m"), dimension=np.array(4))
    monkeypatch.setattr(lr, "PASSAGES_FILE", tmp_path / "passages.json.gz")
    monkeypatch.setattr(lr, "EMBEDDINGS_FILE", tmp_path / "embeddings.npz")
    lr.load_bundle.cache_clear()
    try:
        assert lr.load_bundle() is None          # a vector with no passage text
    finally:
        lr.load_bundle.cache_clear()


# ── how BheemBot uses it ───────────────────────────────────────────────────────

def test_context_and_pills_come_from_the_bundle_without_touching_memgraph(monkeypatch):
    hit = {"chunk_id": "v1_chunk_0215", "volume": 1, "text": "Caste is a notion, it is a state of the mind.", "score": 0.8}
    monkeypatch.setattr(lr, "search", lambda q, top_k=5, **kw: [hit])
    monkeypatch.setattr(mr, "query_semrag", lambda *a, **k: pytest.fail("Memgraph must not be used"))
    ctx, sources = mr.retrieve_semrag_context("what is caste?")
    assert "[1] From Annihilation of Caste, Vol. 1, p. 67:" in ctx and "state of the mind" in ctx
    assert "chunk" not in ctx.lower()
    assert sources[0]["url"].startswith("/book/1/82?p=67") and sources[0]["_passages"] == [1]


def test_nothing_close_says_so_instead_of_falling_back_to_transcripts(monkeypatch):
    monkeypatch.setattr(lr, "search", lambda q, top_k=5, **kw: [])
    monkeypatch.setattr(mr, "query_semrag", lambda *a, **k: pytest.fail("Memgraph must not be used"))
    ctx, sources = mr.retrieve_semrag_context("what is the capital of France?")
    assert ctx and "does not address it directly" in ctx and sources == []   # non-empty: chat.py will not fall back


def test_memgraph_is_the_fallback_only_when_the_search_cannot_run(monkeypatch):
    monkeypatch.setattr(lr, "search", lambda q, top_k=5, **kw: None)
    monkeypatch.setattr(mr, "query_semrag", lambda q, top_chunks=5: {
        "chunks": [{"chunk_id": "v1_chunk_0215", "volume": 1, "text": "Caste is a notion, it is a state of the mind."}],
        "communities": []})
    ctx, sources = mr.retrieve_semrag_context("what is caste?")
    assert "state of the mind" in ctx and sources


def test_nothing_at_all_still_returns_empty_so_the_older_search_can_run(monkeypatch):
    monkeypatch.setattr(lr, "search", lambda q, top_k=5, **kw: None)
    monkeypatch.setattr(mr, "query_semrag", lambda *a, **k: {"chunks": [], "communities": []})
    assert mr.retrieve_semrag_context("anything") == ("", [])


# ── the shipped files ──────────────────────────────────────────────────────────

def test_shipped_bundle_is_consistent():
    lr.load_bundle.cache_clear()
    b = lr.load_bundle()
    assert b is not None, "backend/semrag/data/passages.json.gz or embeddings.npz is missing"
    assert sorted(set(b.volumes.tolist())) == [1, 2, 3]
    assert len(b.ids) == len(set(b.ids)) == len(b.passages) == 3384
    assert b.dimension == 768 and b.vectors.shape == (3384, 768)
    assert np.allclose(np.linalg.norm(b.vectors, axis=1), 1.0, atol=5e-3)    # float16 rounding only


def test_every_shipped_passage_has_a_book_citation_and_a_page_to_open():
    from backend.semrag.presentation import citation

    b = lr.load_bundle()
    missing = [i for i, v in zip(b.ids, b.volumes) if not citation(i)["pdf_page"]]
    assert missing == []
    untitled = [i for i in b.ids if not citation(i)["work"]]
    assert len(untitled) <= 20, untitled[:5]      # only front matter before the first chapter lacks a title


def test_volume_three_passages_never_show_debris_from_the_print_shop():
    b = lr.load_bundle()
    dirty = [i for i, t in b.passages.items() if ".indd" in t or ">YS>" in t or "__ABBR_" in t]
    assert dirty == []


def test_a_passage_finds_itself_in_the_shipped_bundle():
    b = lr.load_bundle()
    i = b.ids.index("v3_chunk_0679")
    top = lr.search("x", embed=lambda q, m, d: b.vectors[i])[0]
    assert top["chunk_id"] == "v3_chunk_0679" and top["volume"] == 3
