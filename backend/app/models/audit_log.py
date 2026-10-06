from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class AuditLog(Document):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    actor_id: str
    actor_email: str
    action: Literal[
        "role_change", "user_deactivate", "user_activate",
        "policy_upload", "policy_delete",
        "claim_override", "login_failed", "login_success",
        "underwriting_rules_updated", "partner_dispatched",
        "admin_signoff_approved", "admin_signoff_rejected",
        "partner_created", "partner_updated", "partner_deleted",
    ] | str
    target_type: Literal["user", "policy", "claim", "partner", "system_config"] | str
    target_id: str
    details: dict = {}
    ip_address: str | None = None

    class Settings:
        name = "audit_logs"
        indexes = [
            IndexModel([("actor_id", ASCENDING)]),
            IndexModel([("action", ASCENDING)]),
            IndexModel([("timestamp", DESCENDING)]),
            IndexModel([("target_type", ASCENDING)]),
        ]
