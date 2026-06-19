from datetime import datetime

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class OCRBundle(Document):
    user_id: str
    bundle_hash: str
    document_ids: list[str]

    documents: list[dict] = []
    consolidated_profile: dict = {}
    inconsistencies: list[dict] = []
    missing_for_insurance: list[str] = []

    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "ocr_bundles"
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("bundle_hash", ASCENDING)]),
        ]
