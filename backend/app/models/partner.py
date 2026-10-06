from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel


class Partner(Document):
    name: str
    partner_type: Literal["garage", "hospital", "rescue"]
    province: str
    address: str
    lat: float
    lng: float
    phone: str
    hotline: str
    cashless_supported: bool = True
    rating: float = 4.8
    services: list[str] = []
    opening_hours: str = "24/7"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "partners"
        indexes = [
            IndexModel([("partner_type", ASCENDING)]),
            IndexModel([("province", ASCENDING)]),
            IndexModel([("cashless_supported", ASCENDING)]),
        ]
