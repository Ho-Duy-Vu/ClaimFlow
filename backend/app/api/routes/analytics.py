import calendar
import logging
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.models.claim import Claim
from app.models.document import Document
from app.models.geo_risk import GeoRisk
from app.models.payment import Payment
from app.models.user import User
from app.models.user_policy import UserPolicy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _scope_query(user: User) -> dict:
    """Admin/reviewer thấy toàn bộ; user thường chỉ thấy của mình."""
    if user.role in ("admin", "reviewer"):
        return {}
    return {"user_id": str(user.id)}


def _get_time_bounds(
    period: str,
    year: int | None = None,
    month: int | None = None,
    quarter: int | None = None,
    week: int | None = None,
) -> tuple[datetime | None, datetime | None]:
    now = datetime.utcnow()
    y = year or now.year
    if period == "7d":
        start = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now + timedelta(days=1)
    elif period == "30d":
        start = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now + timedelta(days=1)
    elif period == "week":
        target_week = week or now.isocalendar()[1]
        try:
            start = datetime.strptime(f"{y}-W{target_week:02d}-1", "%G-W%V-%u")
        except ValueError:
            start = datetime(y, 1, 1) + timedelta(weeks=target_week - 1)
        end = start + timedelta(days=7)
        return start, end
    elif period == "month":
        m = month or now.month
        start = datetime(y, m, 1)
        if m == 12:
            end = datetime(y + 1, 1, 1)
        else:
            end = datetime(y, m + 1, 1)
        return start, end
    elif period == "quarter":
        q = quarter or ((now.month - 1) // 3 + 1)
        q = max(1, min(4, q))
        start_month = (q - 1) * 3 + 1
        start = datetime(y, start_month, 1)
        if q == 4:
            end = datetime(y + 1, 1, 1)
        else:
            end = datetime(y, start_month + 3, 1)
        return start, end
    elif period == "year":
        return datetime(y, 1, 1), datetime(y + 1, 1, 1)
    return None, None


@router.get("/summary")
async def summary(
    period: str = Query("all", regex="^(all|year|quarter|month|week|30d|7d)$"),
    year: int | None = None,
    month: int | None = None,
    quarter: int | None = None,
    week: int | None = None,
    current_user: User = Depends(get_current_user),
) -> dict:
    now = datetime.utcnow()
    base_q = _scope_query(current_user)
    target_year = year or now.year
    target_month = month or now.month
    target_quarter = quarter or ((now.month - 1) // 3 + 1)
    target_week = week or now.isocalendar()[1]

    start_dt, end_dt = _get_time_bounds(period, target_year, target_month, target_quarter, target_week)

    # ── 1. User Policies Overview ──────────────────────────────────────────
    policies = await UserPolicy.find(base_q).to_list()
    active_policies = [p for p in policies if p.status == "active"]
    total_coverage = sum(p.coverage_amount for p in active_policies)
    total_annual_premium = sum(p.annual_premium for p in active_policies)

    # Unique insured persons in family
    family_members = set()
    for p in policies:
        if p.insured_person and p.insured_person.get("name"):
            family_members.add(p.insured_person.get("name"))
        elif current_user.full_name:
            family_members.add(current_user.full_name)

    policy_type_breakdown = Counter(p.policy_type for p in policies)

    # ── 2. Payments (installments) ─────────────────────────────────────────
    payments = await Payment.find(base_q).to_list()
    paid_payments = [p for p in payments if p.status == "paid"]
    pending_payments = [p for p in payments if p.status == "pending"]
    total_paid_premium = sum(p.amount for p in paid_payments)
    pending_payment_amount = sum(p.amount for p in pending_payments)

    # Payments within selected period
    period_payments_q = {**base_q, "status": "paid"}
    if start_dt and end_dt:
        period_payments_q["paid_at"] = {"$gte": start_dt, "$lt": end_dt}
    period_paid_payments = await Payment.find(period_payments_q).to_list()
    period_paid_premium = sum(p.amount for p in period_paid_payments) if (start_dt and end_dt) else total_paid_premium

    # ── 3. Claims (filtered by period) ─────────────────────────────────────
    claims_q = dict(base_q)
    if start_dt and end_dt:
        claims_q["created_at"] = {"$gte": start_dt, "$lt": end_dt}

    filtered_claims = await Claim.find(claims_q).to_list()
    total_claims = len(filtered_claims)
    approved_claims = [c for c in filtered_claims if c.status == "approved"]
    rejected_claims = [c for c in filtered_claims if c.status == "rejected"]
    manual_claims = [c for c in filtered_claims if c.status == "manual_review"]
    processing_claims = [c for c in filtered_claims if c.status in ("pending", "processing")]

    approval_rate = round(len(approved_claims) / total_claims * 100, 1) if total_claims else 0.0

    total_claimed_amount = sum(c.amount_claimed for c in filtered_claims)
    total_approved_amount = sum(c.amount_approved or c.amount_claimed for c in approved_claims)

    # Financial Loss Ratio (Tỷ lệ tổn thất)
    loss_ratio = round(total_approved_amount / period_paid_premium * 100, 1) if period_paid_premium > 0 else 0.0

    # Outstanding Loss Reserves (Dự phòng bồi thường tồn đọng)
    outstanding_claims = await Claim.find({**base_q, "status": {"$in": ["pending", "processing", "manual_review"]}}).to_list()
    outstanding_reserves = sum(c.amount_claimed for c in outstanding_claims)

    # Fraud Prevention Savings (Số tiền gian lận đã chặn)
    high_fraud_claims = [c for c in filtered_claims if c.status == "rejected" or (c.ai_fraud_score and c.ai_fraud_score >= 70)]
    fraud_prevented_amount = sum(c.amount_claimed for c in high_fraud_claims)

    # Straight-Through Processing (STP) Rate — AI auto-approved
    stp_claims = [c for c in approved_claims if not c.reviewer_id]
    stp_rate = round(len(stp_claims) / len(approved_claims) * 100, 1) if approved_claims else 0.0

    # Processing speed in minutes & SLA compliance (< 24 hours)
    processed_claims = [c for c in filtered_claims if c.processed_at and c.created_at]
    avg_minutes = (
        round(
            sum((c.processed_at - c.created_at).total_seconds() for c in processed_claims)
            / len(processed_claims)
            / 60,
            1,
        )
        if processed_claims
        else 0.0
    )
    sla_compliant = [c for c in processed_claims if (c.processed_at - c.created_at).total_seconds() <= 86400]
    sla_rate = round(len(sla_compliant) / len(processed_claims) * 100, 1) if processed_claims else 100.0

    claim_type_breakdown = dict(Counter(c.claim_type for c in filtered_claims))
    disaster_type_breakdown = [
        [k, v] for k, v in Counter(c.disaster_type for c in filtered_claims if c.disaster_type).most_common(10)
    ]

    # ── 4. Documents ───────────────────────────────────────────────────────
    docs = await Document.find(base_q).to_list()
    doc_type_breakdown = dict(Counter(d.doc_type for d in docs))
    confidences = [d.ocr_confidence for d in docs if d.ocr_confidence is not None]
    avg_ocr_confidence = round(sum(confidences) / len(confidences) * 100, 1) if confidences else 95.0

    # ── 5. Geo Risk ────────────────────────────────────────────────────────
    geo = None
    if current_user.province:
        geo = await GeoRisk.find_one({"province_name": current_user.province})

    # ── 6. Discover available years for filtering ─────────────────────────
    all_dates = []
    for c in await Claim.find(base_q).to_list():
        if c.created_at:
            all_dates.append(c.created_at)
    for p in policies:
        if p.start_date:
            all_dates.append(p.start_date)
    for py in payments:
        if py.paid_at:
            all_dates.append(py.paid_at)

    available_years = sorted(list({d.year for d in all_dates} | {now.year}), reverse=True)

    # ── 7. Quarterly Performance Matrix (Q1..Q4 for target_year) ───────────
    quarterly_matrix = []
    for q_idx in range(1, 5):
        q_start = datetime(target_year, (q_idx - 1) * 3 + 1, 1)
        q_end = datetime(target_year + 1, 1, 1) if q_idx == 4 else datetime(target_year, (q_idx - 1) * 3 + 4, 1)
        q_cq = {**base_q, "created_at": {"$gte": q_start, "$lt": q_end}}
        q_claims = await Claim.find(q_cq).to_list()
        q_approved = [c for c in q_claims if c.status == "approved"]
        q_claimed_amt = sum(c.amount_claimed for c in q_claims)
        q_approved_amt = sum(c.amount_approved or c.amount_claimed for c in q_approved)

        q_pq = {**base_q, "paid_at": {"$gte": q_start, "$lt": q_end}, "status": "paid"}
        q_payments = await Payment.find(q_pq).to_list()
        q_prem = sum(p.amount for p in q_payments)
        q_loss_ratio = round(q_approved_amt / q_prem * 100, 1) if q_prem > 0 else 0.0

        quarterly_matrix.append({
            "quarter": f"Q{q_idx}",
            "label": f"Quý {q_idx}/{target_year}",
            "months": f"T{(q_idx - 1) * 3 + 1:02d} - T{(q_idx - 1) * 3 + 3:02d}",
            "claims_count": len(q_claims),
            "approved_count": len(q_approved),
            "claimed_amount": q_claimed_amt,
            "approved_amount": q_approved_amt,
            "premium_paid": q_prem,
            "loss_ratio": q_loss_ratio,
        })

    return {
        "scope": "all" if not base_q else "user",
        "period": period,
        "selected_year": target_year,
        "selected_quarter": target_quarter,
        "selected_month": target_month,
        "selected_week": target_week,
        "available_years": available_years,
        # Claims
        "total_claims": total_claims,
        "approved": len(approved_claims),
        "rejected": len(rejected_claims),
        "manual_review": len(manual_claims),
        "processing": len(processing_claims),
        "approval_rate": approval_rate,
        "avg_processing_minutes": avg_minutes,
        "total_claimed_amount": total_claimed_amount,
        "total_approved_amount": total_approved_amount,
        "claim_types": claim_type_breakdown,
        "disaster_types": disaster_type_breakdown,
        # Enterprise Financials & InsurTech KPIs
        "loss_ratio": loss_ratio,
        "period_paid_premium": period_paid_premium,
        "outstanding_reserves": outstanding_reserves,
        "fraud_prevented_amount": fraud_prevented_amount,
        "stp_rate": stp_rate,
        "sla_rate": sla_rate,
        "quarterly_comparison": quarterly_matrix,
        # Policies & Financials
        "total_policies": len(policies),
        "active_policies": len(active_policies),
        "expired_policies": len([p for p in policies if p.status == "expired"]),
        "cancelled_policies": len([p for p in policies if p.status == "cancelled"]),
        "total_coverage_amount": total_coverage,
        "total_annual_premium": total_annual_premium,
        "total_paid_premium": total_paid_premium,
        "pending_payment_amount": pending_payment_amount,
        "family_members_count": max(1, len(family_members)),
        "policy_types": dict(policy_type_breakdown),
        # Documents
        "total_documents": len(docs),
        "avg_ocr_confidence": avg_ocr_confidence,
        "doc_types": doc_type_breakdown,
        # Geo
        "user_province": current_user.province or (geo.province_name if geo else None),
        "user_region": current_user.region or (geo.region if geo else None),
        "province_risk_score": geo.overall_risk_score if geo else None,
        "province_disasters": [d.model_dump() for d in geo.disaster_risks] if geo else [],
    }


@router.get("/timeline")
async def timeline(
    period: str = Query("year", regex="^(all|year|quarter|month|week|30d|7d)$"),
    year: int | None = None,
    quarter: int | None = None,
    month: int | None = None,
    week: int | None = None,
    current_user: User = Depends(get_current_user),
) -> dict:
    now = datetime.utcnow()
    base_q = _scope_query(current_user)
    target_year = year or now.year
    target_quarter = quarter or ((now.month - 1) // 3 + 1)
    target_quarter = max(1, min(4, target_quarter))
    target_month = month or now.month
    target_week = week or now.isocalendar()[1]

    points: list[dict] = []

    if period == "year":
        # 12 months for target_year
        for m in range(1, 13):
            start = datetime(target_year, m, 1)
            end = datetime(target_year + 1, 1, 1) if m == 12 else datetime(target_year, m + 1, 1)
            cq = {**base_q, "created_at": {"$gte": start, "$lt": end}}
            claims_m = await Claim.find(cq).to_list()
            approved_m = [c for c in claims_m if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_m)
            claimed_amt = sum(c.amount_claimed for c in claims_m)

            pq = {**base_q, "paid_at": {"$gte": start, "$lt": end}, "status": "paid"}
            payments_m = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_m)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": f"T{m:02d}",
                "full_label": f"Tháng {m:02d}/{target_year}",
                "date": f"{target_year}-{m:02d}",
                "claims_count": len(claims_m),
                "approved_count": len(approved_m),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    elif period == "quarter":
        # 3 months for target_quarter in target_year
        start_m = (target_quarter - 1) * 3 + 1
        for m in range(start_m, start_m + 3):
            start = datetime(target_year, m, 1)
            end = datetime(target_year + 1, 1, 1) if m == 12 else datetime(target_year, m + 1, 1)
            cq = {**base_q, "created_at": {"$gte": start, "$lt": end}}
            claims_m = await Claim.find(cq).to_list()
            approved_m = [c for c in claims_m if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_m)
            claimed_amt = sum(c.amount_claimed for c in claims_m)

            pq = {**base_q, "paid_at": {"$gte": start, "$lt": end}, "status": "paid"}
            payments_m = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_m)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": f"T{m:02d}",
                "full_label": f"Tháng {m:02d}/{target_year} (Quý {target_quarter})",
                "date": f"{target_year}-{m:02d}",
                "claims_count": len(claims_m),
                "approved_count": len(approved_m),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    elif period == "month":
        # Days of target_month in target_year
        num_days = calendar.monthrange(target_year, target_month)[1]
        for d in range(1, num_days + 1):
            start = datetime(target_year, target_month, d)
            end = start + timedelta(days=1)
            cq = {**base_q, "created_at": {"$gte": start, "$lt": end}}
            claims_d = await Claim.find(cq).to_list()
            approved_d = [c for c in claims_d if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_d)
            claimed_amt = sum(c.amount_claimed for c in claims_d)

            pq = {**base_q, "paid_at": {"$gte": start, "$lt": end}, "status": "paid"}
            payments_d = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_d)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": f"{d:02d}",
                "full_label": f"Ngày {d:02d}/{target_month:02d}/{target_year}",
                "date": f"{target_year}-{target_month:02d}-{d:02d}",
                "claims_count": len(claims_d),
                "approved_count": len(approved_d),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    elif period == "week":
        # 7 days of target_week in target_year
        try:
            w_start = datetime.strptime(f"{target_year}-W{target_week:02d}-1", "%G-W%V-%u")
        except ValueError:
            w_start = datetime(target_year, 1, 1) + timedelta(weeks=target_week - 1)

        day_names = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"]
        for d_idx in range(7):
            d_start = w_start + timedelta(days=d_idx)
            d_end = d_start + timedelta(days=1)
            cq = {**base_q, "created_at": {"$gte": d_start, "$lt": d_end}}
            claims_d = await Claim.find(cq).to_list()
            approved_d = [c for c in claims_d if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_d)
            claimed_amt = sum(c.amount_claimed for c in claims_d)

            pq = {**base_q, "paid_at": {"$gte": d_start, "$lt": d_end}, "status": "paid"}
            payments_d = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_d)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": day_names[d_idx],
                "full_label": f"{day_names[d_idx]}, {d_start.day:02d}/{d_start.month:02d}/{target_year}",
                "date": d_start.date().isoformat(),
                "claims_count": len(claims_d),
                "approved_count": len(approved_d),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    elif period in ("7d", "30d"):
        num_days = 7 if period == "7d" else 30
        start_anchor = (now - timedelta(days=num_days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        for i in range(num_days):
            day = start_anchor + timedelta(days=i)
            next_day = day + timedelta(days=1)
            cq = {**base_q, "created_at": {"$gte": day, "$lt": next_day}}
            claims_d = await Claim.find(cq).to_list()
            approved_d = [c for c in claims_d if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_d)
            claimed_amt = sum(c.amount_claimed for c in claims_d)

            pq = {**base_q, "paid_at": {"$gte": day, "$lt": next_day}, "status": "paid"}
            payments_d = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_d)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": f"{day.day:02d}/{day.month:02d}",
                "full_label": f"Ngày {day.day:02d}/{day.month:02d}/{day.year}",
                "date": day.date().isoformat(),
                "claims_count": len(claims_d),
                "approved_count": len(approved_d),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    else:  # "all" -> past 5 years or yearly overview
        current_y = now.year
        years = [current_y - 2, current_y - 1, current_y]
        for y in years:
            start = datetime(y, 1, 1)
            end = datetime(y + 1, 1, 1)
            cq = {**base_q, "created_at": {"$gte": start, "$lt": end}}
            claims_y = await Claim.find(cq).to_list()
            approved_y = [c for c in claims_y if c.status == "approved"]
            approved_amt = sum(c.amount_approved or c.amount_claimed for c in approved_y)
            claimed_amt = sum(c.amount_claimed for c in claims_y)

            pq = {**base_q, "paid_at": {"$gte": start, "$lt": end}, "status": "paid"}
            payments_y = await Payment.find(pq).to_list()
            premium_amt = sum(p.amount for p in payments_y)
            point_loss_ratio = round(approved_amt / premium_amt * 100, 1) if premium_amt > 0 else 0.0

            points.append({
                "label": f"Năm {y}",
                "full_label": f"Toàn bộ năm {y}",
                "date": str(y),
                "claims_count": len(claims_y),
                "approved_count": len(approved_y),
                "claimed_amount": claimed_amt,
                "approved_amount": approved_amt,
                "premium_paid": premium_amt,
                "loss_ratio": point_loss_ratio,
            })

    total_claims = sum(p["claims_count"] for p in points)
    total_approved_amount = sum(p["approved_amount"] for p in points)
    total_claimed_amount = sum(p["claimed_amount"] for p in points)
    total_premium_paid = sum(p["premium_paid"] for p in points)

    return {
        "period": period,
        "year": target_year,
        "quarter": target_quarter,
        "month": target_month,
        "week": target_week,
        "points": points,
        "total_claims": total_claims,
        "total_approved_amount": total_approved_amount,
        "total_claimed_amount": total_claimed_amount,
        "total_premium_paid": total_premium_paid,
    }


@router.get("/activity")
async def activity(
    limit: int = 15,
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Trả về dòng sự kiện hoạt động thời gian thực có ngày/tháng/năm của user."""
    base_q = _scope_query(current_user)
    events: list[dict] = []

    # Claims
    claims = await Claim.find(base_q).sort("-created_at").limit(limit).to_list()
    for c in claims:
        events.append({
            "type": "claim",
            "title": f"Yêu cầu bồi thường #{str(c.id)[-6:].upper()}",
            "desc": f"Loại: {c.claim_type} · {c.amount_claimed:,.0f} ₫",
            "status": c.status,
            "timestamp": c.created_at.isoformat() if c.created_at else None,
            "amount": c.amount_approved or c.amount_claimed,
        })

    # Policies
    policies = await UserPolicy.find(base_q).sort("-start_date").limit(limit).to_list()
    for p in policies:
        events.append({
            "type": "policy",
            "title": f"Hợp đồng {p.plan_name}",
            "desc": f"Bảo vệ: {p.coverage_amount:,.0f} ₫ · Phí: {p.annual_premium:,.0f} ₫/năm",
            "status": p.status,
            "timestamp": p.start_date.isoformat() if p.start_date else None,
            "amount": p.annual_premium,
        })

    # Payments
    payments = await Payment.find(base_q).sort("-paid_at").limit(limit).to_list()
    for py in payments:
        if py.paid_at:
            events.append({
                "type": "payment",
                "title": f"Thanh toán kỳ {py.installment_no}/{py.total_installments}",
                "desc": f"Hợp đồng #{py.policy_number}",
                "status": py.status,
                "timestamp": py.paid_at.isoformat(),
                "amount": py.amount,
            })

    # Sort descending by timestamp
    events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
    return events[:limit]


@router.get("/daily")
async def daily(
    days: int = 30,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Legacy backward compatibility endpoint."""
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
