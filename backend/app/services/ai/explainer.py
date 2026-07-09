"""B1 — AI claim explainer.

Biến "AI reasoning kỹ thuật" (ai_decision, fraud_flags, matched_clause, reviewer
note...) thành lời giải thích thân thiện, dễ hiểu cho chính chủ claim: "vì sao
duyệt / từ chối / cần bổ sung" + gợi ý bước tiếp theo. Không lộ PII, không đọc số
fraud thô một cách đáng sợ — diễn giải mang tính xây dựng.
"""
import asyncio
import functools
import logging

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """Bạn là trợ lý bồi thường của ClaimFlow. Nhiệm vụ: giải thích cho
KHÁCH HÀNG (chính chủ yêu cầu bồi thường) bằng tiếng Việt đơn giản, đồng cảm, TẠI SAO
yêu cầu của họ nhận kết quả này và họ NÊN LÀM GÌ tiếp theo.

QUY TẮC:
- 3–6 câu, giọng thân thiện, rõ ràng, không dùng thuật ngữ kỹ thuật khó hiểu.
- KHÔNG đọc số điểm gian lận (fraud score) dạng con số thô gây hoang mang; nếu có dấu
  hiệu nghi ngờ, diễn giải nhẹ nhàng ("hệ thống cần xác minh thêm...").
- KHÔNG tiết lộ PII (số CCCD, số tài khoản, địa chỉ chi tiết, SĐT).
- Nếu bị TỪ CHỐI hoặc CẦN BỔ SUNG → nêu rõ lý do chính + hướng dẫn cụ thể cần làm gì.
- Nếu ĐƯỢC DUYỆT (kể cả một phần) → chúc mừng ngắn gọn + nêu bước nhận tiền/điều cần lưu ý.
- Nếu ĐANG XỬ LÝ → trấn an, cho biết đang ở bước nào.
- Nếu tiếng Anh được yêu cầu (locale=en) thì trả lời bằng tiếng Anh; mặc định tiếng Việt.
- Chỉ dựa trên thông tin được cung cấp, KHÔNG bịa điều khoản."""


def _build_context(claim: dict, policy: dict | None, locale: str) -> str:
    status = claim.get("status")
    lines = [
        f"Locale mong muốn: {locale}",
        f"Loại bảo hiểm: {claim.get('claim_type')}",
        f"Trạng thái hiện tại: {status}",
        f"Số tiền yêu cầu: {claim.get('amount_claimed')}",
    ]
    if claim.get("amount_approved") is not None:
        lines.append(f"Số tiền được duyệt: {claim.get('amount_approved')}")
    if claim.get("is_partial_approval"):
        lines.append("→ Đây là duyệt MỘT PHẦN.")
        if claim.get("reduction_reason"):
            lines.append(f"Lý do giảm số tiền: {claim['reduction_reason']}")
    if claim.get("ai_decision"):
        lines.append(f"Quyết định của AI: {claim['ai_decision']}")
    if claim.get("ai_reasoning"):
        lines.append(f"Lập luận của AI: {claim['ai_reasoning']}")
    if claim.get("ai_fraud_flags"):
        lines.append(f"Dấu hiệu cần xác minh (nội bộ, diễn giải nhẹ nhàng): {', '.join(claim['ai_fraud_flags'])}")
    if claim.get("reviewer_note"):
        lines.append(f"Ghi chú của người thẩm định: {claim['reviewer_note']}")
    if claim.get("additional_info_requested"):
        lines.append(f"Tài liệu/thông tin cần bổ sung: {', '.join(claim['additional_info_requested'])}")
    if claim.get("disaster_type"):
        lines.append(f"Loại thiên tai: {claim['disaster_type']}")
    if policy:
        lines.append(f"Gói bảo hiểm liên quan: {policy.get('plan_name')} (hạn mức {policy.get('coverage_amount')})")
    return "\n".join(lines)


async def explain_claim(claim: dict, policy: dict | None = None, locale: str = "vi") -> str:
    """Return a friendly, customer-facing explanation of the claim's outcome."""
    genai.configure(api_key=settings.GEMINI_API_KEY)
    context = _build_context(claim, policy, locale)
    prompt = (
        "Dưới đây là thông tin yêu cầu bồi thường. Hãy giải thích cho khách hàng theo đúng quy tắc:\n\n"
        f"{context}"
    )

    def _sync_call() -> str:
        model = genai.GenerativeModel(
            settings.GEMINI_MODEL_DEFAULT,
            system_instruction=_SYSTEM_PROMPT,
        )
        return model.generate_content(prompt).text

    loop = asyncio.get_running_loop()
    for attempt in range(3):
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, functools.partial(_sync_call)),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("AI phản hồi quá chậm, vui lòng thử lại")
        except Exception as exc:
            err = str(exc)
            if ("429" in err or "quota" in err.lower()) and attempt < 2:
                await asyncio.sleep(8 * (2 ** attempt))
                continue
            logger.error("explain_claim error: %s", exc)
            raise RuntimeError("Không tạo được giải thích lúc này")
    raise RuntimeError("Không tạo được giải thích lúc này")
