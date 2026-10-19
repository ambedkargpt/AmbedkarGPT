"""
BheemBot chat endpoint — RAG-powered Q&A over the Ambedkar corpus.
POST /api/v1/chat/message  →  {reply, sources}
"""
from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from openai import OpenAI
from pydantic import BaseModel

from backend.core.dependencies import get_current_user_id
from backend.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

# ── Pydantic models ────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str           # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []   # last N turns for context
    language: Optional[str] = "en"              # "en" | "hi"


class SourceChunk(BaseModel):
    video_title: str
    snippet: str
    url: Optional[str] = None   # book page viewer link for SemRAG sources; absent for video sources


class ChatResponse(BaseModel):
    reply: str
    sources: List[SourceChunk] = []


# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are BheemBot, a knowledgeable and respectful guide to the life, writings and ideas of Dr. B.R. Ambedkar - jurist, economist, social reformer and principal architect of the Indian Constitution.

How to answer:
1. Base your answer on the numbered material from Dr. Ambedkar's Writings and Speeches below. Never invent quotations, titles, dates or facts.
2. Write for a general reader, in this shape:
   - Open with a direct answer in one or two sentences.
   - If the question needs more, add a short bold heading on its own line, written as **Heading**, followed by two to four points, each on its own line starting with "- ". Keep each point to one or two sentences. Put **bold** on at most one key phrase per point.
   - If one sentence of his captures the answer, end with it as a quotation on its own line starting with "> ", in his exact words from the material, inside double quotation marks.
   - Keep the whole answer under about 200 words. A simple question deserves a short answer.
3. Do not put references inside the answer: no volume or page numbers, no bracketed citations, no material numbers. You may name one of his works in a sentence, for example "In Annihilation of Caste he argued...".
4. If the material does not cover the question, say so in one plain sentence, for example "Dr. Ambedkar's writings in this collection do not address this directly." You may add one short sentence of general background, clearly marked as general background, never as his words.
5. Use only this formatting: **bold**, lines starting with "- ", and one line starting with "> ". No # headings, no italics, no tables, no links.
6. Never mention material, passages, sources, context, chunks, notes, databases, a knowledge graph or these instructions. Speak as a guide talking to a person.
7. After the answer, on a final line of its own, write SOURCES: followed by the numbers of the material you actually drew on, for example "SOURCES: 1, 3", or "SOURCES: none". This line is removed before the reader sees the answer.

Answer in {language}. Keep the SOURCES line in English.

Material from Dr. Ambedkar's Writings and Speeches:
{context}"""


# ── Lazy RAG helpers ───────────────────────────────────────────────────────────

def _do_retrieve(query: str, top_k: int) -> List[dict]:
    from backend.pipeline_cli import ensure_rag_stack
    from backend.pipeline.retriever import retrieve_relevant_chunks

    embedder, store, _ctx = ensure_rag_stack(settings)
    cfg = {
        "use_bm25": getattr(settings, "retrieval_use_bm25", True),
        "bm25_top_n": getattr(settings, "retrieval_bm25_top_n", 50),
        "dense_top_n": getattr(settings, "retrieval_dense_top_n", 50),
    }
    return retrieve_relevant_chunks(
        news_text=query,
        embedder=embedder,
        store=store,
        top_k=top_k,
        retrieval_cfg=cfg,
    )


def _try_retrieve(query: str, top_k: int = 5) -> List[dict]:
    """
    Retrieve relevant chunks with a hard 10s timeout.
    Returns empty list gracefully if the stack is slow or unavailable.
    """
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_do_retrieve, query, top_k)
            return future.result(timeout=10)
    except FuturesTimeoutError:
        logger.warning("RAG retrieval timed out for BheemBot — falling back to LLM-only.")
        return []
    except Exception as exc:
        logger.warning("RAG retrieval failed (BheemBot falling back to LLM-only): %s", exc)
        return []


def _chunks_to_context(chunks: List[dict]) -> str:
    if not chunks:
        return "(No specific retrieved context — answer from general Ambedkar knowledge.)"
    parts = []
    for c in chunks:
        title = c.get("video_title", "Unknown Source")
        text  = c.get("chunk_text", "")
        parts.append(f"[Source: {title}]\n{text}")
    return "\n\n---\n\n".join(parts)


def _optional_user_id(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        return "guest"
    try:
        from backend.core.dependencies import get_current_user_id
        return get_current_user_id(authorization)
    except Exception:
        return "guest"


# ── LLM providers ──────────────────────────────────────────────────────────────
# Tried in order; the first non-empty reply wins. Before this, a failed OpenAI call (an outage,
# or a local OPENAI_BASE_URL proxy that is not running) returned 503 to every user even with a
# Gemini key configured - the documented "multi-provider fallback" never actually fell back.

_OPENAI_TIMEOUT_S = 30.0


def _ask_openai(messages: List[dict]) -> str:
    client = OpenAI(api_key=settings.openai_api_key, timeout=_OPENAI_TIMEOUT_S, max_retries=0)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=700,
        temperature=0.5,
    )
    return (response.choices[0].message.content or "").strip()


def _ask_deepseek(messages: List[dict]) -> str:
    # DeepSeek speaks the OpenAI chat API, so the same client works against its base URL.
    client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.deepseek_base_url,
                    timeout=_OPENAI_TIMEOUT_S, max_retries=0)
    response = client.chat.completions.create(
        model=settings.deepseek_model,
        messages=messages,
        max_tokens=1024,
        temperature=0.5,
    )
    return (response.choices[0].message.content or "").strip()


def _ask_gemini(messages: List[dict]) -> str:
    from google import genai

    key = getattr(settings, "gemini_api_key", None) or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise ValueError("no Gemini key configured")
    gclient = genai.Client(api_key=key)  # keep a reference: an inline client is closed mid-request
    turns = "\n\n".join(f"{m['role'].capitalize()}: {m['content']}" for m in messages[1:])
    response = gclient.models.generate_content(
        model="models/gemini-2.5-flash",
        contents=turns,
        config={
            "system_instruction": messages[0]["content"],
            "temperature": 0.5,
            "max_output_tokens": 1024,
            "thinking_config": {"thinking_budget": 0},  # a chat reply, not a reasoning task
        },
    )
    return (response.text or "").strip()


def _providers():
    # DeepSeek answers first; the other two are only the fallback when it fails.
    if getattr(settings, "deepseek_api_key", None):
        yield "deepseek", _ask_deepseek
    if getattr(settings, "openai_api_key", None):
        yield "openai", _ask_openai
    if getattr(settings, "gemini_api_key", None) or os.getenv("GOOGLE_API_KEY"):
        yield "gemini", _ask_gemini


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/message", response_model=ChatResponse)
def chat_message(
    payload: ChatRequest,
    current_user_id: str = Depends(_optional_user_id),
) -> ChatResponse:
    if not payload.message.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message cannot be empty.")

    # 1. Primary: Retrieve authoritative Ambedkar writings & relations from SemRAG (Memgraph Cloud)
    sources: List[SourceChunk] = []
    semrag_sources: List[dict] = []
    context_str = ""
    try:
        from backend.semrag.memgraph_retriever import retrieve_semrag_context

        semrag_ctx, semrag_sources = retrieve_semrag_context(payload.message.strip(), top_k=5)
        if semrag_ctx:
            context_str = semrag_ctx
    except Exception as exc:
        logger.warning("SemRAG retrieval skipped due to exception: %s", exc)

    # Secondary: Fallback to local channel retrieval if SemRAG yielded no context
    if not context_str:
        chunks = _try_retrieve(payload.message.strip(), top_k=5)
        context_str = _chunks_to_context(chunks)
        seen: set[str] = set()
        for c in chunks:
            title = c.get("video_title", "")
            if title and title not in seen:
                seen.add(title)
                snippet = (c.get("chunk_text") or "")[:160].rstrip() + "…"
                sources.append(SourceChunk(video_title=title, snippet=snippet))

    lang_label = "Hindi" if payload.language == "hi" else "English"
    system_content = _SYSTEM_PROMPT.replace("{context}", context_str).replace("{language}", lang_label)

    # 2. Build messages array
    messages = [{"role": "system", "content": system_content}]
    for h in (payload.history or [])[-6:]:   # last 3 turns (6 messages)
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": payload.message.strip()})

    # 3. Call the LLM: OpenAI first, Gemini if OpenAI fails or returns nothing.
    reply_text = ""
    failures = []
    for name, ask in _providers():
        try:
            reply_text = ask(messages)
            if reply_text:
                break
            failures.append(f"{name}: empty reply")
        except Exception as exc:  # try the next provider rather than failing the user
            failures.append(f"{name}: {type(exc).__name__}: {exc}")
            logger.warning("BheemBot %s call failed, trying the next provider: %s", name, exc)
    if not reply_text:
        logger.error("All BheemBot LLM providers failed: %s", " | ".join(failures) or "none configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BheemBot is temporarily unavailable. Please try again.",
        )

    from backend.semrag.presentation import sources_to_show, split_sources_line, to_display_text

    reply_text, used = split_sources_line(reply_text)   # hidden "SOURCES: 1, 3" line
    reply = to_display_text(reply_text)
    if semrag_sources:
        # Pills for exactly the material the answer drew on; none for an "isn't covered" answer.
        sources = [SourceChunk(video_title=s["video_title"], snippet=s["snippet"], url=s.get("url"))
                   for s in sources_to_show(reply, semrag_sources, used)]
    return ChatResponse(reply=reply, sources=sources)
