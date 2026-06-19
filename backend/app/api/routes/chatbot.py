import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.models.user import User
from app.services.ai.chatbot import chatbot_service, sanitize_chat_input

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


@router.post("/message")
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    body: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    message: str = body.get("message", "")
    session_id: str | None = body.get("session_id")

    try:
        sanitize_chat_input(message)
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        reply, sid = await chatbot_service.chat(message, session_id, current_user)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        logger.error("Chatbot error for user %s: %s", current_user.id, e)
        raise HTTPException(500, "Lỗi hệ thống, vui lòng thử lại")

    return {"reply": reply, "session_id": sid}


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    session = await chatbot_service.get_session(session_id, str(current_user.id))
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "session_id": str(session.id),
        "messages": [
            {"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat()}
            for m in session.messages
        ],
        "message_count": session.message_count,
        "created_at": session.created_at.isoformat(),
    }


@router.delete("/session/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    deleted = await chatbot_service.delete_session(session_id, str(current_user.id))
    if not deleted:
        raise HTTPException(404, "Session not found")
