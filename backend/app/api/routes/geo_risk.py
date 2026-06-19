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
