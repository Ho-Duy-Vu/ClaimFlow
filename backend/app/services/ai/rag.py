"""
rag.py — Retrieval-Augmented Generation service.

Wraps Qdrant + Gemini embedding behind a simple `search(query, ...)` API.
Used by:
  - chatbot.py — augment user message with relevant policy chunks
  - agent.py check_coverage node — verify claim against policy text

Graceful fallback: if Qdrant down or collection empty, search() returns []
so callers can fall back to rule-based logic.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = "insurance_policies"
EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBEDDING_DIM = 3072


@dataclass
class RetrievedChunk:
    text: str
    title: str
    category: str
    version: str
    chunk_index: int
    score: float
    policy_id: str

    def cite(self) -> str:
        """Format chunk as a citation-ready block for LLM prompt."""
        return f"[Nguồn: {self.title} — chunk {self.chunk_index}, similarity={self.score:.2f}]\n{self.text}"


class VectorService:
    """Singleton wrapper around Qdrant for policy RAG.

    Lazy-init Qdrant client + Gemini config on first use so import doesn't
    crash if services aren't ready.
    """

    def __init__(self) -> None:
        self._qdrant = None
        self._genai_configured = False
        self._available: Optional[bool] = None  # cached availability check

    # ── Lazy initializers ──────────────────────────────────────────────────

    def _get_qdrant(self):
        if self._qdrant is None:
            from qdrant_client import QdrantClient
            self._qdrant = QdrantClient(url=settings.QDRANT_URL, timeout=5.0)
        return self._qdrant

    def _ensure_genai(self) -> bool:
        if self._genai_configured:
            return True
        api_key = settings.GEMINI_API_KEY
        if not api_key:
            logger.warning("GEMINI_API_KEY missing — RAG embeddings disabled")
            return False
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self._genai_configured = True
        return True

    # ── Availability check ────────────────────────────────────────────────

    def is_available(self) -> bool:
        """Return True iff Qdrant is reachable AND collection exists with vectors."""
        if self._available is not None:
            return self._available
        try:
            qdrant = self._get_qdrant()
            collections = [c.name for c in qdrant.get_collections().collections]
            if COLLECTION_NAME not in collections:
                self._available = False
                return False
            info = qdrant.get_collection(COLLECTION_NAME)
            self._available = (info.points_count or 0) > 0
            return self._available
        except Exception as e:
            logger.warning("Qdrant unreachable: %s", e)
            self._available = False
            return False

    def invalidate_cache(self) -> None:
        """Force re-check on next is_available() call. Use after ingest."""
        self._available = None

    # ── Embedding ─────────────────────────────────────────────────────────

    async def _embed(self, query: str) -> Optional[list[float]]:
        if not self._ensure_genai():
            return None
        import google.generativeai as genai
        try:
            result = genai.embed_content(
                model=EMBEDDING_MODEL,
                content=query,
                task_type="retrieval_query",  # different from "retrieval_document" used in ingestion
            )
            return result["embedding"]
        except Exception as e:
            logger.warning("Gemini embed_content failed: %s", e)
            return None

    # ── Public search API ─────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        top_k: int = 5,
        category: str | None = None,
        min_score: float = 0.3,
    ) -> list[RetrievedChunk]:
        """Search Qdrant for chunks similar to `query`.

        Args:
            query: natural-language question (e.g. "bảo hiểm bão lũ có cover ngập úng không")
            top_k: max chunks to return
            category: optional filter — only chunks where payload.category == this
            min_score: drop chunks with cosine similarity < this (0.0..1.0)

        Returns:
            list of RetrievedChunk sorted by score DESC. Empty list if Qdrant/embedding
            unavailable — caller should fall back to rule-based logic.
        """
        if not query or not query.strip():
            return []
        if not self.is_available():
            logger.debug("VectorService.search: Qdrant not available — returning []")
            return []

        vec = await self._embed(query)
        if vec is None:
            return []

        from qdrant_client.models import Filter, FieldCondition, MatchValue
        qdrant = self._get_qdrant()

        query_filter = None
        if category:
            query_filter = Filter(must=[
                FieldCondition(key="category", match=MatchValue(value=category))
            ])

        try:
            # QdrantClient 1.18+ removed .search() — use .query_points() instead
            response = qdrant.query_points(
                collection_name=COLLECTION_NAME,
                query=vec,
                query_filter=query_filter,
                limit=top_k,
                with_payload=True,
            )
            hits = response.points
        except Exception as e:
            logger.warning("Qdrant query_points error: %s", e)
            return []

        results: list[RetrievedChunk] = []
        for h in hits:
            if h.score < min_score:
                continue
            p = h.payload or {}
            results.append(RetrievedChunk(
                text=p.get("text", ""),
                title=p.get("title", "Unknown"),
                category=p.get("category", "unknown"),
                version=p.get("version", ""),
                chunk_index=p.get("chunk_index", 0),
                score=float(h.score),
                policy_id=p.get("policy_id", ""),
            ))
        return results

    # ── Helper for prompt building ─────────────────────────────────────────

    @staticmethod
    def format_context(chunks: list[RetrievedChunk], max_chars: int = 3000) -> str:
        """Concatenate chunks into a single context block, capped at max_chars."""
        if not chunks:
            return ""
        parts: list[str] = []
        total = 0
        for c in chunks:
            block = c.cite()
            if total + len(block) > max_chars:
                break
            parts.append(block)
            total += len(block) + 2
        return "\n\n---\n\n".join(parts)


# Singleton instance — import as: `from app.services.ai.rag import vector_service`
vector_service = VectorService()
