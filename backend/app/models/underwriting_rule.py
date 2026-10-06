from datetime import datetime
from beanie import Document
from pydantic import Field


class UnderwritingRule(Document):
    """Cấu hình quy tắc duyệt tự động và phân bổ hồ sơ của doanh nghiệp."""
    stp_enabled: bool = True                     # Bật/tắt Straight-Through Processing
    max_stp_amount: float = 5_000_000.0          # Hạn mức tiền tối đa để AI duyệt tức thì (VNĐ)
    max_stp_fraud_score: int = 20                # Điểm gian lận AI tối đa cho phép duyệt tự động (< 20)
    min_ocr_confidence: float = 85.0             # Độ tin cậy OCR tối thiểu
    high_value_threshold: float = 50_000_000.0   # Ngưỡng 2 cấp duyệt (Four-Eyes Principle, > 50M cần Admin ký)
    auto_dispatch_enabled: bool = True           # Bật/tắt tự động phân bổ theo chuyên môn
    auto_assignment_mode: str = "specialization_and_load"  # specialization_and_load | round_robin | least_busy
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: str = "system"

    class Settings:
        name = "underwriting_rules"
