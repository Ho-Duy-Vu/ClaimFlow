"""In-app notification service.

Mirror pattern của claims WebSocket (in-memory ConnectionManager) nhưng theo
**từng user** thay vì từng claim — 1 kênh realtime cho mọi sự kiện của user
(claim reviewed, payment due, policy expiring, ...).

`notify()` = persist 1 Notification doc + push realtime cho các socket đang mở.
An toàn khi không có socket nào (chỉ lưu DB, user thấy khi mở chuông).
"""
import logging

from fastapi import WebSocket

from app.models.notification import Notification

logger = logging.getLogger(__name__)


class _UserWsManager:
    """Giữ các WebSocket đang mở theo user_id (in-memory, per-process)."""

    def __init__(self) -> None:
        self._conns: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._conns.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        conns = self._conns.get(user_id, [])
        if ws in conns:
            conns.remove(ws)

    async def push(self, user_id: str, data: dict) -> None:
        for ws in list(self._conns.get(user_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id, ws)


user_ws_manager = _UserWsManager()


async def notify(
    user_id: str,
    *,
    type: str = "system",
    title: str,
    body: str = "",
    link: str | None = None,
) -> Notification | None:
    """Persist + realtime push. Never raises — thông báo không được làm hỏng
    luồng nghiệp vụ chính (best-effort)."""
    try:
        n = Notification(user_id=user_id, type=type, title=title, body=body, link=link)
        await n.insert()
    except Exception as exc:  # pragma: no cover — defensive
        logger.warning("notify persist failed user=%s type=%s: %s", user_id, type, exc)
        return None

    try:
        await user_ws_manager.push(user_id, {
            "event": "notification",
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "body": n.body,
            "link": n.link,
            "created_at": n.created_at.isoformat(),
        })
    except Exception as exc:  # pragma: no cover
        logger.debug("notify push failed user=%s: %s", user_id, exc)

    return n
