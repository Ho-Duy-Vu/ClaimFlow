"""Seed demo data — bồi đắp dữ liệu phong phú cho demo & test UI.

Chạy SAU `python scripts/seed.py` (cần users + policies + geo_risks gốc).

Tạo:
  - +12 user thường ở 12 tỉnh đa dạng (đa số có policy active)
  - ~30 UserPolicy: active / expired / cancelled
  - ~80 Claim trải đều 60 ngày, đủ 6 loại × 5 trạng thái
  - ~25 Document với mock OCR result (CCCD, GPLX, insurance contract, hospital bill)
  - ~10 ChatSession có lịch sử hội thoại thật
  - ~30 AuditLog cho admin & reviewer

Idempotent: kiểm tra count trước khi seed, skip nếu đã đủ.
Deterministic: random.seed(42) → mỗi lần chạy ra cùng kết quả.

Usage:
    cd backend
    python scripts/seed_demo_data.py
"""

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import settings
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.chat_session import ChatMessage, ChatSession
from app.models.claim import Claim
from app.models.document import Document, DocumentEmbed, ExtractedField
from app.models.geo_risk import GeoRisk
from app.models.policy import Policy
from app.models.user import User
from app.models.user_policy import POLICY_PLANS, UserPolicy

random.seed(42)


# ── Demo users ────────────────────────────────────────────────────────────────

DEMO_USERS = [
    # (email, name, province, region)
    ("nguyen.minh@example.com",  "Nguyễn Minh Hoàng",  "Hà Nội",          "north"),
    ("tran.linh@example.com",    "Trần Khánh Linh",    "Hải Phòng",       "north"),
    ("le.duy@example.com",       "Lê Quang Duy",       "Sơn La",          "north"),
    ("pham.huong@example.com",   "Phạm Thu Hương",     "Quảng Bình",      "central"),
    ("hoang.son@example.com",    "Hoàng Văn Sơn",      "Thừa Thiên Huế",  "central"),
    ("vu.mai@example.com",       "Vũ Thị Mai",         "Đà Nẵng",         "central"),
    ("dang.nam@example.com",     "Đặng Hoài Nam",      "Quảng Nam",       "central"),
    ("bui.thuy@example.com",     "Bùi Thị Thúy",       "TP. Hồ Chí Minh", "south"),
    ("ngo.tuan@example.com",     "Ngô Anh Tuấn",       "Cần Thơ",         "south"),
    ("do.lan@example.com",       "Đỗ Ngọc Lan",        "An Giang",        "south"),
    ("phan.khoi@example.com",    "Phan Đức Khôi",      "Đồng Nai",        "south"),
    ("ly.trang@example.com",     "Lý Phương Trang",    "Cà Mau",          "south"),
]

DEFAULT_PASSWORD = "Demo@123"


# ── Realistic claim narratives ────────────────────────────────────────────────

CLAIM_SCENARIOS = {
    "health": [
        ("Phẫu thuật ruột thừa cấp tính tại Bệnh viện Bạch Mai", 12_500_000, 8_900_000),
        ("Nhập viện điều trị viêm phổi 5 ngày, có biên lai và đơn thuốc", 6_400_000, 6_400_000),
        ("Khám và điều trị bệnh tim mạch định kỳ — siêu âm tim + Holter", 3_800_000, 3_800_000),
        ("Phẫu thuật nội soi mật mật ngoài giờ tại bệnh viện tư", 28_000_000, 22_000_000),
        ("Điều trị ung thư phổi giai đoạn 2 — đợt hóa trị thứ 3", 85_000_000, 75_000_000),
        ("Sinh con tại bệnh viện Vinmec — sinh mổ", 45_000_000, 30_000_000),
        ("Cấp cứu sốt xuất huyết, nhập viện 7 ngày", 9_200_000, 9_200_000),
        ("Phẫu thuật thoát vị đĩa đệm L4-L5", 35_000_000, 28_000_000),
    ],
    "life": [
        ("Tai nạn lao động tử vong tại công trường xây dựng", 500_000_000, 500_000_000),
        ("Thương tật vĩnh viễn 75% do tai nạn giao thông", 375_000_000, 300_000_000),
        ("Tử vong do đột quỵ tại nhà — có biên bản y tế", 500_000_000, 500_000_000),
    ],
    "property": [
        ("Cháy nhà do chập điện — thiệt hại nội thất phòng khách và bếp", 180_000_000, 150_000_000),
        ("Trộm cắp đột nhập, mất laptop và tiền mặt", 65_000_000, 45_000_000),
        ("Nước mưa thấm dột làm hỏng đồ điện tử và sàn gỗ", 28_000_000, 22_000_000),
        ("Vỡ ống nước trong tường gây hỏng nội thất phòng ngủ", 42_000_000, 38_000_000),
    ],
    "vehicle": [
        ("Va chạm xe máy với ô tô tại ngã tư — xe máy hỏng nặng", 18_000_000, 15_000_000),
        ("Mất xe máy SH do trộm cắp — có biên bản công an", 75_000_000, 60_000_000),
        ("Ô tô bị tông phía sau — sửa cản và đèn hậu", 12_000_000, 12_000_000),
        ("Ngập nước xe máy ở Cần Thơ, máy hỏng cần thay", 8_500_000, 8_500_000),
        ("Va chạm tự gây — ô tô đâm vào tường nhà mình", 22_000_000, 18_000_000),
    ],
    "disaster": [
        ("Bão Yagi tốc mái nhà cấp 4, hư hỏng nội thất tầng 2", 95_000_000, 80_000_000),
        ("Lũ quét cuốn trôi đàn gia súc và hỏng nhà bếp", 65_000_000, 50_000_000),
        ("Sạt lở đất vùi lấp ô tô đậu trước nhà", 280_000_000, 240_000_000),
        ("Ngập sâu 1.5m, hỏng toàn bộ thiết bị tầng trệt", 75_000_000, 60_000_000),
        ("Bão số 9 làm gãy cây đè vào nhà, hư hỏng mái tôn", 35_000_000, 30_000_000),
        ("Lũ lụt ngập nhà 3 ngày, hỏng tủ lạnh máy giặt TV", 28_000_000, 25_000_000),
    ],
    "income": [
        ("Mất việc do công ty phá sản — yêu cầu trợ cấp 3 tháng", 24_000_000, 18_000_000),
        ("Tai nạn lao động nghiêm trọng, không thể đi làm 6 tháng", 60_000_000, 48_000_000),
        ("Bệnh hiểm nghèo (ung thư) — không thể tiếp tục công việc", 90_000_000, 75_000_000),
    ],
}

DISASTER_TYPES_BY_PROVINCE = {
    "Quảng Bình":     ["storm", "flood"],
    "Thừa Thiên Huế": ["storm", "flood", "landslide"],
    "Đà Nẵng":        ["storm", "flood"],
    "Quảng Nam":      ["storm", "flood", "landslide"],
    "Sơn La":         ["landslide", "flood"],
    "An Giang":       ["inundation", "flood"],
    "Cần Thơ":        ["inundation"],
    "Cà Mau":         ["inundation"],
}


# ── Mock OCR data ─────────────────────────────────────────────────────────────

def _mock_cccd_ocr(full_name: str, province: str) -> dict:
    dob = f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/{random.randint(1965, 2005)}"
    return {
        "id_number": f"0{random.randint(10**10, 10**11 - 1)}",
        "full_name": full_name,
        "date_of_birth": dob,
        "gender": random.choice(["Nam", "Nữ"]),
        "nationality": "Việt Nam",
        "place_of_origin": province,
        "place_of_residence": f"{random.randint(1, 999)} Đường {random.choice(['Lê Lợi', 'Trần Hưng Đạo', 'Nguyễn Trãi', 'Hai Bà Trưng'])}, {province}",
        "expiry_date": f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/2035",
    }


def _mock_driver_license_ocr(full_name: str, province: str) -> dict:
    return {
        "license_number": f"79{random.randint(10**10, 10**11 - 1)}",
        "full_name": full_name,
        "date_of_birth": f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/{random.randint(1970, 2000)}",
        "address": f"{random.randint(1, 500)} Đường Cách Mạng Tháng 8, {province}",
        "license_class": random.choice(["A1", "A2", "B1", "B2"]),
        "issue_date": "15/03/2020",
        "expiry_date": "15/03/2030",
    }


def _mock_insurance_policy_ocr(full_name: str) -> dict:
    return {
        "policy_number": f"BVK-{uuid.uuid4().hex[:10].upper()}",
        "insured_name": full_name,
        "coverage_types": "Sức khỏe + Tai nạn",
        "coverage_amount": "300,000,000 VND",
        "premium": "5,400,000 VND/năm",
        "start_date": "01/01/2024",
        "end_date": "31/12/2024",
        "insurer": "Bảo Việt",
    }


# ── Chat scenarios ────────────────────────────────────────────────────────────

CHAT_SCENARIOS = [
    [
        ("user", "Xin chào, tôi sống ở Quảng Bình, cần mua bảo hiểm gì?"),
        ("assistant", "Chào bạn! Quảng Bình thuộc vùng có rủi ro thiên tai cao (bão, lũ lụt). Tôi đề xuất bạn cân nhắc:\n\n1. **Bảo hiểm thiên tai** — bảo vệ tài sản trước bão lũ\n2. **Bảo hiểm tài sản & nhà ở** — cho rủi ro thiệt hại nhà cửa\n3. **Bảo hiểm sức khỏe** — cho gia đình\n\nBạn quan tâm nhất đến loại nào?"),
        ("user", "Cho tôi thông tin chi tiết về gói thiên tai"),
        ("assistant", "ClaimFlow có 3 gói bảo hiểm thiên tai:\n\n• **Thiên Tai Cơ Bản** — bảo vệ 100tr, phí 1.2tr/năm — bão, lũ, sạt lở\n• **Thiên Tai Nâng Cao** — bảo vệ 500tr, phí 4.8tr/năm — thêm mất mùa, gián đoạn KD\n• **Thiên Tai Toàn Diện** — bảo vệ 2 tỷ, phí 12tr/năm — cộng thêm chi phí tái định cư\n\nVới tỉnh Quảng Bình, tôi gợi ý gói **Nâng Cao** trở lên do tần suất bão hàng năm."),
    ],
    [
        ("user", "Quy trình bồi thường mất bao lâu?"),
        ("assistant", "Quy trình bồi thường ClaimFlow:\n\n1. **Nộp hồ sơ** (5-10 phút) — upload chứng từ qua app\n2. **AI tự động xử lý** (1-2 phút) — OCR + check coverage + đánh giá fraud\n3. **Quyết định**:\n   • Tự động duyệt → chi trả trong 24h\n   • Cần thẩm định thủ công → thẩm định viên xử lý trong 1-3 ngày làm việc\n\nTổng thời gian: từ vài giờ đến tối đa 5 ngày làm việc cho ca phức tạp."),
        ("user", "Nếu hồ sơ của tôi bị từ chối thì sao?"),
        ("assistant", "Bạn có quyền khiếu nại trong vòng 30 ngày kể từ ngày nhận kết quả. Quy trình:\n\n1. Vào mục **Yêu cầu bồi thường** → chọn claim bị từ chối\n2. Bấm **Yêu cầu thẩm định lại** + đính kèm chứng cứ bổ sung\n3. Thẩm định viên cấp cao sẽ xem xét trong 5 ngày làm việc"),
    ],
    [
        ("user", "Bảo hiểm xe máy của tôi đã hết hạn, gia hạn thế nào?"),
        ("assistant", "Để gia hạn:\n\n1. Vào trang **Gói bảo hiểm** → tab **Gói của tôi**\n2. Tìm gói đã hết hạn → bấm **Gia hạn**\n3. Hệ thống tự động áp dụng phí ưu đãi 5% cho khách cũ\n\nLưu ý: nếu gia hạn trong vòng 30 ngày sau khi hết hạn, không cần khai báo lại sức khỏe."),
    ],
    [
        ("user", "Tôi muốn biết về bảo hiểm sức khỏe cao cấp"),
        ("assistant", "Gói **Sức Khỏe Cao Cấp** của ClaimFlow:\n\n• Phạm vi: 1 tỷ VND/năm\n• Phí: 18 triệu VND/năm\n• Quyền lợi:\n  - Khám tại BV quốc tế (Vinmec, FV, Hoàn Mỹ)\n  - Không giới hạn số lần khám ngoại trú\n  - Phẫu thuật, hồi sức tích cực\n  - Sinh đẻ, thai sản\n  - Ung thư, bệnh hiểm nghèo\n  - Răng hàm mặt cơ bản\n\nKhuyến khích cho gia đình có trẻ nhỏ hoặc người lớn tuổi."),
    ],
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _random_date_within(days_back: int = 60) -> datetime:
    """Random datetime trong khoảng [now-days_back, now]."""
    delta = timedelta(
        days=random.randint(0, days_back),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )
    return datetime.utcnow() - delta


def _ai_reasoning_for(decision: str, scenario: str, fraud_score: int) -> str:
    if decision == "approve":
        return (
            f"Hồ sơ đầy đủ và khớp với điều khoản gói bảo hiểm. "
            f"AI fraud score thấp ({fraud_score}/100), không phát hiện dấu hiệu bất thường. "
            f"Tình huống: {scenario[:80]}... Đề xuất chi trả theo phạm vi bảo hiểm."
        )
    elif decision == "reject":
        return (
            f"Sau khi đối chiếu điều khoản, tình huống không nằm trong phạm vi bảo hiểm "
            f"hoặc vượt quá giới hạn coverage. Fraud score: {fraud_score}/100. "
            f"Có thể hồ sơ thiếu chứng từ chứng minh thiệt hại."
        )
    elif decision == "manual_review":
        return (
            f"Hồ sơ cần thẩm định thủ công do: số tiền claim lớn, fraud score trung bình "
            f"({fraud_score}/100), hoặc một số field OCR có confidence thấp. "
            f"Đề nghị thẩm định viên xem xét chứng từ kỹ hơn."
        )
    else:
        return (
            f"Cần bổ sung thêm thông tin: biên bản hiện trường, hóa đơn chi tiết, "
            f"hoặc xác nhận từ bên thứ ba. Hồ sơ tạm dừng chờ user upload thêm chứng từ."
        )


def _fraud_flags_for(fraud_score: int) -> list[str]:
    if fraud_score < 30:
        return []
    flags = []
    if fraud_score >= 70:
        flags.append("high_value_atypical")
    if fraud_score >= 50:
        flags.append("documentation_inconsistency")
    if fraud_score >= 40:
        flags.append("late_claim_submission")
    if random.random() < 0.3 and fraud_score >= 60:
        flags.append("similar_recent_claim")
    return flags


# ── Seed functions ────────────────────────────────────────────────────────────

async def seed_demo_users() -> list[User]:
    """Tạo 12 user demo (skip nếu đã tồn tại). Trả list user vừa có."""
    print("Seeding 12 demo users...")
    created = 0
    users: list[User] = []
    for email, full_name, province, region in DEMO_USERS:
        existing = await User.find_one(User.email == email)
        if existing:
            users.append(existing)
            continue
        u = User(
            email=email,
            hashed_password=hash_password(DEFAULT_PASSWORD),
            full_name=full_name,
            role="user",
            province=province,
            region=region,
            is_active=True,
            created_at=datetime.utcnow() - timedelta(days=random.randint(30, 180)),
        )
        await u.insert()
        users.append(u)
        created += 1
    print(f"  ✓ {created} new users (password = {DEFAULT_PASSWORD})")
    return users


async def seed_demo_policies(users: list[User]) -> list[UserPolicy]:
    """Mỗi user 1-3 policy. Mix active/expired/cancelled (80/15/5)."""
    print("Seeding demo user policies...")
    created = 0
    all_policies: list[UserPolicy] = []
    now = datetime.utcnow()

    # Map province → policy types phù hợp
    province_recommendations = {
        "central": ["disaster", "property", "health"],
        "north":   ["health", "life", "property", "vehicle"],
        "south":   ["health", "vehicle", "income", "disaster"],
    }

    for user in users:
        existing_count = await UserPolicy.find(UserPolicy.user_id == str(user.id)).count()
        if existing_count >= 2:
            continue

        candidates = province_recommendations.get(user.region or "north", ["health", "life"])
        n_policies = random.randint(2, 3)
        chosen_types = random.sample(candidates, min(n_policies, len(candidates)))

        for ptype in chosen_types:
            plan_idx = random.randint(0, 2)
            plan = POLICY_PLANS[ptype][plan_idx]

            # Status distribution
            r = random.random()
            if r < 0.80:
                status = "active"
                start_offset = random.randint(30, 200)
                end_offset = 365 - start_offset
            elif r < 0.95:
                status = "expired"
                start_offset = random.randint(400, 700)
                end_offset = -random.randint(10, 90)  # đã hết hạn
            else:
                status = "cancelled"
                start_offset = random.randint(60, 180)
                end_offset = random.randint(100, 300)

            policy = UserPolicy(
                user_id=str(user.id),
                policy_number=f"CF-{ptype[:3].upper()}-{uuid.uuid4().hex[:8].upper()}",
                policy_type=ptype,
                plan_name=plan["plan_name"],
                description=plan.get("description", ""),
                coverage_amount=plan["coverage_amount"],
                annual_premium=plan["annual_premium"],
                status=status,
                start_date=now - timedelta(days=start_offset),
                end_date=now + timedelta(days=end_offset),
                created_at=now - timedelta(days=start_offset),
            )
            await policy.insert()
            all_policies.append(policy)
            created += 1

    print(f"  ✓ {created} user policies created")
    return all_policies


async def seed_demo_claims(users: list[User]) -> list[Claim]:
    """~80 claims phân bố qua 60 ngày, đủ status & type."""
    print("Seeding ~80 demo claims...")
    existing = await Claim.find().count()
    if existing >= 50:
        print(f"  ⚠ Đã có {existing} claims — skip để tránh trùng")
        return []

    created = 0
    all_claims: list[Claim] = []

    # Lấy tất cả active policies để tạo claim đúng type
    all_active_policies = await UserPolicy.find(UserPolicy.status == "active").to_list()
    if not all_active_policies:
        print("  ⚠ Không có policy active — bỏ qua claims")
        return []

    # Phân phối status: 40% approved, 15% rejected, 15% manual_review, 20% processing, 10% pending
    status_pool = (
        ["approved"] * 32 +
        ["rejected"] * 12 +
        ["manual_review"] * 12 +
        ["processing"] * 16 +
        ["pending"] * 8
    )
    random.shuffle(status_pool)

    # Tìm reviewer ID để gán cho claims đã review
    reviewer = await User.find_one(User.email == "reviewer@claimflow.vn")
    reviewer_id = str(reviewer.id) if reviewer else None

    for status in status_pool:
        policy = random.choice(all_active_policies)
        claim_type = policy.policy_type
        scenarios = CLAIM_SCENARIOS.get(claim_type, [])
        if not scenarios:
            continue
        narrative, amount_claimed, amount_approved_full = random.choice(scenarios)

        user = next((u for u in users if str(u.id) == policy.user_id), None)
        if not user:
            user_obj = await User.get(policy.user_id)
            if not user_obj:
                continue
            user = user_obj

        province = user.province
        disaster_type = None
        if claim_type == "disaster" and province in DISASTER_TYPES_BY_PROVINCE:
            disaster_type = random.choice(DISASTER_TYPES_BY_PROVINCE[province])

        created_at = _random_date_within(days_back=60)

        # Tính fraud score theo status
        if status == "approved":
            fraud_score = random.randint(5, 30)
            ai_decision = "approve"
            amount_approved = amount_approved_full
        elif status == "rejected":
            fraud_score = random.randint(40, 90)
            ai_decision = "reject"
            amount_approved = None
        elif status == "manual_review":
            fraud_score = random.randint(35, 70)
            ai_decision = "manual_review"
            amount_approved = None
        elif status == "processing":
            fraud_score = random.randint(20, 50)
            ai_decision = None
            amount_approved = None
        else:  # pending
            fraud_score = None
            ai_decision = None
            amount_approved = None

        claim = Claim(
            user_id=str(user.id),
            status=status,
            claim_type=claim_type,
            amount_claimed=float(amount_claimed),
            amount_approved=float(amount_approved) if amount_approved else None,
            documents=[],
            ai_decision=ai_decision,
            ai_reasoning=_ai_reasoning_for(ai_decision, narrative, fraud_score or 0) if ai_decision else None,
            ai_fraud_score=fraud_score,
            ai_fraud_flags=_fraud_flags_for(fraud_score or 0),
            ai_parsed_data={
                "description": narrative,
                "amount": amount_claimed,
                "incident_summary": narrative[:100],
            } if ai_decision else None,
            province=province,
            disaster_type=disaster_type,
            reviewer_id=reviewer_id if status in ("approved", "rejected") and random.random() < 0.4 else None,
            reviewer_note=(
                "Đã thẩm định kỹ, chứng từ hợp lệ, duyệt theo phạm vi gói."
                if status == "approved" and random.random() < 0.4
                else "Hồ sơ thiếu chứng từ cơ bản, từ chối yêu cầu."
                if status == "rejected" and random.random() < 0.4
                else None
            ),
            reviewed_at=(
                created_at + timedelta(hours=random.randint(2, 48))
                if status in ("approved", "rejected") and random.random() < 0.4
                else None
            ),
            created_at=created_at,
            processed_at=(
                created_at + timedelta(minutes=random.randint(1, 30))
                if status != "pending" and status != "processing"
                else None
            ),
        )
        await claim.insert()
        all_claims.append(claim)
        created += 1

    print(f"  ✓ {created} claims created across 6 types & 5 statuses")
    return all_claims


async def seed_demo_documents(users: list[User]) -> None:
    """~25 documents có mock OCR result để hiển thị trên trang Documents."""
    print("Seeding demo documents...")
    existing = await Document.find().count()
    if existing >= 15:
        print(f"  ⚠ Đã có {existing} documents — skip")
        return

    created = 0
    doc_types = ["cccd", "driver_license", "insurance_policy"]

    for user in users[:8]:  # Chỉ 8 user đầu có doc
        n_docs = random.randint(2, 4)
        for _ in range(n_docs):
            doc_type = random.choice(doc_types)
            if doc_type == "cccd":
                structured = _mock_cccd_ocr(user.full_name or user.email, user.province or "Hà Nội")
                file_name = f"cccd_{user.email.split('@')[0]}.jpg"
            elif doc_type == "driver_license":
                structured = _mock_driver_license_ocr(user.full_name or user.email, user.province or "Hà Nội")
                file_name = f"gplx_{user.email.split('@')[0]}.jpg"
            else:
                structured = _mock_insurance_policy_ocr(user.full_name or user.email)
                file_name = f"hopdong_baoviet_{user.email.split('@')[0]}.pdf"

            extracted_fields = [
                ExtractedField(key=k, value=str(v), confidence=round(random.uniform(0.75, 0.98), 2))
                for k, v in structured.items()
            ]
            avg_confidence = sum(f.confidence for f in extracted_fields) / len(extracted_fields)

            await Document(
                user_id=str(user.id),
                file_name=file_name,
                file_key=f"demo/{user.email}/{uuid.uuid4().hex[:8]}.{file_name.split('.')[-1]}",
                file_hash=uuid.uuid4().hex,
                file_type=file_name.split(".")[-1].lower(),
                file_size_kb=random.randint(150, 1800),
                doc_type=doc_type,
                structured_data=structured,
                extracted_fields=extracted_fields,
                ocr_confidence=round(avg_confidence, 2),
                needs_manual_review=avg_confidence < 0.85,
                low_confidence_fields=(
                    [f.key for f in extracted_fields if f.confidence < 0.80][:2]
                ),
                processing_status="done",
                created_at=_random_date_within(days_back=45),
            ).insert()
            created += 1

    print(f"  ✓ {created} documents created with mock OCR data")


async def seed_demo_chat_sessions(users: list[User]) -> None:
    """~10 chat sessions với hội thoại realistic."""
    print("Seeding demo chat sessions...")
    existing = await ChatSession.find().count()
    if existing >= 6:
        print(f"  ⚠ Đã có {existing} chat sessions — skip")
        return

    created = 0
    for user in users[:10]:
        scenario = random.choice(CHAT_SCENARIOS)
        session_created = _random_date_within(days_back=30)
        messages = []
        for i, (role, content) in enumerate(scenario):
            messages.append(ChatMessage(
                role=role,
                content=content,
                timestamp=session_created + timedelta(minutes=i * 2),
            ))
        await ChatSession(
            user_id=str(user.id),
            messages=messages,
            message_count=len(messages),
            context={"province": user.province, "region": user.region},
            created_at=session_created,
            updated_at=session_created + timedelta(minutes=len(messages) * 2),
        ).insert()
        created += 1

    print(f"  ✓ {created} chat sessions created")


async def seed_demo_audit_logs(users: list[User]) -> None:
    """~30 audit log để hiện trong admin dashboard."""
    print("Seeding demo audit logs...")
    existing = await AuditLog.find().count()
    if existing >= 20:
        print(f"  ⚠ Đã có {existing} audit logs — skip")
        return

    admin = await User.find_one(User.email == "admin@claimflow.vn")
    reviewer = await User.find_one(User.email == "reviewer@claimflow.vn")
    if not admin:
        print("  ⚠ Không tìm thấy admin — chạy seed.py trước")
        return

    # Một số claim để reference cho claim_override logs
    sample_claims = await Claim.find(Claim.status == "approved").limit(10).to_list()
    sample_users = users[:5]

    log_specs = [
        ("admin", admin, "role_change", "user", {"old_role": "user", "new_role": "reviewer"}),
        ("admin", admin, "user_deactivate", "user", {"reason": "Vi phạm điều khoản"}),
        ("admin", admin, "user_activate", "user", {"reason": "Khôi phục sau khiếu nại"}),
        ("admin", admin, "policy_upload", "policy", {"title": "Điều khoản bảo hiểm sức khỏe 2024", "chunks": 4}),
        ("admin", admin, "policy_upload", "policy", {"title": "Điều khoản bảo hiểm thiên tai 2024", "chunks": 3}),
        ("admin", admin, "policy_delete", "policy", {"title": "Điều khoản cũ 2023"}),
    ]

    created = 0
    # Admin actions (6 sự kiện cố định)
    for actor_role, actor, action, target_type, details in log_specs:
        target_id = str(random.choice(sample_users).id) if target_type == "user" else uuid.uuid4().hex[:24]
        await AuditLog(
            timestamp=_random_date_within(days_back=45),
            actor_id=str(actor.id),
            actor_email=actor.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=f"192.168.1.{random.randint(2, 250)}",
        ).insert()
        created += 1

    # Reviewer claim_override (nhiều, rải rác)
    if reviewer and sample_claims:
        for claim in sample_claims:
            await AuditLog(
                timestamp=claim.created_at + timedelta(hours=random.randint(2, 48)),
                actor_id=str(reviewer.id),
                actor_email=reviewer.email,
                action="claim_override",
                target_type="claim",
                target_id=str(claim.id),
                details={
                    "previous_status": "manual_review",
                    "new_status": claim.status,
                    "ai_decision": claim.ai_decision,
                    "is_override": random.choice([True, False]),
                    "amount_approved": claim.amount_approved,
                    "note": "Đã thẩm định kỹ, chứng từ hợp lệ",
                },
                ip_address=f"192.168.1.{random.randint(2, 250)}",
            ).insert()
            created += 1

    # Vài login_failed cho realistic
    for _ in range(8):
        fake_email = random.choice([
            "hacker@example.com", "test@test.com", "unknown@xyz.vn",
            "admin@admin.com", "root@claimflow.vn",
        ])
        await AuditLog(
            timestamp=_random_date_within(days_back=20),
            actor_id="anonymous",
            actor_email=fake_email,
            action="login_failed",
            target_type="user",
            target_id="unknown",
            details={"reason": "invalid_password", "attempts_recent": random.randint(1, 5)},
            ip_address=f"203.0.113.{random.randint(2, 250)}",
        ).insert()
        created += 1

    print(f"  ✓ {created} audit logs created")


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("ClaimFlow — Demo Data Seeder")
    print("=" * 60)
    print(f"Connecting to {settings.MONGODB_URL}...")

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    await init_beanie(
        database=client[settings.MONGODB_DB_NAME],
        document_models=[
            User, Document, Claim, GeoRisk, ChatSession,
            Policy, AuditLog, UserPolicy,
        ],
    )
    print(f"✓ Connected to [{settings.MONGODB_DB_NAME}]\n")

    # Phải có admin/reviewer/3 user gốc + provinces từ seed.py
    base_users = await User.find().count()
    base_provinces = await GeoRisk.find().count()
    if base_users < 5 or base_provinces < 60:
        print("⚠ CẢNH BÁO: Dữ liệu gốc chưa đủ.")
        print("  Hãy chạy `python scripts/seed.py` trước, rồi quay lại.")
        return

    users = await seed_demo_users()
    print()

    await seed_demo_policies(users)
    print()

    await seed_demo_claims(users)
    print()

    await seed_demo_documents(users)
    print()

    await seed_demo_chat_sessions(users)
    print()

    await seed_demo_audit_logs(users)
    print()

    # Final counts
    total_users         = await User.count()
    total_user_policies = await UserPolicy.count()
    total_claims        = await Claim.count()
    total_documents     = await Document.count()
    total_chats         = await ChatSession.count()
    total_audit         = await AuditLog.count()

    print("=" * 60)
    print(f"  Users (tổng):    {total_users}")
    print(f"  User policies:   {total_user_policies}")
    print(f"  Claims:          {total_claims}")
    print(f"  Documents:       {total_documents}")
    print(f"  Chat sessions:   {total_chats}")
    print(f"  Audit logs:      {total_audit}")
    print("=" * 60)
    print("Demo data ready! Login với bất kỳ user demo nào:")
    print(f"  Email: <bất kỳ email từ DEMO_USERS>")
    print(f"  Pass:  {DEFAULT_PASSWORD}")
    print("\nVí dụ: pham.huong@example.com / Demo@123 (Quảng Bình)")


if __name__ == "__main__":
    asyncio.run(main())
