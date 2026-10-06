from datetime import datetime
import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse
from app.services.province_mapper import get_region

logger = logging.getLogger("claimflow")

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_MAX_AGE = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def _set_auth_cookies(response: Response, user_id: str) -> str:
    """Set httpOnly access_token + non-httpOnly csrf_token. Returns csrf token."""
    token = create_access_token(str(user_id))
    csrf = secrets.token_hex(32)

    response.set_cookie(
        key="access_token",
        value=f"Bearer {token}",
        httponly=True,
        secure=False,       # True in production (HTTPS)
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,     # JavaScript must read this for X-CSRF-Token header
        secure=False,
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
    )
    return csrf


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response):
    existing = await User.find_one(User.email == body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email đã được đăng ký")

    region = get_region(body.province)
    user = await User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        province=body.province,
        region=region,
    ).insert()

    _set_auth_cookies(response, user.id)
    logger.info("New user registered: %s", user.email)
    return UserResponse.from_user(user)


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest, response: Response):
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa",
        )

    _set_auth_cookies(response, user.id)
    logger.info("User logged in: %s", user.email)
    return {
        "message": "Login successful",
        "user": UserResponse.from_user(user),
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("csrf_token")
    return {"message": "Logged out"}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.from_user(current_user)


class UpdateLocationRequest(BaseModel):
    province: str


@router.patch("/location")
async def update_location(
    body: UpdateLocationRequest,
    current_user: User = Depends(get_current_user),
):
    from app.services.province_mapper import get_region
    from app.services.geo.risk_engine import detect_province_from_text

    canonical_p = detect_province_from_text(body.province) or body.province
    current_user.province = canonical_p
    current_user.region = get_region(canonical_p)
    current_user.updated_at = datetime.utcnow()
    await current_user.save()
    logger.info("Updated user %s province to %s", current_user.id, canonical_p)
    return UserResponse.from_user(current_user)
