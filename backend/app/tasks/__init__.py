"""Celery tasks package.

Re-export celery app instance để Celery CLI có thể tìm được khi chạy:
    celery -A app.tasks worker ...
"""

from app.tasks.document_processor import celery_app

# Alias chuẩn cho Celery 5+ auto-discovery
celery = celery_app
app = celery_app

__all__ = ["celery_app", "celery", "app"]
