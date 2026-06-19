"""Sinh file mẫu để test OCR + Merge.

Tạo PDF (reportlab) + JPG (Pillow) trải đều các loại tài liệu, kèm các
"merge bundle" để test logic gộp 2-3 doc của cùng 1 người.

Cấu trúc output:
    sample_data/uploads/
    ├── README.md                  ← chỉ dẫn scenario nào dùng file nào
    ├── cccd/                      ← CCCD (PDF + JPG)
    ├── driver_license/            ← Giấy phép lái xe
    ├── insurance_policy/          ← Hợp đồng bảo hiểm
    ├── medical_invoice/           ← Hóa đơn viện phí
    ├── disaster_report/           ← Biên bản thiên tai
    ├── vehicle_doc/               ← Đăng ký xe + biên bản tai nạn
    └── merge_bundles/             ← Bộ 2-3 file cùng 1 người để test merge

Usage:
    cd backend
    python scripts/generate_sample_docs.py

Cần: pip install reportlab pillow
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Output root
ROOT = Path(__file__).resolve().parents[2] / "sample_data" / "uploads"
SUBDIRS = [
    "cccd", "driver_license", "insurance_policy",
    "medical_invoice", "disaster_report", "vehicle_doc",
    "merge_bundles",
]

# ── Font discovery (Vietnamese support) ───────────────────────────────────────

_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\tahoma.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]
_FONT_BOLD_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\tahomabd.ttf",
    r"C:\Windows\Fonts\seguisb.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _resolve_font(candidates: list[str]) -> str | None:
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


# ── PDF helper (reportlab) ────────────────────────────────────────────────────

def _make_pdf(out: Path, title: str, lines: list[str]) -> None:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

    font_path = _resolve_font(_FONT_CANDIDATES)
    bold_path = _resolve_font(_FONT_BOLD_CANDIDATES) or font_path
    font_name = "VietFont"
    bold_name = "VietFontBold"

    if font_path:
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            pdfmetrics.registerFont(TTFont(bold_name, bold_path))
        except Exception:
            font_name, bold_name = "Helvetica", "Helvetica-Bold"
    else:
        font_name, bold_name = "Helvetica", "Helvetica-Bold"

    doc = SimpleDocTemplate(
        str(out), pagesize=A4,
        rightMargin=2 * cm, leftMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Normal"], fontName=bold_name,
                                 fontSize=14, alignment=TA_CENTER, spaceAfter=6)
    normal = ParagraphStyle("n", parent=styles["Normal"], fontName=font_name,
                            fontSize=10, leading=14)
    bold = ParagraphStyle("b", parent=styles["Normal"], fontName=bold_name,
                          fontSize=10, leading=14)

    story = [Paragraph(title, title_style),
             HRFlowable(width="100%", thickness=1, color=colors.black),
             Spacer(1, 0.3 * cm)]
    for line in lines:
        if not line:
            story.append(Spacer(1, 0.15 * cm))
        elif line.startswith("**") and line.endswith("**"):
            story.append(Paragraph(line[2:-2], bold))
        elif line.startswith("---"):
            story.append(HRFlowable(width="100%", thickness=0.5, color=colors.grey))
        else:
            story.append(Paragraph(line, normal))
    doc.build(story)


# ── JPG helper (Pillow) ───────────────────────────────────────────────────────

def _make_jpg(out: Path, title: str, lines: list[str], accent_color: tuple = (0, 51, 102)) -> None:
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1024, 1400
    img = Image.new("RGB", (W, H), color=(255, 255, 252))
    draw = ImageDraw.Draw(img)

    font_path = _resolve_font(_FONT_CANDIDATES)
    bold_path = _resolve_font(_FONT_BOLD_CANDIDATES) or font_path

    try:
        font_title = ImageFont.truetype(bold_path or font_path, 32)
        font_bold = ImageFont.truetype(bold_path or font_path, 20)
        font_body = ImageFont.truetype(font_path, 18)
    except Exception:
        font_title = font_bold = font_body = ImageFont.load_default()

    # Header bar
    draw.rectangle([0, 0, W, 90], fill=accent_color)
    draw.text((W // 2, 45), title, fill=(255, 255, 255),
              font=font_title, anchor="mm")

    # Body
    y = 120
    for line in lines:
        if not line:
            y += 12
            continue
        if line.startswith("---"):
            draw.line([(60, y + 8), (W - 60, y + 8)], fill=(120, 120, 120), width=1)
            y += 18
            continue
        if line.startswith("**") and line.endswith("**"):
            draw.text((60, y), line[2:-2], fill=(0, 0, 0), font=font_bold)
        else:
            draw.text((60, y), line, fill=(30, 30, 30), font=font_body)
        y += 28

    # Footer accent line
    draw.rectangle([0, H - 8, W, H], fill=accent_color)
    img.save(out, "JPEG", quality=92)


# ── Content templates ────────────────────────────────────────────────────────

def _cccd_lines(id_number: str, full_name: str, dob: str, gender: str,
                origin: str, residence: str, expiry: str) -> list[str]:
    return [
        "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM",
        "Độc lập - Tự do - Hạnh phúc",
        "---",
        "**CĂN CƯỚC CÔNG DÂN**",
        "",
        f"Số: {id_number}",
        f"Họ và tên: {full_name}",
        f"Ngày sinh: {dob}",
        f"Giới tính: {gender}",
        "Quốc tịch: Việt Nam",
        "",
        f"Quê quán: {origin}",
        f"Nơi thường trú: {residence}",
        "",
        f"Có giá trị đến: {expiry}",
        "---",
        "Cấp tại: Cục Cảnh sát QLHC về TTXH",
    ]


def _gplx_lines(license_no: str, full_name: str, dob: str,
                address: str, license_class: str) -> list[str]:
    return [
        "BỘ GIAO THÔNG VẬN TẢI",
        "---",
        "**GIẤY PHÉP LÁI XE**",
        "",
        f"Số GPLX: {license_no}",
        f"Họ và tên: {full_name}",
        f"Ngày sinh: {dob}",
        f"Quốc tịch: Việt Nam",
        "",
        f"Địa chỉ: {address}",
        f"Hạng: {license_class}",
        "Ngày cấp: 15/03/2020",
        "Có giá trị đến: 15/03/2030",
        "---",
        "Cấp bởi: Sở GTVT",
    ]


def _medical_invoice_lines(hospital: str, patient: str, dob: str, address: str,
                           diagnosis: str, items: list[tuple[str, int]],
                           total: int, days_ago: int = 10) -> list[str]:
    admission = (datetime.now() - timedelta(days=days_ago + 2)).strftime("%d/%m/%Y")
    discharge = (datetime.now() - timedelta(days=days_ago)).strftime("%d/%m/%Y")
    lines = [
        f"{hospital}",
        f"Mã hóa đơn: HD-{datetime.now().year}-{abs(hash(patient)) % 100000:05d}",
        "---",
        "**HÓA ĐƠN VIỆN PHÍ**",
        "",
        f"Họ tên bệnh nhân: {patient}",
        f"Ngày sinh: {dob}",
        f"Địa chỉ: {address}",
        "",
        f"Ngày nhập viện: {admission}",
        f"Ngày xuất viện: {discharge}",
        "",
        f"**Chẩn đoán: {diagnosis}**",
        "",
        "---",
        "**CHI TIẾT CHI PHÍ:**",
        "",
    ]
    for name, amt in items:
        lines.append(f"  {name}: {amt:,} VND".replace(",", "."))
    lines += [
        "---",
        f"**TỔNG CỘNG: {total:,} VND**".replace(",", "."),
        "Hình thức thanh toán: Tiền mặt",
        "",
        f"Ngày {datetime.now().strftime('%d/%m/%Y')}",
        "[Dấu đỏ + chữ ký]",
    ]
    return lines


def _disaster_report_lines(province: str, full_name: str, address: str,
                           id_number: str, disaster: str, period: str,
                           damages: list[str], total: int) -> list[str]:
    lines = [
        f"UBND TỈNH {province.upper()}",
        "Ban Chỉ huy Phòng chống Thiên tai",
        "---",
        "**BIÊN BẢN XÁC NHẬN THIỆT HẠI DO THIÊN TAI**",
        "",
        "Kính gửi: Công ty Bảo hiểm ClaimFlow",
        "",
        f"Họ tên: {full_name}",
        f"Số CCCD: {id_number}",
        f"Địa chỉ: {address}",
        "",
        f"**Loại thiên tai: {disaster}**",
        f"Thời gian xảy ra: {period}",
        "",
        "Thiệt hại ghi nhận:",
    ]
    for d in damages:
        lines.append(f"  - {d}")
    lines += [
        "",
        f"**Ước tính tổng thiệt hại: {total:,} VND**".replace(",", "."),
        "---",
        f"Ngày: {datetime.now().strftime('%d/%m/%Y')}",
        "Chủ tịch UBND xã  [Dấu đỏ]",
    ]
    return lines


def _vehicle_reg_lines(plate: str, owner: str, dob: str, address: str,
                       brand: str, model: str, year: int, engine_no: str) -> list[str]:
    return [
        "CỤC CẢNH SÁT GIAO THÔNG",
        "---",
        "**GIẤY ĐĂNG KÝ XE**",
        "",
        f"Biển số: {plate}",
        f"Chủ xe: {owner}",
        f"Ngày sinh: {dob}",
        f"Địa chỉ: {address}",
        "",
        f"Nhãn hiệu: {brand}",
        f"Số loại: {model}",
        f"Năm sản xuất: {year}",
        f"Số máy: {engine_no}",
        f"Số khung: VF{abs(hash(plate)) % 10**13:013d}",
        "Màu sơn: Đen",
        "Loại nhiên liệu: Xăng",
        "---",
        f"Cấp ngày: 15/06/{year + 1}",
    ]


def _insurance_policy_lines(policy_no: str, insured: str, id_number: str,
                            address: str, coverage_type: str, period: str,
                            coverage_amount: int, premium: int) -> list[str]:
    return [
        "CLAIMFLOW INSURANCE CO., LTD",
        f"Số hợp đồng: {policy_no}",
        "---",
        f"**HỢP ĐỒNG BẢO HIỂM {coverage_type.upper()}**",
        "",
        f"Bên được bảo hiểm: {insured}",
        f"Số CCCD: {id_number}",
        f"Địa chỉ: {address}",
        "",
        f"Thời hạn: {period}",
        f"Số tiền bảo hiểm: {coverage_amount:,} VND".replace(",", "."),
        f"Phí bảo hiểm: {premium:,} VND/năm".replace(",", "."),
        "",
        "Phạm vi bảo hiểm:",
        f"  - Toàn bộ rủi ro thuộc nhóm {coverage_type}",
        "  - Bao gồm chi phí y tế, thiệt hại trực tiếp",
        "  - Trừ trường hợp cố ý gây tổn thất",
        "---",
        "Đại diện bên bảo hiểm:  [Ký + đóng dấu]",
    ]


# ── Catalog ───────────────────────────────────────────────────────────────────

def _ensure_dirs() -> None:
    for sub in SUBDIRS:
        (ROOT / sub).mkdir(parents=True, exist_ok=True)


def _gen_cccd() -> None:
    """3 PDF + 2 JPG, trong đó có 1 cặp cùng person dùng cho merge_bundles."""
    print("→ CCCD...")
    base = ROOT / "cccd"

    # Nguyễn Văn An — Quảng Bình (sẽ dùng trong merge bundle 1)
    lines = _cccd_lines(
        "001234567890", "NGUYỄN VĂN AN", "15/03/1990", "Nam",
        "Xã Đức Ninh Đông, TP Đồng Hới, Quảng Bình",
        "45 Trần Hưng Đạo, P. Hải Thành, TP Đồng Hới, Quảng Bình",
        "15/03/2035",
    )
    _make_pdf(base / "cccd_nguyen_van_an.pdf", "CĂN CƯỚC CÔNG DÂN", lines)
    _make_jpg(base / "cccd_nguyen_van_an.jpg", "CĂN CƯỚC CÔNG DÂN", lines)

    # Lê Thị Thu — HCM
    lines = _cccd_lines(
        "079345678901", "LÊ THỊ THU", "20/06/1995", "Nữ",
        "Quận 1, TP Hồ Chí Minh",
        "123 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. HCM",
        "20/06/2035",
    )
    _make_pdf(base / "cccd_le_thi_thu.pdf", "CĂN CƯỚC CÔNG DÂN", lines)
    _make_jpg(base / "cccd_le_thi_thu.jpg", "CĂN CƯỚC CÔNG DÂN", lines)

    # Phạm Thị Hoa — Hà Tĩnh
    lines = _cccd_lines(
        "038234567890", "PHẠM THỊ HOA", "12/11/1988", "Nữ",
        "Xã Thạch Hà, Hà Tĩnh",
        "78 Nguyễn Công Trứ, TP Hà Tĩnh",
        "12/11/2034",
    )
    _make_pdf(base / "cccd_pham_thi_hoa.pdf", "CĂN CƯỚC CÔNG DÂN", lines)


def _gen_driver_license() -> None:
    """2 PDF + 1 JPG (Nguyễn Văn An dùng trong merge bundle 1)."""
    print("→ Driver License...")
    base = ROOT / "driver_license"

    lines = _gplx_lines(
        "790001234567", "NGUYỄN VĂN AN", "15/03/1990",
        "45 Trần Hưng Đạo, TP Đồng Hới, Quảng Bình", "B1",
    )
    _make_pdf(base / "gplx_nguyen_van_an.pdf", "GIẤY PHÉP LÁI XE", lines)
    _make_jpg(base / "gplx_nguyen_van_an.jpg", "GIẤY PHÉP LÁI XE", lines,
              accent_color=(180, 30, 30))

    lines = _gplx_lines(
        "790009876543", "LÊ THỊ THU", "20/06/1995",
        "123 Nguyễn Huệ, Q.1, TP. HCM", "A1",
    )
    _make_pdf(base / "gplx_le_thi_thu.pdf", "GIẤY PHÉP LÁI XE", lines)


def _gen_insurance_policy() -> None:
    """3 PDF — health, disaster, vehicle policies."""
    print("→ Insurance Policy...")
    base = ROOT / "insurance_policy"

    _make_pdf(base / "policy_disaster_an.pdf", "HỢP ĐỒNG BẢO HIỂM THIÊN TAI",
              _insurance_policy_lines(
                  "CF-DIS-A1B2C3D4", "Nguyễn Văn An", "001234567890",
                  "45 Trần Hưng Đạo, Đồng Hới, Quảng Bình",
                  "Thiên tai (bão, lũ, sạt lở)",
                  "01/01/2024 - 31/12/2024",
                  500_000_000, 4_800_000,
              ))

    _make_pdf(base / "policy_health_thu.pdf", "HỢP ĐỒNG BẢO HIỂM SỨC KHỎE",
              _insurance_policy_lines(
                  "CF-HEA-E5F6G7H8", "Lê Thị Thu", "079345678901",
                  "123 Nguyễn Huệ, Q.1, TP. HCM",
                  "Sức khỏe toàn diện",
                  "01/03/2024 - 28/02/2025",
                  500_000_000, 8_400_000,
              ))

    _make_pdf(base / "policy_vehicle_hoa.pdf", "HỢP ĐỒNG BẢO HIỂM XE CỘ",
              _insurance_policy_lines(
                  "CF-VEH-I9J0K1L2", "Phạm Thị Hoa", "038234567890",
                  "78 Nguyễn Công Trứ, TP Hà Tĩnh",
                  "Ô tô tự thân + trách nhiệm dân sự",
                  "15/04/2024 - 14/04/2025",
                  300_000_000, 3_600_000,
              ))


def _gen_medical_invoice() -> None:
    """4 PDF — variety: approve (viêm phổi), reject (thẩm mỹ), nha khoa, phẫu thuật."""
    print("→ Medical Invoice...")
    base = ROOT / "medical_invoice"

    # APPROVE — viêm phổi (Nguyễn Văn An — merge bundle 1)
    _make_pdf(base / "invoice_viem_phoi_AN_APPROVE.pdf", "BỆNH VIỆN BẠCH MAI",
              _medical_invoice_lines(
                  "BỆNH VIỆN BẠCH MAI",
                  "Nguyễn Văn An", "15/03/1990",
                  "45 Trần Hưng Đạo, Đồng Hới, Quảng Bình",
                  "Viêm phổi thùy phải (ICD-10: J18.1)",
                  [
                      ("Tiền phòng nằm viện (2 ngày)", 800_000),
                      ("Kháng sinh Amoxicillin + Azithromycin", 650_000),
                      ("Xét nghiệm máu toàn phần", 350_000),
                      ("X-quang phổi", 400_000),
                      ("Khí dung (2 lần)", 200_000),
                      ("Phí khám bác sĩ", 200_000),
                  ],
                  total=2_600_000, days_ago=15,
              ))

    # REJECT — thẩm mỹ
    _make_pdf(base / "invoice_tham_my_REJECT.pdf", "THẨM MỸ VIỆN ABC",
              _medical_invoice_lines(
                  "THẨM MỸ VIỆN QUỐC TẾ ABC",
                  "Phạm Thị Bình", "10/08/1995",
                  "12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
                  "Nâng mũi cấu trúc (thẩm mỹ, không phải y tế cần thiết)",
                  [
                      ("Phẫu thuật chỉnh hình mũi", 15_000_000),
                      ("Gây mê toàn thân", 2_000_000),
                      ("Thuốc và vật tư sau PT", 1_000_000),
                  ],
                  total=18_000_000, days_ago=8,
              ))

    # APPROVE — nha khoa
    _make_pdf(base / "invoice_nha_khoa_APPROVE.pdf", "NHA KHOA SMILE",
              _medical_invoice_lines(
                  "PHÒNG KHÁM NHA KHOA SMILE",
                  "Lê Thị Thu", "20/06/1995",
                  "123 Nguyễn Huệ, Q.1, TP. HCM",
                  "Sâu răng độ 3 + viêm nướu (ICD-10: K02.7)",
                  [
                      ("Trám răng số 6 (sâu độ 3)", 900_000),
                      ("Cạo vôi răng toàn hàm", 450_000),
                      ("X-quang răng panorama", 200_000),
                  ],
                  total=1_550_000, days_ago=3,
              ))

    # APPROVE — phẫu thuật ruột thừa (merge bundle 2 demo)
    _make_pdf(base / "invoice_phau_thuat_THU.pdf", "BỆNH VIỆN CHỢ RẪY",
              _medical_invoice_lines(
                  "BỆNH VIỆN CHỢ RẪY",
                  "Lê Thị Thu", "20/06/1995",
                  "123 Nguyễn Huệ, Q.1, TP. HCM",
                  "Viêm ruột thừa cấp tính (ICD-10: K35.8)",
                  [
                      ("Phòng nằm viện (3 ngày)", 1_500_000),
                      ("Phẫu thuật nội soi ruột thừa", 8_500_000),
                      ("Gây mê toàn thân", 1_200_000),
                      ("Thuốc kháng sinh + giảm đau", 900_000),
                      ("Xét nghiệm trước PT (máu, nước tiểu)", 600_000),
                      ("Phí bác sĩ phẫu thuật", 1_500_000),
                  ],
                  total=14_200_000, days_ago=20,
              ))


def _gen_disaster_report() -> None:
    """3 PDF — flood (Quảng Bình), storm (Hà Tĩnh), landslide (Sơn La)."""
    print("→ Disaster Report...")
    base = ROOT / "disaster_report"

    _make_pdf(base / "disaster_flood_QB_AN.pdf",
              "BIÊN BẢN THIỆT HẠI THIÊN TAI",
              _disaster_report_lines(
                  "QUẢNG BÌNH", "Nguyễn Văn An",
                  "45 Trần Hưng Đạo, Đồng Hới, Quảng Bình",
                  "001234567890",
                  "Lũ lụt do hoàn lưu bão số 4/2024",
                  "10/10/2024 - 15/10/2024",
                  [
                      "Nhà ngập 1.2m, tường nứt, nền hư hỏng",
                      "Toàn bộ đồ dùng tầng trệt bị hư",
                      "Xe máy ngập nước, máy hỏng",
                      "Đàn gia cầm (30 con) chết",
                  ],
                  total=45_000_000,
              ))

    _make_pdf(base / "disaster_storm_HT_HOA.pdf",
              "BIÊN BẢN THIỆT HẠI BÃO",
              _disaster_report_lines(
                  "HÀ TĨNH", "Phạm Thị Hoa",
                  "78 Nguyễn Công Trứ, TP Hà Tĩnh",
                  "038234567890",
                  "Bão số 4/2024 (Typhoon Yagi) — gió cấp 12-13",
                  "06/09/2024 - 08/09/2024",
                  [
                      "Mái ngói nhà chính bị tốc hoàn toàn (60m²)",
                      "Tường rào đổ 15m",
                      "Cây xanh đổ vào công trình phụ",
                      "Ô tô bị cây đổ trúng — hỏng phần đầu",
                  ],
                  total=85_000_000,
              ))

    _make_pdf(base / "disaster_landslide_SL.pdf",
              "BIÊN BẢN SẠT LỞ ĐẤT",
              _disaster_report_lines(
                  "SƠN LA", "Lò Văn Phú",
                  "Bản Nà Ớt, xã Mường Bú, huyện Mường La, Sơn La",
                  "014123456789",
                  "Sạt lở đất sau mưa lớn 5 ngày liên tục",
                  "22/08/2024",
                  [
                      "Nhà sàn bị đất vùi 1/3 (cột phía sau)",
                      "Vườn ngô 2000m² mất trắng",
                      "1 con trâu bị vùi lấp",
                  ],
                  total=65_000_000,
              ))


def _gen_vehicle_doc() -> None:
    """2 PDF + 1 JPG — đăng ký xe + biên bản tai nạn."""
    print("→ Vehicle Doc...")
    base = ROOT / "vehicle_doc"

    # Đăng ký ô tô của Phạm Thị Hoa (bundle với hợp đồng vehicle policy)
    lines = _vehicle_reg_lines(
        "38A-12345", "Phạm Thị Hoa", "12/11/1988",
        "78 Nguyễn Công Trứ, TP Hà Tĩnh",
        "Toyota", "Vios E", 2022, "2NRA1234567",
    )
    _make_pdf(base / "dangky_xe_HOA.pdf", "GIẤY ĐĂNG KÝ XE", lines)
    _make_jpg(base / "dangky_xe_HOA.jpg", "GIẤY ĐĂNG KÝ XE", lines,
              accent_color=(0, 102, 51))

    # Biên bản tai nạn
    _make_pdf(base / "bienban_taimansgt_HOA.pdf",
              "BIÊN BẢN TAI NẠN GIAO THÔNG",
              [
                  "CÔNG AN TP HÀ TĨNH",
                  "Phòng CSGT Đường bộ - Đường sắt",
                  "Số: 045/BB-CSGT",
                  "---",
                  "**BIÊN BẢN VỤ TAI NẠN GIAO THÔNG**",
                  "",
                  "Thời gian: 14h30 ngày 18/04/2024",
                  "Địa điểm: KM 35+200, QL1A đoạn qua TP Hà Tĩnh",
                  "",
                  "**Bên A (xe va chạm):**",
                  "Chủ xe: Phạm Thị Hoa",
                  "Biển số: 38A-12345 (Toyota Vios)",
                  "GPLX hạng B1: 380012345678",
                  "",
                  "**Bên B:**",
                  "Chủ xe: Trần Văn Định",
                  "Biển số: 38C-67890 (Hyundai Grand i10)",
                  "",
                  "**Diễn biến:**",
                  "Bên B vượt ẩu, tông vào phần đầu xe Bên A từ làn ngược chiều.",
                  "Bên B nhận lỗi 100%. Cả hai không có thương tích nghiêm trọng.",
                  "",
                  "**Thiệt hại xe Bên A (Toyota Vios):**",
                  "  - Vỡ đèn pha, nắp capô móp",
                  "  - Cản trước hỏng, gãy lưới tản nhiệt",
                  "  - Hỏng radiator, túi khí bung",
                  "  - Báo giá sửa chữa: 65.000.000 VND",
                  "---",
                  "Cán bộ lập biên bản: Đại úy Nguyễn Trọng Hùng",
                  "[Dấu đỏ + chữ ký các bên]",
              ])


def _gen_merge_bundles() -> None:
    """3 bundle để demo merge.

    Mỗi bundle là 1 thư mục con chứa các file của cùng 1 người, để user
    upload lên rồi click Merge → thấy data gộp + conflict.
    """
    print("→ Merge Bundles (copy file đã sinh ra subfolder bundle/)...")
    import shutil
    bundles = {
        "bundle_1_NguyenVanAn_QuangBinh": [
            "cccd/cccd_nguyen_van_an.pdf",
            "driver_license/gplx_nguyen_van_an.pdf",
            "insurance_policy/policy_disaster_an.pdf",
            "medical_invoice/invoice_viem_phoi_AN_APPROVE.pdf",
            "disaster_report/disaster_flood_QB_AN.pdf",
        ],
        "bundle_2_LeThiThu_HCM": [
            "cccd/cccd_le_thi_thu.pdf",
            "driver_license/gplx_le_thi_thu.pdf",
            "insurance_policy/policy_health_thu.pdf",
            "medical_invoice/invoice_phau_thuat_THU.pdf",
        ],
        "bundle_3_PhamThiHoa_HaTinh": [
            "cccd/cccd_pham_thi_hoa.pdf",
            "insurance_policy/policy_vehicle_hoa.pdf",
            "vehicle_doc/dangky_xe_HOA.pdf",
            "vehicle_doc/bienban_taimansgt_HOA.pdf",
            "disaster_report/disaster_storm_HT_HOA.pdf",
        ],
    }

    for bundle_name, files in bundles.items():
        bundle_dir = ROOT / "merge_bundles" / bundle_name
        bundle_dir.mkdir(parents=True, exist_ok=True)
        for rel in files:
            src = ROOT / rel
            if src.exists():
                shutil.copy(src, bundle_dir / src.name)


def _write_readme() -> None:
    readme = ROOT / "README.md"
    readme.write_text(
        """# Sample Documents — ClaimFlow

Thư mục này chứa file mẫu để test pipeline OCR + Merge + Submit Claim.

## Cấu trúc

- `cccd/` — Căn cước công dân (3 PDF + 2 JPG)
- `driver_license/` — Giấy phép lái xe (2 PDF + 1 JPG)
- `insurance_policy/` — Hợp đồng bảo hiểm (3 PDF — health/disaster/vehicle)
- `medical_invoice/` — Hóa đơn viện phí (4 PDF — bao gồm 1 case REJECT)
- `disaster_report/` — Biên bản thiên tai (3 PDF — flood/storm/landslide)
- `vehicle_doc/` — Đăng ký xe + biên bản tai nạn (2 PDF + 1 JPG)
- `merge_bundles/` — Bộ tài liệu cùng người để test Merge

## Test Scenarios

### Scenario A — OCR đơn lẻ
Upload `cccd/cccd_nguyen_van_an.jpg` → trang Documents → verify field
`id_number, full_name, place_of_origin, place_of_residence` đúng.

### Scenario B — OCR + Submit Claim disaster (APPROVE)
1. Đăng ký bảo hiểm: chọn `disaster` → gói **Nâng Cao**
2. Upload `disaster_report/disaster_flood_QB_AN.pdf` (có chứng từ chính quyền)
3. Submit claim type=`disaster`, amount=45,000,000, province="Quảng Bình"
4. AI nên `approve` (low fraud, có biên bản UBND, trong coverage)

### Scenario C — OCR + Submit Claim health (REJECT)
1. Mua gói `health` cơ bản
2. Upload `medical_invoice/invoice_tham_my_REJECT.pdf`
3. Submit claim type=`health`, amount=18,000,000
4. AI nên `reject` (thẩm mỹ không nằm trong phạm vi bảo hiểm sức khỏe)

### Scenario D — Merge bundle
1. Vào trang Documents
2. Upload toàn bộ folder `merge_bundles/bundle_1_NguyenVanAn_QuangBinh/`
3. Bấm **Merge** → kết quả gộp 5 file thành 1 hồ sơ:
   - Personal info từ CCCD + GPLX (khớp nhau)
   - Policy info từ insurance contract
   - Medical history từ hóa đơn
   - Disaster info từ biên bản UBND
4. Conflict expected: address có thể khác nhau giữa CCCD và GPLX → flag

### Scenario E — Reviewer manual review (high fraud)
1. Bundle 3 (Phạm Thị Hoa — Hà Tĩnh):
   - Upload đăng ký xe + biên bản tai nạn + biên bản bão
   - Submit 2 claim cùng tuần → fraud detector flag `similar_recent_claim`
2. Login as `reviewer@claimflow.vn` / `Reviewer@123`
3. Vào `/reviewer` → thấy 2 claim trong queue → review

## Login mẫu

Sau khi chạy `seed.py` + `seed_demo_data.py`:

| Email                       | Password    | Role     | Tỉnh           |
|-----------------------------|-------------|----------|----------------|
| admin@claimflow.vn          | Admin@123   | admin    | Hà Nội         |
| reviewer@claimflow.vn       | Reviewer@123| reviewer | TP. HCM        |
| pham.huong@example.com      | Demo@123    | user     | Quảng Bình     |
| bui.thuy@example.com        | Demo@123    | user     | TP. HCM        |
| user1@example.com           | User1@123   | user     | Quảng Bình     |

## Regenerate

```bash
cd backend
python scripts/generate_sample_docs.py
```

Script idempotent — file đã có sẽ bị ghi đè.
""",
        encoding="utf-8",
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("ClaimFlow — Sample Documents Generator")
    print(f"Output: {ROOT}")
    print("=" * 60)

    try:
        import reportlab  # noqa: F401
        import PIL  # noqa: F401
    except ImportError as e:
        print(f"\n❌ Thiếu dependency: {e}")
        print("   pip install reportlab pillow")
        sys.exit(1)

    _ensure_dirs()
    _gen_cccd()
    _gen_driver_license()
    _gen_insurance_policy()
    _gen_medical_invoice()
    _gen_disaster_report()
    _gen_vehicle_doc()
    _gen_merge_bundles()
    _write_readme()

    # Count
    total = sum(1 for _ in ROOT.rglob("*") if _.is_file())
    print("\n" + "=" * 60)
    print(f"✓ Đã sinh {total} file")
    print(f"  Mở thư mục: {ROOT}")
    print(f"  Đọc README: {ROOT / 'README.md'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
