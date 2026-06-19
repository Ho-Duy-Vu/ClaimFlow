import logging
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.claim import Claim
from app.models.geo_risk import GeoRisk
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _scope_query(user: User) -> dict:
    """Admin/reviewer thấy toàn bộ; user thường chỉ thấy claim của mình."""
    if user.role in ("admin", "reviewer"):
        return {}
    return {"user_id": str(user.id)}


@router.get("/summary")
async def summary(
    current_user: User = Depends(get_current_user),
) -> dict:
    base_q = _scope_query(current_user)

    total = await Claim.find(base_q).count()
    approved = await Claim.find({**base_q, "status": "approved"}).count()
    rejected = await Claim.find({**base_q, "status": "rejected"}).count()
    manual = await Claim.find({**base_q, "status": "manual_review"}).count()
    processing = await Claim.find({**base_q, "status": "processing"}).count()

    approval_rate = round(approved / total * 100, 1) if total else 0.0

    # Avg processing time (created_at → processed_at) in minutes
    processed_claims = await Claim.find(
        {**base_q, "processed_at": {"$ne": None}}
    ).to_list()
    total_seconds = sum(
        (c.processed_at - c.created_at).total_seconds()
        for c in processed_claims
        if c.processed_at and c.created_at
    )
    avg_processing_minutes = round(total_seconds / len(processed_claims) / 60, 1) if processed_claims else 0.0

    # Approved amount
    approved_claims = await Claim.find({**base_q, "status": "approved"}).to_list()
    total_approved_amount = sum(c.amount_approved or c.amount_claimed for c in approved_claims)

    return {
        "scope": "all" if not base_q else "user",
        "total_claims": total,
        "approved": approved,
        "rejected": rejected,
        "manual_review": manual,
        "processing": processing,
        "approval_rate": approval_rate,
        "avg_processing_minutes": avg_processing_minutes,
        "total_approved_amount": total_approved_amount,
    }


@router.get("/daily")
async def daily(
    days: int = 30,
    current_user: User = Depends(get_current_user),
) -> dict:
    days = max(1, min(days, 90))
    base_q = _scope_query(current_user)

    now = datetime.utcnow()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    daily_counts: list[dict] = []
    for i in range(days):
        day = start + timedelta(days=i)
        next_day = day + timedelta(days=1)
        q = {**base_q, "created_at": {"$gte": day, "$lt": next_day}}
        count = await Claim.find(q).count()
        approved = await Claim.find({**q, "status": "approved"}).count()
        daily_counts.append({
            "date": day.date().isoformat(),
            "count": count,
            "approved": approved,
        })

    # Region + disaster breakdown
    province_to_region = {p.province_name: p.region for p in await GeoRisk.find().to_list()}
    region_counts: Counter = Counter()
    disaster_counts: Counter = Counter()
    type_counts: Counter = Counter()

    claims = await Claim.find({**base_q, "created_at": {"$gte": start}}).to_list()
    for c in claims:
        region = province_to_region.get(c.province or "", "unknown")
        region_counts[region] += 1
        if c.disaster_type:
            disaster_counts[c.disaster_type] += 1
        if c.claim_type:
            type_counts[c.claim_type] += 1

    return {
        "days": days,
        "daily_counts": daily_counts,
        "region_breakdown": dict(region_counts),
        "disaster_types": disaster_counts.most_common(10),
        "claim_types": dict(type_counts),
    }
