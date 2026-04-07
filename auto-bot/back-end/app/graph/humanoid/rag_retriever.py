"""
app/graph/humanoid/rag_retriever.py
Retrieves relevant psychology/behavior chunks from ChromaDB
and assembles them into behavioral context for the system prompt.
"""
import logging
from typing import Optional

from app.graph.humanoid.config import MAX_CONTEXT_TOKENS, MAX_RETRIEVAL_CHUNKS, MIN_RELEVANCE_SCORE
from app.graph.humanoid.pdf_ingestor import get_collection

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[float, str]] = {}
CACHE_TTL = 300  # seconds


def _build_query(user_message: str, emotion: Optional[dict] = None) -> str:
    """Build an enriched query combining the user message with emotion context."""
    parts = [user_message]

    if emotion:
        primary = emotion.get("primary_emotion", "")
        intent = emotion.get("intent", "")
        if primary and primary != "neutral":
            parts.append(f"responding to someone feeling {primary}")
        if intent:
            parts.append(f"when someone is {intent}")

    return " ".join(parts)


def retrieve_context(
    user_message: str,
    emotion: Optional[dict] = None,
    personality: Optional[dict] = None,
) -> str:
    """
    Retrieve relevant psychology chunks and format as behavioral context.
    Returns a formatted string to inject into the system prompt.
    """
    collection = get_collection()

    if collection.count() == 0:
        return ""

    query = _build_query(user_message, emotion)

    import time
    cache_key = query[:200]
    now = time.time()
    if cache_key in _cache:
        cached_time, cached_result = _cache[cache_key]
        if now - cached_time < CACHE_TTL:
            return cached_result

    try:
        results = collection.query(
            query_texts=[query],
            n_results=MAX_RETRIEVAL_CHUNKS,
            include=["documents", "distances", "metadatas"],
        )
    except Exception as e:
        logger.error(f"ChromaDB query failed: {e}")
        return ""

    if not results or not results["documents"] or not results["documents"][0]:
        return ""

    docs = results["documents"][0]
    distances = results["distances"][0] if results.get("distances") else [0.5] * len(docs)
    metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)

    filtered = []
    total_chars = 0
    char_limit = MAX_CONTEXT_TOKENS * 4

    for doc, dist, meta in zip(docs, distances, metadatas):
        relevance = 1.0 - dist
        if relevance < MIN_RELEVANCE_SCORE:
            continue

        if total_chars + len(doc) > char_limit:
            remaining = char_limit - total_chars
            if remaining > 200:
                doc = doc[:remaining] + "..."
            else:
                break

        filtered.append({
            "text": doc,
            "relevance": round(relevance, 3),
            "source": meta.get("source_pdf", "unknown"),
            "categories": meta.get("categories", "general"),
        })
        total_chars += len(doc)

    if not filtered:
        return ""

    lines = [
        "\nHUMAN BEHAVIORAL CONTEXT (apply these patterns naturally in your response):"
    ]

    for i, chunk in enumerate(filtered, 1):
        lines.append(f"\n[Insight {i} — {chunk['categories']}]:")
        lines.append(chunk["text"])

    if personality and personality.get("enabled"):
        lines.append("\nPERSONALITY APPLICATION:")
        lines.append("Use the behavioral insights above naturally — don't quote them directly.")
        lines.append("Blend them into your conversational style as if they are second nature.")

    context_str = "\n".join(lines)

    _cache[cache_key] = (now, context_str)

    return context_str
