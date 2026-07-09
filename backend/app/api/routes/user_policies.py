import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_current_user
from app.models.audit_log import AuditLog
from app.models.payment import Payment
from app.models.policy import Policy
from app.models.user import User
from app.models.user_policy import POLICY_PLANS, UserPolicy
from app.services.notifications import notify

_PERIODS_PER_YEAR = {"yearly": 1, "quarterly": 4, "monthly": 12}
_MAX_INSTALLMENTS = 60

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/policies", tags=["policies"])

POLICY_TYPES = Literal["health", "life", "property", "vehicle", "disaster", "income"]
PAYMENT_FREQ = Literal["monthly", "quarterly", "yearly"]
PAYMENT_METHOD = Literal["bank_transfer", "cash", "card"]


def _serialize(p: UserPolicy) -> dict:
    return {
        "id": str(p.id),
        "policy_number": p.policy_number,
        "policy_type": p.policy_type,
        "plan_name": p.plan_name,
        "description": p.description,
        "insurer": p.insurer,
        "coverage_amount": p.coverage_amount,
        "annual_premium": p.annual_premium,
        "base_premium": p.base_premium,
        "age_multiplier": p.age_multiplier,
        "status": p.status,
        "start_date": p.start_date.isoformat(),
        "end_date": p.end_date.isoformat(),
        "term_years": p.term_years,
        "insured_person": p.insured_person,
        "beneficiaries": p.beneficiaries,
        "subject_details": p.subject_details,
        "health_declaration": p.health_declaration,
        "payment_frequency": p.payment_frequency,
        "payment_method": p.payment_method,
        "terms_accepted": p.terms_accepted,
        "voided_reason": p.voided_reason,
        "voided_at": p.voided_at.isoformat() if p.voided_at else None,
        "created_at": p.created_at.isoformat(),
    }


def _serialize_payment(p: Payment) -> dict:
    return {
        "id": str(p.id),
        "policy_id": p.policy_id,
        "installment_no": p.installment_no,
        "total_installments": p.total_installments,
        "amount": p.amount,
        "due_date": p.due_date.isoformat(),
        "status": p.status,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "method": p.method,
        "transaction_ref": p.transaction_ref,
    }


async def _generate_payment_schedule(policy: UserPolicy) -> None:
    """Sinh lịch đóng phí khi mua gói. Kỳ đầu đánh dấu đã thanh toán (mô phỏng
    — user vừa qua bước thanh toán khi mua). Các kỳ sau `pending`."""
    ppy = _PERIODS_PER_YEAR.get(policy.payment_frequency, 1)
    total = max(1, min(ppy * policy.term_years, _MAX_INSTALLMENTS))
    per_amount = round(policy.annual_premium / ppy)
    interval_days = 365 / ppy
    docs: list[Payment] = []
    for i in range(total):
        due = policy.start_date + timedelta(days=round(i * interval_days))
        first = i == 0
        docs.append(Payment(
            user_id=policy.user_id,
            policy_id=str(policy.id),
            policy_number=policy.policy_number,
            installment_no=i + 1,
            total_installments=total,
            amount=per_amount,
            due_date=due,
            method=policy.payment_method,
            status="paid" if first else "pending",
            paid_at=policy.start_date if first else None,
            transaction_ref=f"CF-PAY-{uuid.uuid4().hex[:8].upper()}" if first else None,
        ))
    if docs:
        await Payment.insert_many(docs)


def _age_from_dob(dob_str: str) -> int | None:
    """Parse DOB in any of: ISO, dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy. Returns age or None."""
    if not dob_str:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            dob = datetime.strptime(dob_str[:10], fmt)
            today = datetime.utcnow()
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except ValueError:
            continue
    return None


def _age_multiplier(age: int | None) -> float:
    """Simple actuarial-ish age multiplier per TASK-028 spec."""
    if age is None:
        return 1.0
    if age < 18:
        return 1.5  # minor — uncommon, treat as elevated risk
    if age <= 30:
        return 1.0
    if age <= 50:
        return 1.2
    if age <= 65:
        return 1.5
    return 2.0  # >65 — high risk


def _as_naive_utc(dt: datetime | None) -> datetime | None:
    """Strip tzinfo (converting to UTC first if aware) so we can compare against
    MongoDB-stored naive datetimes without TypeError. FE sends ISO with Z (aware),
    UserPolicy.start_date is stored as naive — they must match."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


@router.get("/plans")
async def get_plans() -> dict:
    """Return available insurance plans (public — no auth required)."""
    return POLICY_PLANS


@router.get("/terms/{category}")
async def get_policy_terms(category: str) -> dict:
    """Trả full text điều khoản của 1 loại bảo hiểm (public).

    Đọc từ Policy collection (ingested từ sample_data/policies/*.txt).
    Dùng cho frontend hiển thị "Xem điều khoản đầy đủ" trước khi mua.
    """
    policy = await Policy.find_one(
        Policy.category == category,
        Policy.is_active == True,  # noqa: E712
    )
    if not policy:
        raise HTTPException(404, f"Không tìm thấy điều khoản cho loại '{category}'")
    return {
        "category": policy.category,
        "title": policy.title,
        "version": policy.version,
        "content": policy.content,
        "coverage_types": policy.coverage_types,
        "last_updated": policy.created_at.isoformat(),
    }


@router.get("")
async def list_policies(
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    # Auto-expire policies past end_date + notify (once)
    now = datetime.utcnow()
    expired = await UserPolicy.find(
        UserPolicy.user_id == str(current_user.id),
        UserPolicy.status == "active",
        UserPolicy.end_date < now,
    ).to_list()
    for p in expired:
        p.status = "expired"
        await p.save()
        await notify(
            str(current_user.id), type="policy_expired",
            title="Gói bảo hiểm đã hết hạn",
            body=f"Gói {p.plan_name} ({p.policy_number}) đã hết hiệu lực. Gia hạn để tiếp tục được bảo vệ.",
            link="/policies",
        )

    # Reminder for policies expiring within 30 days (idempotent via expiry_reminder_sent)
    soon = now + timedelta(days=30)
    expiring = await UserPolicy.find(
        UserPolicy.user_id == str(current_user.id),
        UserPolicy.status == "active",
        UserPolicy.end_date >= now,
        UserPolicy.end_date <= soon,
        UserPolicy.expiry_reminder_sent == False,  # noqa: E712
    ).to_list()
    for p in expiring:
        days_left = max(0, (p.end_date - now).days)
        p.expiry_reminder_sent = True
        await p.save()
        await notify(
            str(current_user.id), type="policy_expiring",
            title="Gói bảo hiểm sắp hết hạn",
            body=f"Gói {p.plan_name} còn {days_left} ngày là hết hạn. Gia hạn sớm để không gián đoạn.",
            link="/policies",
        )

    policies = await UserPolicy.find(
        UserPolicy.user_id == str(current_user.id)
    ).sort(-UserPolicy.created_at).to_list()
    return [_serialize(p) for p in policies]


class InsuredPerson(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    dob: str = Field(..., min_length=4, max_length=20)   # accept multiple formats
    id_number: str | None = None
    relationship: str | None = None   # to buyer (self / spouse / child / parent)


class Beneficiary(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    relationship: str = Field(..., min_length=2, max_length=60)
    percentage: float = Field(..., ge=0, le=100)


class PurchaseRequest(BaseModel):
    policy_type: POLICY_TYPES
    plan_index: int = 0
    # v2 (TASK-028) — all optional for backward compat with legacy single-step flow
    insured_person: InsuredPerson | None = None
    beneficiaries: list[Beneficiary] = []
    start_date: datetime | None = None
    term_years: int = Field(default=1, ge=1, le=20)
    subject_details: dict | None = None
    health_declaration: dict | None = None
    payment_frequency: PAYMENT_FREQ = "yearly"
    payment_method: PAYMENT_METHOD = "bank_transfer"
    terms_accepted: bool = False

    @field_validator("beneficiaries")
    @classmethod
    def beneficiaries_sum_100(cls, v: list[Beneficiary]) -> list[Beneficiary]:
        # Empty list OK (skip for non life/income). Otherwise must total 100 ±0.01
        if not v:
            return v
        total = sum(b.percentage for b in v)
        if abs(total - 100.0) > 0.01:
            raise ValueError(f"Tổng phần trăm thụ hưởng phải bằng 100% (hiện: {total:.0f}%)")
        return v


@router.post("/purchase", status_code=201)
async def purchase_policy(
    body: PurchaseRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict:
    plans = POLICY_PLANS.get(body.policy_type, [])
    if not plans or body.plan_index >= len(plans):
        raise HTTPException(400, "Gói bảo hiểm không hợp lệ")

    # Beneficiaries required for life/income
    if body.policy_type in ("life", "income") and not body.beneficiaries:
        raise HTTPException(422, "Cần khai báo người thụ hưởng cho gói nhân thọ / thu nhập")

    # Check if already has an active policy of this type
    existing = await UserPolicy.find_one(
        UserPolicy.user_id == str(current_user.id),
        UserPolicy.policy_type == body.policy_type,
        UserPolicy.status == "active",
    )
    if existing:
        raise HTTPException(409, f"Bạn đã có gói {body.policy_type} đang hoạt động")

    plan = plans[body.plan_index]

    # Age-based premium adjustment (TASK-028: 18-30 ×1.0, 31-50 ×1.2, 51-65 ×1.5)
    age = _age_from_dob(body.insured_person.dob) if body.insured_person else None
    multiplier = _age_multiplier(age)
    base_premium = float(plan["annual_premium"])
    final_premium = round(base_premium * multiplier, 0)

    start_date = _as_naive_utc(body.start_date) or datetime.utcnow()
    if start_date < datetime.utcnow() - timedelta(days=1):
        raise HTTPException(422, "Ngày bắt đầu không được ở quá khứ")
    end_date = start_date + timedelta(days=365 * body.term_years)

    policy = UserPolicy(
        user_id=str(current_user.id),
        policy_number=f"CF-{body.policy_type[:3].upper()}-{uuid.uuid4().hex[:8].upper()}",
        policy_type=body.policy_type,
        plan_name=plan["plan_name"],
        description=plan.get("description", ""),
        coverage_amount=plan["coverage_amount"],
        annual_premium=final_premium,
        base_premium=base_premium,
        age_multiplier=multiplier,
        start_date=start_date,
        end_date=end_date,
        term_years=body.term_years,
        insured_person=body.insured_person.model_dump() if body.insured_person else None,
        beneficiaries=[b.model_dump() for b in body.beneficiaries],
        subject_details=body.subject_details,
        health_declaration=body.health_declaration,
        payment_frequency=body.payment_frequency,
        payment_method=body.payment_method,
        terms_accepted=body.terms_accepted,
    )
    await policy.insert()

    # Audit log policy_purchased
    try:
        await AuditLog(
            actor_id=str(current_user.id),
            actor_email=current_user.email,
            action="policy_purchased",
            target_type="user_policy",
            target_id=str(policy.id),
            details={
                "policy_type": body.policy_type,
                "plan_name": plan["plan_name"],
                "coverage_amount": plan["coverage_amount"],
                "base_premium": base_premium,
                "final_premium": final_premium,
                "age_multiplier": multiplier,
                "term_years": body.term_years,
                "payment_frequency": body.payment_frequency,
                "payment_method": body.payment_method,
                "has_beneficiaries": bool(body.beneficiaries),
                "has_health_declaration": bool(body.health_declaration),
            },
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed policy_purchased=%s: %s", policy.id, exc)

    # Generate premium payment schedule (first installment paid at purchase)
    try:
        await _generate_payment_schedule(policy)
    except Exception as exc:
        logger.warning("Payment schedule gen failed policy=%s: %s", policy.id, exc)

    # In-app notification
    await notify(
        str(current_user.id),
        type="policy_purchased",
        title="Mua bảo hiểm thành công",
        body=f"Gói {plan['plan_name']} đã được kích hoạt. Số HĐ: {policy.policy_number}.",
        link="/policies",
    )

    return _serialize(policy)


@router.post("/quote")
async def get_quote(
    body: PurchaseRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Lightweight pricing preview — same multiplier logic, no insert.

    Used by the FE wizard to show the user their final premium before confirming."""
    plans = POLICY_PLANS.get(body.policy_type, [])
    if not plans or body.plan_index >= len(plans):
        raise HTTPException(400, "Gói bảo hiểm không hợp lệ")
    plan = plans[body.plan_index]
    age = _age_from_dob(body.insured_person.dob) if body.insured_person else None
    multiplier = _age_multiplier(age)
    base_premium = float(plan["annual_premium"])
    final_premium = round(base_premium * multiplier, 0)
    return {
        "plan_name": plan["plan_name"],
        "coverage_amount": plan["coverage_amount"],
        "base_premium": base_premium,
        "age": age,
        "age_multiplier": multiplier,
        "annual_premium": final_premium,
        "term_years": body.term_years,
        "total_premium": final_premium * body.term_years,
    }


@router.delete("/{policy_id}", status_code=204)
async def cancel_policy(
    policy_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    policy = await UserPolicy.get(policy_id)
    if not policy or policy.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")
    if policy.status != "active":
        raise HTTPException(409, "Gói bảo hiểm không còn hoạt động")
    policy.status = "cancelled"
    await policy.save()


@router.post("/{policy_id}/renew", status_code=201)
async def renew_policy(
    policy_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Gia hạn gói — tạo UserPolicy mới nối tiếp, cùng plan/term. Gói cũ (nếu còn
    active) chuyển 'expired' → hiện ở tab Lịch sử; gói mới active → hiện ở "Gói của tôi".

    Duration: **cộng dồn số ngày còn lại** — mốc bắt đầu = ngày hết hạn cũ nếu gói còn
    hạn (giữ lại phần chưa dùng), hoặc hôm nay nếu đã hết hạn. `start_date = now` để có
    hiệu lực ngay, không tạo khoảng trống bảo hiểm.
    Ví dụ: còn 1 ngày → gia hạn 1 năm → còn 1 + 365 = 366 ngày."""
    old = await UserPolicy.get(policy_id)
    if not old or old.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")
    if old.status in ("cancelled", "voided"):
        raise HTTPException(409, "Gói đã hủy / bị vô hiệu hoá không thể gia hạn")

    now = datetime.utcnow()
    base = old.end_date if old.end_date > now else now   # giữ ngày còn lại nếu còn hạn
    end_date = base + timedelta(days=365 * old.term_years)
    new = UserPolicy(
        user_id=old.user_id,
        policy_number=f"CF-{old.policy_type[:3].upper()}-{uuid.uuid4().hex[:8].upper()}",
        policy_type=old.policy_type,
        plan_name=old.plan_name,
        description=old.description,
        insurer=old.insurer,
        coverage_amount=old.coverage_amount,
        annual_premium=old.annual_premium,
        base_premium=old.base_premium,
        age_multiplier=old.age_multiplier,
        start_date=now,
        end_date=end_date,
        term_years=old.term_years,
        insured_person=old.insured_person,
        beneficiaries=old.beneficiaries,
        subject_details=old.subject_details,
        health_declaration=old.health_declaration,
        payment_frequency=old.payment_frequency,
        payment_method=old.payment_method,
        terms_accepted=old.terms_accepted,
        renewed_from=policy_id,
    )
    await new.insert()

    if old.status == "active":
        old.status = "expired"
        await old.save()

    try:
        await _generate_payment_schedule(new)
    except Exception as exc:
        logger.warning("Payment schedule gen failed on renew policy=%s: %s", new.id, exc)

    try:
        await AuditLog(
            actor_id=str(current_user.id),
            actor_email=current_user.email,
            action="policy_renewed",
            target_type="user_policy",
            target_id=str(new.id),
            details={"renewed_from": policy_id, "policy_type": old.policy_type, "plan_name": old.plan_name},
            ip_address=request.client.host if request.client else None,
        ).insert()
    except Exception as exc:
        logger.warning("Audit log failed policy_renewed=%s: %s", new.id, exc)

    await notify(
        str(current_user.id), type="policy_purchased",
        title="Gia hạn bảo hiểm thành công",
        body=f"Gói {new.plan_name} đã được gia hạn. Số HĐ mới: {new.policy_number}.",
        link="/policies",
    )
    return _serialize(new)


@router.get("/{policy_id}/payments")
async def list_payments(
    policy_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Lịch đóng phí của 1 gói + tóm tắt (đã đóng / còn lại / kỳ tới hạn)."""
    policy = await UserPolicy.get(policy_id)
    if not policy or policy.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")

    payments = await Payment.find(
        Payment.policy_id == policy_id
    ).sort(+Payment.installment_no).to_list()

    paid = [p for p in payments if p.status == "paid"]
    pending = [p for p in payments if p.status == "pending"]
    next_due = min(pending, key=lambda p: p.due_date).due_date.isoformat() if pending else None

    return {
        "items": [_serialize_payment(p) for p in payments],
        "summary": {
            "total_installments": len(payments),
            "paid_count": len(paid),
            "pending_count": len(pending),
            "paid_amount": sum(p.amount for p in paid),
            "remaining_amount": sum(p.amount for p in pending),
            "next_due_date": next_due,
            "frequency": policy.payment_frequency,
        },
    }


@router.post("/{policy_id}/payments/{payment_id}/pay")
async def pay_installment(
    policy_id: str,
    payment_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Thanh toán 1 kỳ (mô phỏng — local, không cổng thật)."""
    payment = await Payment.get(payment_id)
    if not payment or payment.policy_id != policy_id or payment.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy kỳ đóng phí")
    if payment.status == "paid":
        raise HTTPException(409, "Kỳ này đã được thanh toán")

    payment.status = "paid"
    payment.paid_at = datetime.utcnow()
    payment.transaction_ref = f"CF-PAY-{uuid.uuid4().hex[:8].upper()}"
    await payment.save()
    return _serialize_payment(payment)


@router.get("/{policy_id}/payments/{payment_id}/receipt.pdf")
async def download_payment_receipt(
    policy_id: str,
    payment_id: str,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Biên lai PDF cho 1 kỳ đã thanh toán."""
    from app.services.pdf_generator import generate_payment_receipt

    payment = await Payment.get(payment_id)
    if not payment or payment.policy_id != policy_id or payment.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy kỳ đóng phí")
    if payment.status != "paid":
        raise HTTPException(409, "Chỉ kỳ đã thanh toán mới có biên lai")

    policy = await UserPolicy.get(policy_id)
    pdf_bytes = generate_payment_receipt(
        payment=_serialize_payment(payment),
        policy=_serialize(policy) if policy else None,
        user={"email": current_user.email, "full_name": current_user.full_name},
    )
    filename = f"bien-lai-{payment.policy_number}-ky{payment.installment_no}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{policy_id}/contract.pdf")
async def download_policy_contract(
    policy_id: str,
    current_user: User = Depends(get_current_user),
) -> Response:
    """Generate (or fetch cached) PDF contract for a UserPolicy. Cached to
    MinIO under {user_id}/contracts/{policy_id}.pdf so we don't rebuild on
    every download (TASK-030)."""
    from app.services.pdf_generator import generate_policy_contract
    from app.services.storage import download_file, ensure_bucket, upload_file

    policy = await UserPolicy.get(policy_id)
    if not policy or policy.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy gói bảo hiểm")

    cache_key = f"{policy.user_id}/contracts/{policy_id}.pdf"
    pdf_bytes: bytes | None = None
    try:
        pdf_bytes = await download_file(cache_key)
    except Exception:
        pdf_bytes = None  # not cached yet

    if not pdf_bytes:
        pdf_bytes = generate_policy_contract(
            policy=_serialize(policy),
            user={
                "email": current_user.email,
                "full_name": current_user.full_name,
                "province": current_user.province,
            },
        )
        try:
            await ensure_bucket()
            await upload_file(pdf_bytes, cache_key, "application/pdf")
        except Exception as exc:
            logger.warning("PDF cache upload failed for policy=%s: %s", policy_id, exc)

    filename = f"hop-dong-{policy.policy_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
