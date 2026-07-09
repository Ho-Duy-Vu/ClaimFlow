from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

PAYMENT_STATUS = Literal["pending", "paid"]


class Payment(Document):
    """Một kỳ đóng phí bảo hiểm (installment) của một UserPolicy.

    Local/demo: 'thanh toán' được mô phỏng — không tích hợp cổng thật.
    Lịch được sinh tự động khi mua gói dựa trên payment_frequency.
    """
    user_id: str
    policy_id: str
    policy_number: str
    installment_no: int                 # 1-based
    total_installments: int
    amount: float
    due_date: datetime
    status: PAYMENT_STATUS = "pending"
    paid_at: datetime | None = None
    method: str = "bank_transfer"
    transaction_ref: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "payments"
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("policy_id", ASCENDING), ("installment_no", ASCENDING)]),
            IndexModel([("status", ASCENDING), ("due_date", ASCENDING)]),
        ]
