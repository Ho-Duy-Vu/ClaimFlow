import re
import unicodedata

from app.services.province_mapper import PROVINCE_REGION


def _normalize_vn(s: str) -> str:
    """Strip Vietnamese diacritics + lowercase + collapse whitespace."""
    if not s:
        return ""
    nfd = unicodedata.normalize("NFD", s.lower())
    no_marks = "".join(c for c in nfd if not unicodedata.combining(c))
    no_d = no_marks.replace("đ", "d")
    clean = re.sub(r"[^a-z0-9\s]", " ", no_d)
    return re.sub(r"\s+", " ", clean).strip()


# Precomputed index: normalized form → canonical province name
_PROVINCE_INDEX: dict[str, str] = {_normalize_vn(p): p for p in PROVINCE_REGION}

# Common abbreviations / colloquialisms that don't appear in the canonical list
_ALIASES: dict[str, str] = {
    "tp ho chi minh": "TP. Hồ Chí Minh",
    "thanh pho ho chi minh": "TP. Hồ Chí Minh",
    "ho chi minh": "TP. Hồ Chí Minh",
    "tp hcm": "TP. Hồ Chí Minh",
    "hcm": "TP. Hồ Chí Minh",
    "saigon": "TP. Hồ Chí Minh",
    "sai gon": "TP. Hồ Chí Minh",
    "ha noi": "Hà Nội",
    "hn": "Hà Nội",
    "ba ria vung tau": "Bà Rịa-Vũng Tàu",
    "vung tau": "Bà Rịa-Vũng Tàu",
}


def detect_province_from_text(address: str) -> str | None:
    """Extract province name from free-text address.

    Handles addresses with or without diacritics, common abbreviations,
    and prefers the longest province-name match to avoid prefix collisions
    (e.g. "Hà Nam" should not eclipse "Hà Nội").
    """
    if not address:
        return None
    norm = _normalize_vn(address)
    if not norm:
        return None

    # Pad with spaces so word-boundary checks below work for start/end positions.
    padded = f" {norm} "

    # 1. Aliases — surrounded by word boundaries to avoid matching "hcm" inside "ohcmx"
    for alias, canonical in _ALIASES.items():
        if f" {alias} " in padded:
            return canonical

    # 2. Province names — longest first so "Hà Nội" beats "Hà Nam"
    matches: list[tuple[int, str]] = []
    for norm_key, canonical in _PROVINCE_INDEX.items():
        if f" {norm_key} " in padded:
            matches.append((len(norm_key), canonical))
    if matches:
        matches.sort(reverse=True)
        return matches[0][1]

    return None


def get_insurance_recommendations(province_name: str, risk_score: int, disaster_risks: list) -> list[dict]:
    region = PROVINCE_REGION.get(province_name, "north")
    recs = []

    # Always recommend basic property insurance
    recs.append({
        "insurance_type": "Bảo hiểm tài sản nhà ở",
        "priority_score": min(100, risk_score + 10),
        "reason": "Bảo vệ tài sản khỏi thiên tai và sự cố bất ngờ",
    })

    # Disaster-specific recommendations
    disaster_map = {
        "storm": ("Bảo hiểm thiên tai bão", "Khu vực thường xuyên chịu ảnh hưởng bão"),
        "flood": ("Bảo hiểm lũ lụt ngập lụt", "Nguy cơ lũ lụt cao trong mùa mưa"),
        "landslide": ("Bảo hiểm sạt lở đất", "Địa hình đồi núi có nguy cơ sạt lở"),
        "drought": ("Bảo hiểm nông nghiệp hạn hán", "Khu vực có nguy cơ hạn hán ảnh hưởng sản xuất"),
        "inundation": ("Bảo hiểm ngập úng đô thị", "Hệ thống thoát nước dễ bị quá tải"),
    }

    for d_risk in disaster_risks:
        d_type = d_risk.get("type") if isinstance(d_risk, dict) else getattr(d_risk, "type", None)
        d_score = d_risk.get("risk_score", 0) if isinstance(d_risk, dict) else getattr(d_risk, "risk_score", 0)
        if d_type in disaster_map and d_score >= 50:
            ins_type, reason = disaster_map[d_type]
            recs.append({
                "insurance_type": ins_type,
                "priority_score": d_score,
                "reason": reason,
            })

    # Region-specific
    if region == "central" and risk_score >= 70:
        recs.append({
            "insurance_type": "Bảo hiểm toàn diện miền Trung",
            "priority_score": risk_score,
            "reason": "Miền Trung chịu nhiều loại thiên tai nhất cả nước",
        })

    return sorted(recs, key=lambda x: x["priority_score"], reverse=True)
