from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

# Các loại bảo hiểm phổ biến nhất tại Việt Nam
POLICY_TYPE = Literal["health", "life", "property", "vehicle", "disaster", "income"]

POLICY_PLANS: dict[str, list[dict]] = {
    # Sức khỏe toàn diện (thay cho medical/dental/hospitalization/medication)
    "health": [
        {
            "plan_name": "Sức Khỏe Cơ Bản",
            "description": "Khám chữa bệnh, nội trú, nha khoa cơ bản",
            "coverage_amount": 100_000_000,
            "annual_premium": 2_400_000,
        },
        {
            "plan_name": "Sức Khỏe Toàn Diện",
            "description": "Bao gồm điều trị ung thư, phẫu thuật, thai sản",
            "coverage_amount": 500_000_000,
            "annual_premium": 8_400_000,
        },
        {
            "plan_name": "Sức Khỏe Cao Cấp",
            "description": "Bệnh viện quốc tế, không giới hạn số lần khám",
            "coverage_amount": 1_000_000_000,
            "annual_premium": 18_000_000,
        },
    ],

    # Nhân thọ
    "life": [
        {
            "plan_name": "Nhân Thọ Bảo Vệ",
            "description": "Tử vong & thương tật toàn bộ vĩnh viễn",
            "coverage_amount": 500_000_000,
            "annual_premium": 6_000_000,
        },
        {
            "plan_name": "Nhân Thọ Tích Lũy",
            "description": "Bảo vệ + tích lũy đầu tư dài hạn",
            "coverage_amount": 1_000_000_000,
            "annual_premium": 15_000_000,
        },
        {
            "plan_name": "Nhân Thọ Hưu Trí",
            "description": "Thu nhập hưu trí + bảo vệ gia đình",
            "coverage_amount": 2_000_000_000,
            "annual_premium": 30_000_000,
        },
    ],

    # Tài sản & nhà ở
    "property": [
        {
            "plan_name": "Tài Sản Cơ Bản",
            "description": "Cháy nổ, trộm cắp, thiệt hại tài sản",
            "coverage_amount": 500_000_000,
            "annual_premium": 1_800_000,
        },
        {
            "plan_name": "Nhà Ở & Nội Thất",
            "description": "Kết cấu nhà + nội thất + trách nhiệm dân sự",
            "coverage_amount": 2_000_000_000,
            "annual_premium": 5_400_000,
        },
        {
            "plan_name": "Tài Sản Toàn Diện",
            "description": "Toàn bộ rủi ro bao gồm thiên tai và ngập úng",
            "coverage_amount": 5_000_000_000,
            "annual_premium": 12_000_000,
        },
    ],

    # Xe cộ (xe máy & ô tô)
    "vehicle": [
        {
            "plan_name": "Xe Máy Bảo Vệ",
            "description": "Tai nạn xe máy, bồi thường bên thứ ba",
            "coverage_amount": 50_000_000,
            "annual_premium": 600_000,
        },
        {
            "plan_name": "Ô Tô Cơ Bản",
            "description": "Va chạm, trộm cắp, thiệt hại ô tô cá nhân",
            "coverage_amount": 300_000_000,
            "annual_premium": 3_600_000,
        },
        {
            "plan_name": "Xe Cộ Toàn Diện",
            "description": "Mọi rủi ro, xe thay thế khi sửa chữa",
            "coverage_amount": 1_000_000_000,
            "annual_premium": 9_600_000,
        },
    ],

    # Thiên tai (phù hợp đặc thù địa lý Việt Nam)
    "disaster": [
        {
            "plan_name": "Thiên Tai Cơ Bản",
            "description": "Bão, lũ lụt, sạt lở đất, ngập úng",
            "coverage_amount": 100_000_000,
            "annual_premium": 1_200_000,
        },
        {
            "plan_name": "Thiên Tai Nâng Cao",
            "description": "Toàn bộ thiên tai + mất mùa + gián đoạn kinh doanh",
            "coverage_amount": 500_000_000,
            "annual_premium": 4_800_000,
        },
        {
            "plan_name": "Thiên Tai Toàn Diện",
            "description": "Thiệt hại tài sản + chi phí tái định cư + nhân thọ thiên tai",
            "coverage_amount": 2_000_000_000,
            "annual_premium": 12_000_000,
        },
    ],

    # Thu nhập & an sinh xã hội
    "income": [
        {
            "plan_name": "Bảo Hiểm Thất Nghiệp",
            "description": "Hỗ trợ thu nhập tối đa 6 tháng khi mất việc",
            "coverage_amount": 60_000_000,
            "annual_premium": 1_800_000,
        },
        {
            "plan_name": "Bảo Vệ Thu Nhập",
            "description": "Tai nạn lao động, bệnh nghề nghiệp, tàn tật",
            "coverage_amount": 120_000_000,
            "annual_premium": 4_200_000,
        },
        {
            "plan_name": "An Sinh Toàn Diện",
            "description": "Thất nghiệp + tai nạn + bệnh hiểm nghèo dài hạn",
            "coverage_amount": 300_000_000,
            "annual_premium": 9_600_000,
        },
    ],
}

POLICY_TYPE_LABELS = {
    "health":   "Bảo hiểm sức khỏe",
    "life":     "Bảo hiểm nhân thọ",
    "property": "Bảo hiểm tài sản",
    "vehicle":  "Bảo hiểm xe cộ",
    "disaster": "Bảo hiểm thiên tai",
    "income":   "Bảo hiểm thu nhập & an sinh",
}


class UserPolicy(Document):
    user_id: str
    policy_number: str
    policy_type: POLICY_TYPE
    plan_name: str
    description: str = ""
    insurer: str = "ClaimFlow Insurance"
    coverage_amount: float
    annual_premium: float                          # final premium after age multiplier
    base_premium: float | None = None              # original plan premium (before multiplier)
    age_multiplier: float | None = None
    status: Literal["active", "expired", "cancelled", "voided"] = "active"
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: datetime
    term_years: int = 1

    # v2 (TASK-028) — all optional → backward compat with legacy policies
    insured_person: dict | None = None             # { name, dob, id_number, relationship }
    beneficiaries: list[dict] = []                 # [{ name, relationship, percentage }]
    subject_details: dict | None = None            # type-specific: health BMI / property addr / vehicle plate
    health_declaration: dict | None = None         # for health/life
    payment_frequency: Literal["monthly", "quarterly", "yearly"] = "yearly"
    payment_method: Literal["bank_transfer", "cash", "card"] = "bank_transfer"
    terms_accepted: bool = False

    # A3 — expiry reminder idempotency + renewal chaining
    expiry_reminder_sent: bool = False
    renewed_from: str | None = None          # policy_id gốc nếu đây là gói gia hạn

    # Admin/Reviewer void (vô hiệu hoá khi phát hiện bất thường)
    voided_by: str | None = None             # user_id của admin/reviewer
    voided_reason: str | None = None
    voided_at: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_policies"
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("policy_type", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("end_date", DESCENDING)]),
        ]
