import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pymongo import DESCENDING

from app.api.deps import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.services.notifications import user_ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])


def _serialize(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "link": n.link,
        "read": n.read,
        "created_at": n.created_at.isoformat(),
    }


@router.get("")
async def list_notifications(
    unread_only: bool = False,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
) -> dict:
    """List thông báo của user hiện tại (mới nhất trước) + số chưa đọc."""
    limit = max(1, min(limit, 100))
    q = Notification.find(Notification.user_id == str(current_user.id))
    if unread_only:
        q = Notification.find(
            Notification.user_id == str(current_user.id),
            Notification.read == False,  # noqa: E712
        )
    items = await q.sort(-Notification.created_at).limit(limit).to_list()
    unread = await Notification.find(
        Notification.user_id == str(current_user.id),
        Notification.read == False,  # noqa: E712
    ).count()
    return {"items": [_serialize(n) for n in items], "unread": unread}


@router.get("/unread-count")
async def unread_count(current_user: User = Depends(get_current_user)) -> dict:
    unread = await Notification.find(
        Notification.user_id == str(current_user.id),
        Notification.read == False,  # noqa: E712
    ).count()
    return {"unread": unread}


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    n = await Notification.get(notification_id)
    if not n or n.user_id != str(current_user.id):
        raise HTTPException(404, "Không tìm thấy thông báo")
    if not n.read:
        n.read = True
        await n.save()
    return {"ok": True}


@router.patch("/read-all")
async def mark_all_read(current_user: User = Depends(get_current_user)) -> dict:
    await Notification.find(
        Notification.user_id == str(current_user.id),
        Notification.read == False,  # noqa: E712
    ).update({"$set": {"read": True}})
    return {"ok": True}


@router.websocket("/ws")
async def notifications_ws(websocket: WebSocket):
    """Kênh realtime per-user cho mọi thông báo. Auth qua cookie JWT."""
    from app.core.security import decode_access_token

    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001)
        return
    user_id = decode_access_token(token.removeprefix("Bearer "))
    if not user_id:
        await websocket.close(code=4001)
        return

    await user_ws_manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        user_ws_manager.disconnect(user_id, websocket)
