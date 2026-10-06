import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.models.geo_risk import GeoRisk
from app.models.user import User
from app.services.geo.risk_engine import (
    _PROVINCE_INDEX,
    _normalize_vn,
    detect_province_from_text,
    get_insurance_recommendations,
)

router = APIRouter(prefix="/geo-risk", tags=["geo-risk"])
logger = logging.getLogger(__name__)


def _serialize(doc: GeoRisk) -> dict:
    return {
        "id": str(doc.id),
        "province_name": doc.province_name,
        "province_code": doc.province_code,
        "region": doc.region,
        "overall_risk_score": doc.overall_risk_score,
        "is_high_risk": doc.is_high_risk,
        "risk_factors": doc.risk_factors,
        "disaster_risks": [
            {
                "type": d.type,
                "risk_score": d.risk_score,
                "frequency": d.frequency,
                "historical_events": d.historical_events,
            }
            for d in doc.disaster_risks
        ],
        "recommendations": [
            {
                "insurance_type": r.insurance_type,
                "priority_score": r.priority_score,
                "reason": r.reason,
            }
            for r in doc.recommendations
        ],
    }


@router.get("/map")
async def get_map_data() -> list[dict]:
    """Return risk data for all provinces — used by Leaflet choropleth."""
    docs = await GeoRisk.find({}).to_list()
    return [_serialize(d) for d in docs]


@router.get("/province/{province_name}")
async def get_province_risk(province_name: str) -> dict:
    # Exact match first
    doc = await GeoRisk.find_one(GeoRisk.province_name == province_name)
    # Fallback: normalize input (handles "quang binh" → "Quảng Bình")
    if not doc:
        canonical = _PROVINCE_INDEX.get(_normalize_vn(province_name))
        if canonical:
            doc = await GeoRisk.find_one(GeoRisk.province_name == canonical)
    if not doc:
        raise HTTPException(404, f"Province '{province_name}' not found")
    return _serialize(doc)


@router.post("/recommend")
async def recommend_insurance(
    body: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    address: str = body.get("address", "")
    province_name = body.get("province") or detect_province_from_text(address)

    if not province_name:
        return {
            "province": None,
            "risk_score": None,
            "recommendations": [
                {
                    "insurance_type": "Bảo hiểm tài sản cơ bản",
                    "priority_score": 50,
                    "reason": "Khuyến nghị chung khi chưa xác định được khu vực",
                }
            ],
        }

    doc = await GeoRisk.find_one(GeoRisk.province_name == province_name)
    if not doc:
        raise HTTPException(404, f"No risk data for province '{province_name}'")

    recs = get_insurance_recommendations(province_name, doc.overall_risk_score, doc.disaster_risks)

    return {
        "province": province_name,
        "region": doc.region,
        "risk_score": doc.overall_risk_score,
        "is_high_risk": doc.is_high_risk,
        "recommendations": recs,
    }


# ── Partner Network & Emergency SOS Dispatcher (Feature 4) ────────────────────

import math
from datetime import datetime
from app.models.partner import Partner

DEFAULT_PARTNERS = [
    # ── 1. Vùng Tây Bắc & Đông Bắc ────────────────────────────
    {
        "name": "Bệnh Viện Đa Khoa Tỉnh Lào Cai",
        "partner_type": "hospital",
        "province": "Lào Cai",
        "address": "Đường Chiềng On, Phường Bình Minh, TP. Lào Cai",
        "lat": 22.4855,
        "lng": 103.9708,
        "phone": "0214.3872.115",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu tai nạn đèo dốc & sạt lở", "Bảo lãnh viện phí trực tiếp", "Phẫu thuật ngoại khoa"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Biển & Giao Thông Hạ Long",
        "partner_type": "rescue",
        "province": "Quảng Ninh",
        "address": "Đường Hạ Long, Bãi Cháy, TP. Hạ Long, Quảng Ninh",
        "lat": 20.9505,
        "lng": 107.0734,
        "phone": "0203.3846.116",
        "hotline": "0912.846.116",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cứu hộ thủy nạn & ven biển", "Kéo xe sự cố đường bao biển", "Cứu hộ bão lốc"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Ô Tô Tasco Phú Thọ - Việt Trì",
        "partner_type": "garage",
        "province": "Phú Thọ",
        "address": "Đại Lộ Hùng Vương, TP. Việt Trì, Phú Thọ",
        "lat": 21.3228,
        "lng": 105.4019,
        "phone": "0210.3848.888",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Sửa chữa thân vỏ", "Khắc phục sự cố cao tốc Nội Bài - Lào Cai", "Bảo lãnh bồi thường"],
        "opening_hours": "24/7",
    },

    # ── 2. Hà Nội & Hải Phòng ───────────────────────────────────
    {
        "name": "Bệnh Viện Hữu Nghị Việt Đức - Khoa Cấp Cứu",
        "partner_type": "hospital",
        "province": "Hà Nội",
        "address": "40 Tràng Thi, Quận Hoàn Kiếm, Hà Nội",
        "lat": 21.0282,
        "lng": 105.8475,
        "phone": "024.3825.3531",
        "hotline": "1900.1902",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cấp cứu ngoại khoa", "Bảo lãnh viện phí trực tiếp", "Hồi sức chấn thương"],
        "opening_hours": "24/7",
    },
    {
        "name": "Tasco Auto Long Biên - Xưởng Cứu Hộ & Sửa Chữa 24/7",
        "partner_type": "garage",
        "province": "Hà Nội",
        "address": "Số 1 Nguyễn Văn Linh, Quận Long Biên, Hà Nội",
        "lat": 21.0368,
        "lng": 105.8945,
        "phone": "024.3872.9999",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cứu hộ giao thông 24/7", "Bảo lãnh sửa chữa trực tiếp", "Sơn sấy nhanh", "Cẩu kéo cao tốc"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Hữu Nghị Việt Tiệp Hải Phòng",
        "partner_type": "hospital",
        "province": "Hải Phòng",
        "address": "Số 1 Nhà Thương, Phường Cát Dài, Lê Chân, Hải Phòng",
        "lat": 20.8540,
        "lng": 106.6780,
        "phone": "0225.3700.436",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu chấn thương cảng biển", "Bảo lãnh viện phí trực tiếp", "Hồi sức tích cực"],
        "opening_hours": "24/7",
    },

    # ── 3. Bắc Trung Bộ ─────────────────────────────────────────
    {
        "name": "Gara Ô Tô Tasco Auto Thanh Hóa",
        "partner_type": "garage",
        "province": "Thanh Hóa",
        "address": "Quốc Lộ 1A, Phường Quảng Thành, TP. Thanh Hóa",
        "lat": 19.8067,
        "lng": 105.7852,
        "phone": "0237.3852.999",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Gara liên kết bảo lãnh", "Sửa chữa xe tai nạn Quốc Lộ 1A", "Cứu hộ ngập lụt"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Hữu Nghị Đa Khoa Nghệ An",
        "partner_type": "hospital",
        "province": "Nghệ An",
        "address": "Km 5, Đại Lộ Lê Nin, Nghi Phú, TP. Vinh, Nghệ An",
        "lat": 18.6796,
        "lng": 105.6813,
        "phone": "0238.3844.528",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Trung tâm hồi sức cấp cứu Bắc Trung Bộ", "Bảo lãnh viện phí 24/7"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông Hà Tĩnh 24/7",
        "partner_type": "rescue",
        "province": "Hà Tĩnh",
        "address": "Hà Huy Tập, TP. Hà Tĩnh, Tỉnh Hà Tĩnh",
        "lat": 18.3435,
        "lng": 105.9059,
        "phone": "0913.385.116",
        "hotline": "0913.385.116",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Kéo xe bão lũ", "Cứu hộ đèo Ngang & cao tốc Bãi Vọt", "Kích bình vá lốp"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Hữu Nghị Việt Nam - CuBa Đồng Hới",
        "partner_type": "hospital",
        "province": "Quảng Bình",
        "address": "Đường Hữu Nghị, Phường Nam Lý, TP. Đồng Hới, Quảng Bình",
        "lat": 17.4645,
        "lng": 106.6085,
        "phone": "0232.3822.115",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu 115", "Bảo lãnh viện phí BHYT & Bảo hiểm tư nhân", "Điều trị chấn thương bão"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Sửa Chữa & Cứu Hộ Tasco Quảng Trị",
        "partner_type": "garage",
        "province": "Quảng Trị",
        "address": "Lê Duẩn, Phường 2, TP. Đông Hà, Quảng Trị",
        "lat": 16.8164,
        "lng": 107.1011,
        "phone": "0233.3856.789",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Sửa chữa khung gầm máy móc", "Cứu hộ xe lật đổ do lũ", "Bảo lãnh trực tiếp"],
        "opening_hours": "24/7",
    },

    # ── 4. Miền Trung (Huế, Đà Nẵng, Quảng Nam, Quảng Ngãi, Bình Định) ─
    {
        "name": "Bệnh Viện Trung Ương Huế - Trung Tâm Cấp Cứu",
        "partner_type": "hospital",
        "province": "Thừa Thiên Huế",
        "address": "16 Lê Lợi, Phường Vĩnh Ninh, TP. Huế",
        "lat": 16.4637,
        "lng": 107.5847,
        "phone": "0234.3822.325",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Bệnh viện tuyến trung ương", "Bảo lãnh viện phí không tiền mặt", "Cấp cứu đa khoa"],
        "opening_hours": "24/7",
    },
    {
        "name": "Tasco Auto Savico Đà Nẵng",
        "partner_type": "garage",
        "province": "Đà Nẵng",
        "address": "356 Điện Biên Phủ, Quận Thanh Khê, Đà Nẵng",
        "lat": 16.0612,
        "lng": 108.1925,
        "phone": "0236.3758.888",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Xưởng dịch vụ chính hãng", "Giám định tổn thất tại chỗ", "Bảo lãnh thanh toán"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông & Đèo Hải Vân 24/7",
        "partner_type": "rescue",
        "province": "Đà Nẵng",
        "address": "Tạ Quang Bửu, Quận Liên Chiểu, Đà Nẵng",
        "lat": 16.0915,
        "lng": 108.1450,
        "phone": "0905.116.116",
        "hotline": "0905.116.116",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cứu hộ đèo Hải Vân & Bà Nà", "Cứu trợ ngập lụt mưa bão", "Kéo xe tải & xe con"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông Chu Lai - Quảng Nam",
        "partner_type": "rescue",
        "province": "Quảng Nam",
        "address": "Quốc Lộ 1A, Khu Kinh Tế Mở Chu Lai, Núi Thành, Quảng Nam",
        "lat": 15.5647,
        "lng": 108.4839,
        "phone": "0914.116.116",
        "hotline": "0914.116.116",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cứu hộ cao tốc Đà Nẵng - Quảng Ngãi", "Cẩu tải trọng lớn", "Sửa chữa lưu động"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Đa Khoa Tỉnh Quảng Ngãi",
        "partner_type": "hospital",
        "province": "Quảng Ngãi",
        "address": "Đường Lê Hữu Trác, Phường Nghĩa Lộ, TP. Quảng Ngãi",
        "lat": 15.1205,
        "lng": 108.7923,
        "phone": "0255.3827.899",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu ngoại viện", "Bảo lãnh thanh toán viện phí", "Chấn thương chỉnh hình"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Sửa Chữa & Cứu Hộ Tasco Quy Nhơn",
        "partner_type": "garage",
        "province": "Bình Định",
        "address": "Tây Sơn, Phường Quang Trung, TP. Quy Nhơn, Bình Định",
        "lat": 13.7820,
        "lng": 109.2197,
        "phone": "0256.3846.999",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Sửa chữa xe ngập triều cường ven biển", "Bảo lãnh trực tiếp", "Đại lý ủy quyền"],
        "opening_hours": "24/7",
    },

    # ── 5. Tây Nguyên ───────────────────────────────────────────
    {
        "name": "Bệnh Viện Đa Khoa Tỉnh Gia Lai",
        "partner_type": "hospital",
        "province": "Gia Lai",
        "address": "132 Tôn Thất Tùng, Phường Phù Đổng, TP. Pleiku, Gia Lai",
        "lat": 13.9832,
        "lng": 108.0056,
        "phone": "0269.3824.407",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu chấn thương Tây Nguyên", "Bảo lãnh viện phí không tiền mặt"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông Cao Nguyên Buôn Ma Thuột 24/7",
        "partner_type": "rescue",
        "province": "Đắk Lắk",
        "address": "Nguyễn Tất Thành, TP. Buôn Ma Thuột, Đắk Lắk",
        "lat": 12.6863,
        "lng": 108.0378,
        "phone": "0908.116.116",
        "hotline": "0908.116.116",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cứu hộ đường đèo dốc hiểm trở", "Kéo xe công nông & xe tải", "Tiếp nhiên liệu khẩn cấp"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Ô Tô & Cứu Hộ Đèo Prenn Đà Lạt",
        "partner_type": "garage",
        "province": "Lâm Đồng",
        "address": "Đường 3 Tháng 4, Phường 3, TP. Đà Lạt, Lâm Đồng",
        "lat": 11.9404,
        "lng": 108.4583,
        "phone": "0263.3822.888",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cứu hộ đèo Prenn & đèo Mimosa", "Sửa chữa hệ thống phanh sương mù", "Bảo lãnh bảo hiểm"],
        "opening_hours": "24/7",
    },

    # ── 6. Nam Trung Bộ & Đông Nam Bộ ───────────────────────────
    {
        "name": "Bệnh Viện Đa Khoa Quốc Tế Vinmec Nha Trang",
        "partner_type": "hospital",
        "province": "Khánh Hòa",
        "address": "42A Trần Phú, Vĩnh Nguyên, TP. Nha Trang, Khánh Hòa",
        "lat": 12.2388,
        "lng": 109.1967,
        "phone": "0258.3900.168",
        "hotline": "1900.232389",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cấp cứu quốc tế 24/7", "Bảo lãnh viện phí thẻ đối tác", "Điều trị đa khoa cao cấp"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông Ninh Thuận - Phan Rang",
        "partner_type": "rescue",
        "province": "Ninh Thuận",
        "address": "Quốc Lộ 1A, TP. Phan Rang - Tháp Chàm, Ninh Thuận",
        "lat": 11.5653,
        "lng": 108.9890,
        "phone": "0933.116.116",
        "hotline": "0933.116.116",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cứu hộ xe tải gió bão cát", "Kéo xe cao tốc Cam Lâm - Vĩnh Hảo", "Kích nổ bình điện"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Tasco Auto Phan Thiết",
        "partner_type": "garage",
        "province": "Bình Thuận",
        "address": "Đại Lộ Hùng Vương, Phú Hài, TP. Phan Thiết, Bình Thuận",
        "lat": 10.9289,
        "lng": 108.1021,
        "phone": "0252.3838.999",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Xử lý xe ngập cát & nước biển", "Sửa chữa thân vỏ", "Bảo lãnh thanh toán nhanh"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Cao Tốc Long Thành - Dầu Giây",
        "partner_type": "rescue",
        "province": "Đồng Nai",
        "address": "Nút giao Dầu Giây, Huyện Thống Nhất, Tỉnh Đồng Nai",
        "lat": 10.9574,
        "lng": 106.8427,
        "phone": "0909.116.116",
        "hotline": "0909.116.116",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cứu hộ khẩn cấp cao tốc", "Cẩu kéo xe tải nặng", "Giải phóng hiện trường va chạm"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Chợ Rẫy - Trung Tâm Cấp Cứu",
        "partner_type": "hospital",
        "province": "Hồ Chí Minh",
        "address": "201B Nguyễn Chí Thanh, Phường 12, Quận 5, TP.HCM",
        "lat": 10.7578,
        "lng": 106.6596,
        "phone": "028.3855.4137",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Cấp cứu chấn thương", "Bảo lãnh viện phí trực tiếp", "Hồi sức tích cực"],
        "opening_hours": "24/7",
    },
    {
        "name": "Tasco Auto Savico Sài Gòn - Tân Bình",
        "partner_type": "garage",
        "province": "Hồ Chí Minh",
        "address": "20 Cộng Hòa, Phường 12, Quận Tân Bình, TP.HCM",
        "lat": 10.8015,
        "lng": 106.6520,
        "phone": "028.3844.7777",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.9,
        "services": ["Đại lý ủy quyền liên kết", "Sửa chữa thân vỏ công nghệ cao", "Bảo lãnh bồi thường"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Đa Khoa Vũng Tàu",
        "partner_type": "hospital",
        "province": "Bà Rịa - Vũng Tàu",
        "address": "27 Đường 2 Tháng 9, Phường 11, TP. Vũng Tàu",
        "lat": 10.3759,
        "lng": 107.0843,
        "phone": "0254.3852.662",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu tai nạn du lịch & biển", "Bảo lãnh thanh toán viện phí thẻ bảo hiểm"],
        "opening_hours": "24/7",
    },

    # ── 7. Tây Nam Bộ / Đồng Bằng Sông Cửu Long ──────────────────
    {
        "name": "Đội Cứu Hộ Cầu Rạch Miễu & Cao Tốc Trung Lương",
        "partner_type": "rescue",
        "province": "Tiền Giang",
        "address": "Ấp Bắc, Phường 5, TP. Mỹ Tho, Tiền Giang",
        "lat": 10.3622,
        "lng": 106.3600,
        "phone": "0918.116.116",
        "hotline": "0918.116.116",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cứu hộ cầu Rạch Miễu", "Cẩu kéo cao tốc TP.HCM - Trung Lương - Mỹ Thuận"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Đa Khoa Trung Ương Cần Thơ",
        "partner_type": "hospital",
        "province": "Cần Thơ",
        "address": "315 Nguyễn Văn Linh, Phường An Khánh, Ninh Kiều, Cần Thơ",
        "lat": 10.0332,
        "lng": 105.7570,
        "phone": "0292.3820.071",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu tuyến Tây Nam Bộ", "Bảo lãnh viện phí thẻ đối tác", "Can thiệp tim mạch"],
        "opening_hours": "24/7",
    },
    {
        "name": "Gara Sửa Chữa Ô Tô An Giang - Long Xuyên",
        "partner_type": "garage",
        "province": "An Giang",
        "address": "Trần Hưng Đạo, Phường Mỹ Quý, TP. Long Xuyên, An Giang",
        "lat": 10.3864,
        "lng": 105.4352,
        "phone": "0296.3833.999",
        "hotline": "1900.6868",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Khắc phục sự cố xe mùa nước nổi", "Bảo lãnh bảo hiểm xe cơ giới"],
        "opening_hours": "24/7",
    },
    {
        "name": "Đội Cứu Hộ Giao Thông Kiên Giang - Rạch Giá",
        "partner_type": "rescue",
        "province": "Kiên Giang",
        "address": "Lạc Hồng, Phường Vĩnh Lạc, TP. Rạch Giá, Kiên Giang",
        "lat": 10.0125,
        "lng": 105.0809,
        "phone": "0977.116.116",
        "hotline": "0977.116.116",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cứu hộ bến phà & đường ven biển", "Vá lốp cứu hộ lưu động"],
        "opening_hours": "24/7",
    },
    {
        "name": "Bệnh Viện Đa Khoa Tỉnh Cà Mau",
        "partner_type": "hospital",
        "province": "Cà Mau",
        "address": "16 Hải Thượng Lãn Ông, Phường 6, TP. Cà Mau",
        "lat": 9.1769,
        "lng": 105.1524,
        "phone": "0290.3831.015",
        "hotline": "115",
        "cashless_supported": True,
        "rating": 4.8,
        "services": ["Cấp cứu vùng Đất Mũi", "Bảo lãnh viện phí không tiền mặt trực tiếp"],
        "opening_hours": "24/7",
    },
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


async def _ensure_partners(force_refresh: bool = False):
    count = await Partner.count()
    if count < len(DEFAULT_PARTNERS) or force_refresh:
        # Re-sync partners collection to ensure distributed coordinates
        await Partner.get_motor_collection().delete_many({})
        for p_data in DEFAULT_PARTNERS:
            p = Partner(**p_data)
            await p.insert()


def _serialize_partner(p: Partner, distance_km: float | None = None) -> dict:
    data = {
        "id": str(p.id),
        "name": p.name,
        "partner_type": p.partner_type,
        "province": p.province,
        "address": p.address,
        "lat": p.lat,
        "lng": p.lng,
        "phone": p.phone,
        "hotline": p.hotline,
        "cashless_supported": p.cashless_supported,
        "rating": p.rating,
        "services": p.services,
        "opening_hours": p.opening_hours,
    }
    if distance_km is not None:
        data["distance_km"] = distance_km
    return data


@router.get("/partners")
async def get_partners(
    province: str | None = None,
    partner_type: str | None = None,
    refresh: bool = False,
) -> list[dict]:
    """Danh sách các đối tác bảo lãnh trực tiếp và cứu hộ."""
    await _ensure_partners(force_refresh=refresh)
    query = {}
    if province:
        query["province"] = {"$regex": province, "$options": "i"}
    if partner_type and partner_type != "all":
        query["partner_type"] = partner_type

    docs = await Partner.find(query).to_list()
    return [_serialize_partner(d) for d in docs]


@router.get("/partners/nearby")
async def get_nearby_partners(
    lat: float,
    lng: float,
    radius_km: float = 100.0,
    partner_type: str | None = None,
) -> list[dict]:
    """Tìm đối tác gần nhất dựa trên tọa độ GPS người dùng."""
    await _ensure_partners()
    query = {}
    if partner_type and partner_type != "all":
        query["partner_type"] = partner_type

    docs = await Partner.find(query).to_list()
    results = []
    for d in docs:
        dist = _haversine_km(lat, lng, d.lat, d.lng)
        if dist <= radius_km:
            results.append((dist, d))

    results.sort(key=lambda x: x[0])
    return [_serialize_partner(d, dist) for dist, d in results]


@router.post("/sos")
async def request_sos(
    body: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Tạo lệnh điều phối cứu hộ khẩn cấp và cấp mã bảo lãnh tức thì."""
    await _ensure_partners()
    lat = float(body.get("lat", 21.0285))
    lng = float(body.get("lng", 105.8542))
    emergency_type = body.get("emergency_type", "accident")
    province = body.get("province", "")
    description = body.get("description", "Yêu cầu cứu hộ khẩn cấp")

    # Map emergency type to relevant partner types
    target_type = "rescue"
    if emergency_type == "medical":
        target_type = "hospital"
    elif emergency_type == "breakdown":
        target_type = "garage"

    all_docs = await Partner.find({}).to_list()
    scored = []
    for d in all_docs:
        dist = _haversine_km(lat, lng, d.lat, d.lng)
        # boost priority if exact match with target_type
        priority_penalty = 0 if d.partner_type == target_type else 20
        scored.append((dist + priority_penalty, dist, d))

    scored.sort(key=lambda x: x[0])
    top_partners = [_serialize_partner(d, dist) for _, dist, d in scored[:3]]

    ticket_code = f"SOS-{datetime.utcnow().strftime('%Y%m%d')}-{str(current_user.id)[-4:].upper()}"
    qr_code = f"CLAIMFLOW-CASHLESS-SOS:{ticket_code}:{str(current_user.id)}:{datetime.utcnow().timestamp()}"

    return {
        "ticket_code": ticket_code,
        "status": "dispatched",
        "emergency_type": emergency_type,
        "created_at": datetime.utcnow().isoformat(),
        "user_name": current_user.full_name or current_user.email,
        "user_phone": getattr(current_user, "phone", None) or "0900.000.000",
        "incident_location": {
            "lat": lat,
            "lng": lng,
            "province": province,
            "address": body.get("address", "Vị trí GPS người dùng"),
        },
        "description": description,
        "cashless_guarantee": {
            "eligible": True,
            "qr_code_payload": qr_code,
            "max_emergency_limit": 30_000_000,
            "note": "Xuất trình mã này tại Gara/Bệnh viện liên kết để được bảo lãnh miễn phí tạm ứng.",
        },
        "dispatched_partners": top_partners,
    }


@router.get("/guarantee-recommendations")
async def get_guarantee_recommendations(
    claim_id: str | None = None,
    claim_type: str | None = "vehicle",
    province: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Gợi ý mạng lưới bảo lãnh viện phí & garage (Hybrid InsurTech + Geo).
    
    Lọc theo quyền lợi nghiệp vụ của hồ sơ bồi thường (Xe/Tài sản -> Gara, Sức khỏe/Tai nạn -> Bệnh viện)
    và xếp hạng theo khoảng cách địa lý thực tế.
    """
    await _ensure_partners()

    target_partner_type = "garage"
    if claim_type in ("health", "life"):
        target_partner_type = "hospital"
    elif claim_type in ("vehicle", "property", "disaster"):
        target_partner_type = "garage"

    origin_lat = lat
    origin_lng = lng
    ref_province = province

    if claim_id:
        try:
            from app.models.claim import Claim
            claim = await Claim.get(claim_id)
            if claim:
                if claim.claim_type in ("health", "life"):
                    target_partner_type = "hospital"
                else:
                    target_partner_type = "garage"
                if claim.incident_location and isinstance(claim.incident_location, dict):
                    loc_lat = claim.incident_location.get("lat")
                    loc_lng = claim.incident_location.get("lng")
                    if loc_lat and loc_lng:
                        origin_lat = float(loc_lat)
                        origin_lng = float(loc_lng)
                if claim.province and not ref_province:
                    ref_province = claim.province
        except Exception:
            pass

    all_docs = await Partner.find({"is_active": True}).to_list()
    scored = []
    for d in all_docs:
        dist = None
        if origin_lat is not None and origin_lng is not None:
            dist = _haversine_km(origin_lat, origin_lng, d.lat, d.lng)

        type_match = (d.partner_type == target_partner_type)
        penalty = 0 if type_match else 50

        prov_match = bool(ref_province and ref_province.lower() in d.province.lower())
        if ref_province and not prov_match:
            penalty += 15

        distance_score = dist if dist is not None else (0 if prov_match else 100)
        total_score = distance_score + penalty
        scored.append((total_score, dist, d, type_match, prov_match))

    scored.sort(key=lambda x: x[0])

    recommendations = []
    for _, dist, d, type_match, prov_match in scored:
        serialized = _serialize_partner(d, dist)
        serialized["is_direct_guarantee"] = d.cashless_supported
        serialized["is_type_match"] = type_match
        serialized["is_same_province"] = prov_match
        recommendations.append(serialized)

    return {
        "target_type": target_partner_type,
        "origin_coordinates": {"lat": origin_lat, "lng": origin_lng} if origin_lat and origin_lng else None,
        "filter_province": ref_province,
        "recommendations": recommendations,
    }

