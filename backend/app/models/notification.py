from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

# Loại thông báo — quyết định icon/màu ở frontend
NOTIFICATION_TYPE = Literal[
    "claim_reviewed",      # claim được approve/partial/reject
    "claim_info_requested",  # reviewer yêu cầu bổ sung
    "claim_paid",          # đã chi trả bồi thường
    "policy_purchased",    # mua gói thành công
    "policy_expiring",     # gói sắp hết hạn
    "policy_expired",      # gói đã hết hạn
    "payment_due",         # kỳ đóng phí sắp tới hạn
    "system",              # thông báo hệ thống chung
]


class Notification(Document):
    user_id: str
    type: NOTIFICATION_TYPE = "system"
    title: str
    body: str = ""
    link: str | None = None          # deep-link tương đối, ví dụ "/claims" hoặc "/policies"
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
        ]
