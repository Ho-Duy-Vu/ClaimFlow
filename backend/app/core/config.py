from pathlib import Path

from pydantic_settings import BaseSettings

# Tìm .env từ thư mục gốc project (2 cấp trên config.py)
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    # App
    APP_VERSION: str = "1.0.0"

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "claimflow_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Auth
    SECRET_KEY: str = "change-this-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    # Storage
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    AWS_BUCKET_NAME: str = "claimflow-documents"
    S3_ENDPOINT_URL: str = "http://localhost:9000"

    # Qdrant
    QDRANT_URL: str = "http://localhost:6333"

    # AI — Gemini API
    GEMINI_API_KEY: str = ""

    # ── Model tier strategy ──────────────────────────────────────────────────
    # Tách 3 alias để switch tier theo task. Mặc định tất cả là flash-lite
    # (zero behavior change). Khi cần upgrade, đổi env var tương ứng — KHÔNG
    # đụng code.
    #
    # Mapping (xem TASK-035 trong TASKS.md):
    #   - LITE    → OCR đơn giản (CCCD layout chuẩn), chatbot Q&A
    #   - DEFAULT → Claim agent (LangGraph) — cần reasoning ổn định
    #   - PRO     → OCR handwriting / multi-doc / bbox (cần model mạnh nhất)
    #
    # Upgrade khuyến nghị khi đã verify model availability:
    #   GEMINI_MODEL_DEFAULT=gemini-3.1-flash
    #   GEMINI_MODEL_PRO=gemini-3.1-pro
    GEMINI_MODEL_LITE: str = "gemini-3.1-flash-lite"
    GEMINI_MODEL_DEFAULT: str = "gemini-3.1-flash-lite"
    GEMINI_MODEL_PRO: str = "gemini-3.1-flash-lite"

    # Email
    RESEND_API_KEY: str = ""

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    class Config:
        env_file = str(_ENV_FILE)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
