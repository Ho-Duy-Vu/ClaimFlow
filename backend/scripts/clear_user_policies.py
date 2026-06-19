"""Clear UserPolicy records — dev/test reset utility.

Xóa toàn bộ UserPolicy (kèm prompt confirm), hoặc lọc theo email user.

Usage:
    # Xóa tất cả (hỏi confirm)
    python scripts/clear_user_policies.py

    # Xóa của 1 user cụ thể
    python scripts/clear_user_policies.py --email user1@example.com

    # Xóa toàn bộ KHÔNG hỏi (dùng với CI/seed reset)
    python scripts/clear_user_policies.py --yes

CẢNH BÁO: thao tác này KHÔNG hoàn tác. UserPolicy có claim đính kèm sẽ
KHÔNG bị ảnh hưởng (Claim chỉ ref user_id, không ref policy_id — đợi TASK-027).
"""

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.chat_session import ChatSession
from app.models.claim import Claim
from app.models.document import Document
from app.models.geo_risk import GeoRisk
from app.models.policy import Policy
from app.models.user import User
from app.models.user_policy import UserPolicy


async def run(email: str | None, skip_confirm: bool) -> None:
    print(f"Connecting to {settings.MONGODB_URL}...")
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    await init_beanie(
        database=client[settings.MONGODB_DB_NAME],
        document_models=[
            User, Document, Claim, GeoRisk, ChatSession,
            Policy, AuditLog, UserPolicy,
        ],
    )

    if email:
        user = await User.find_one(User.email == email)
        if not user:
            print(f"✗ Không tìm thấy user {email}")
            return
        query = UserPolicy.user_id == str(user.id)
        scope_label = f"của user {email}"
    else:
        query = {}
        scope_label = "TOÀN BỘ user_policies"

    count = await UserPolicy.find(query).count()
    if count == 0:
        print(f"Không có policy nào {scope_label}.")
        return

    print(f"\n⚠ Sắp xóa {count} UserPolicy {scope_label}.")

    if not skip_confirm:
        ans = input("Gõ 'yes' để xác nhận: ").strip().lower()
        if ans != "yes":
            print("Hủy bỏ.")
            return

    result = await UserPolicy.find(query).delete()
    deleted = getattr(result, "deleted_count", count)
    print(f"\n✓ Đã xóa {deleted} UserPolicy.")
    print("Bây giờ user có thể đăng ký gói mới qua flow Documents → OCR → Form.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Chỉ xóa policy của user có email này")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    asyncio.run(run(args.email, args.yes))


if __name__ == "__main__":
    main()
