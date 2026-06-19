import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from app.api.deps import require_reviewer
from app.models.claim import Claim
from app.models.user import User
from app.models.user_policy import UserPolicy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviewer", tags=["reviewer"])


async def _serialize_queue_item(c: Claim) -> dict:
    """Full claim payload for reviewer/admin to make payout decisions.

    Resolves user + policy so the panel can display name/email/coverage without
    extra round-trips. Includes every v2 field added in TASK-027 (incident,
    evidence, bank account, witness, etc.) — reviewer needs all of this to
    authorise the bank transfer."""
    waiting_seconds = (datetime.utcnow() - c.created_at).total_seconds()

    # Resolve user
    user_info: dict | None = None
    try:
        u = await User.get(c.user_id)
        if u:
            user_info = {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "phone": getattr(u, "phone", None),
                "province": u.province,
                "is_active": u.is_active,
            }
    except Exception:
        pass

    # Resolve policy — also compute coverage_remaining from prior approved claims
    policy_info: dict | None = None
    if c.policy_id:
        try:
            p = await UserPolicy.get(c.policy_id)
            if p:
                prior = await Claim.find(
                    Claim.user_id == c.user_id,
                    Claim.policy_id == c.policy_id,
                    Claim.status == "approved",
                ).to_list()
                spent = sum((pc.amount_approved or 0) for pc in prior if str(pc.id) != str(c.id))
                policy_info = {
                    "id": str(p.id),
                    "policy_number": p.policy_number,
                    "policy_type": p.policy_type,
                    "plan_name": p.plan_name,
                    "insurer": p.insurer,
                    "coverage_amount": p.coverage_amount,
                    "coverage_spent_before": spent,
                    "coverage_remaining": max(0.0, p.coverage_amount - spent),
                    "start_date": p.start_date.isoformat() if p.start_date else None,
                    "end_date": p.end_date.isoformat() if p.end_date else None,
                    "status": p.status,
                }
        except Exception:
            pass

    return {
        "id": str(c.id),
        "user_id": c.user_id,
        "user": user_info,
        "policy_id": c.policy_id,
        "policy": policy_info,
        "claim_type": c.claim_type,
        "status": c.status,
        "amount_claimed": c.amount_claimed,
        "amount_approved": c.amount_approved,
        "province": c.province,
        "disaster_type": c.disaster_type,
        # Incident details (v2)
        "description": c.description,
        "incident_date": c.incident_date.isoformat() if c.incident_date else None,
        "incident_time": c.incident_time,
        "incident_location": c.incident_location,
        "incident_type": c.incident_type,
        # Payout info
        "bank_account": c.bank_account,
        "witness_info": c.witness_info,
        "hospital_admission_number": c.hospital_admission_number,
        "police_report_number": c.police_report_number,
        "fact_declaration": c.fact_declaration,
        # AI section
        "ai_decision": c.ai_decision,
        "ai_reasoning": c.ai_reasoning,
        "ai_fraud_score": c.ai_fraud_score,
        "ai_fraud_flags": c.ai_fraud_flags,
        "ai_parsed_data": c.ai_parsed_data,
        # Human review state
        "reviewer_id": c.reviewer_id,
        "reviewer_note": c.reviewer_note,
        "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
        # Reviewer v2 — partial approval + request more info (TASK-029)
        "is_partial_approval": c.is_partial_approval,
        "reduction_reason": c.reduction_reason,
        "additional_info_requested": c.additional_info_requested,
        "additional_info_requested_at": c.additional_info_requested_at.isoformat() if c.additional_info_requested_at else None,
        "additional_info_provided_at": c.additional_info_provided_at.isoformat() if c.additional_info_provided_at else None,
        # Payment workflow (human-only)
        "payment_status": c.payment_status,
        "payment_transaction_ref": c.payment_transaction_ref,
        "payment_marked_at": c.payment_marked_at.isoformat() if c.payment_marked_at else None,
        # Documents — supporting + evidence
        "documents": [
            {"id": d.id, "doc_type": d.doc_type, "file_name": d.file_name}
            for d in c.documents
        ],
        "evidence_files": [
            {"id": d.id, "doc_type": d.doc_type, "file_name": d.file_name}
            for d in c.evidence_files
        ],
        "created_at": c.created_at.isoformat(),
        "waiting_seconds": int(waiting_seconds),
    }


_VALID_STATUSES = {"pending", "processing", "approved", "rejected", "manual_review", "info_requested", "all"}


@router.get("/queue")
async def review_queue(
    status: str = "manual_review",
    province: str | None = None,
    disaster_type: str | None = None,
    min_fraud_score: int | None = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Reviewer queue. `status` filters by claim status:
      - "manual_review" (default) — only claims needing human review
      - "approved" / "rejected" / "processing" — browse other states
      - "all" — every claim in the system
    Sort oldest first."""
    if status not in _VALID_STATUSES:
        status = "manual_review"

    query: dict = {}
    if status != "all":
        query["status"] = status
    if province:
        query["province"] = province
    if disaster_type:
        query["disaster_type"] = disaster_type
    if min_fraud_score is not None:
        query["ai_fraud_score"] = {"$gte": min_fraud_score}

    total = await Claim.find(query).count()
    claims = await Claim.find(query).sort(+Claim.created_at).skip(skip).limit(limit).to_list()

    # Status counts (useful for FE tab badges) — only on first page
    counts: dict[str, int] = {}
    if skip == 0:
        for s in ("manual_review", "info_requested", "approved", "rejected", "processing"):
            counts[s] = await Claim.find({**({k: v for k, v in query.items() if k != "status"}), "status": s}).count()

    items = [await _serialize_queue_item(c) for c in claims]
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "status": status,
        "counts": counts,
        "items": items,
    }


@router.get("/stats")
async def reviewer_stats(
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Stats cá nhân của reviewer đang login."""
    reviewer_id = str(current_user.id)
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)

    reviewed_today = await Claim.find(
        Claim.reviewer_id == reviewer_id,
        Claim.reviewed_at >= today_start,
    ).count()

    reviewed_week = await Claim.find(
        Claim.reviewer_id == reviewer_id,
        Claim.reviewed_at >= week_start,
    ).count()

    reviewed_total = await Claim.find(Claim.reviewer_id == reviewer_id).count()

    # avg_review_time and override_rate
    reviewed_claims = await Claim.find(Claim.reviewer_id == reviewer_id).to_list()
    total_seconds = 0
    overrides = 0
    counted = 0
    for c in reviewed_claims:
        if c.reviewed_at and c.created_at:
            total_seconds += (c.reviewed_at - c.created_at).total_seconds()
            counted += 1
        ai_outcome = {
            "approve": "approved",
            "reject": "rejected",
            "manual_review": "manual_review",
            "need_more_info": "manual_review",
        }.get(c.ai_decision or "", None)
        if ai_outcome and c.status in ("approved", "rejected") and ai_outcome != c.status:
            overrides += 1

    avg_review_time_minutes = round(total_seconds / counted / 60, 1) if counted else 0.0
    override_rate = round(overrides / reviewed_total * 100, 1) if reviewed_total else 0.0

    pending_total = await Claim.find(Claim.status == "manual_review").count()

    # AI auto-decision counts (no human reviewer touched these)
    ai_approved = await Claim.find(
        Claim.status == "approved",
        {"reviewer_id": None},
    ).count()
    ai_rejected = await Claim.find(
        Claim.status == "rejected",
        {"reviewer_id": None},
    ).count()
    human_approved = await Claim.find(
        Claim.status == "approved",
        {"reviewer_id": {"$ne": None}},
    ).count()
    human_rejected = await Claim.find(
        Claim.status == "rejected",
        {"reviewer_id": {"$ne": None}},
    ).count()

    return {
        "reviewer_id": reviewer_id,
        "reviewer_email": current_user.email,
        "reviewed_today": reviewed_today,
        "reviewed_week": reviewed_week,
        "reviewed_total": reviewed_total,
        "avg_review_time_minutes": avg_review_time_minutes,
        "override_rate": override_rate,
        "pending_in_queue": pending_total,
        # System-wide decision volume (AI vs human breakdown)
        "ai_approved": ai_approved,
        "ai_rejected": ai_rejected,
        "ai_decided_total": ai_approved + ai_rejected,
        "human_approved": human_approved,
        "human_rejected": human_rejected,
        "human_decided_total": human_approved + human_rejected,
        "total_decided": ai_approved + ai_rejected + human_approved + human_rejected,
    }
