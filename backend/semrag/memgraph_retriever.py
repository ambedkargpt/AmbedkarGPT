"""
Memgraph Cloud Knowledge Graph Retriever for Ambedkar SemRAG.

Queries live Memgraph instance for:
- Entities & Relational Triples
- Verbatim Book Chunks from Dr. B.R. Ambedkar's Writings & Speeches (Vol 1 & 2)
- Community Thematic Summaries
"""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# The book passages and their page references come only from Memgraph. Without a working
# connection BheemBot answers from its older transcript search and shows no book references,
# so the connection is configured, bounded and observable (see memgraph_status).
#
# Settings are read when the connection is made, not when this module is imported: a .env
# loaded after the import, or a Lambda environment variable, is still seen. NEO4J_* names are
# accepted as aliases because Ambedkar-SemRAG itself uses them.
CONNECT_TIMEOUT_S = 8     # per attempt; two attempts at most, well inside Lambda's 60 s
RETRY_COOLDOWN_S = 60     # after a failure, requests skip Memgraph instead of each waiting on it

_DRIVER = None
_RETRY_AFTER = 0.0        # time.monotonic() before which a failed connection is not retried
_LAST_ERROR = ""          # short fixed phrase, safe to show on the health endpoint
_WARNED_UNCONFIGURED = False


def _setting(*names: str) -> str:
    for name in names:
        value = (os.getenv(name) or "").strip()
        if value:
            return value
    return ""


def _connection_settings() -> Tuple[str, str, str]:
    return (
        _setting("MEMGRAPH_URI", "NEO4J_URI"),
        _setting("MEMGRAPH_USERNAME", "NEO4J_USERNAME"),
        _setting("MEMGRAPH_PASSWORD", "NEO4J_PASSWORD"),
    )


def _close_quietly(driver) -> None:
    try:
        driver.close()
    except Exception:
        pass


def get_memgraph_driver(uri: Optional[str] = None, user: Optional[str] = None, password: Optional[str] = None):
    """Obtain or reuse a thread-safe driver for Memgraph Cloud; None when it cannot be reached."""
    global _DRIVER, _RETRY_AFTER, _LAST_ERROR, _WARNED_UNCONFIGURED
    if _DRIVER is not None:
        return _DRIVER

    cfg_uri, cfg_user, cfg_pwd = _connection_settings()
    target_uri = uri or cfg_uri
    target_user = user or cfg_user
    target_pwd = password or cfg_pwd

    if not target_uri:
        _LAST_ERROR = "MEMGRAPH_URI is not set"
        if not _WARNED_UNCONFIGURED:
            _WARNED_UNCONFIGURED = True
            logger.error(
                "Memgraph is not configured (MEMGRAPH_URI is empty): answers will have no book "
                "references. Set MEMGRAPH_URI, MEMGRAPH_USERNAME and MEMGRAPH_PASSWORD in the "
                "environment (backend/.env locally, the function's environment variables on Lambda)."
            )
        return None

    if time.monotonic() < _RETRY_AFTER:
        return None  # failed a moment ago; do not make every request wait on it again

    try:
        from neo4j import GraphDatabase
    except ImportError:
        _LAST_ERROR = "the neo4j package is not installed"
        logger.error("Memgraph unavailable: the neo4j package is not installed")
        return None

    auth = (target_user, target_pwd) if (target_user or target_pwd) else None

    # Memgraph Cloud presents a self-signed certificate on some hosts: try the verified
    # scheme first, then the same address accepting a self-signed certificate.
    attempts = [target_uri]
    if "bolt+s://" in target_uri:
        attempts.append(target_uri.replace("bolt+s://", "bolt+ssc://"))
    elif "neo4j+s://" in target_uri:
        attempts.append(target_uri.replace("neo4j+s://", "neo4j+ssc://"))

    last_exc: Optional[Exception] = None
    for attempt_uri in attempts:
        driver = None
        try:
            driver = GraphDatabase.driver(attempt_uri, auth=auth, connection_timeout=CONNECT_TIMEOUT_S)
            driver.verify_connectivity()
            _DRIVER = driver
            _LAST_ERROR = ""
            return _DRIVER
        except Exception as exc:
            last_exc = exc
            if driver is not None:
                _close_quietly(driver)
            logger.info("Memgraph connection attempt failed (%s): %s", attempt_uri.split("://")[0], exc)

    _RETRY_AFTER = time.monotonic() + RETRY_COOLDOWN_S
    _LAST_ERROR = "could not connect, or the credentials were rejected"
    logger.error(
        "Failed to connect to Memgraph (%s); answers will have no book references. Not retrying for %ds.",
        type(last_exc).__name__, RETRY_COOLDOWN_S,
    )
    return None


def memgraph_status() -> Dict[str, Any]:
    """Whether book references are available - booleans and a short reason only.

    Never includes the address, the username or the error text, because it backs an
    unauthenticated health endpoint. It reuses the outcome of the last attempt (and the
    cooldown above), so polling it cannot hammer the database.
    """
    uri, user, pwd = _connection_settings()
    if not uri:
        return {"configured": False, "credentials_set": False, "connected": False,
                "reason": "MEMGRAPH_URI is not set"}
    connected = get_memgraph_driver() is not None
    return {
        "configured": True,
        "credentials_set": bool(user and pwd),
        "connected": connected,
        "reason": "" if connected else (_LAST_ERROR or "not connected"),
    }


STOP_WORDS = {
    "what", "is", "the", "of", "in", "and", "a", "to", "how", "did", "dr",
    "ambedkar", "ambedkar's", "babasaheb", "bhimrao", "view", "views", "critique", "think",
    "thought", "perspective", "about", "for", "on", "with", "by", "his", "their",
    "are", "does", "why", "who", "which", "was", "were", "when", "where", "can",
    "you", "tell", "me", "explain", "give", "some", "according", "opinion",
    "say", "said", "says", "speak", "spoke", "talk", "mention", "mentioned", "regarding",
    "from", "that", "this", "has", "have", "had", "any", "all", "into", "between",
    "than", "then", "there", "would", "could", "should", "also", "like", "its", "your",
    "not", "but", "more", "most", "does", "do", "wrote", "write", "bheem", "bot",
}


def extract_keywords(query: str) -> List[str]:
    """Extract key topical words from user question."""
    words: List[str] = []
    for raw in query.split():
        clean = raw.strip("?,.!'\"()[]{}<>").lower()
        if clean.endswith("'s"):
            clean = clean[:-2]
        if clean and len(clean) > 2 and clean not in STOP_WORDS:
            words.append(clean)
    return words


def query_semrag(
    query: str,
    top_chunks: int = 5,
    volume: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Search Memgraph for entities, relationships, verbatim chunks, and community summaries.
    """
    driver = get_memgraph_driver()
    if driver is None:
        return {
            "entities": [],
            "relationships": [],
            "chunks": [],
            "community_summaries": [],
            "formatted_context": "",
            "sources": [],
        }

    keywords = extract_keywords(query)
    q_lower = query.lower()
    explicit_ambedkar = any(k in q_lower for k in ["ambedkar", "babasaheb", "bhimrao"])

    with driver.session() as session:
        # 1. Match Entities
        entity_matches: List[Dict[str, Any]] = []
        seen_entity_ids = set()

        for kw in keywords:
            cypher_entities = """
            MATCH (e:Entity)
            WHERE ((' ' + toLower(e.name) + ' ') CONTAINS (' ' + $kw + ' ')
                   OR (' ' + toLower(e.name) + ' ') CONTAINS (' ' + $kw + 's '))
              AND ($volume IS NULL OR e.volume = $volume)
            RETURN e.entity_id AS id, e.name AS name, e.entity_type AS type, e.volume AS volume,
                   e.description AS desc, e.frequency AS freq,
                   CASE WHEN toLower(e.name) = $kw THEN 0 ELSE 1 END AS exact_rank
            ORDER BY exact_rank ASC, e.frequency DESC
            LIMIT 10
            """
            rows = session.run(cypher_entities, {"kw": kw, "volume": volume}).data()
            for r in rows:
                if r["id"] not in seen_entity_ids:
                    seen_entity_ids.add(r["id"])
                    r["kw_hits"] = 1
                    entity_matches.append(r)
                else:
                    for m in entity_matches:
                        if m["id"] == r["id"]:
                            m["kw_hits"] += 1

        entity_matches.sort(key=lambda e: (-e.get("kw_hits", 0), e.get("exact_rank", 1), -(e.get("freq") or 0)))
        top_entities = entity_matches[:8]
        entity_ids = [e["id"] for e in top_entities]

        # General fallback if no entities matched
        if not entity_ids and explicit_ambedkar:
            cypher_fallback_ent = """
            MATCH (e:Entity)
            WHERE (e.name CONTAINS 'Ambedkar' OR e.name CONTAINS 'Caste' OR e.name CONTAINS 'Constitution')
              AND ($volume IS NULL OR e.volume = $volume)
            RETURN e.entity_id AS id, e.name AS name, e.entity_type AS type, e.volume AS volume,
                   e.description AS desc, e.frequency AS freq
            ORDER BY e.frequency DESC
            LIMIT 5
            """
            top_entities = session.run(cypher_fallback_ent, {"volume": volume}).data()
            entity_ids = [e["id"] for e in top_entities]

        # 2. Relational Edges
        triples: List[Dict[str, Any]] = []
        if entity_ids:
            cypher_triples = """
            MATCH (e1:Entity)-[r:RELATES_TO]->(e2:Entity)
            WHERE (e1.entity_id IN $ids OR e2.entity_id IN $ids)
              AND ($volume IS NULL OR e1.volume = $volume)
            RETURN e1.name AS source,
                   head(coalesce(r.relationships, ['RELATES_TO'])) AS relation,
                   e2.name AS target,
                   coalesce(r.description, '') AS description
            LIMIT 15
            """
            triples = session.run(cypher_triples, {"ids": entity_ids, "volume": volume}).data()

        # 3. Verbatim Source Chunks
        chunks: List[Dict[str, Any]] = []
        if entity_ids:
            cypher_chunks = """
            MATCH (ch:Chunk)-[:MENTIONS]->(e:Entity)
            WHERE e.entity_id IN $ids
              AND ($volume IS NULL OR ch.volume = $volume)
              AND coalesce(ch.low_quality, false) = false
            RETURN ch.chunk_id AS chunk_id, ch.text AS text, ch.volume AS volume,
                   count(DISTINCT e) AS hits, collect(DISTINCT e.name)[0] AS matched_entity
            ORDER BY hits DESC
            LIMIT $limit
            """
            chunks = session.run(cypher_chunks, {"ids": entity_ids, "volume": volume, "limit": top_chunks * 2}).data()
        elif keywords:
            # Fallback text search across chunks
            cypher_text_chunks = """
            MATCH (ch:Chunk)
            WHERE toLower(ch.text) CONTAINS $kw
              AND ($volume IS NULL OR ch.volume = $volume)
            RETURN ch.chunk_id AS chunk_id, ch.text AS text, ch.volume AS volume,
                   1 AS hits, $kw AS matched_entity
            LIMIT $limit
            """
            chunks = session.run(cypher_text_chunks, {"kw": keywords[0], "volume": volume, "limit": top_chunks}).data()

        # 4. Community Summaries
        communities: List[Dict[str, Any]] = []
        if top_entities:
            comm_ids = list({e.get("community_id") for e in top_entities if e.get("community_id") is not None})
            if comm_ids:
                cypher_comm = """
                MATCH (c:Community)
                WHERE c.community_id IN $cids AND c.summary <> ''
                RETURN c.community_id AS id, c.summary AS summary, c.volume AS volume
                LIMIT 3
                """
                communities = session.run(cypher_comm, {"cids": comm_ids}).data()

        if not communities:
            cypher_comm_fallback = """
            MATCH (c:Community)
            WHERE c.summary <> '' AND ($volume IS NULL OR c.volume = $volume)
            RETURN c.community_id AS id, c.summary AS summary, c.volume AS volume
            LIMIT 2
            """
            communities = session.run(cypher_comm_fallback, {"volume": volume}).data()

        return {
            "entities": top_entities,
            "triples": triples,
            "chunks": chunks[:top_chunks],
            "communities": communities,
        }


def retrieve_semrag_context(query: str, top_k: int = 5) -> Tuple[str, List[Dict[str, str]]]:
    """
    High-level entry point for BheemBot.
    Returns:
      (context_string_for_prompt, list_of_sources_for_ui)

    Both are reader-facing: passages are labelled by book, volume and printed page, never by
    internal chunk id, so neither the model nor the source pills can show one to a user.
    Knowledge-graph triples are not passed to the model: they are internal, sometimes noisy,
    and invite answers that talk about "the knowledge graph" instead of Dr. Ambedkar's words.
    """
    from backend.semrag.presentation import book_link, clean_passage, excerpt, pill_label, reference

    try:
        data = query_semrag(query, top_chunks=top_k)
    except Exception as exc:
        logger.warning("SemRAG retrieval encountered error: %s", exc)
        return "", []

    chunks = [c for c in data.get("chunks", []) if clean_passage(c.get("text") or "")]
    communities = data.get("communities", [])

    if not chunks:
        return "", []

    # Numbered so the model can report, on a hidden last line, which material it used; the
    # number is never shown to a reader (see presentation.split_sources_line).
    parts: List[str] = []
    for n, c in enumerate(chunks, 1):
        ref = reference(c.get("chunk_id"), c.get("volume"))
        parts.append(f"[{n}] From {ref}:\n{clean_passage(c.get('text') or '')}")

    if communities:
        notes = [c.get("summary") for c in communities if c.get("summary")]
        if notes:
            parts.append(
                "Background notes (editorial summaries, NOT Dr. Ambedkar's words - use only to "
                "understand the topic, never quote or cite them):\n" + "\n".join(f"- {n}" for n in notes)
            )

    context_str = "\n\n".join(parts)

    sources: List[Dict[str, Any]] = []
    by_title: Dict[str, Dict[str, Any]] = {}
    for n, c in enumerate(chunks, 1):
        title = pill_label(c.get("chunk_id"), c.get("volume"))
        if title in by_title:  # two passages on the same page share one pill
            by_title[title]["_passages"].append(n)
            continue
        by_title[title] = {
            "video_title": title,  # the frontend renders 'video_title' in the BookOpen pill
            "snippet": f"{reference(c.get('chunk_id'), c.get('volume'))}: \u201c{excerpt(c.get('text') or '')}\u201d",
            "url": book_link(c.get("chunk_id"), c.get("volume")),  # opens the scanned page
            "_passages": [n],      # internal: which numbered material this pill stands for
        }
        sources.append(by_title[title])

    return context_str, sources
