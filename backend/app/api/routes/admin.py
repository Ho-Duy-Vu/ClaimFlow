import logging
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.api.deps import require_admin, require_reviewer
from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.claim import Claim
from app.models.geo_risk import GeoRisk
from app.models.policy import Policy
from app.models.user import User
from app.models.user_policy import UserPolicy
from app.services.notifications import notify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def log_action(
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    await AuditLog(
        actor_id=str(actor.id),
        actor_email=actor.email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
        ip_address=ip_address,
    ).insert()


def _serialize_user(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "province": u.province,
        "region": u.region,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat(),
    }


def _serialize_audit(a: AuditLog) -> dict:
    return {
        "id": str(a.id),
        "timestamp": a.timestamp.isoformat(),
        "actor_id": a.actor_id,
        "actor_email": a.actor_email,
        "action": a.action,
        "target_type": a.target_type,
        "target_id": a.target_id,
        "details": a.details,
        "ip_address": a.ip_address,
    }


def _serialize_policy(p: Policy) -> dict:
    return {
        "id": str(p.id),
        "title": p.title,
        "category": p.category,
        "version": p.version,
        "is_active": p.is_active,
        "chunk_count": p.chunk_count,
        "coverage_types": p.coverage_types,
        "last_ingested": p.last_ingested.isoformat() if p.last_ingested else None,
        "created_at": p.created_at.isoformat(),
        "content_preview": (p.content[:200] + "...") if len(p.content) > 200 else p.content,
    }


# ── User management ────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    role: str | None = None,
    is_active: bool | None = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_admin),
) -> dict:
    query: dict = {}
    if role:
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active

    total = await User.find(query).count()
    users = await User.find(query).sort(-User.created_at).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_user(u) for u in users],
    }


class RoleChangeRequest(BaseModel):
    role: Literal["user", "reviewer", "admin"]


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: str,
    body: RoleChangeRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    target = await User.get(user_id)
    if not target:
        raise HTTPException(404, "Không tìm thấy người dùng")
    if str(target.id) == str(current_user.id) and body.role != "admin":
        raise HTTPException(400, "Không thể tự hạ quyền admin của chính mình")

    old_role = target.role
    target.role = body.role
    target.updated_at = datetime.utcnow()
    await target.save()

    await log_action(
        current_user, "role_change", "user", str(target.id),
        {"old_role": old_role, "new_role": body.role, "target_email": target.email},
        request.client.host if request.client else None,
    )

    return _serialize_user(target)


class StatusChangeRequest(BaseModel):
    is_active: bool


@router.patch("/users/{user_id}/status")
async def change_user_status(
    user_id: str,
    body: StatusChangeRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    target = await User.get(user_id)
    if not target:
        raise HTTPException(404, "Không tìm thấy người dùng")
    if str(target.id) == str(current_user.id):
        raise HTTPException(400, "Không thể tự vô hiệu hóa chính mình")

    target.is_active = body.is_active
    target.updated_at = datetime.utcnow()
    await target.save()

    action = "user_activate" if body.is_active else "user_deactivate"
    await log_action(
        current_user, action, "user", str(target.id),
        {"target_email": target.email, "is_active": body.is_active},
        request.client.host if request.client else None,
    )

    return _serialize_user(target)


# ── Audit logs ─────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
async def list_audit_logs(
    action: str | None = None,
    target_type: str | None = None,
    actor_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(require_admin),
) -> dict:
    query: dict = {}
    if action:
        query["action"] = action
    if target_type:
        query["target_type"] = target_type
    if actor_id:
        query["actor_id"] = actor_id

    if from_date or to_date:
        ts_filter: dict = {}
        if from_date:
            try:
                ts_filter["$gte"] = datetime.fromisoformat(from_date)
            except ValueError:
                raise HTTPException(400, "from_date không hợp lệ (ISO 8601)")
        if to_date:
            try:
                ts_filter["$lte"] = datetime.fromisoformat(to_date)
            except ValueError:
                raise HTTPException(400, "to_date không hợp lệ (ISO 8601)")
        query["timestamp"] = ts_filter

    total = await AuditLog.find(query).count()
    logs = await AuditLog.find(query).sort(-AuditLog.timestamp).skip(skip).limit(limit).to_list()
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_audit(a) for a in logs],
    }


# ── System health ──────────────────────────────────────────────────────────────

async def _ping_mongodb() -> dict:
    import time as _t
    t0 = _t.perf_counter()
    try:
        await User.find_one()
        return {"status": "up", "latency_ms": round((_t.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        return {"status": "down", "error": str(e)[:200]}


async def _ping_redis() -> dict:
    import time as _t
    try:
        import redis.asyncio as _redis
        client = _redis.from_url(settings.REDIS_URL)
        t0 = _t.perf_counter()
        await client.ping()
        await client.aclose()
        return {"status": "up", "latency_ms": round((_t.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        return {"status": "down", "error": str(e)[:200]}


def _ping_qdrant() -> dict:
    import time as _t
    try:
        from qdrant_client import QdrantClient
        client = QdrantClient(url=settings.QDRANT_URL)
        t0 = _t.perf_counter()
        collections = client.get_collections().collections
        latency = round((_t.perf_counter() - t0) * 1000, 1)
        return {
            "status": "up",
            "latency_ms": latency,
            "collections": [c.name for c in collections],
        }
    except Exception as e:
        return {"status": "down", "error": str(e)[:200]}


def _ping_celery() -> dict:
    try:
        from app.tasks.document_processor import celery_app
        workers = celery_app.control.inspect(timeout=1.0).ping()
        if not workers:
            return {"status": "down", "error": "No workers responding"}
        return {"status": "up", "workers": list(workers.keys())}
    except Exception as e:
        return {"status": "down", "error": str(e)[:200]}


@router.get("/system/health")
async def system_health(
    current_user: User = Depends(require_admin),
) -> dict:
    mongo = await _ping_mongodb()
    redis_status = await _ping_redis()
    qdrant = _ping_qdrant()
    celery = _ping_celery()

    services = {"mongodb": mongo, "redis": redis_status, "qdrant": qdrant, "celery": celery}
    overall = "up" if all(s.get("status") == "up" for s in services.values()) else "degraded"

    return {"overall": overall, "services": services, "checked_at": datetime.utcnow().isoformat()}


# ── Full system analytics ─────────────────────────────────────────────────────

@router.get("/analytics/full")
async def full_analytics(
    current_user: User = Depends(require_admin),
) -> dict:
    total_users = await User.find().count()
    active_users = await User.find(User.is_active == True).count()  # noqa: E712
    reviewers = await User.find(User.role == "reviewer").count()

    total_claims = await Claim.find().count()
    approved = await Claim.find(Claim.status == "approved").count()
    rejected = await Claim.find(Claim.status == "rejected").count()
    manual_review = await Claim.find(Claim.status == "manual_review").count()
    processing = await Claim.find(Claim.status == "processing").count()

    approval_rate = round(approved / total_claims * 100, 1) if total_claims else 0.0

    # Fraud rate — count claims with fraud_score >= 70
    high_fraud = await Claim.find(Claim.ai_fraud_score >= 70).count()
    fraud_rate = round(high_fraud / total_claims * 100, 1) if total_claims else 0.0

    # Top high-risk provinces
    high_risk_provinces = await GeoRisk.find(
        GeoRisk.is_high_risk == True  # noqa: E712
    ).sort(-GeoRisk.overall_risk_score).limit(5).to_list()
    top_provinces = [
        {
            "name": p.province_name,
            "region": p.region,
            "risk_score": p.overall_risk_score,
        }
        for p in high_risk_provinces
    ]

    # Reviewer performance (claims where reviewer_id is set)
    reviewer_perf: list[dict] = []
    reviewer_users = await User.find({"role": {"$in": ["reviewer", "admin"]}}).to_list()
    for r in reviewer_users:
        rid = str(r.id)
        reviewed = await Claim.find(Claim.reviewer_id == rid).count()
        if reviewed == 0:
            continue
        reviewed_approved = await Claim.find(
            Claim.reviewer_id == rid, Claim.status == "approved"
        ).count()
        reviewer_perf.append({
            "reviewer_id": rid,
            "email": r.email,
            "full_name": r.full_name,
            "total_reviewed": reviewed,
            "approved": reviewed_approved,
            "approval_rate": round(reviewed_approved / reviewed * 100, 1),
        })
    reviewer_perf.sort(key=lambda x: x["total_reviewed"], reverse=True)

    # Daily claim counts (last 30 days)
    now = datetime.utcnow()
    daily: list[dict] = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_day = day + timedelta(days=1)
        count = await Claim.find(Claim.created_at >= day, Claim.created_at < next_day).count()
        daily.append({"date": day.date().isoformat(), "count": count})

    # Region breakdown
    region_counts: dict[str, int] = {"north": 0, "central": 0, "south": 0, "unknown": 0}
    all_claims = await Claim.find().to_list()
    province_to_region = {p.province_name: p.region for p in await GeoRisk.find().to_list()}
    for c in all_claims:
        region = province_to_region.get(c.province or "", "unknown")
        region_counts[region] = region_counts.get(region, 0) + 1

    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "reviewers": reviewers,
        },
        "claims": {
            "total": total_claims,
            "approved": approved,
            "rejected": rejected,
            "manual_review": manual_review,
            "processing": processing,
            "approval_rate": approval_rate,
            "fraud_rate": fraud_rate,
        },
        "top_high_risk_provinces": top_provinces,
        "reviewer_performance": reviewer_perf[:10],
        "daily_claims": daily,
        "region_breakdown": region_counts,
    }


# ── Policy management ─────────────────────────────────────────────────────────

@router.get("/policies")
async def list_policies(
    is_active: bool | None = None,
    current_user: User = Depends(require_admin),
) -> list[dict]:
    query: dict = {}
    if is_active is not None:
        query["is_active"] = is_active
    policies = await Policy.find(query).sort(-Policy.created_at).to_list()
    return [_serialize_policy(p) for p in policies]


class PolicyCreateRequest(BaseModel):
    title: str
    content: str
    category: str
    version: str = "1.0"
    coverage_types: list[str] = []


@router.post("/policies", status_code=201)
async def upload_policy(
    body: PolicyCreateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    if len(body.content.strip()) < 100:
        raise HTTPException(400, "Nội dung policy phải có ít nhất 100 ký tự")

    policy = Policy(
        title=body.title.strip(),
        content=body.content,
        category=body.category.strip(),
        version=body.version.strip(),
        coverage_types=body.coverage_types,
        is_active=True,
    )
    await policy.insert()

    await log_action(
        current_user, "policy_upload", "policy", str(policy.id),
        {"title": policy.title, "category": policy.category, "version": policy.version},
        request.client.host if request.client else None,
    )

    # Trigger Qdrant ingestion in background (best-effort — silent on failure)
    try:
        from app.tasks.document_processor import celery_app, ingest_policy_to_qdrant
        workers = celery_app.control.inspect(timeout=0.5).ping()
        if workers:
            ingest_policy_to_qdrant.delay(str(policy.id))
    except Exception as e:
        logger.warning("Could not queue Qdrant ingestion for policy %s: %s", policy.id, e)

    return _serialize_policy(policy)


@router.delete("/policies/{policy_id}", status_code=200)
async def delete_policy(
    policy_id: str,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    policy = await Policy.get(policy_id)
    if not policy:
        raise HTTPException(404, "Không tìm thấy policy")

    policy.is_active = False
    await policy.save()

    # Remove vectors from Qdrant (best-effort)
    vectors_deleted = 0
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        client = QdrantClient(url=settings.QDRANT_URL)
        result = client.delete(
            collection_name="insurance_policies",
            points_selector=Filter(must=[
                FieldCondition(key="policy_id", match=MatchValue(value=policy_id))
            ]),
        )
        vectors_deleted = policy.chunk_count
        policy.chunk_count = 0
        await policy.save()
    except Exception as e:
        logger.warning("Could not delete vectors for policy %s: %s", policy_id, e)

    await log_action(
        current_user, "policy_delete", "policy", policy_id,
        {"title": policy.title, "vectors_deleted": vectors_deleted},
        request.client.host if request.client else None,
    )

    return {"ok": True, "vectors_deleted": vectors_deleted}


# ── User policy oversight (Admin list + Admin/Reviewer void) ────────────────────

def _serialize_user_policy_admin(p: UserPolicy) -> dict:
    return {
        "id": str(p.id),
        "user_id": p.user_id,
        "policy_number": p.policy_number,
        "policy_type": p.policy_type,
        "plan_name": p.plan_name,
        "coverage_amount": p.coverage_amount,
        "annual_premium": p.annual_premium,
        "status": p.status,
        "start_date": p.start_date.isoformat(),
        "end_date": p.end_date.isoformat(),
        "voided_by": p.voided_by,
        "voided_reason": p.voided_reason,
        "voided_at": p.voided_at.isoformat() if p.voided_at else None,
        "created_at": p.created_at.isoformat(),
    }


@router.get("/user-policies")
async def list_user_policies(
    current_user: User = Depends(require_admin),
) -> dict:
    """Danh sách user đã mua bảo hiểm + số lượng gói (theo trạng thái) để check
    bất thường (mua quá nhiều gói, v.v.). Admin only."""
    all_policies = await UserPolicy.find().to_list()

    # Group per user
    agg: dict[str, dict] = {}
    for p in all_policies:
        b = agg.setdefault(p.user_id, {
            "user_id": p.user_id, "total": 0,
            "active": 0, "expired": 0, "cancelled": 0, "voided": 0,
            "active_coverage": 0.0, "active_premium": 0.0,
        })
        b["total"] += 1
        b[p.status] = b.get(p.status, 0) + 1
        if p.status == "active":
            b["active_coverage"] += p.coverage_amount
            b["active_premium"] += p.annual_premium

    # Join user info (buyer count is small at demo scale → per-id fetch is fine)
    buyers = []
    for uid, b in agg.items():
        try:
            u = await User.get(uid)
        except Exception:
            u = None
        buyers.append({
            **b,
            "email": u.email if u else None,
            "full_name": u.full_name if u else None,
            "province": u.province if u else None,
            "is_active": u.is_active if u else None,
        })
    buyers.sort(key=lambda x: x["total"], reverse=True)

    return {"total_buyers": len(buyers), "buyers": buyers}


@router.get("/user-policies/user/{user_id}")
async def get_user_policies_detail(
    user_id: str,
    current_user: User = Depends(require_admin),
) -> dict:
    """Chi tiết tất cả gói của 1 user (drill-down). Admin only."""
    policies = await UserPolicy.find(
        UserPolicy.user_id == user_id
    ).sort(-UserPolicy.created_at).to_list()
    target = await User.get(user_id)
    return {
        "user": _serialize_user(target) if target else {"id": user_id},
        "policies": [_serialize_user_policy_admin(p) for p in policies],
    }


class VoidPolicyRequest(BaseModel):
    reason: str


@router.patch("/user-policies/{policy_id}/void")
async def void_user_policy(
    policy_id: str,
    body: VoidPolicyRequest,
    request: Request,
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Vô hiệu hoá gói bảo hiểm của 1 user khi phát hiện bất thường.
    Cho phép cả **reviewer** và **admin** (require_reviewer). Ghi audit + notify user."""
    reason = (body.reason or "").strip()
    if len(reason) < 3:
        raise HTTPException(422, "Cần nêu lý do vô hiệu hoá (tối thiểu 3 ký tự)")

    policy = await UserPolicy.get(policy_id)
    if not policy:
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")
    if policy.status == "voided":
        raise HTTPException(409, "Gói này đã bị vô hiệu hoá")

    previous_status = policy.status
    policy.status = "voided"
    policy.voided_by = str(current_user.id)
    policy.voided_reason = reason
    policy.voided_at = datetime.utcnow()
    await policy.save()

    await log_action(
        current_user, "policy_voided", "user_policy", policy_id,
        {
            "policy_number": policy.policy_number,
            "policy_type": policy.policy_type,
            "owner_id": policy.user_id,
            "previous_status": previous_status,
            "reason": reason,
        },
        request.client.host if request.client else None,
    )

    await notify(
        policy.user_id, type="system",
        title="Gói bảo hiểm bị vô hiệu hoá",
        body=f"Gói {policy.plan_name} ({policy.policy_number}) đã bị vô hiệu hoá. Lý do: {reason}",
        link="/policies",
    )

    return _serialize_user_policy_admin(policy)
