"""PDF generator for policy contracts + claim payout invoices (TASK-030).

Inputs are plain dicts (already-serialized model data) — keeps this service
decoupled from Beanie. Routes serialize then call.
"""

from __future__ import annotations

import io
import os
import logging
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

logger = logging.getLogger(__name__)

# ── Font discovery (Vietnamese diacritics) ─────────────────────────────────────

_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]
_BOLD_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _resolve(candidates: list[str]) -> str | None:
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


# Lazy one-time registration
_fonts_registered = False
_FONT = "Helvetica"
_BOLD = "Helvetica-Bold"


def _ensure_fonts() -> None:
    global _fonts_registered, _FONT, _BOLD
    if _fonts_registered:
        return
    reg = _resolve(_FONT_CANDIDATES)
    bold = _resolve(_BOLD_CANDIDATES) or reg
    if reg:
        try:
            pdfmetrics.registerFont(TTFont("VietFont", reg))
            pdfmetrics.registerFont(TTFont("VietFontBold", bold or reg))
            _FONT, _BOLD = "VietFont", "VietFontBold"
        except Exception as e:
            logger.warning("PDF font registration failed, falling back to Helvetica: %s", e)
    _fonts_registered = True


# ── Helpers ────────────────────────────────────────────────────────────────────

CLAIMFLOW_BLUE = colors.HexColor("#1d4ed8")
CLAIMFLOW_GRAY = colors.HexColor("#475569")
CLAIMFLOW_LIGHT = colors.HexColor("#f1f5f9")


def _fmt_vnd(amount: float | int | None) -> str:
    if amount is None:
        return "—"
    return f"{int(round(amount)):,}".replace(",", ".") + " VND"


def _fmt_date(value: datetime | str | None) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value[:10]
    return value.strftime("%d/%m/%Y")


def _styles() -> dict[str, ParagraphStyle]:
    _ensure_fonts()
    return {
        "title":     ParagraphStyle("title", fontName=_BOLD, fontSize=16,
                                    alignment=TA_CENTER, textColor=CLAIMFLOW_BLUE,
                                    spaceAfter=4),
        "title_en":  ParagraphStyle("title_en", fontName=_FONT, fontSize=10,
                                    alignment=TA_CENTER, textColor=CLAIMFLOW_GRAY),
        "h2":        ParagraphStyle("h2", fontName=_BOLD, fontSize=11,
                                    textColor=CLAIMFLOW_BLUE, spaceBefore=10,
                                    spaceAfter=4),
        "body":      ParagraphStyle("body", fontName=_FONT, fontSize=10, leading=14),
        "body_bold": ParagraphStyle("body_bold", fontName=_BOLD, fontSize=10, leading=14),
        "small":     ParagraphStyle("small", fontName=_FONT, fontSize=8,
                                    textColor=CLAIMFLOW_GRAY, leading=11),
        "footer":    ParagraphStyle("footer", fontName=_FONT, fontSize=8,
                                    alignment=TA_CENTER, textColor=CLAIMFLOW_GRAY),
        "right":     ParagraphStyle("right", fontName=_FONT, fontSize=10,
                                    alignment=TA_RIGHT),
    }


def _header_band(story: list, vi: str, en: str, styles: dict[str, ParagraphStyle]) -> None:
    """Branded title band (VI + EN bilingual)."""
    story.append(Paragraph("CLAIMFLOW INSURANCE CO., LTD.", styles["body_bold"]))
    story.append(Paragraph("Số 1 Đường Cát Linh, Đống Đa, Hà Nội — support@claimflow.vn", styles["small"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=CLAIMFLOW_BLUE,
                            spaceBefore=4, spaceAfter=6))
    story.append(Paragraph(vi, styles["title"]))
    story.append(Paragraph(en, styles["title_en"]))
    story.append(Spacer(1, 0.4 * cm))


def _kv_table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    """Two-column label/value table. Wraps long values in Paragraphs so they break."""
    data = [
        [Paragraph(label, styles["body_bold"]), Paragraph(value or "—", styles["body"])]
        for label, value in rows
    ]
    t = Table(data, colWidths=[5 * cm, 11 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BACKGROUND", (0, 0), (0, -1), CLAIMFLOW_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.4, CLAIMFLOW_GRAY),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
    ]))
    return t


def _section(story: list, title: str, styles: dict) -> None:
    story.append(Paragraph(title, styles["h2"]))


# ── Public: Policy Contract ────────────────────────────────────────────────────

POLICY_TYPE_LABELS = {
    "health":   ("Bảo hiểm sức khỏe", "Health Insurance"),
    "life":     ("Bảo hiểm nhân thọ", "Life Insurance"),
    "property": ("Bảo hiểm tài sản", "Property Insurance"),
    "vehicle":  ("Bảo hiểm xe cộ", "Vehicle Insurance"),
    "disaster": ("Bảo hiểm thiên tai", "Natural Disaster Insurance"),
    "income":   ("Bảo hiểm thu nhập & an sinh", "Income & Social Security"),
}

PAYMENT_FREQ_LABEL = {
    "monthly":   "Hàng tháng",
    "quarterly": "Hàng quý",
    "yearly":    "Hàng năm",
}
PAYMENT_METHOD_LABEL = {
    "bank_transfer": "Chuyển khoản ngân hàng",
    "cash":          "Tiền mặt",
    "card":          "Thẻ ngân hàng",
}


def generate_policy_contract(policy: dict, user: dict) -> bytes:
    """Build PDF bytes for a UserPolicy contract."""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f"Policy {policy.get('policy_number', '')}",
        author="ClaimFlow Insurance",
    )

    story: list = []
    type_vi, type_en = POLICY_TYPE_LABELS.get(policy["policy_type"], (policy["policy_type"], policy["policy_type"]))

    _header_band(
        story,
        vi=f"HỢP ĐỒNG {type_vi.upper()}",
        en=f"{type_en.upper()} CONTRACT",
        styles=styles,
    )

    # Policy summary header (number + dates)
    story.append(_kv_table([
        ("Số hợp đồng / Policy No.",       policy.get("policy_number", "")),
        ("Tên gói / Plan",                  policy.get("plan_name", "")),
        ("Thời hạn / Effective period",
         f"{_fmt_date(policy.get('start_date'))} — {_fmt_date(policy.get('end_date'))} "
         f"({policy.get('term_years', 1)} năm)"),
        ("Trạng thái / Status",             policy.get("status", "active")),
    ], styles))

    # Insured / policyholder
    _section(story, "1. Người được bảo hiểm / Insured Person", styles)
    insured = policy.get("insured_person") or {}
    insured_name = insured.get("name") or user.get("full_name") or user.get("email", "")
    story.append(_kv_table([
        ("Họ tên / Full name",  insured_name),
        ("Ngày sinh / DOB",     str(insured.get("dob") or "—")),
        ("Số CCCD / ID No.",    str(insured.get("id_number") or "—")),
        ("Quan hệ / Relationship", str(insured.get("relationship") or "Bản thân / Self")),
        ("Email liên hệ",       user.get("email", "—")),
        ("Tỉnh / Province",     user.get("province") or "—"),
    ], styles))

    # Coverage
    _section(story, "2. Quyền lợi bảo hiểm / Coverage", styles)
    base = policy.get("base_premium") or policy.get("annual_premium")
    multi = policy.get("age_multiplier")
    premium_breakdown = _fmt_vnd(policy.get("annual_premium"))
    if base and multi and abs(multi - 1.0) > 1e-3:
        premium_breakdown = (
            f"{_fmt_vnd(base)} × {multi:.2f} (hệ số tuổi) = "
            f"<b>{_fmt_vnd(policy.get('annual_premium'))}</b>"
        )
    story.append(_kv_table([
        ("Loại bảo hiểm / Type",      f"{type_vi} / {type_en}"),
        ("Hạn mức / Coverage",        _fmt_vnd(policy.get("coverage_amount"))),
        ("Phí bảo hiểm / Premium",    premium_breakdown),
        ("Kỳ thanh toán / Frequency", PAYMENT_FREQ_LABEL.get(policy.get("payment_frequency", "yearly"), "—")),
        ("Phương thức / Method",      PAYMENT_METHOD_LABEL.get(policy.get("payment_method", "bank_transfer"), "—")),
    ], styles))
    if policy.get("description"):
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(f"<i>{policy['description']}</i>", styles["body"]))

    # Beneficiaries
    bens = policy.get("beneficiaries") or []
    if bens:
        _section(story, "3. Người thụ hưởng / Beneficiaries", styles)
        data = [["Họ tên", "Quan hệ", "Tỷ lệ %"]]
        for b in bens:
            data.append([
                str(b.get("name") or "—"),
                str(b.get("relationship") or "—"),
                f"{b.get('percentage', 0):.1f}%",
            ])
        bt = Table(data, colWidths=[8 * cm, 5 * cm, 3 * cm])
        bt.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), _BOLD),
            ("FONTNAME", (0, 1), (-1, -1), _FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), CLAIMFLOW_LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.4, CLAIMFLOW_GRAY),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(bt)

    # Subject details + health declaration (free-form key/value)
    extras: list[tuple[str, str]] = []
    sd = policy.get("subject_details") or {}
    hd = policy.get("health_declaration") or {}
    for k, v in sd.items():
        extras.append((f"{k}", str(v) if v not in (None, "") else "—"))
    for k, v in hd.items():
        if v in (None, "", False, []):
            continue
        extras.append((f"Khai báo: {k}", str(v)))
    if extras:
        _section(story, "4. Thông tin bổ sung / Additional details", styles)
        story.append(_kv_table(extras, styles))

    # Terms snippet
    _section(story, "5. Điều khoản chính / Key terms", styles)
    terms = [
        "• Hợp đồng có hiệu lực kể từ ngày ghi trong mục 'Thời hạn' với điều kiện phí bảo hiểm đầu kỳ đã được thanh toán đầy đủ.",
        "• Phạm vi bảo hiểm, loại trừ và quy trình yêu cầu bồi thường được quy định chi tiết trong Điều khoản chung (Bản 2024) đính kèm.",
        "• Mọi sai lệch trong khai báo có thể dẫn đến việc giảm hoặc từ chối quyền lợi theo quy định pháp luật về kinh doanh bảo hiểm.",
        "• Tranh chấp phát sinh trước hết được giải quyết qua thương lượng; nếu không thành, được giải quyết tại Tòa án có thẩm quyền tại Việt Nam.",
    ]
    for t in terms:
        story.append(Paragraph(t, styles["body"]))

    # Signature block
    story.append(Spacer(1, 1 * cm))
    sig = Table(
        [[
            Paragraph("BÊN MUA BẢO HIỂM<br/>Policyholder<br/><br/><br/>(Ký, ghi rõ họ tên)", styles["body_bold"]),
            Paragraph("ĐẠI DIỆN CÔNG TY<br/>ClaimFlow Insurance<br/><br/><br/>(Ký + đóng dấu)", styles["body_bold"]),
        ]],
        colWidths=[8 * cm, 8 * cm],
    )
    sig.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(sig)

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        f"Phát hành ngày {_fmt_date(datetime.utcnow())} — Tài liệu này được tạo tự động bởi ClaimFlow.",
        styles["footer"],
    ))

    doc.build(story)
    return buf.getvalue()


# ── Public: Claim Invoice ──────────────────────────────────────────────────────

def generate_claim_invoice(claim: dict, policy: dict | None, user: dict) -> bytes:
    """Build PDF bytes for a paid/approved claim invoice."""
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f"Invoice {claim.get('id', '')}",
        author="ClaimFlow Insurance",
    )
    story: list = []

    _header_band(
        story,
        vi="HÓA ĐƠN CHI TRẢ BỒI THƯỜNG",
        en="CLAIM PAYOUT INVOICE",
        styles=styles,
    )

    # Status badge — green for approved, yellow for partial
    is_partial = bool(claim.get("is_partial_approval"))
    badge_color = colors.HexColor("#ca8a04") if is_partial else colors.HexColor("#16a34a")
    badge_text = "DUYỆT 1 PHẦN / PARTIALLY APPROVED" if is_partial else "ĐÃ DUYỆT / APPROVED"
    badge = Table(
        [[Paragraph(f'<font color="white"><b>{badge_text}</b></font>', styles["body_bold"])]],
        colWidths=[16 * cm],
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), badge_color),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(badge)
    story.append(Spacer(1, 0.3 * cm))

    # Header info
    story.append(_kv_table([
        ("Mã hóa đơn / Invoice No.",   f"INV-{str(claim.get('id', ''))[-12:].upper()}"),
        ("Mã yêu cầu / Claim No.",     str(claim.get("id", ""))),
        ("Ngày phát hành / Issued at", _fmt_date(datetime.utcnow())),
        ("Người xét duyệt / Reviewer", str(claim.get("reviewer_email") or "—")),
    ], styles))

    # Claimant
    _section(story, "1. Người được bồi thường / Claimant", styles)
    story.append(_kv_table([
        ("Họ tên / Full name",  user.get("full_name") or user.get("email", "")),
        ("Email",               user.get("email", "—")),
        ("Tỉnh / Province",     user.get("province") or "—"),
    ], styles))

    # Policy reference
    if policy:
        type_vi, type_en = POLICY_TYPE_LABELS.get(policy.get("policy_type", ""), ("", ""))
        _section(story, "2. Hợp đồng liên quan / Linked policy", styles)
        story.append(_kv_table([
            ("Số HĐ / Policy No.",     str(policy.get("policy_number", ""))),
            ("Tên gói / Plan",         str(policy.get("plan_name", ""))),
            ("Loại bảo hiểm / Type",   f"{type_vi} / {type_en}"),
            ("Hạn mức / Coverage",     _fmt_vnd(policy.get("coverage_amount"))),
        ], styles))

    # Incident details
    _section(story, "3. Sự cố / Incident", styles)
    loc = claim.get("incident_location") or {}
    story.append(_kv_table([
        ("Loại sự cố / Type",         str(claim.get("incident_type") or claim.get("claim_type", ""))),
        ("Ngày sự cố / Date",         _fmt_date(claim.get("incident_date"))),
        ("Tỉnh / Province",           str(claim.get("province") or "—")),
        ("Địa điểm / Location",       str(loc.get("address") or "—") if isinstance(loc, dict) else str(loc)),
        ("Mô tả / Description",       str(claim.get("description") or "—")),
    ], styles))

    # Amounts
    _section(story, "4. Số tiền bồi thường / Payout amount", styles)
    claimed = claim.get("amount_claimed") or 0
    approved = claim.get("amount_approved") or 0
    rows = [
        ("Số tiền yêu cầu / Claimed",  _fmt_vnd(claimed)),
        ("Số tiền chi trả / Approved", f"<b>{_fmt_vnd(approved)}</b>"),
    ]
    if is_partial and claimed > 0:
        pct = round((approved / claimed) * 100)
        rows.append(("Tỷ lệ chi trả / Payout ratio", f"{pct}%"))
        if claim.get("reduction_reason"):
            rows.append(("Lý do giảm / Reduction reason", str(claim["reduction_reason"])))
    story.append(_kv_table(rows, styles))

    # Bank account
    bank = claim.get("bank_account") or {}
    if bank:
        _section(story, "5. Tài khoản nhận / Beneficiary account", styles)
        story.append(_kv_table([
            ("Ngân hàng / Bank",          str(bank.get("bank_name") or "—")),
            ("Số tài khoản / Account",    str(bank.get("account_number") or "—")),
            ("Chủ tài khoản / Holder",    str(bank.get("account_holder") or "—")),
        ], styles))

    # Payment confirmation
    if claim.get("payment_status") == "paid":
        _section(story, "6. Xác nhận thanh toán / Payment confirmation", styles)
        story.append(_kv_table([
            ("Mã giao dịch / Transaction ref", str(claim.get("payment_transaction_ref") or "—")),
            ("Thời điểm / Paid at",            _fmt_date(claim.get("payment_marked_at"))),
        ], styles))
    elif approved > 0:
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph(
            "<i>Khoản chi trả sẽ được chuyển vào tài khoản trên trong vòng 3-5 ngày làm việc kể từ ngày phát hành.</i>",
            styles["small"],
        ))

    # Reviewer note
    if claim.get("reviewer_note"):
        _section(story, "Ghi chú thẩm định / Reviewer note", styles)
        story.append(Paragraph(str(claim["reviewer_note"]).replace("\n", "<br/>"), styles["body"]))

    # Signature
    story.append(Spacer(1, 1 * cm))
    sig = Table(
        [[
            Paragraph("ĐẠI DIỆN CÔNG TY<br/>ClaimFlow Insurance<br/><br/><br/>(Ký + đóng dấu)", styles["body_bold"]),
        ]],
        colWidths=[16 * cm],
    )
    sig.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    story.append(sig)

    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        "Hóa đơn này được phát hành điện tử và có giá trị pháp lý tương đương bản giấy.",
        styles["footer"],
    ))

    doc.build(story)
    return buf.getvalue()
