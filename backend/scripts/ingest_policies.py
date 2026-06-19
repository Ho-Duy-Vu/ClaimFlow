"""
scripts/ingest_policies.py — Ingest policy documents vào Qdrant
===============================================================
Đọc policies từ MongoDB → chunk → embed (Gemini) → upsert Qdrant

Chạy sau seed.py:
  python scripts/ingest_policies.py

Yêu cầu:
  - MongoDB đang chạy
  - Qdrant đang chạy tại localhost:6333
  - GEMINI_API_KEY trong .env
"""

import asyncio
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

CHUNK_SIZE = 500        # Số token mỗi chunk (xấp xỉ 400 words)
CHUNK_OVERLAP = 50      # Overlap giữa các chunk
COLLECTION_NAME = "insurance_policies"
EMBEDDING_MODEL = "models/gemini-embedding-001"  # text-embedding-004 đã deprecated 2026
EMBEDDING_DIM = 3072    # gemini-embedding-001 dimension


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Chia text thành các chunk với overlap."""
    # Tách theo paragraph trước
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    current = ""

    for para in paragraphs:
        words = para.split()
        if len(current.split()) + len(words) <= chunk_size:
            current += "\n\n" + para if current else para
        else:
            if current:
                chunks.append(current.strip())
                # Overlap: giữ lại phần cuối của chunk trước
                overlap_words = current.split()[-overlap:]
                current = " ".join(overlap_words) + "\n\n" + para
            else:
                current = para

    if current:
        chunks.append(current.strip())

    return [c for c in chunks if len(c) > 50]  # Bỏ chunk quá ngắn


async def get_embedding(text: str, client) -> list[float]:
    """Lấy embedding vector từ Gemini API."""
    import google.generativeai as genai
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="retrieval_document",
    )
    return result["embedding"]


async def ingest():
    import google.generativeai as genai
    from motor.motor_asyncio import AsyncIOMotorClient
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance, VectorParams, PointStruct
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY not found in .env")
        return

    genai.configure(api_key=api_key)

    print("\n📚 ClaimFlow — Ingesting policies vào Qdrant...\n")

    # Connect MongoDB — use the same URL as the FastAPI app
    from app.core.config import settings
    mongo = AsyncIOMotorClient(settings.MONGODB_URL)
    db = mongo[settings.MONGODB_DB_NAME]

    # Connect Qdrant
    qdrant = QdrantClient(host="localhost", port=6333)

    # Tạo collection nếu chưa có
    existing = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME in existing:
        print(f"🗑️  Deleting existing collection '{COLLECTION_NAME}'...")
        qdrant.delete_collection(COLLECTION_NAME)

    print(f"📦 Creating Qdrant collection '{COLLECTION_NAME}' (dim={EMBEDDING_DIM})...")
    qdrant.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )

    # Lấy policies từ MongoDB
    policies = await db.policies.find({"is_active": True}).to_list(100)
    if not policies:
        print("⚠️  No active policies found. Run seed.py first.")
        return

    total_chunks = 0

    for policy in policies:
        policy_id = str(policy["_id"])
        title = policy["title"]
        content = policy["content"]
        category = policy["category"]
        version = policy["version"]

        print(f"\n📄 Processing: {title}")
        chunks = chunk_text(content)
        print(f"   → {len(chunks)} chunks")

        points = []
        for i, chunk in enumerate(chunks):
            # Thêm title vào đầu chunk để embedding có context
            chunk_with_context = f"[{title}]\n\n{chunk}"

            try:
                vector = await get_embedding(chunk_with_context, genai)
            except Exception as e:
                print(f"   ⚠️  Embedding error chunk {i}: {e}")
                continue

            point_id = str(uuid.uuid4())
            points.append(PointStruct(
                id=point_id,
                vector=vector,
                payload={
                    "policy_id": policy_id,
                    "title": title,
                    "category": category,
                    "version": version,
                    "chunk_index": i,
                    "chunk_total": len(chunks),
                    "text": chunk,
                    "coverage_types": policy.get("coverage_types", []),
                },
            ))

        if points:
            qdrant.upsert(collection_name=COLLECTION_NAME, points=points)
            total_chunks += len(points)
            print(f"   ✅ Upserted {len(points)} chunks")

            # Update chunk_count trong MongoDB
            await db.policies.update_one(
                {"_id": policy["_id"]},
                {"$set": {"chunk_count": len(points), "last_ingested": __import__("datetime").datetime.utcnow()}}
            )

    # Verify
    info = qdrant.get_collection(COLLECTION_NAME)
    print(f"\n{'='*50}")
    print(f"✅ Ingestion complete!")
    print(f"   Policies processed: {len(policies)}")
    print(f"   Total chunks:       {total_chunks}")
    print(f"   Qdrant vectors:     {info.points_count}")
    print(f"   Collection:         {COLLECTION_NAME}")
    print(f"{'='*50}")
    print("\n🔍 Test search:")
    print("   python scripts/test_rag.py")

    mongo.close()


if __name__ == "__main__":
    asyncio.run(ingest())
