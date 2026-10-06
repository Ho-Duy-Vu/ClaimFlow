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
from app.models.payment import Payment
from app.models.partner import Partner
from app.models.underwriting_rule import UnderwritingRule
from app.models.user import User
from app.models.user_policy import UserPolicy
from app.api.routes.analytics import _get_time_bounds
from app.services.dispatcher import (
    get_or_create_underwriting_rules,
    auto_dispatch_claim,
    dispatch_pending_claims,
)
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
    try:
        await AuditLog(
            actor_id=str(actor.id),
            actor_email=actor.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
            ip_address=ip_address,
        ).insert()
    except Exception as exc:
        logger.warning("Failed to record audit log for action=%s: %s", action, exc)


def _serialize_user(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "province": u.province,
        "region": u.region,
        "is_active": u.is_active,
        "specializations": getattr(u, "specializations", []) or [],
        "max_active_claims": getattr(u, "max_active_claims", 10) or 10,
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
    period: str = "year",
    year: int | None = None,
    quarter: int | None = None,
    month: int | None = None,
    week: int | None = None,
    current_user: User = Depends(require_reviewer),
) -> dict:
    now = datetime.utcnow()
    selected_year = year or now.year
    selected_month = month or now.month
    selected_quarter = quarter or ((now.month - 1) // 3 + 1)
    selected_week = week or now.isocalendar()[1]

    # Global counts
    total_users = await User.find().count()
    active_users = await User.find(User.is_active == True).count()  # noqa: E712
    reviewers = await User.find(User.role == "reviewer").count()

    # Time Bounds for filtered period
    start_dt, end_dt = _get_time_bounds(
        period,
        year=selected_year,
        month=selected_month,
        quarter=selected_quarter,
        week=selected_week,
    )

    # Fetch all claims & payments
    all_claims = await Claim.find().to_list()
    all_payments = await Payment.find(Payment.status == "paid").to_list()
    active_policies = await UserPolicy.find(UserPolicy.status == "active").to_list()

    # Filter claims for the active period
    if start_dt and end_dt:
        period_claims = [c for c in all_claims if c.created_at and start_dt <= c.created_at < end_dt]
        period_payments = [p for p in all_payments if p.paid_at and start_dt <= p.paid_at < end_dt]
    else:
        period_claims = all_claims
        period_payments = all_payments

    total_claims = len(period_claims)
    approved = sum(1 for c in period_claims if c.status == "approved")
    rejected = sum(1 for c in period_claims if c.status == "rejected")
    manual_review = sum(1 for c in period_claims if c.status == "manual_review")
    processing = sum(1 for c in period_claims if c.status == "processing")
    approval_rate = round(approved / total_claims * 100, 1) if total_claims else 0.0

    high_fraud = sum(1 for c in period_claims if (c.ai_fraud_score or 0) >= 70)
    fraud_rate = round(high_fraud / total_claims * 100, 1) if total_claims else 0.0

    # Financials for period
    period_approved_amount = sum(c.amount_approved or 0 for c in period_claims if c.status == "approved")
    period_claimed_amount = sum(c.amount_claimed or 0 for c in period_claims)
    outstanding_reserves = sum(
        c.amount_claimed or 0
        for c in period_claims
        if c.status in ("pending", "processing", "manual_review")
    )
    fraud_prevented = sum(
        c.amount_claimed or 0
        for c in period_claims
        if c.status == "rejected" or (c.ai_fraud_score or 0) >= 70
    )
    stp_count = sum(1 for c in period_claims if c.status == "approved" and not c.reviewer_id)
    stp_rate = round(stp_count / approved * 100, 1) if approved else 0.0

    # GWP (Gross Written Premium) in period
    period_gwp = sum(p.amount for p in period_payments)
    if period_gwp == 0 and active_policies:
        total_annual = sum(p.annual_premium or 0 for p in active_policies)
        if period == "month":
            period_gwp = round(total_annual / 12, 0)
        elif period == "quarter":
            period_gwp = round(total_annual / 4, 0)
        elif period == "week":
            period_gwp = round(total_annual / 52, 0)
        else:
            period_gwp = total_annual

    loss_ratio = round(period_approved_amount / period_gwp * 100, 1) if period_gwp else 0.0

    # ── Quarterly Comparison Matrix (Q1..Q4) for selected year ───────────────
    quarterly_comparison: list[dict] = []
    for q_num in range(1, 5):
        q_start, q_end = _get_time_bounds("quarter", year=selected_year, quarter=q_num)
        q_cls = [c for c in all_claims if c.created_at and q_start <= c.created_at < q_end] if q_start and q_end else []
        q_claims_paid = sum(c.amount_approved or 0 for c in q_cls if c.status == "approved")
        q_pmts = [p for p in all_payments if p.paid_at and q_start <= p.paid_at < q_end] if q_start and q_end else []
        q_gwp = sum(p.amount for p in q_pmts)
        if q_gwp == 0 and active_policies:
            q_gwp = round(sum(p.annual_premium or 0 for p in active_policies) / 4, 0)
        q_lr = round(q_claims_paid / q_gwp * 100, 1) if q_gwp else 0.0

        quarterly_comparison.append({
            "quarter": q_num,
            "name": f"Quý {q_num}/{selected_year}",
            "gwp": q_gwp,
            "claims_paid": q_claims_paid,
            "claims_count": len(q_cls),
            "loss_ratio": q_lr,
        })

    # ── Timeline Points Generation ──────────────────────────────────────────
    timeline_points: list[dict] = []
    if period == "quarter":
        # 3 monthly points in this quarter
        m_start = (selected_quarter - 1) * 3 + 1
        for m in range(m_start, m_start + 3):
            sub_start, sub_end = _get_time_bounds("month", year=selected_year, month=m)
            sub_cls = [c for c in all_claims if c.created_at and sub_start <= c.created_at < sub_end] if sub_start and sub_end else []
            sub_app_amt = sum(c.amount_approved or 0 for c in sub_cls if c.status == "approved")
            sub_clm_amt = sum(c.amount_claimed or 0 for c in sub_cls)
            sub_pmts = [p for p in all_payments if p.paid_at and sub_start <= p.paid_at < sub_end] if sub_start and sub_end else []
            sub_prem = sum(p.amount for p in sub_pmts)
            if sub_prem == 0 and active_policies:
                sub_prem = round(sum(p.annual_premium or 0 for p in active_policies) / 12, 0)
            sub_lr = round(sub_app_amt / sub_prem * 100, 1) if sub_prem else 0.0

            timeline_points.append({
                "label": f"Thg {m:02d}",
                "full_label": f"Tháng {m:02d}/{selected_year}",
                "date": f"{selected_year}-{m:02d}",
                "claims_count": len(sub_cls),
                "approved_count": sum(1 for c in sub_cls if c.status == "approved"),
                "claimed_amount": sub_clm_amt,
                "approved_amount": sub_app_amt,
                "premium_paid": sub_prem,
                "loss_ratio": sub_lr,
            })
    elif period == "week":
        # 7 daily points Monday to Sunday
        if start_dt:
            for day_offset in range(7):
                cur_day = start_dt + timedelta(days=day_offset)
                next_day = cur_day + timedelta(days=1)
                sub_cls = [c for c in all_claims if c.created_at and cur_day <= c.created_at < next_day]
                sub_app_amt = sum(c.amount_approved or 0 for c in sub_cls if c.status == "approved")
                sub_clm_amt = sum(c.amount_claimed or 0 for c in sub_cls)
                sub_pmts = [p for p in all_payments if p.paid_at and cur_day <= p.paid_at < next_day]
                sub_prem = sum(p.amount for p in sub_pmts)
                weekday_name = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][cur_day.weekday()]

                timeline_points.append({
                    "label": f"{weekday_name} {cur_day.day:02d}/{cur_day.month:02d}",
                    "full_label": f"{weekday_name}, {cur_day.strftime('%d/%m/%Y')}",
                    "date": cur_day.strftime("%Y-%m-%d"),
                    "claims_count": len(sub_cls),
                    "approved_count": sum(1 for c in sub_cls if c.status == "approved"),
                    "claimed_amount": sub_clm_amt,
                    "approved_amount": sub_app_amt,
                    "premium_paid": sub_prem,
                    "loss_ratio": round(sub_app_amt / sub_prem * 100, 1) if sub_prem else 0.0,
                })
    elif period == "month":
        # Days in selected month
        import calendar
        _, num_days = calendar.monthrange(selected_year, selected_month)
        for d in range(1, num_days + 1):
            cur_day = datetime(selected_year, selected_month, d)
            next_day = cur_day + timedelta(days=1)
            sub_cls = [c for c in all_claims if c.created_at and cur_day <= c.created_at < next_day]
            sub_app_amt = sum(c.amount_approved or 0 for c in sub_cls if c.status == "approved")
            sub_clm_amt = sum(c.amount_claimed or 0 for c in sub_cls)
            sub_pmts = [p for p in all_payments if p.paid_at and cur_day <= p.paid_at < next_day]
            sub_prem = sum(p.amount for p in sub_pmts)

            timeline_points.append({
                "label": f"{d:02d}",
                "full_label": f"{d:02d}/{selected_month:02d}/{selected_year}",
                "date": cur_day.strftime("%Y-%m-%d"),
                "claims_count": len(sub_cls),
                "approved_count": sum(1 for c in sub_cls if c.status == "approved"),
                "claimed_amount": sub_clm_amt,
                "approved_amount": sub_app_amt,
                "premium_paid": sub_prem,
                "loss_ratio": round(sub_app_amt / sub_prem * 100, 1) if sub_prem else 0.0,
            })
    else:
        # Year or All -> 12 months of selected year
        for m in range(1, 13):
            sub_start, sub_end = _get_time_bounds("month", year=selected_year, month=m)
            sub_cls = [c for c in all_claims if c.created_at and sub_start <= c.created_at < sub_end] if sub_start and sub_end else []
            sub_app_amt = sum(c.amount_approved or 0 for c in sub_cls if c.status == "approved")
            sub_clm_amt = sum(c.amount_claimed or 0 for c in sub_cls)
            sub_pmts = [p for p in all_payments if p.paid_at and sub_start <= p.paid_at < sub_end] if sub_start and sub_end else []
            sub_prem = sum(p.amount for p in sub_pmts)
            if sub_prem == 0 and active_policies:
                sub_prem = round(sum(p.annual_premium or 0 for p in active_policies) / 12, 0)
            sub_lr = round(sub_app_amt / sub_prem * 100, 1) if sub_prem else 0.0

            timeline_points.append({
                "label": f"Thg {m:02d}",
                "full_label": f"Tháng {m:02d}/{selected_year}",
                "date": f"{selected_year}-{m:02d}",
                "claims_count": len(sub_cls),
                "approved_count": sum(1 for c in sub_cls if c.status == "approved"),
                "claimed_amount": sub_clm_amt,
                "approved_amount": sub_app_amt,
                "premium_paid": sub_prem,
                "loss_ratio": sub_lr,
            })

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

    # Reviewer performance
    reviewer_perf: list[dict] = []
    reviewer_users = await User.find({"role": {"$in": ["reviewer", "admin"]}}).to_list()
    for r in reviewer_users:
        rid = str(r.id)
        r_claims = [c for c in period_claims if c.reviewer_id == rid]
        if not r_claims:
            continue
        r_approved = sum(1 for c in r_claims if c.status == "approved")
        r_rejected = sum(1 for c in r_claims if c.status == "rejected")
        reviewer_perf.append({
            "reviewer_id": rid,
            "email": r.email,
            "full_name": r.full_name,
            "total_reviewed": len(r_claims),
            "approved": r_approved,
            "rejected": r_rejected,
            "approval_rate": round(r_approved / len(r_claims) * 100, 1),
        })
    reviewer_perf.sort(key=lambda x: x["total_reviewed"], reverse=True)

    # Region breakdown
    region_counts: dict[str, int] = {"north": 0, "central": 0, "south": 0, "unknown": 0}
    province_to_region = {p.province_name: p.region for p in await GeoRisk.find().to_list()}
    for c in period_claims:
        region = province_to_region.get(c.province or "", "unknown")
        region_counts[region] = region_counts.get(region, 0) + 1

    return {
        "period": period,
        "selected_year": selected_year,
        "selected_quarter": selected_quarter,
        "selected_month": selected_month,
        "selected_week": selected_week,
        "available_years": [2026, 2025, 2024],
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
        "financials": {
            "loss_ratio": loss_ratio,
            "total_paid_premium": period_gwp,
            "total_approved_amount": period_approved_amount,
            "total_claimed_amount": period_claimed_amount,
            "outstanding_reserves": outstanding_reserves,
            "fraud_prevented_amount": fraud_prevented,
            "stp_rate": stp_rate,
        },
        "quarterly_comparison": quarterly_comparison,
        "timeline_points": timeline_points,
        "top_high_risk_provinces": top_provinces,
        "reviewer_performance": reviewer_perf,
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
        "insured_person": p.insured_person,
        "subject_details": p.subject_details,
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


# ── Mạng lưới Đối tác & Điểm cứu hộ (Partners: Garage, Hospital, Rescue) ───────

class PartnerCreateUpdateRequest(BaseModel):
    name: str
    partner_type: Literal["garage", "hospital", "rescue"]
    province: str
    address: str
    lat: float = 21.0285
    lng: float = 105.8542
    phone: str
    hotline: str
    cashless_supported: bool = True
    rating: float = 4.8
    services: list[str] = []
    opening_hours: str = "24/7"
    is_active: bool = True


def _serialize_partner(p: Partner) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "partner_type": p.partner_type,
        "province": p.province,
        "address": p.address,
        "lat": p.lat,
        "lng": p.lng,
        "phone": p.phone,
        "hotline": p.hotline,
        "cashless_supported": p.cashless_supported,
        "rating": p.rating,
        "services": p.services,
        "opening_hours": p.opening_hours,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.get("/partners")
async def list_partners(
    partner_type: str | None = None,
    province: str | None = None,
    q: str | None = None,
    is_active: bool | None = None,
    current_user: User = Depends(require_reviewer),
) -> dict:
    query: dict = {}
    if partner_type and partner_type != "all":
        query["partner_type"] = partner_type
    if province and province != "all":
        query["province"] = province
    if is_active is not None:
        query["is_active"] = is_active
    if q and q.strip():
        query["name"] = {"$regex": q.strip(), "$options": "i"}

    partners = await Partner.find(query).sort([("rating", -1), ("name", 1)]).to_list()
    return {
        "total": len(partners),
        "items": [_serialize_partner(p) for p in partners],
    }


@router.post("/partners", status_code=201)
async def create_partner(
    body: PartnerCreateUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    p = Partner(
        name=body.name.strip(),
        partner_type=body.partner_type,
        province=body.province.strip(),
        address=body.address.strip(),
        lat=body.lat,
        lng=body.lng,
        phone=body.phone.strip(),
        hotline=body.hotline.strip(),
        cashless_supported=body.cashless_supported,
        rating=body.rating,
        services=body.services,
        opening_hours=body.opening_hours.strip(),
        is_active=body.is_active,
    )
    await p.insert()

    await log_action(
        current_user, "partner_created", "partner", str(p.id),
        {"name": p.name, "type": p.partner_type, "province": p.province},
        request.client.host if request.client else None,
    )
    return _serialize_partner(p)


@router.put("/partners/{partner_id}")
async def update_partner(
    partner_id: str,
    body: PartnerCreateUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    p = await Partner.get(partner_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy đối tác liên kết")

    p.name = body.name.strip()
    p.partner_type = body.partner_type
    p.province = body.province.strip()
    p.address = body.address.strip()
    p.lat = body.lat
    p.lng = body.lng
    p.phone = body.phone.strip()
    p.hotline = body.hotline.strip()
    p.cashless_supported = body.cashless_supported
    p.rating = body.rating
    p.services = body.services
    p.opening_hours = body.opening_hours.strip()
    p.is_active = body.is_active
    await p.save()

    await log_action(
        current_user, "partner_updated", "partner", partner_id,
        {"name": p.name, "type": p.partner_type},
        request.client.host if request.client else None,
    )
    return _serialize_partner(p)


@router.delete("/partners/{partner_id}")
async def delete_partner(
    partner_id: str,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    p = await Partner.get(partner_id)
    if not p:
        raise HTTPException(404, "Không tìm thấy đối tác liên kết")
    p.is_active = not p.is_active
    await p.save()

    await log_action(
        current_user, "partner_status_toggled", "partner", partner_id,
        {"name": p.name, "new_active": p.is_active},
        request.client.host if request.client else None,
    )
    return {"ok": True, "partner_id": partner_id, "is_active": p.is_active}


class PartnerDispatchRequest(BaseModel):
    claim_id: str
    partner_id: str
    service_type: Literal["rescue_dispatch", "direct_billing", "garage_repair"]
    notes: str | None = None


@router.post("/partners/dispatch")
async def dispatch_partner_to_claim(
    body: PartnerDispatchRequest,
    request: Request,
    current_user: User = Depends(require_reviewer),
) -> dict:
    """Phát lệnh cứu hộ khẩn cấp hoặc gửi Bảo lãnh viện phí / sửa chữa trực tiếp cho hồ sơ bồi thường."""
    claim = await Claim.get(body.claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy hồ sơ bồi thường")

    partner = await Partner.get(body.partner_id)
    if not partner:
        raise HTTPException(404, "Không tìm thấy đối tác")

    claim.partner_id = str(partner.id)
    claim.partner_service_type = body.service_type
    claim.partner_dispatched_at = datetime.utcnow()
    claim.partner_guarantee_status = "guaranteed" if body.service_type == "direct_billing" else "dispatched"
    claim.partner_notes = body.notes
    await claim.save()

    service_names = {
        "rescue_dispatch": "Cứu hộ khẩn cấp",
        "direct_billing": "Bảo lãnh viện phí trực tiếp",
        "garage_repair": "Bảo lãnh sửa chữa Gara liên kết",
    }
    svc_label = service_names.get(body.service_type, "Dịch vụ đối tác")

    # Thông báo cho khách hàng
    await notify(
        claim.user_id,
        type="system",
        title=f"Đã kích hoạt {svc_label}",
        body=f"Hồ sơ bồi thường của bạn đã được kết nối với đối tác: {partner.name}. Địa chỉ: {partner.address}. Hotline: {partner.hotline}.",
        link=f"/claims/{claim.id}",
    )

    await log_action(
        current_user, "partner_dispatched", "claim", str(claim.id),
        {"partner_id": str(partner.id), "partner_name": partner.name, "service_type": body.service_type},
        request.client.host if request.client else None,
    )

    return {
        "ok": True,
        "claim_id": str(claim.id),
        "partner": _serialize_partner(partner),
        "service_type": body.service_type,
        "service_label": svc_label,
        "dispatched_at": claim.partner_dispatched_at.isoformat(),
    }


# ── Cấu hình Quy tắc Thẩm định & Phân bổ (Underwriting & STP Rules) ───────────

class UnderwritingRuleUpdateRequest(BaseModel):
    stp_enabled: bool
    max_stp_amount: float
    max_stp_fraud_score: int
    min_ocr_confidence: float
    high_value_threshold: float
    auto_dispatch_enabled: bool
    auto_assignment_mode: str = "specialization_and_load"


@router.get("/underwriting-rules")
async def get_underwriting_rules(
    current_user: User = Depends(require_admin),
) -> dict:
    rule = await get_or_create_underwriting_rules()
    return {
        "id": str(rule.id),
        "stp_enabled": rule.stp_enabled,
        "max_stp_amount": rule.max_stp_amount,
        "max_stp_fraud_score": rule.max_stp_fraud_score,
        "min_ocr_confidence": rule.min_ocr_confidence,
        "high_value_threshold": rule.high_value_threshold,
        "auto_dispatch_enabled": rule.auto_dispatch_enabled,
        "auto_assignment_mode": rule.auto_assignment_mode,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
        "updated_by": rule.updated_by,
    }


@router.put("/underwriting-rules")
async def update_underwriting_rules(
    body: UnderwritingRuleUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    rule = await get_or_create_underwriting_rules()
    rule.stp_enabled = body.stp_enabled
    rule.max_stp_amount = max(0.0, body.max_stp_amount)
    rule.max_stp_fraud_score = max(0, min(100, body.max_stp_fraud_score))
    rule.min_ocr_confidence = max(0.0, min(100.0, body.min_ocr_confidence))
    rule.high_value_threshold = max(0.0, body.high_value_threshold)
    rule.auto_dispatch_enabled = body.auto_dispatch_enabled
    rule.auto_assignment_mode = body.auto_assignment_mode
    rule.updated_at = datetime.utcnow()
    rule.updated_by = current_user.email
    await rule.save()

    await log_action(
        current_user, "underwriting_rules_updated", "system_config", str(rule.id),
        {
            "stp_enabled": rule.stp_enabled,
            "max_stp_amount": rule.max_stp_amount,
            "max_stp_fraud_score": rule.max_stp_fraud_score,
            "high_value_threshold": rule.high_value_threshold,
            "auto_dispatch_enabled": rule.auto_dispatch_enabled,
        },
        request.client.host if request.client else None,
    )
    return {
        "ok": True,
        "stp_enabled": rule.stp_enabled,
        "max_stp_amount": rule.max_stp_amount,
        "max_stp_fraud_score": rule.max_stp_fraud_score,
        "min_ocr_confidence": rule.min_ocr_confidence,
        "high_value_threshold": rule.high_value_threshold,
        "auto_dispatch_enabled": rule.auto_dispatch_enabled,
        "auto_assignment_mode": rule.auto_assignment_mode,
        "updated_at": rule.updated_at.isoformat(),
        "updated_by": rule.updated_by,
    }


# ── Phân bổ Hồ sơ Thông minh & Quản lý Thẩm định viên (Smart Dispatch) ────────

@router.post("/dispatch/auto-assign-all")
async def auto_dispatch_all(
    current_user: User = Depends(require_admin),
) -> dict:
    """Kích hoạt chạy phân bổ tự động cho toàn bộ hồ sơ đang chờ trong hàng đợi."""
    result = await dispatch_pending_claims()
    return result


class ManualAssignRequest(BaseModel):
    claim_id: str
    reviewer_id: str


@router.post("/dispatch/assign")
async def manual_assign_claim(
    body: ManualAssignRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    """Admin điều chuyển hoặc gán thủ công 1 hồ sơ cho Reviewer cụ thể."""
    claim = await Claim.get(body.claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy hồ sơ bồi thường")

    reviewer = await User.get(body.reviewer_id)
    if not reviewer or reviewer.role not in ("reviewer", "admin"):
        raise HTTPException(400, "Thẩm định viên không hợp lệ")

    claim.reviewer_id = str(reviewer.id)
    claim.assigned_at = datetime.utcnow()
    claim.assigned_by = current_user.email
    await claim.save()

    await notify(
        str(reviewer.id),
        type="system",
        title="Hồ sơ được phân công",
        body=f"Hồ sơ {claim.claim_type.upper()} ({claim.amount_claimed:,.0f} đ) đã được Admin điều chuyển cho bạn.",
        link="/reviewer",
    )

    await log_action(
        current_user, "claim_manual_assigned", "claim", str(claim.id),
        {"reviewer_id": str(reviewer.id), "reviewer_email": reviewer.email},
        request.client.host if request.client else None,
    )
    return {"ok": True, "claim_id": str(claim.id), "reviewer_id": str(reviewer.id), "reviewer_email": reviewer.email}


class ReviewerProfileUpdateRequest(BaseModel):
    specializations: list[str]
    max_active_claims: int = 10


@router.put("/reviewers/{reviewer_id}/profile")
async def update_reviewer_profile(
    reviewer_id: str,
    body: ReviewerProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    """Cập nhật chuyên môn thẩm định (Xe, Y tế, Nhà cửa, Thiên tai) và hạn mức thụ lý."""
    u = await User.get(reviewer_id)
    if not u or u.role not in ("reviewer", "admin"):
        raise HTTPException(404, "Không tìm thấy thẩm định viên")

    u.specializations = body.specializations
    u.max_active_claims = max(1, body.max_active_claims)
    await u.save()

    await log_action(
        current_user, "reviewer_profile_updated", "user", reviewer_id,
        {"specializations": u.specializations, "max_active_claims": u.max_active_claims},
        request.client.host if request.client else None,
    )
    return _serialize_user(u)


# ── Four-Eyes Principle: Admin Ký duyệt Chi Cấp 2 cho Hồ sơ Lớn (>= 50M) ──────

@router.get("/claims/pending-admin-approval")
async def list_claims_pending_admin_approval(
    current_user: User = Depends(require_admin),
) -> dict:
    """Danh sách các hồ sơ bồi thường giá trị cao (>= 50M) đã qua Reviewer sơ bộ, đang chờ Admin ký duyệt chi."""
    claims = await Claim.find({
        "requires_admin_approval": True,
        "admin_approved_at": None,
    }).sort(-Claim.amount_approved).to_list()

    items = []
    for c in claims:
        u = await User.get(c.user_id) if c.user_id else None
        r = await User.get(c.reviewer_id) if c.reviewer_id else None
        items.append({
            "id": str(c.id),
            "claim_id": str(c.id),
            "claim_type": c.claim_type,
            "status": c.status,
            "amount_claimed": c.amount_claimed,
            "amount_approved": c.amount_approved,
            "claimant_name": u.full_name if u else None,
            "claimant_email": u.email if u else None,
            "reviewer_name": r.full_name if r else (r.email if r else "Thẩm định viên"),
            "reviewer_email": r.email if r else None,
            "reviewer_note": c.reviewer_note,
            "reviewed_at": c.reviewed_at.isoformat() if c.reviewed_at else None,
            "created_at": c.created_at.isoformat(),
        })

    return {"total": len(items), "items": items}


class AdminSignOffRequest(BaseModel):
    notes: str | None = None
    approved: bool = True


@router.post("/claims/{claim_id}/approve-high-value")
async def admin_sign_off_high_value(
    claim_id: str,
    body: AdminSignOffRequest,
    request: Request,
    current_user: User = Depends(require_admin),
) -> dict:
    """Admin ký duyệt chi cấp 2 (Four-Eyes Principle) cho hồ sơ bồi thường giá trị lớn."""
    claim = await Claim.get(claim_id)
    if not claim:
        raise HTTPException(404, "Không tìm thấy hồ sơ bồi thường")
    if not claim.requires_admin_approval:
        raise HTTPException(400, "Hồ sơ này không yêu cầu cấp duyệt Admin")

    if body.approved:
        claim.admin_approved_by = current_user.email
        claim.admin_approved_at = datetime.utcnow()
        claim.payment_status = "pending" # Mở khóa để chi trả
        await claim.save()

        # Thông báo cho khách hàng & reviewer
        await notify(
            claim.user_id,
            type="claim_reviewed",
            title="Hồ sơ bồi thường đã hoàn tất phê duyệt chi",
            body=f"Hồ sơ giá trị lớn ({claim.amount_approved:,.0f} đ) đã được Ban Giám đốc phê duyệt chi trả hoàn tất.",
            link=f"/claims/{claim.id}",
        )

        await log_action(
            current_user, "admin_signoff_approved", "claim", str(claim.id),
            {"amount_approved": claim.amount_approved, "admin": current_user.email, "notes": body.notes},
            request.client.host if request.client else None,
        )
        return {"ok": True, "claim_id": str(claim.id), "status": "approved", "admin_approved_by": current_user.email}
    else:
        claim.status = "manual_review"
        claim.requires_admin_approval = False
        claim.reviewer_note = f"[Admin yêu cầu thẩm định lại]: {body.notes or 'Chưa đạt điều kiện chi trả lớn'}"
        await claim.save()

        if claim.reviewer_id:
            await notify(
                claim.reviewer_id,
                type="system",
                title="Hồ sơ bị Admin trả về thẩm định lại",
                body=f"Hồ sơ {claim.id} ({claim.amount_approved:,.0f} đ) bị Admin từ chối duyệt chi: {body.notes}",
                link="/reviewer",
            )

        await log_action(
            current_user, "admin_signoff_rejected", "claim", str(claim.id),
            {"amount_approved": claim.amount_approved, "admin": current_user.email, "notes": body.notes},
            request.client.host if request.client else None,
        )
        return {"ok": True, "claim_id": str(claim.id), "status": "manual_review", "returned_to_reviewer": True}

