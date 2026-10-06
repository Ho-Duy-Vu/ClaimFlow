import logging
from datetime import datetime, timedelta, timezone

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException,
    Request, Response, UploadFile, WebSocket, WebSocketDisconnect,
)
from pydantic import BaseModel, Field, field_validator
from typing import Literal

from app.api.deps import get_current_user, require_reviewer
from app.core.rate_limit import limiter
from app.models.audit_log import AuditLog
from app.models.claim import Claim
from app.models.document import Document, DocumentEmbed
from app.models.user import User
from app.services.ai.damage_analyzer import analyze_damage_image
from app.services.email import send_claim_review_email
from app.services.notifications import notify
from app.services.dispatcher import get_or_create_underwriting_rules, auto_dispatch_claim

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/claims", tags=["claims"])

# ── WebSocket connection manager ───────────────────────────────────────────────

class _WsManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, claim_id: str, ws: WebSocket):
        await ws.accept()
        self._connections.setdefault(claim_id, []).append(ws)

    def disconnect(self, claim_id: str, ws: WebSocket):
        conns = self._connections.get(claim_id, [])
        if ws in conns:
            conns.remove(ws)

    async def push(self, claim_id: str, data: dict):
        for ws in list(self._connections.get(claim_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(claim_id, ws)


ws_manager = _WsManager()


# ── Schemas ────────────────────────────────────────────────────────────────────

class IncidentLocation(BaseModel):
    address: str = Field(..., min_length=3, max_length=300)
    lat: float | None = None
    lng: float | None = None


class BankAccount(BaseModel):
    account_number: str = Field(..., min_length=4, max_length=30)
    bank_name: str = Field(..., min_length=2, max_length=80)
    account_holder: str = Field(..., min_length=2, max_length=100)


class WitnessInfo(BaseModel):
    name: str | None = None
    phone: str | None = None
    relation: str | None = None


class ClaimSubmitRequest(BaseModel):
    claim_type: Literal["health", "life", "property", "vehicle", "disaster", "income"]
    policy_id: str | None = None  # optional for backward-compat; new flow requires it
    amount_claimed: float = Field(..., gt=0)
    province: str | None = None
    disaster_type: str | None = None
    description: str = Field(..., min_length=10)
    document_ids: list[str] = []

    # v2 incident & evidence (TASK-027) — all optional to keep legacy submissions working
    incident_date: datetime | None = None
    incident_time: str | None = None
    incident_location: IncidentLocation | None = None
    incident_type: str | None = None
    evidence_document_ids: list[str] = []
    bank_account: BankAccount | None = None
    witness_info: WitnessInfo | None = None
    hospital_admission_number: str | None = None
    police_report_number: str | None = None
    fact_declaration: bool = False
    damage_assessment: dict | None = None

    @field_validator("amount_claimed")
    @classmethod
    def cap_amount(cls, v: float) -> float:
        if v > 10_000_000_000:
            raise ValueError("Số tiền yêu cầu vượt mức tối đa 10 tỷ VND")
        return v


# Type-specific minimum evidence-document count expected for an authentic claim.
# Used as a fraud signal — submissions below this raise fraud_score.
REQUIRED_EVIDENCE_COUNT: dict[str, int] = {
    "health":   3,  # hóa đơn viện phí + đơn thuốc + bệnh án
    "vehicle":  3,  # biên bản CSGT + báo giá sửa + ảnh thiệt hại
    "property": 3,  # ảnh thiệt hại + báo giá sửa + biên bản công an
    "disaster": 2,  # xác nhận thiên tai + ảnh thiệt hại
    "life":     2,  # giấy chứng tử + bệnh án
    "income":   1,  # giấy thôi việc / biên bản TNLĐ
}


class ClaimProvideInfoRequest(BaseModel):
    """User responds to reviewer's info_requested by attaching evidence docs."""
    document_ids: list[str] = Field(..., min_length=1, max_length=10)
    note: str | None = Field(default=None, max_length=1000)


class ClaimReviewRequest(BaseModel):
    # TASK-029: 4 decision types — approved, rejected, info_requested (back to user),
    # partial_approved (amount_approved < amount_claimed + reduction_reason)
    decision: Literal["approved", "rejected", "info_requested", "partial_approved"]
    note: str = Field(..., min_length=3, max_length=2000)
    amount_approved: float | None = Field(default=None, ge=0)
    # For info_requested: list of fields/documents the user must provide
    fields_needed: list[str] = []
    # For partial_approved: reason why amount was reduced
    reduction_reason: str | None = Field(default=None, max_length=500)
    # Enterprise Adjustment & Dual Notes
    adjustment_items: list[dict] = []
    internal_note: str | None = None
    customer_notice: str | None = None

    @field_validator("note")
    @classmethod
    def strip_note(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ghi chú thẩm định không được để trống")
        return v


def _serialize_claim(c: Claim, partner_map: dict | None = None) -> dict:
    partner_info = None
    qr_guarantee_payload = None
    partner_id = getattr(c, "partner_id", None)
    if partner_id and partner_map and partner_id in partner_map:
        part = partner_map[partner_id]
        partner_info = {
            "id": str(part.id),
            "name": part.name,
            "partner_type": part.partner_type,
            "province": part.province,
            "address": part.address,
            "lat": getattr(part, "lat", None),
            "lng": getattr(part, "lng", None),
            "phone": getattr(part, "phone", None),
            "hotline": getattr(part, "hotline", None),
            "cashless_supported": getattr(part, "cashless_supported", True),
            "rating": getattr(part, "rating", 4.8),
            "services": getattr(part, "services", []),
            "guarantee_status": getattr(c, "partner_guarantee_status", "guaranteed"),
            "service_type": getattr(c, "partner_service_type", None),
            "notes": getattr(c, "partner_notes", None),
            "dispatched_at": c.partner_dispatched_at.isoformat() if getattr(c, "partner_dispatched_at", None) else None,
        }
        qr_guarantee_payload = f"CLAIMFLOW-CASHLESS:{c.id}:{part.id}:{c.user_id}:{part.partner_type}"

    return {
        "id": str(c.id),
        "user_id": c.user_id,
        "status": c.status,
        "claim_type": c.claim_type,
        "policy_id": c.policy_id,
        "amount_claimed": c.amount_claimed,
        "amount_approved": c.amount_approved,
        "is_partial_approval": c.is_partial_approval,
        "reduction_reason": c.reduction_reason,
        "adjustment_items": getattr(c, "adjustment_items", []) or [],
        "internal_note": getattr(c, "internal_note", None),
        "customer_notice": getattr(c, "customer_notice", None),
        "sla_hours": getattr(c, "sla_hours", 48),
        "sla_deadline": c.sla_deadline.isoformat() if getattr(c, "sla_deadline", None) else None,
        "partner_id": partner_id,
        "partner_service_type": getattr(c, "partner_service_type", None),
        "partner_guarantee_status": getattr(c, "partner_guarantee_status", None),
        "partner": partner_info,
        "qr_guarantee_payload": qr_guarantee_payload,
        "additional_info_requested": c.additional_info_requested,
        "additional_info_requested_at": c.additional_info_requested_at.isoformat() if c.additional_info_requested_at else None,
        "additional_info_provided_at": c.additional_info_provided_at.isoformat() if c.additional_info_provided_at else None,
        "incident_date": c.incident_date.isoformat() if c.incident_date else None,
        "incident_time": c.incident_time,
        "incident_location": c.incident_location,
        "incident_type": c.incident_type,
        "description": c.description,
        "bank_account": c.bank_account,
        "witness_info": c.witness_info,
        "hospital_admission_number": c.hospital_admission_number,
        "police_report_number": c.police_report_number,
        "fact_declaration": c.fact_declaration,
        "damage_assessment": c.damage_assessment,
        "ai_decision": c.ai_decision,
        "ai_reasoning": c.ai_reasoning,
        "ai_fraud_score": c.ai_fraud_score,
        "ai_fraud_flags": c.ai_fraud_flags,
        "province": c.province,
        "disaster_type": c.disaster_type,
        "reviewer_note": c.reviewer_note,
        "created_at": c.created_at.isoformat(),
        "processed_at": c.processed_at.isoformat() if c.processed_at else None,
        "documents": [{"id": d.id, "doc_type": d.doc_type, "file_name": d.file_name} for d in c.documents],
        "evidence_files": [
            {"id": d.id, "doc_type": d.doc_type, "file_name": d.file_name} for d in c.evidence_files
        ],
    }


# ── Background processing ──────────────────────────────────────────────────────

async def _process_claim_bg(
    claim_id: str,
    raw_text: str,
    claim: Claim,
    coverage_limit: float = 0,
    evidence_count: int = 0,
    required_evidence_count: int = 1,
) -> None:
    from app.services.ai.agent import run_claim_agent

    async def _push(step: str, data: dict):
        await ws_manager.push(claim_id, {"event": step, **data})

    try:
        state = await run_claim_agent(
            claim_id=claim_id,
            user_id=claim.user_id,
            claim_type=claim.claim_type,
            amount_claimed=claim.amount_claimed,
            raw_text=raw_text,
            province=claim.province,
            disaster_type=claim.disaster_type,
            coverage_limit=coverage_limit,
            evidence_count=evidence_count,
            required_evidence_count=required_evidence_count,
            progress_cb=_push,
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
                # AI cannot mark payment as done — set to pending if approved, leave NA otherwise
                "payment_status": "pending" if final_status == "approved" else "not_applicable",
            }
        })

        await ws_manager.push(claim_id, {
            "event": "completed",
            "status": status_map.get(decision, "manual_review"),
            "decision": decision,
            "reasoning": state["final_reasoning"],
            "fraud_score": state["fraud_score"],
            "amount_approved": state.get("amount_approved") if final_status == "approved" else None,
        })
        logger.info("Claim %s processed: %s (fraud=%d)", claim_id, decision, state["fraud_score"])

        # ── Notify the claimant of the AI decision ─────────────────────────────
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

        # ── Smart Workload Dispatching for manual review ─────────────────────────
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
                    logger.warning("Notify reviewers failed for claim %s: %s", claim_id, exc)

    except Exception as exc:
        logger.error("Claim processing failed %s: %s", claim_id, exc)
        await Claim.find_one(Claim.id == claim.id).update({
            "$set": {"status": "manual_review", "ai_reasoning": f"Xử lý tự động thất bại: {exc}"}
        })
        await ws_manager.push(claim_id, {"event": "error", "message": str(exc)})
        try:
            await notify(
                claim.user_id, type="system",
                title="Yêu cầu đang được xét duyệt",
                body="Claim của bạn đang được chuyển cho chuyên viên xét duyệt.",
                link="/claims",
            )
        except Exception:
            pass


# ── Endpoints ──────────────────────────────────────────────────────────────────

async def _embed_docs(user_id: str, doc_ids: list[str], limit: int) -> tuple[list[DocumentEmbed], list[str]]:
    """Validate ownership + return DocumentEmbed list + structured_data context for AI."""
    embeds: list[DocumentEmbed] = []
    context_parts: list[str] = []
    for doc_id in doc_ids[:limit]:
        doc = await Document.get(doc_id)
        if doc and doc.user_id == user_id:
            embeds.append(DocumentEmbed(
                id=str(doc.id),
                doc_type=doc.doc_type,
                file_name=doc.file_name,
                created_at=doc.created_at,
            ))
            if doc.structured_data:
                import json as _json
                context_parts.append(
                    f"[{doc.doc_type}]\n{_json.dumps(doc.structured_data, ensure_ascii=False)}"
                )
    return embeds, context_parts


@router.post("/analyze-damage")
@limiter.limit("20/minute")
async def analyze_damage_endpoint(
    request: Request,
    claim_type: str = Form("vehicle"),
    incident_description: str | None = Form(None),
    document_id: str | None = Form(None),
    file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Phân tích ảnh hiện trường bằng Gemini Vision để giám định tổn thất và phát hiện gian lận."""
    image_bytes = None
    mime_type = "image/jpeg"

    if file and file.filename:
        image_bytes = await file.read()
        mime_type = file.content_type or "image/jpeg"
    elif document_id:
        doc = await Document.get(document_id)
        if not doc or doc.user_id != str(current_user.id):
            raise HTTPException(404, "Không tìm thấy tài liệu ảnh hiện trường")
        from app.services.storage import download_file
        try:
            image_bytes = download_file(doc.file_path)
            mime_type = doc.mime_type or "image/jpeg"
        except Exception as e:
            logger.warning(f"Could not download file from storage: {e}")

    if not image_bytes:
        from app.services.ai.damage_analyzer import _generate_fallback_assessment
        return _generate_fallback_assessment(claim_type, incident_description)

    result = await analyze_damage_image(
        image_bytes=image_bytes,
        mime_type=mime_type,
        claim_type=claim_type,
        incident_description=incident_description,
    )
    return result


@router.post("/submit", status_code=201)
@limiter.limit("5/minute")
async def submit_claim(
    request: Request,
    body: ClaimSubmitRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.id)

    # ── Policy validation (v2: prefer explicit policy_id) ─────────────────────
    from app.models.user_policy import UserPolicy
    if body.policy_id:
        active_policy = await UserPolicy.get(body.policy_id)
        if (not active_policy
            or active_policy.user_id != user_id
            or active_policy.status != "active"
            or active_policy.policy_type != body.claim_type):
            raise HTTPException(
                422,
                "Gói bảo hiểm không hợp lệ hoặc không khớp loại yêu cầu."
            )
    else:
        # Backward-compat: fall back to first active policy of the right type
        active_policy = await UserPolicy.find_one(
            UserPolicy.user_id == user_id,
            UserPolicy.policy_type == body.claim_type,
            UserPolicy.status == "active",
        )
        if not active_policy:
            raise HTTPException(
                422,
                f"Bạn chưa mua gói bảo hiểm '{body.claim_type}'. "
                "Vui lòng mua gói phù hợp trước khi gửi yêu cầu bồi thường."
            )

    # ── Incident date sanity (within policy period, not in future) ────────────
    if body.incident_date:
        # FE sends ISO with Z (aware datetime); MongoDB stores naive. Normalize to naive UTC.
        incident_dt = body.incident_date
        if incident_dt.tzinfo is not None:
            incident_dt = incident_dt.astimezone(timezone.utc).replace(tzinfo=None)
        now = datetime.utcnow()
        if incident_dt > now:
            raise HTTPException(422, "Ngày sự cố không được trong tương lai")
        if incident_dt < active_policy.start_date:
            raise HTTPException(
                422,
                "Ngày sự cố trước ngày hợp đồng bảo hiểm có hiệu lực"
            )
        if active_policy.end_date and incident_dt > active_policy.end_date:
            raise HTTPException(
                422,
                "Ngày sự cố sau ngày kết thúc hợp đồng bảo hiểm"
            )
        # Persist the normalized naive value so DB stays consistent
        body.incident_date = incident_dt

    # ── Coverage remaining check (sum prior approved claims on this policy) ───
    prior_approved = await Claim.find(
        Claim.user_id == user_id,
        Claim.policy_id == str(active_policy.id),
        Claim.status == "approved",
    ).to_list()
    spent = sum((c.amount_approved or 0) for c in prior_approved)
    coverage_remaining = max(0.0, active_policy.coverage_amount - spent)
    if coverage_remaining <= 0:
        raise HTTPException(
            422,
            "Hạn mức bảo hiểm đã hết — không còn coverage cho gói này"
        )
    if body.amount_claimed > coverage_remaining:
        raise HTTPException(
            422,
            f"Số tiền yêu cầu ({body.amount_claimed:,.0f}đ) vượt hạn mức còn lại "
            f"({coverage_remaining:,.0f}đ)"
        )

    # ── Embed supporting docs + evidence files ────────────────────────────────
    doc_embeds, doc_context_parts = await _embed_docs(user_id, body.document_ids, limit=5)
    evidence_embeds, evidence_context = await _embed_docs(user_id, body.evidence_document_ids, limit=10)

    # ── Build claim record ────────────────────────────────────────────────────
    raw_text_parts = [body.description]
    if body.incident_type:
        raw_text_parts.append(f"Loại sự cố: {body.incident_type}")
    if body.incident_location:
        raw_text_parts.append(f"Địa điểm: {body.incident_location.address}")
    if doc_context_parts:
        raw_text_parts.append("--- Tài liệu hỗ trợ ---\n" + "\n".join(doc_context_parts))
    if evidence_context:
        raw_text_parts.append("--- Chứng từ ---\n" + "\n".join(evidence_context))
    raw_text = "\n\n".join(raw_text_parts)

    required_count = REQUIRED_EVIDENCE_COUNT.get(body.claim_type, 1)

    claim = Claim(
        user_id=user_id,
        status="processing",
        claim_type=body.claim_type,
        policy_id=str(active_policy.id),
        amount_claimed=body.amount_claimed,
        province=body.province,
        disaster_type=body.disaster_type,
        description=body.description,
        incident_date=body.incident_date,
        incident_time=body.incident_time,
        incident_location=body.incident_location.model_dump() if body.incident_location else None,
        incident_type=body.incident_type,
        documents=doc_embeds,
        evidence_files=evidence_embeds,
        bank_account=body.bank_account.model_dump() if body.bank_account else None,
        witness_info=body.witness_info.model_dump(exclude_none=True) if body.witness_info else None,
        hospital_admission_number=body.hospital_admission_number,
        police_report_number=body.police_report_number,
        fact_declaration=body.fact_declaration,
        damage_assessment=body.damage_assessment,
    )
    await claim.insert()
    claim_id = str(claim.id)

    # ── Audit log ─────────────────────────────────────────────────────────────
    try:
        await AuditLog(
            actor_id=user_id,
            actor_email=current_user.email,
            action="claim_submitted",
            target_type="claim",
            target_id=claim_id,
            details={
                "claim_type": body.claim_type,
                "policy_id": str(active_policy.id),
                "amount_claimed": body.amount_claimed,
                "evidence_count": len(evidence_embeds),
                "required_count": required_count,
                "coverage_remaining_before": coverage_remaining,
            },
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed claim_submitted=%s: %s", claim_id, exc)

    # ── Hand off to AI processing (TASK-027: pass coverage + evidence) ────────
    celery_queued = False
    try:
        from app.tasks.document_processor import celery_app, process_claim
        workers = celery_app.control.inspect(timeout=0.5).ping()
        if workers:
            process_claim.delay(
                claim_id,
                raw_text,
                active_policy.coverage_amount,
                len(evidence_embeds),
                required_count,
            )
            celery_queued = True
    except Exception:
        pass

    if not celery_queued:
        background_tasks.add_task(
            _process_claim_bg,
            claim_id,
            raw_text,
            claim,
            active_policy.coverage_amount,
            len(evidence_embeds),
            required_count,
        )

    return {
        "claim_id": claim_id,
        "status": "processing",
        "coverage_remaining": coverage_remaining,
        "evidence_count": len(evidence_embeds),
        "required_evidence_count": required_count,
    }


@router.get("/policy-context/{policy_id}")
async def get_policy_context(
    policy_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Frontend helper — returns coverage_remaining + required_evidence_count
    so the submit wizard can show inline limits and the docs checklist."""
    from app.models.user_policy import UserPolicy
    policy = await UserPolicy.get(policy_id)
    if not policy or policy.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")
    prior = await Claim.find(
        Claim.user_id == str(current_user.id),
        Claim.policy_id == policy_id,
        Claim.status == "approved",
    ).to_list()
    spent = sum((c.amount_approved or 0) for c in prior)
    return {
        "policy_id": policy_id,
        "policy_type": policy.policy_type,
        "plan_name": policy.plan_name,
        "coverage_amount": policy.coverage_amount,
        "coverage_spent": spent,
        "coverage_remaining": max(0.0, policy.coverage_amount - spent),
        "start_date": policy.start_date.isoformat(),
        "end_date": policy.end_date.isoformat() if policy.end_date else None,
        "required_evidence_count": REQUIRED_EVIDENCE_COUNT.get(policy.policy_type, 1),
    }


@router.get("", response_model=list[dict])
async def list_claims(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    claims = await Claim.find(Claim.user_id == str(current_user.id)).sort(-Claim.created_at).to_list()
    partner_map = {}
    has_partners = any(getattr(c, "partner_id", None) for c in claims)
    if has_partners:
        try:
            from app.models.partner import Partner
            all_parts = await Partner.find_all().to_list()
            partner_map = {str(p.id): p for p in all_parts}
        except Exception:
            partner_map = {}
    return [_serialize_claim(c, partner_map=partner_map) for c in claims]


@router.delete("/{claim_id}", status_code=204)
async def delete_claim(
    claim_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    claim = await Claim.get(claim_id)
    if not claim or claim.user_id != str(current_user.id):
        raise HTTPException(404, "Claim not found")
    if claim.status == "processing":
        # Allow deletion if stuck in processing for more than 5 minutes (agent likely crashed)
        stuck_threshold = datetime.utcnow() - timedelta(minutes=5)
        if claim.created_at > stuck_threshold:
            raise HTTPException(409, "Yêu cầu đang xử lý, vui lòng chờ hoặc thử lại sau 5 phút")
    await claim.delete()


@router.get("/{claim_id}")
async def get_claim(
    claim_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    claim = await Claim.get(claim_id)
    if not claim or claim.user_id != str(current_user.id):
        raise HTTPException(404, "Claim not found")
    partner_map = {}
    if getattr(claim, "partner_id", None):
        try:
            from app.models.partner import Partner
            part = await Partner.get(claim.partner_id)
            if part:
                partner_map[str(part.id)] = part
                partner_map[claim.partner_id] = part
        except Exception:
            pass
    return _serialize_claim(claim, partner_map=partner_map)


@router.patch("/{claim_id}/review")
async def review_claim(
    claim_id: str,
    body: ClaimReviewRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Reviewer override — role reviewer hoặc admin.

    Ghi audit log (claim_override), push WebSocket event, gửi email cho user
    (background). Không cho phép review claim đã ở trạng thái cuối.
    """
    claim = await Claim.get(claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy yêu cầu bồi thường")

    # Block review-of-review (another human already decided). AI auto-decision
    # (reviewer_id is None) CAN be overridden by a human reviewer.
    if claim.status in ("approved", "rejected") and claim.reviewer_id:
        raise HTTPException(
            409,
            f"Yêu cầu đã được reviewer khác xét duyệt ({claim.status}) — không thể review lại"
        )

    decision = body.decision

    # ── Per-decision validation & field shape ─────────────────────────────────
    # 'approved'         → amount = amount_claimed (or capped); payment pending
    # 'partial_approved' → amount < amount_claimed, reduction_reason required
    # 'rejected'         → no amount
    # 'info_requested'   → no amount, fields_needed required, status loops back to user
    if decision == "approved":
        amount_approved = body.amount_approved if body.amount_approved is not None else claim.amount_claimed
        if amount_approved > claim.amount_claimed:
            raise HTTPException(422, "Số tiền duyệt không được vượt số tiền yêu cầu")
        is_partial = False
        new_status = "approved"
        payment_status_set = "pending"
    elif decision == "partial_approved":
        if body.amount_approved is None or body.amount_approved <= 0:
            raise HTTPException(422, "Duyệt 1 phần yêu cầu số tiền > 0")
        if body.amount_approved >= claim.amount_claimed:
            raise HTTPException(422, "Số tiền duyệt 1 phần phải < số tiền yêu cầu — dùng 'approved' nếu duyệt full")
        if not (body.reduction_reason or "").strip():
            raise HTTPException(422, "Cần lý do giảm số tiền cho duyệt 1 phần")
        amount_approved = body.amount_approved
        is_partial = True
        new_status = "approved"  # final status is approved, but is_partial=True flag
        payment_status_set = "pending"
    elif decision == "rejected":
        amount_approved = None
        is_partial = False
        new_status = "rejected"
        payment_status_set = "not_applicable"
    else:  # info_requested
        if not body.fields_needed:
            raise HTTPException(422, "Cần liệt kê các trường/tài liệu cần bổ sung")
        amount_approved = None
        is_partial = False
        new_status = "info_requested"
        payment_status_set = "not_applicable"

    previous_status = claim.status
    previous_ai_decision = claim.ai_decision
    reviewed_at = datetime.utcnow()

    # ── Check Underwriting Rules: Four-Eyes Principle (Admin Sign-off for High Value) ──
    rules = await get_or_create_underwriting_rules()
    requires_admin = False
    if decision in ("approved", "partial_approved") and amount_approved and amount_approved >= rules.high_value_threshold:
        requires_admin = True
        payment_status_set = "pending_admin_approval"

    update_doc: dict = {
        "status": new_status,
        "reviewer_id": str(current_user.id),
        "reviewer_note": body.note,
        "internal_note": (body.internal_note or "").strip() or None,
        "customer_notice": (body.customer_notice or "").strip() or None,
        "adjustment_items": body.adjustment_items or [],
        "reviewed_at": reviewed_at,
        "amount_approved": amount_approved,
        "payment_status": payment_status_set,
        "is_partial_approval": is_partial,
        "reduction_reason": (body.reduction_reason or "").strip() or None if is_partial else None,
        "requires_admin_approval": requires_admin,
    }
    if decision == "info_requested":
        update_doc["additional_info_requested"] = body.fields_needed
        update_doc["additional_info_requested_at"] = reviewed_at
        update_doc["additional_info_provided_at"] = None  # reset if previously provided
    await Claim.find_one(Claim.id == claim.id).update({"$set": update_doc})

    if requires_admin:
        try:
            admins = await User.find({"role": "admin", "is_active": True}).to_list()
            for adm in admins:
                await notify(
                    str(adm.id),
                    type="system",
                    title="Hồ sơ giá trị cao chờ Admin ký duyệt",
                    body=f"Hồ sơ {claim.claim_type.upper()} ({amount_approved:,.0f} đ) cần duyệt cấp 2 (Four-Eyes Principle) trước khi chi trả.",
                    link="/admin?tab=underwriting",
                )
        except Exception as exc:
            logger.warning("Notify admin failed for high-value claim %s: %s", claim_id, exc)

    # ── Audit log ─────────────────────────────────────────────────────────────
    ai_outcome_map = {
        "approve": "approved",
        "reject": "rejected",
        "manual_review": "manual_review",
        "need_more_info": "manual_review",
    }
    ai_resolved = ai_outcome_map.get(previous_ai_decision or "")
    is_override = bool(ai_resolved) and ai_resolved != new_status

    audit_action = (
        "claim_info_requested" if decision == "info_requested"
        else "claim_partial_approved" if decision == "partial_approved"
        else "claim_override"
    )

    try:
        await AuditLog(
            actor_id=str(current_user.id),
            actor_email=current_user.email,
            action=audit_action,
            target_type="claim",
            target_id=claim_id,
            details={
                "previous_status": previous_status,
                "new_status": new_status,
                "decision": decision,
                "ai_decision": previous_ai_decision,
                "is_override": is_override,
                "is_partial": is_partial,
                "amount_approved": amount_approved,
                "amount_claimed": claim.amount_claimed,
                "reduction_reason": body.reduction_reason if is_partial else None,
                "fields_needed": body.fields_needed if decision == "info_requested" else None,
                "note": body.note[:200],
            },
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed claim=%s: %s", claim_id, exc)

    # ── WebSocket push ────────────────────────────────────────────────────────
    await ws_manager.push(claim_id, {
        "event": "reviewed",
        "status": new_status,
        "decision": decision,
        "reviewer_note": body.note,
        "amount_approved": amount_approved,
        "is_partial": is_partial,
        "reduction_reason": body.reduction_reason if is_partial else None,
        "fields_needed": body.fields_needed if decision == "info_requested" else None,
        "reviewed_at": reviewed_at.isoformat(),
    })

    # ── Email notification (fire-and-forget) ──────────────────────────────────
    claimant = await User.get(claim.user_id)
    if claimant and claimant.email:
        background_tasks.add_task(
            send_claim_review_email,
            to_email=claimant.email,
            full_name=claimant.full_name,
            claim_id=claim_id,
            claim_type=claim.claim_type,
            decision=decision,
            note=body.note,
            amount_approved=amount_approved,
            fields_needed=body.fields_needed if decision == "info_requested" else None,
            reduction_reason=body.reduction_reason if is_partial else None,
        )

    # ── In-app notification ────────────────────────────────────────────────────
    _notif = {
        "approved": ("claim_reviewed", "Yêu cầu bồi thường được duyệt",
                     f"Claim {claim.claim_type} của bạn đã được duyệt chi trả."),
        "partial_approved": ("claim_reviewed", "Yêu cầu được duyệt một phần",
                             "Claim của bạn được duyệt một phần — xem chi tiết mức chi trả."),
        "rejected": ("claim_reviewed", "Yêu cầu bồi thường bị từ chối",
                     "Claim của bạn đã bị từ chối — xem lý do trong chi tiết."),
        "info_requested": ("claim_info_requested", "Cần bổ sung tài liệu",
                           "Reviewer yêu cầu bổ sung thông tin cho claim của bạn."),
    }
    _type, _title, _body = _notif.get(decision, ("claim_reviewed", "Cập nhật yêu cầu bồi thường", ""))
    await notify(claim.user_id, type=_type, title=_title, body=_body, link="/claims")

    logger.info(
        "Claim %s reviewed by %s → %s (override=%s)",
        claim_id, current_user.email, decision, is_override,
    )

    return {
        "ok": True,
        "status": decision,
        "reviewer_id": str(current_user.id),
        "reviewed_at": reviewed_at.isoformat(),
        "is_override": is_override,
    }


@router.post("/{claim_id}/provide-info")
@limiter.limit("10/minute")
async def provide_claim_info(
    claim_id: str,
    body: ClaimProvideInfoRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict:
    """User responds to a reviewer's info_requested by attaching additional
    evidence documents. Status loops back to manual_review so the reviewer
    re-evaluates with the new info (per TASK-029 followup)."""
    claim = await Claim.get(claim_id)
    if not claim or claim.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy yêu cầu bồi thường")
    if claim.status != "info_requested":
        raise HTTPException(
            409,
            "Chỉ yêu cầu đang ở trạng thái 'Chờ bổ sung hồ sơ' mới có thể bổ sung tài liệu"
        )

    new_embeds, _ = await _embed_docs(str(current_user.id), body.document_ids, limit=10)
    if not new_embeds:
        raise HTTPException(422, "Không tìm thấy tài liệu hợp lệ để bổ sung")

    existing_ids = {d.id for d in claim.evidence_files}
    merged_evidence = list(claim.evidence_files)
    added: list[str] = []
    for e in new_embeds:
        if e.id not in existing_ids:
            merged_evidence.append(e)
            added.append(e.id)

    if not added:
        raise HTTPException(409, "Các tài liệu này đã có trong yêu cầu — chọn tài liệu khác")

    now = datetime.utcnow()
    await Claim.find_one(Claim.id == claim.id).update({
        "$set": {
            "status": "manual_review",
            "evidence_files": [e.model_dump() for e in merged_evidence],
            "additional_info_provided_at": now,
        }
    })

    try:
        await AuditLog(
            actor_id=str(current_user.id),
            actor_email=current_user.email,
            action="claim_info_provided",
            target_type="claim",
            target_id=claim_id,
            details={
                "added_document_ids": added,
                "added_count": len(added),
                "note": (body.note or "").strip()[:300],
                "requested_fields": claim.additional_info_requested,
            },
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed claim_info_provided=%s: %s", claim_id, exc)

    await ws_manager.push(claim_id, {
        "event": "info_provided",
        "status": "manual_review",
        "added_document_ids": added,
        "provided_at": now.isoformat(),
    })

    logger.info(
        "Claim %s info provided by %s — %d new docs",
        claim_id, current_user.email, len(added),
    )
    return {
        "ok": True,
        "status": "manual_review",
        "added_count": len(added),
        "provided_at": now.isoformat(),
    }


@router.get("/{claim_id}/invoice.pdf")
async def download_claim_invoice(
    claim_id: str,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Generate (or fetch cached) payout invoice PDF. Only available for
    approved or partial-approved claims (TASK-030). User can only download
    their own; reviewers/admins can download any."""
    from app.services.pdf_generator import generate_claim_invoice
    from app.services.storage import download_file, ensure_bucket, upload_file
    from app.models.user_policy import UserPolicy

    claim = await Claim.get(claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy yêu cầu bồi thường")
    is_owner = claim.user_id == str(current_user.id)
    if not is_owner and current_user.role not in ("reviewer", "admin"):
        raise HTTPException(403, "Không có quyền tải hóa đơn này")
    if claim.status != "approved":
        raise HTTPException(409, "Chỉ yêu cầu đã duyệt mới có hóa đơn chi trả")
    if (claim.amount_approved or 0) <= 0:
        raise HTTPException(422, "Yêu cầu không có số tiền chi trả")

    # Version cache key by review + payment timestamps so the PDF
    # regenerates whenever those change (e.g. reviewer marks paid).
    ver_reviewed = int(claim.reviewed_at.timestamp()) if claim.reviewed_at else 0
    ver_paid = int(claim.payment_marked_at.timestamp()) if claim.payment_marked_at else 0
    cache_key = f"{claim.user_id}/invoices/{claim_id}-{ver_reviewed}-{ver_paid}.pdf"

    pdf_bytes: bytes | None = None
    try:
        pdf_bytes = await download_file(cache_key)
    except Exception:
        pdf_bytes = None

    if not pdf_bytes:
        # Build serializer payload — service expects plain dicts
        claim_dict = _serialize_claim(claim)
        # Enrich with reviewer email + paid timestamps that _serialize_claim skipped
        reviewer_email: str | None = None
        if claim.reviewer_id:
            reviewer = await User.get(claim.reviewer_id)
            if reviewer:
                reviewer_email = reviewer.email
        claim_dict["reviewer_email"] = reviewer_email
        claim_dict["payment_status"] = claim.payment_status
        claim_dict["payment_transaction_ref"] = claim.payment_transaction_ref
        claim_dict["payment_marked_at"] = (
            claim.payment_marked_at.isoformat() if claim.payment_marked_at else None
        )

        claimant = await User.get(claim.user_id)
        user_dict = {
            "email":     claimant.email if claimant else "",
            "full_name": claimant.full_name if claimant else None,
            "province":  claimant.province if claimant else None,
        }

        policy_dict: dict | None = None
        if claim.policy_id:
            policy = await UserPolicy.get(claim.policy_id)
            if policy:
                policy_dict = {
                    "policy_number":   policy.policy_number,
                    "plan_name":       policy.plan_name,
                    "policy_type":     policy.policy_type,
                    "coverage_amount": policy.coverage_amount,
                }

        pdf_bytes = generate_claim_invoice(claim_dict, policy_dict, user_dict)

        try:
            await ensure_bucket()
            await upload_file(pdf_bytes, cache_key, "application/pdf")
        except Exception as exc:
            logger.warning("PDF cache upload failed for claim=%s: %s", claim_id, exc)

    filename = f"hoa-don-boi-thuong-{claim_id[-8:]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


class MarkPaidRequest(BaseModel):
    transaction_ref: str = Field(..., min_length=3, max_length=120)
    note: str | None = Field(default=None, max_length=500)


@router.patch("/{claim_id}/mark-paid")
async def mark_claim_paid(
    claim_id: str,
    body: MarkPaidRequest,
    request: Request,
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Reviewer/admin xác nhận đã chuyển khoản cho user. Chỉ con người mới mark được —
    AI không có quyền chạm vào tiền. Audit log payment_marked_paid."""
    claim = await Claim.get(claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy yêu cầu bồi thường")
    if claim.status != "approved":
        raise HTTPException(409, "Chỉ claim đã duyệt mới có thể đánh dấu thanh toán")
    if claim.payment_status == "paid":
        raise HTTPException(409, "Claim này đã được đánh dấu là đã thanh toán")
    if not claim.bank_account:
        raise HTTPException(422, "Claim chưa khai báo tài khoản nhận — yêu cầu user bổ sung")

    now = datetime.utcnow()
    await Claim.find_one(Claim.id == claim.id).update({
        "$set": {
            "payment_status": "paid",
            "payment_transaction_ref": body.transaction_ref.strip(),
            "payment_marked_by": str(current_user.id),
            "payment_marked_at": now,
        }
    })

    try:
        await AuditLog(
            actor_id=str(current_user.id),
            actor_email=current_user.email,
            action="payment_marked_paid",
            target_type="claim",
            target_id=claim_id,
            details={
                "amount_approved": claim.amount_approved,
                "bank_account": claim.bank_account,
                "transaction_ref": body.transaction_ref,
                "note": (body.note or "")[:200],
            },
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed payment_marked_paid=%s: %s", claim_id, exc)

    await ws_manager.push(claim_id, {
        "event": "payment_marked",
        "payment_status": "paid",
        "transaction_ref": body.transaction_ref,
        "marked_at": now.isoformat(),
    })

    await notify(
        claim.user_id,
        type="claim_paid",
        title="Đã chi trả bồi thường",
        body=f"Claim {claim.claim_type} đã được chuyển khoản (mã GD: {body.transaction_ref.strip()}).",
        link="/claims",
    )

    return {
        "ok": True,
        "payment_status": "paid",
        "transaction_ref": body.transaction_ref,
        "marked_at": now.isoformat(),
    }


@router.post("/{claim_id}/explain")
@limiter.limit("20/minute")
async def explain_claim_endpoint(
    claim_id: str,
    request: Request,
    locale: str = "vi",
    current_user: User = Depends(get_current_user),
) -> dict:
    """B1 — Giải thích thân thiện kết quả claim cho khách hàng (AI).
    Chính chủ hoặc reviewer/admin. Rate limit 20/phút."""
    from app.models.user_policy import UserPolicy
    from app.services.ai.explainer import explain_claim

    claim = await Claim.get(claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy yêu cầu bồi thường")
    if claim.user_id != str(current_user.id) and current_user.role not in ("reviewer", "admin"):
        raise HTTPException(403, "Không có quyền xem giải thích cho claim này")

    claim_ctx = {
        "claim_type": claim.claim_type,
        "status": claim.status,
        "amount_claimed": claim.amount_claimed,
        "amount_approved": claim.amount_approved,
        "is_partial_approval": claim.is_partial_approval,
        "reduction_reason": claim.reduction_reason,
        "ai_decision": claim.ai_decision,
        "ai_reasoning": claim.ai_reasoning,
        "ai_fraud_flags": claim.ai_fraud_flags,
        "reviewer_note": claim.reviewer_note,
        "additional_info_requested": claim.additional_info_requested,
        "disaster_type": claim.disaster_type,
    }
    policy_ctx = None
    if claim.policy_id:
        p = await UserPolicy.get(claim.policy_id)
        if p:
            policy_ctx = {"plan_name": p.plan_name, "coverage_amount": p.coverage_amount}

    loc = "en" if str(locale).lower().startswith("en") else "vi"
    try:
        explanation = await explain_claim(claim_ctx, policy_ctx, loc)
    except Exception as exc:
        raise HTTPException(503, str(exc))
    return {"explanation": explanation, "status": claim.status}


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/ws/{claim_id}")
async def claim_ws(websocket: WebSocket, claim_id: str):
    """Real-time claim processing updates. Auth via cookie (JWT)."""
    from app.core.security import decode_access_token

    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001)
        return
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    # Verify claim belongs to user
    claim = await Claim.get(claim_id)
    if not claim or claim.user_id != user_id:
        await websocket.close(code=4004)
        return

    await ws_manager.connect(claim_id, websocket)
    # Immediately send current status
    await websocket.send_json({"event": "status", "status": claim.status})

    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        ws_manager.disconnect(claim_id, websocket)
