import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.core.middleware import csrf_middleware, request_id_middleware
from app.core.rate_limit import RateLimitExceeded, _rate_limit_exceeded_handler, limiter

from app.api.routes import (
    admin,
    analytics,
    auth,
    chatbot,
    claims,
    documents,
    geo_risk,
    notifications,
    reviewer,
    user_policies,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("claimflow")

app = FastAPI(
    title="ClaimFlow API",
    version=settings.APP_VERSION,
    description="AI-powered insurance claims processing platform for Vietnam",
)

# ── Rate limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)

# ── Custom middleware (order matters — outermost runs first) ──────────────────
app.middleware("http")(request_id_middleware)
app.middleware("http")(csrf_middleware)


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await init_db(settings.MONGODB_URL, settings.MONGODB_DB_NAME)
    logger.info("ClaimFlow API started — DB connected")


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "db": "connected", "version": settings.APP_VERSION}


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(geo_risk.router)
app.include_router(chatbot.router)
app.include_router(claims.router)
app.include_router(user_policies.router)
app.include_router(analytics.router)
app.include_router(reviewer.router)
app.include_router(admin.router)
app.include_router(notifications.router)
