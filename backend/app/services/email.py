"""Email service — Resend API (HTTP) via async httpx.

Resend chỉ cần 1 endpoint POST https://api.resend.com/emails với Bearer token.
Không cần SDK riêng. Nếu RESEND_API_KEY rỗng (dev/test) → no-op + log warning,
không raise — review flow vẫn hoạt động bình thường.
"""

from __future__ import annotations

import logging
from typing import Literal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "ClaimFlow <noreply@claimflow.vn>"

# Bản đồ loại bảo hiểm → tiếng Việt hiển thị
_CLAIM_TYPE_VI = {
    "health": "Sức khỏe",
    "life": "Nhân thọ",
    "property": "Tài sản",
    "vehicle": "Xe cộ",
    "disaster": "Thiên tai",
    "income": "Thu nhập & An sinh",
}


def _format_amount(amount: float | None) -> str:
    if amount is None:
        return "—"
    return f"{int(amount):,} VND".replace(",", ".")


_DecisionType = Literal["approved", "rejected", "partial_approved", "info_requested"]


def _decision_display(decision: _DecisionType) -> tuple[str, str, str]:
    """Returns (label_vi, accent_color_hex, bg_accent_hex)."""
    if decision == "approved":
        return ("ĐƯỢC DUYỆT", "#16a34a", "#dcfce7")
    if decision == "partial_approved":
        return ("DUYỆT 1 PHẦN", "#ca8a04", "#fef9c3")
    if decision == "info_requested":
        return ("CẦN BỔ SUNG HỒ SƠ", "#ea580c", "#ffedd5")
    return ("BỊ TỪ CHỐI", "#dc2626", "#fee2e2")


def _build_review_html(
    *,
    full_name: str,
    claim_id: str,
    claim_type: str,
    decision: _DecisionType,
    note: str,
    amount_approved: float | None,
    fields_needed: list[str] | None = None,
    reduction_reason: str | None = None,
) -> tuple[str, str]:
    """Render HTML + plain-text email cho thông báo review claim."""
    decision_vi, accent, bg_accent = _decision_display(decision)
    type_vi = _CLAIM_TYPE_VI.get(claim_type, claim_type)
    show_amount = decision in ("approved", "partial_approved")
    amount_line = (
        f"<p style='margin:8px 0'><strong>Số tiền duyệt:</strong> "
        f"{_format_amount(amount_approved)}</p>"
        if show_amount else ""
    )
    reduction_block = (
        f"<p style='margin:8px 0 0;padding:10px 12px;background:#fffbeb;"
        f"border:1px solid #fde68a;border-radius:4px;font-size:13px;'>"
        f"<strong>Lý do giảm số tiền:</strong> {reduction_reason}</p>"
        if decision == "partial_approved" and reduction_reason else ""
    )
    fields_block = ""
    if decision == "info_requested" and fields_needed:
        items = "".join(f"<li>{f}</li>" for f in fields_needed)
        fields_block = (
            "<div style='margin:16px 0;padding:14px 16px;background:#fff7ed;"
            "border:1px solid #fed7aa;border-radius:6px;'>"
            "<p style='margin:0 0 8px;font-weight:600;color:#9a3412;'>"
            "Vui lòng bổ sung các tài liệu / thông tin sau:</p>"
            f"<ul style='margin:0;padding-left:20px;color:#7c2d12;line-height:1.6;'>{items}</ul>"
            "</div>"
        )

    html = f"""<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><title>Thông báo yêu cầu bồi thường</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             margin:0;padding:24px;background:#f8fafc;color:#0f172a;">
  <table cellpadding="0" cellspacing="0" border="0"
         style="max-width:560px;margin:0 auto;background:#ffffff;
                border-radius:12px;overflow:hidden;
                box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
      <h1 style="margin:0;font-size:20px;color:#0f172a;">ClaimFlow</h1>
      <p style="margin:4px 0 0;color:#64748b;font-size:14px;">
        Nền tảng bồi thường bảo hiểm AI
      </p>
    </td></tr>
    <tr><td style="padding:28px;">
      <p style="margin:0 0 16px;">Xin chào <strong>{full_name}</strong>,</p>
      <p style="margin:0 0 16px;">
        Yêu cầu bồi thường của bạn đã được nhân viên thẩm định xem xét.
      </p>
      <div style="background:{bg_accent};border-left:4px solid {accent};
                  padding:16px 20px;border-radius:6px;margin:20px 0;">
        <p style="margin:0;font-size:13px;color:#475569;
                  text-transform:uppercase;letter-spacing:0.5px;">
          Kết quả thẩm định
        </p>
        <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:{accent};">
          {decision_vi}
        </p>
      </div>
      <div style="background:#f8fafc;padding:16px 20px;border-radius:6px;
                  font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;"><strong>Mã yêu cầu:</strong> {claim_id}</p>
        <p style="margin:8px 0;"><strong>Loại bảo hiểm:</strong> {type_vi}</p>
        {amount_line}
        {reduction_block}
        <p style="margin:8px 0 0;"><strong>Ghi chú từ thẩm định viên:</strong></p>
        <p style="margin:6px 0 0;padding:10px 12px;background:#ffffff;
                  border:1px solid #e2e8f0;border-radius:4px;
                  white-space:pre-wrap;">{note}</p>
      </div>
      {fields_block}
      <p style="margin:24px 0 0;font-size:13px;color:#64748b;">
        Bạn có thể xem chi tiết yêu cầu trong mục
        <em>"Yêu cầu bồi thường"</em> của ClaimFlow.
      </p>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f1f5f9;
                   font-size:12px;color:#64748b;text-align:center;">
      Email tự động từ ClaimFlow · Không trả lời email này
    </td></tr>
  </table>
</body>
</html>"""

    text_lines = [
        f"Xin chào {full_name},",
        "",
        f"Yêu cầu bồi thường {claim_id} ({type_vi}) đã được thẩm định.",
        f"Kết quả: {decision_vi}",
    ]
    if show_amount:
        text_lines.append(f"Số tiền duyệt: {_format_amount(amount_approved)}")
    if decision == "partial_approved" and reduction_reason:
        text_lines.append(f"Lý do giảm số tiền: {reduction_reason}")
    if decision == "info_requested" and fields_needed:
        text_lines.append("")
        text_lines.append("Vui lòng bổ sung:")
        for f in fields_needed:
            text_lines.append(f"  - {f}")
    text_lines.extend(["", f"Ghi chú thẩm định viên:", note, "", "— ClaimFlow"])
    return html, "\n".join(text_lines)


async def send_claim_review_email(
    *,
    to_email: str,
    full_name: str | None,
    claim_id: str,
    claim_type: str,
    decision: _DecisionType,
    note: str,
    amount_approved: float | None = None,
    fields_needed: list[str] | None = None,
    reduction_reason: str | None = None,
) -> bool:
    """Gửi email kết quả review claim. Trả True nếu Resend ack 200/202.

    No-op (trả False) nếu chưa cấu hình RESEND_API_KEY — vẫn log để dev biết.
    Mọi exception đều catch lại, KHÔNG raise — email là side-effect, không
    được chặn flow chính của reviewer.
    """
    if not settings.RESEND_API_KEY or settings.RESEND_API_KEY.startswith("re_..."):
        logger.warning(
            "Resend chưa cấu hình (RESEND_API_KEY rỗng). Bỏ qua email cho claim %s",
            claim_id,
        )
        return False

    html, text = _build_review_html(
        full_name=full_name or to_email.split("@")[0],
        claim_id=claim_id,
        claim_type=claim_type,
        decision=decision,
        note=note,
        amount_approved=amount_approved,
        fields_needed=fields_needed,
        reduction_reason=reduction_reason,
    )

    subject_map = {
        "approved":         "[ClaimFlow] Yêu cầu bồi thường đã được duyệt",
        "partial_approved": "[ClaimFlow] Yêu cầu bồi thường đã được duyệt 1 phần",
        "rejected":         "[ClaimFlow] Yêu cầu bồi thường đã bị từ chối",
        "info_requested":   "[ClaimFlow] Yêu cầu bổ sung hồ sơ bồi thường",
    }
    subject = subject_map.get(decision, "[ClaimFlow] Cập nhật yêu cầu bồi thường")

    payload = {
        "from": DEFAULT_FROM,
        "to": [to_email],
        "subject": subject,
        "html": html,
        "text": text,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code in (200, 202):
            logger.info(
                "Resend OK claim=%s to=%s status=%s", claim_id, to_email, resp.status_code
            )
            return True
        logger.error(
            "Resend FAIL claim=%s to=%s status=%s body=%s",
            claim_id, to_email, resp.status_code, resp.text[:300],
        )
        return False
    except Exception as exc:
        logger.exception("Resend exception claim=%s: %s", claim_id, exc)
        return False
