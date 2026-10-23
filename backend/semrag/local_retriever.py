"""Search Dr. Ambedkar's Writings and Speeches by meaning, from files shipped with the backend.

BheemBot used to read passages from Memgraph (a trial instance that can expire - when it did,
answers silently lost every book reference). The passages and their search vectors for all
volumes now ship inside the backend:

    data/passages.json.gz   {"v2_chunk_0268": "passage text", ...}
    data/embeddings.npz     ids, float16 vectors (rows normalised), embedding model, dimension

Both are written by Ambedkar-SemRAG (`python -m src.utils.export_bheembot_bundle`). A search is
one embedding call for the question plus a dot product over about 3,400 rows, so it needs no
database and no network beyond the embedding API. Searching by meaning alone found the right
passage as often as SemRAG's full hybrid search (recall@20 0.864 / 0.914 on the Volume 1 / 2
question sets).

`search` returns None when it cannot answer (bundle missing, embedding call failed) and [] when it
searched and nothing was close - callers must treat those differently.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Callable, Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent / "data"
PASSAGES_FILE = DATA_DIR / "passages.json.gz"
EMBEDDINGS_FILE = DATA_DIR / "embeddings.npz"

# A passage whose cosine similarity to the question is below this is treated as not about it.
# Calibrated on this bundle (2026-10-23): the best passage for SemRAG's 63 evaluation questions
# scored 0.712-0.864; for 20 off-topic questions ("capital of France", "tell me a joke", ...) it
# scored 0.514-0.615. 0.62 keeps all 63 and blocks all 20; it also keeps 95% of the 57 deliberately
# poor keyword-style prompts (down to 0.596). SemRAG's own 0.55 let 90% of the off-topic ones through.
MIN_SIMILARITY = 0.62
# One volume can sit closer to a question's wording throughout and take every slot, hiding the
# passage that answers it (SemRAG saw this with the Poona Pact). Each volume contributes at most
# this many of the final passages.
PER_VOLUME = 3
QUERY_MAX_CHARS = 1000      # an embedding is billed per token; a chat message needs no more
EMBED_TIMEOUT_MS = 8000     # a slow embedding call must not hold up the whole answer


@dataclass
class Bundle:
    ids: List[str]
    volumes: np.ndarray        # volume number of each row
    vectors: np.ndarray        # float32, rows normalised
    passages: Dict[str, str]
    model: str
    dimension: int


@lru_cache(maxsize=1)
def load_bundle() -> Optional[Bundle]:
    """Load the shipped files once per process; None (logged) if they are missing or damaged."""
    try:
        with gzip.open(PASSAGES_FILE, "rt", encoding="utf-8") as f:
            passages = json.load(f)
        with np.load(EMBEDDINGS_FILE, allow_pickle=False) as z:
            ids = [str(i) for i in z["ids"]]
            vectors = z["vectors"].astype(np.float32)
            model, dimension = str(z["model"]), int(z["dimension"])
        if len(ids) != vectors.shape[0] or vectors.shape[1] != dimension or not set(ids) <= passages.keys():
            raise ValueError("passages and vectors do not match")
        volumes = np.array([int(i[1:i.index("_")]) for i in ids])
    except Exception as exc:
        logger.error("Book passages are not available (%s): answers will have no book references "
                     "unless Memgraph is configured. Rebuild with Ambedkar-SemRAG's export_bheembot_bundle.", exc)
        return None
    logger.info("Loaded %d book passages from %d volumes", len(ids), len(set(volumes.tolist())))
    return Bundle(ids, volumes, vectors, passages, model, dimension)


_client = None
_client_lock = threading.Lock()


def _api_key() -> str:
    try:
        from backend.core.config import settings

        key = getattr(settings, "gemini_api_key", None)
    except Exception:
        key = None
    return key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def embed_query(query: str, model: str, dimension: int) -> np.ndarray:
    """Normalised embedding of a question, made the way the passages' vectors were."""
    global _client
    with _client_lock:
        if _client is None:
            from google import genai
            from google.genai import types

            key = _api_key()
            if not key:
                raise RuntimeError("no Gemini API key configured")
            _client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=EMBED_TIMEOUT_MS))
        client = _client
    resp = client.models.embed_content(
        model=model,
        contents=[{"parts": [{"text": query[:QUERY_MAX_CHARS]}]}],
        config={"output_dimensionality": dimension, "task_type": "RETRIEVAL_QUERY"},
    )
    v = np.array(resp.embeddings[0].values, dtype=np.float32)
    return v / max(float(np.linalg.norm(v)), 1e-9)


def search(
    query: str,
    top_k: int = 5,
    per_volume: int = PER_VOLUME,
    min_similarity: float = MIN_SIMILARITY,
    embed: Optional[Callable[[str, str, int], np.ndarray]] = None,
) -> Optional[List[dict]]:
    """Passages closest in meaning to `query`, best first: [{chunk_id, volume, text, score}].

    None means the search could not run; [] means it ran and nothing reached `min_similarity`.
    """
    bundle = load_bundle()
    if bundle is None or not query.strip():
        return None
    try:
        q = (embed or embed_query)(query, bundle.model, bundle.dimension)
    except Exception as exc:
        logger.warning("Could not embed the question, so no book search: %s", exc)
        return None
    # Rows and q are normalised, so this is cosine similarity. numpy 2.2 on macOS (Apple's
    # Accelerate) raises spurious divide/overflow/invalid warnings on float32 matrix products
    # while returning correct values (checked to 1e-7 against float64), so they are silenced here
    # and the result is verified instead.
    with np.errstate(all="ignore"):
        sims = bundle.vectors @ q
    if not np.isfinite(sims).all():
        logger.warning("Book search produced non-finite scores, so it was skipped")
        return None
    picked = []
    for volume in sorted(set(bundle.volumes.tolist())):
        rows = np.flatnonzero(bundle.volumes == volume)
        best = rows[np.argsort(sims[rows])[::-1][:per_volume]]
        picked.extend((float(sims[i]), int(i)) for i in best if sims[i] >= min_similarity)
    picked.sort(reverse=True)
    return [
        {"chunk_id": bundle.ids[i], "volume": int(bundle.volumes[i]), "text": bundle.passages[bundle.ids[i]], "score": round(s, 4)}
        for s, i in picked[:top_k]
    ]
