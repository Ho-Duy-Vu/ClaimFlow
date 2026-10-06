from datetime import datetime
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models.document import DocumentEmbed


class Claim(Document):
    user_id: str
    status: Literal[
        "pending", "processing", "approved", "rejected", "manual_review", "info_requested"
    ] = "pending"
    claim_type: Literal["health", "life", "property", "vehicle", "disaster", "income"]

    # v2: link to a specific UserPolicy this claim is against (TASK-027)
    policy_id: str | None = None

    amount_claimed: float
    amount_approved: float | None = None

    # v2 incident details (TASK-027)
    incident_date: datetime | None = None
    incident_time: str | None = None
    incident_location: dict | None = None  # { address, lat?, lng? }
    incident_type: str | None = None       # finer-grained than claim_type (collision/theft/illness/...)
    description: str | None = None

    # Original supporting docs (CCCD/policy etc.) + evidence_files (claim-specific evidence)
    documents: list[DocumentEmbed] = []
    evidence_files: list[DocumentEmbed] = []

    # v2 payout info + auxiliary fields (TASK-027)
    bank_account: dict | None = None       # { account_number, bank_name, account_holder }
    witness_info: dict | None = None
    hospital_admission_number: str | None = None
    police_report_number: str | None = None
    fact_declaration: bool = False

    ai_decision: str | None = None
    ai_reasoning: str | None = None
    ai_fraud_score: int | None = None
    ai_fraud_flags: list[str] = []
    ai_parsed_data: dict | None = None
    damage_assessment: dict | None = None

    province: str | None = None
    disaster_type: str | None = None

    reviewer_id: str | None = None
    reviewer_note: str | None = None
    reviewed_at: datetime | None = None
    assigned_at: datetime | None = None
    assigned_by: str | None = None          # "ai_dispatcher" | email

    # Reviewer v2 (TASK-029): request more info + partial approval tracking
    additional_info_requested: list[str] = []
    additional_info_requested_at: datetime | None = None
    additional_info_provided_at: datetime | None = None
    reduction_reason: str | None = None
    is_partial_approval: bool = False

    # Four-Eyes Principle (2-tier sign-off for claims >= 50M)
    requires_admin_approval: bool = False
    admin_approved_by: str | None = None
    admin_approved_at: datetime | None = None

    # Enterprise Claims Adjudication (Itemized Adjustment, Dual Notes, SLA)
    adjustment_items: list[dict] = []
    internal_note: str | None = None
    customer_notice: str | None = None
    sla_hours: int = 48
    sla_deadline: datetime | None = None

    # Partner Network Guarantee / Dispatch (Garage / Hospital / Rescue)
    partner_id: str | None = None
    partner_service_type: str | None = None # "rescue_dispatch" | "direct_billing" | "garage_repair"
    partner_dispatched_at: datetime | None = None
    partner_guarantee_status: str | None = None # "requested" | "guaranteed" | "completed"
    partner_notes: str | None = None

    # Payment workflow (human-only) — humans must mark transfer done after approval
    payment_status: Literal["not_applicable", "pending", "pending_admin_approval", "paid", "failed"] = "not_applicable"
    payment_transaction_ref: str | None = None
    payment_marked_by: str | None = None
    payment_marked_at: datetime | None = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    processed_at: datetime | None = None

    class Settings:
        name = "claims"
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("status", ASCENDING)]),
            IndexModel([("province", ASCENDING)]),
            IndexModel([("policy_id", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ]
