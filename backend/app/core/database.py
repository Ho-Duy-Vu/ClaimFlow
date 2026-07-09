from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie


async def init_db(mongodb_url: str, db_name: str):
    client = AsyncIOMotorClient(mongodb_url)
    # Document models imported here to avoid circular imports
    from app.models.user import User
    from app.models.document import Document
    from app.models.claim import Claim
    from app.models.geo_risk import GeoRisk
    from app.models.chat_session import ChatSession
    from app.models.policy import Policy
    from app.models.audit_log import AuditLog
    from app.models.user_policy import UserPolicy
    from app.models.ocr_bundle import OCRBundle
    from app.models.notification import Notification
    from app.models.payment import Payment

    await init_beanie(
        database=client[db_name],
        document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy, AuditLog, UserPolicy, OCRBundle, Notification, Payment],
    )
