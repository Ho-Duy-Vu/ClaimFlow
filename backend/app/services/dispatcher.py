import logging
from datetime import datetime
from app.models.claim import Claim
from app.models.user import User
from app.models.underwriting_rule import UnderwritingRule
from app.services.notifications import notify

logger = logging.getLogger(__name__)


async def get_or_create_underwriting_rules() -> UnderwritingRule:
    """Lấy quy tắc thẩm định hiện tại hoặc khởi tạo mặc định."""
    rule = await UnderwritingRule.find_one()
    if not rule:
        rule = UnderwritingRule()
        await rule.insert()
        logger.info("Initialized default UnderwritingRule: STP max 5M, Fraud < 20, High Value 50M")
    return rule


async def auto_dispatch_claim(claim: Claim) -> User | None:
    """
    Phân bổ hồ sơ thông minh (Smart Workload Dispatching):
    1. Kiểm tra auto_dispatch_enabled trong quy tắc.
    2. Lọc các reviewer active.
    3. Ưu tiên reviewer có chuyên môn (specializations) trùng với claim_type.
    4. Cân bằng tải: Chọn reviewer có số lượng hồ sơ đang mở ít nhất (dưới hạn mức max_active_claims).
    5. Gán hồ sơ và gửi thông báo tới reviewer.
    """
    rule = await get_or_create_underwriting_rules()
    if not rule.auto_dispatch_enabled:
        logger.info("Auto dispatch is disabled by configuration.")
        return None

    # Lấy toàn bộ reviewer đang hoạt động
    reviewers = await User.find(
        {"role": "reviewer", "is_active": True}
    ).to_list()

    if not reviewers:
        # Fallback tới admin nếu chưa có reviewer
        reviewers = await User.find(
            {"role": "admin", "is_active": True}
        ).to_list()

    if not reviewers:
        logger.warning("No active reviewers/admins found for dispatching claim %s", claim.id)
        return None

    claim_type = claim.claim_type

    # 1. Tìm reviewer có chuyên môn trùng khớp
    specialized_reviewers = [
        r for r in reviewers
        if r.specializations and claim_type in r.specializations
    ]

    candidate_pool = specialized_reviewers if specialized_reviewers else reviewers

    # 2. Tính tải hiện tại của từng ứng viên (số hồ sơ manual_review / processing đang thụ lý)
    reviewer_workloads: list[tuple[User, int]] = []
    for r in candidate_pool:
        active_count = await Claim.find({
            "reviewer_id": str(r.id),
            "status": {"$in": ["manual_review", "processing"]},
        }).count()
        max_quota = getattr(r, "max_active_claims", 10) or 10
        if active_count < max_quota:
            reviewer_workloads.append((r, active_count))

    # Nếu tất cả đều đầy tải, fallback lấy người ít tải nhất trong toàn bộ pool
    if not reviewer_workloads:
        for r in candidate_pool:
            active_count = await Claim.find({
                "reviewer_id": str(r.id),
                "status": {"$in": ["manual_review", "processing"]},
            }).count()
            reviewer_workloads.append((r, active_count))

    # Sắp xếp theo số lượng việc tăng dần (least loaded first)
    reviewer_workloads.sort(key=lambda x: x[1])
    selected_reviewer, current_load = reviewer_workloads[0]

    # 3. Gán hồ sơ
    claim.reviewer_id = str(selected_reviewer.id)
    claim.assigned_at = datetime.utcnow()
    claim.assigned_by = "ai_dispatcher"
    await claim.save()

    logger.info(
        "Auto-dispatched claim %s (%s) to reviewer %s (%s, load=%d)",
        claim.id, claim_type, selected_reviewer.email, selected_reviewer.full_name, current_load
    )

    # 4. Gửi thông báo đến Reviewer
    try:
        await notify(
            str(selected_reviewer.id),
            type="system",
            title="Hồ sơ bồi thường mới được phân bổ",
            body=f"Hồ sơ {claim_type.upper()} trị giá {claim.amount_claimed:,.0f} đ đã được hệ thống tự động gán cho bạn thẩm định.",
            link="/reviewer",
        )
    except Exception as e:
        logger.error("Failed to notify reviewer %s: %s", selected_reviewer.id, e)

    return selected_reviewer


async def dispatch_pending_claims() -> dict:
    """Điều phối tự động toàn bộ hồ sơ đang chờ chưa có người nhận."""
    rule = await get_or_create_underwriting_rules()
    unassigned_claims = await Claim.find({
        "status": "manual_review",
        "reviewer_id": None,
    }).to_list()

    dispatched = 0
    for c in unassigned_claims:
        res = await auto_dispatch_claim(c)
        if res:
            dispatched += 1

    return {
        "total_unassigned": len(unassigned_claims),
        "successfully_dispatched": dispatched,
        "auto_dispatch_enabled": rule.auto_dispatch_enabled,
    }
