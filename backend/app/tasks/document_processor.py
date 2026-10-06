import asyncio
import logging

from celery import Celery

from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "claimflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_track_started = True
# Windows requires solo pool (no fork support)
celery_app.conf.worker_pool = "solo"


@celery_app.task(
    name="process_document",
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
)
def process_document(self, document_id: str, file_bytes_b64: str, doc_type: str):
    import base64

    async def _run():
        from motor.motor_asyncio import AsyncIOMotorClient
        from beanie import init_beanie
        from app.models.document import Document
        from app.models.user import User
        from app.models.claim import Claim
        from app.models.geo_risk import GeoRisk
        from app.models.chat_session import ChatSession
        from app.models.policy import Policy
        from app.models.audit_log import AuditLog
        from app.services.ai.ocr import ocr_service

        client = AsyncIOMotorClient(settings.MONGODB_URL)
        await init_beanie(
            database=client[settings.MONGODB_DB_NAME],
            document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy, AuditLog],
        )

        file_bytes = base64.b64decode(file_bytes_b64)
        result = await ocr_service.get_or_extract(file_bytes, doc_type, document_id)
        logger.info("OCR done for %s — confidence=%.2f", document_id, result.get("confidence", 0))
        return result

    return asyncio.run(_run())


@celery_app.task(
    name="process_claim",
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
)
def process_claim(
    self,
    claim_id: str,
    raw_text: str,
    coverage_limit: float = 0.0,
    evidence_count: int = 0,
    required_evidence_count: int = 1,
):
    async def _run():
        from motor.motor_asyncio import AsyncIOMotorClient
        from beanie import init_beanie
        from app.models.document import Document
        from app.models.user import User
        from app.models.claim import Claim
        from app.models.geo_risk import GeoRisk
        from app.models.chat_session import ChatSession
        from app.models.policy import Policy
        from app.models.audit_log import AuditLog
        from app.models.user_policy import UserPolicy
        from app.models.notification import Notification
        from app.models.payment import Payment
        from app.models.underwriting_rule import UnderwritingRule
        from app.services.ai.agent import run_claim_agent
        from app.services.notifications import notify
        from app.services.dispatcher import get_or_create_underwriting_rules, auto_dispatch_claim

        client = AsyncIOMotorClient(settings.MONGODB_URL)
        await init_beanie(
            database=client[settings.MONGODB_DB_NAME],
            document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy,
                             AuditLog, UserPolicy, Notification, Payment, UnderwritingRule],
        )

        claim = await Claim.get(claim_id)
        if not claim:
            logger.error("process_claim: claim %s not found", claim_id)
            return

        # Defensive: if caller didn't pass coverage_limit (legacy call), look it up
        # from the linked policy so amount_approved is never min(amount, 0) = 0.
        effective_limit = coverage_limit
        if effective_limit <= 0 and claim.policy_id:
            policy = await UserPolicy.get(claim.policy_id)
            if policy:
                effective_limit = policy.coverage_amount
        if effective_limit <= 0:
            # Fall back to any active policy of this type
            policy = await UserPolicy.find_one(
                UserPolicy.user_id == claim.user_id,
                UserPolicy.policy_type == claim.claim_type,
                UserPolicy.status == "active",
            )
            if policy:
                effective_limit = policy.coverage_amount

        eff_evidence = evidence_count if evidence_count else len(claim.evidence_files)

        from datetime import datetime
        state = await run_claim_agent(
            claim_id=claim_id,
            user_id=claim.user_id,
            claim_type=claim.claim_type,
            amount_claimed=claim.amount_claimed,
            raw_text=raw_text,
            province=claim.province,
            disaster_type=claim.disaster_type,
            coverage_limit=effective_limit,
            evidence_count=eff_evidence,
            required_evidence_count=required_evidence_count,
        )

        decision = state["final_decision"]

        # ── Underwriting Rules & STP Check ──────────────────────────────────────
        rules = await get_or_create_underwriting_rules()
        stp_downgraded = False
        stp_reason = ""
        if decision == "approve":
            if not rules.stp_enabled:
                stp_downgraded = True
                stp_reason = "Chế độ duyệt tự động tức thì (STP) đang tạm tắt."
            elif claim.amount_claimed > rules.max_stp_amount:
                stp_downgraded = True
                stp_reason = f"Số tiền yêu cầu ({claim.amount_claimed:,.0f} đ) vượt hạn mức duyệt tự động STP ({rules.max_stp_amount:,.0f} đ)."
            elif state.get("fraud_score", 0) > rules.max_stp_fraud_score:
                stp_downgraded = True
                stp_reason = f"Điểm rủi ro AI ({state.get('fraud_score', 0)}/100) vượt ngưỡng cho phép duyệt tức thì ({rules.max_stp_fraud_score}/100)."

            if stp_downgraded:
                decision = "manual_review"
                state["final_reasoning"] = (
                    f"[Chuyển thẩm định thủ công: {stp_reason}] "
                    + (state.get("final_reasoning") or "")
                )

        status_map = {
            "approve": "approved",
            "reject": "rejected",
            "manual_review": "manual_review",
            "need_more_info": "manual_review",
        }

        final_status = status_map.get(decision, "manual_review")
        await Claim.find_one(Claim.id == claim.id).update({
            "$set": {
                "status": final_status,
                "ai_decision": decision,
                "ai_reasoning": state["final_reasoning"],
                "ai_fraud_score": state["fraud_score"],
                "ai_fraud_flags": state["fraud_flags"],
                "ai_parsed_data": state["parsed_data"],
                "amount_approved": state.get("amount_approved") if final_status == "approved" else None,
                "province": state.get("province") or claim.province,
                "disaster_type": state.get("disaster_type") or claim.disaster_type,
                "processed_at": datetime.utcnow(),
                "payment_status": "pending" if final_status == "approved" else "not_applicable",
            }
        })
        logger.info("Claim %s processed via Celery: %s", claim_id, decision)

        # Notify the claimant of the AI decision
        _ai_notif = {
            "approve": ("claim_reviewed", "Yêu cầu bồi thường được duyệt",
                        f"Claim {claim.claim_type} của bạn đã được hệ thống duyệt tự động."),
            "reject": ("claim_reviewed", "Yêu cầu bồi thường bị từ chối",
                       "Claim của bạn chưa đủ điều kiện — xem lý do & bấm \"Vì sao?\" trong chi tiết."),
            "need_more_info": ("claim_info_requested", "Cần bổ sung thông tin",
                               "Hồ sơ còn thiếu thông tin — vui lòng bổ sung để tiếp tục xử lý."),
            "manual_review": ("system", "Yêu cầu đang được xét duyệt",
                              "Claim của bạn đang được chuyển đến chuyên viên thẩm định."),
        }
        _t, _title, _body = _ai_notif.get(decision, ("system", "Cập nhật yêu cầu bồi thường", ""))
        await notify(claim.user_id, type=_t, title=_title, body=_body, link="/claims")

        # Smart Workload Dispatching for manual review
        if final_status == "manual_review":
            fresh_claim = await Claim.get(claim.id)
            assigned_reviewer = None
            if fresh_claim:
                try:
                    assigned_reviewer = await auto_dispatch_claim(fresh_claim)
                except Exception as exc:
                    logger.warning("Auto dispatch claim %s failed: %s", claim_id, exc)

            if not assigned_reviewer:
                try:
                    reviewers = await User.find(
                        {"role": {"$in": ["reviewer", "admin"]}, "is_active": True}
                    ).to_list()
                    for r in reviewers:
                        await notify(
                            str(r.id), type="system",
                            title="Có yêu cầu cần xét duyệt",
                            body=f"Claim {claim.claim_type} cần xét duyệt thủ công (điểm rủi ro {state['fraud_score']}/100).",
                            link="/reviewer",
                        )
                except Exception as exc:
                    logger.warning("Notify reviewers failed (celery) claim=%s: %s", claim_id, exc)

    return asyncio.run(_run())


@celery_app.task(
    name="ingest_policy_to_qdrant",
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 2},
    retry_backoff=True,
)
def ingest_policy_to_qdrant(self, policy_id: str):
    """Chunk + embed + upsert a single policy vào Qdrant. Idempotent: xóa chunk cũ trước khi upsert."""
    import os
    import uuid

    CHUNK_SIZE = 500
    CHUNK_OVERLAP = 50
    COLLECTION_NAME = "insurance_policies"
    EMBEDDING_MODEL = "models/gemini-embedding-001"
    EMBEDDING_DIM = 3072

    def _chunk(text: str) -> list[str]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[str] = []
        current = ""
        for para in paragraphs:
            words = para.split()
            if len(current.split()) + len(words) <= CHUNK_SIZE:
                current += "\n\n" + para if current else para
            else:
                if current:
                    chunks.append(current.strip())
                    overlap_words = current.split()[-CHUNK_OVERLAP:]
                    current = " ".join(overlap_words) + "\n\n" + para
                else:
                    current = para
        if current:
            chunks.append(current.strip())
        return [c for c in chunks if len(c) > 50]

    async def _run():
        import google.generativeai as genai
        from motor.motor_asyncio import AsyncIOMotorClient
        from beanie import init_beanie
        from qdrant_client import QdrantClient
        from qdrant_client.models import (
            Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams,
        )
        from datetime import datetime
        from app.models.user import User
        from app.models.document import Document
        from app.models.claim import Claim
        from app.models.geo_risk import GeoRisk
        from app.models.chat_session import ChatSession
        from app.models.policy import Policy
        from app.models.audit_log import AuditLog
        from app.models.user_policy import UserPolicy

        api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.error("GEMINI_API_KEY missing — cannot embed policy %s", policy_id)
            return
        genai.configure(api_key=api_key)

        client = AsyncIOMotorClient(settings.MONGODB_URL)
        await init_beanie(
            database=client[settings.MONGODB_DB_NAME],
            document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy, AuditLog, UserPolicy],
        )

        policy = await Policy.get(policy_id)
        if not policy or not policy.is_active:
            logger.warning("Policy %s not found or inactive", policy_id)
            return

        qdrant = QdrantClient(url=settings.QDRANT_URL)
        # Ensure collection exists
        existing = [c.name for c in qdrant.get_collections().collections]
        if COLLECTION_NAME not in existing:
            qdrant.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
            )

        # Remove old chunks for this policy
        try:
            qdrant.delete(
                collection_name=COLLECTION_NAME,
                points_selector=Filter(must=[
                    FieldCondition(key="policy_id", match=MatchValue(value=policy_id))
                ]),
            )
        except Exception as e:
            logger.warning("Could not delete old vectors for policy %s: %s", policy_id, e)

        chunks = _chunk(policy.content)
        points = []
        for i, chunk in enumerate(chunks):
            chunk_with_context = f"[{policy.title}]\n\n{chunk}"
            try:
                emb = genai.embed_content(
                    model=EMBEDDING_MODEL,
                    content=chunk_with_context,
                    task_type="retrieval_document",
                )
                vec = emb["embedding"]
            except Exception as e:
                logger.warning("Embedding error chunk %d of policy %s: %s", i, policy_id, e)
                continue

            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload={
                    "policy_id": policy_id,
                    "title": policy.title,
                    "category": policy.category,
                    "version": policy.version,
                    "chunk_index": i,
                    "chunk_total": len(chunks),
                    "text": chunk,
                    "coverage_types": policy.coverage_types or [],
                },
            ))

        if points:
            qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

        policy.chunk_count = len(points)
        policy.last_ingested = datetime.utcnow()
        await policy.save()
        logger.info("Ingested policy %s into Qdrant — %d chunks", policy_id, len(points))

    return asyncio.run(_run())


@celery_app.task(name="check_expiring_policies", bind=True)
def check_expiring_policies(self):
    """A3 — quét policy sắp hết hạn (≤30 ngày) hoặc đã hết hạn → tạo notification.
    Idempotent qua cờ `expiry_reminder_sent`. Chạy định kỳ qua Celery beat
    (xem beat_schedule bên dưới). Cũng được kiểm tra lazy trong GET /policies."""
    async def _run():
        from datetime import datetime, timedelta
        from motor.motor_asyncio import AsyncIOMotorClient
        from beanie import init_beanie
        from app.models.user import User
        from app.models.document import Document
        from app.models.claim import Claim
        from app.models.geo_risk import GeoRisk
        from app.models.chat_session import ChatSession
        from app.models.policy import Policy
        from app.models.audit_log import AuditLog
        from app.models.user_policy import UserPolicy
        from app.models.ocr_bundle import OCRBundle
        from app.models.notification import Notification
        from app.models.payment import Payment
        from app.services.notifications import notify

        client = AsyncIOMotorClient(settings.MONGODB_URL)
        await init_beanie(
            database=client[settings.MONGODB_DB_NAME],
            document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy,
                             AuditLog, UserPolicy, OCRBundle, Notification, Payment],
        )

        now = datetime.utcnow()
        # Expired → mark + notify
        for p in await UserPolicy.find(
            UserPolicy.status == "active", UserPolicy.end_date < now
        ).to_list():
            p.status = "expired"
            await p.save()
            await notify(p.user_id, type="policy_expired", title="Gói bảo hiểm đã hết hạn",
                         body=f"Gói {p.plan_name} ({p.policy_number}) đã hết hiệu lực.", link="/policies")

        # Expiring within 30 days → remind once
        soon = now + timedelta(days=30)
        count = 0
        for p in await UserPolicy.find(
            UserPolicy.status == "active",
            UserPolicy.end_date >= now,
            UserPolicy.end_date <= soon,
            UserPolicy.expiry_reminder_sent == False,  # noqa: E712
        ).to_list():
            days_left = max(0, (p.end_date - now).days)
            p.expiry_reminder_sent = True
            await p.save()
            await notify(p.user_id, type="policy_expiring", title="Gói bảo hiểm sắp hết hạn",
                         body=f"Gói {p.plan_name} còn {days_left} ngày là hết hạn.", link="/policies")
            count += 1
        logger.info("check_expiring_policies: reminded %d expiring policies", count)
        return count

    return asyncio.run(_run())


# Beat schedule — chạy check_expiring_policies mỗi ngày (cần `celery -A app.tasks beat`)
celery_app.conf.beat_schedule = {
    "check-expiring-policies-daily": {
        "task": "check_expiring_policies",
        "schedule": 24 * 60 * 60,  # 86400s = 1 ngày
    },
}
