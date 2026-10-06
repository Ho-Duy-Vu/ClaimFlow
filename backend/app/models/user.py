from datetime import datetime
from typing import Annotated, Literal

from beanie import Document, Indexed
from pydantic import EmailStr, Field
from pymongo import IndexModel, ASCENDING


class User(Document):
    email: Annotated[EmailStr, Indexed(unique=True)]
    hashed_password: str
    full_name: str | None = None
    role: Literal["user", "reviewer", "admin"] = "user"
    province: str | None = None
    region: Literal["north", "central", "south"] | None = None
    is_active: bool = True
    specializations: list[str] = []         # e.g. ["vehicle", "health", "property", "disaster"]
    max_active_claims: int = 10             # workload quota for reviewer
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("role", ASCENDING)]),
            IndexModel([("province", ASCENDING)]),
            IndexModel([("is_active", ASCENDING)]),
        ]
