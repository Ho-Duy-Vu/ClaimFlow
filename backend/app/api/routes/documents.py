import base64
import hashlib
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.models.document import Document
from app.models.user import User
from app.schemas.document import DocumentOCRResponse, DocumentResponse, DocumentUploadResponse
from app.services.storage import delete_file, download_file, ensure_bucket, get_presigned_url, upload_file

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

_ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
}

_ALLOWED_DOC_TYPES = [
    "cccd", "cmnd", "driver_license", "passport",
    "vehicle_registration", "insurance_policy", "other",
]

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/upload", status_code=201, response_model=DocumentUploadResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    current_user: User = Depends(get_current_user),
) -> DocumentUploadResponse:
    if doc_type not in _ALLOWED_DOC_TYPES:
        raise HTTPException(400, f"Invalid doc_type. Allowed: {', '.join(_ALLOWED_DOC_TYPES)}")

    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(415, "Unsupported file type. Allowed: PDF, JPG, PNG")

    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, "File exceeds 20MB limit")

    file_ext = _ALLOWED_CONTENT_TYPES[content_type]
    file_hash = hashlib.md5(file_bytes).hexdigest()
    file_key = f"{current_user.id}/{uuid.uuid4()}.{file_ext}"
    original_name = file.filename or f"upload.{file_ext}"

    await ensure_bucket()
    await upload_file(file_bytes, file_key, content_type)

    doc = Document(
        user_id=str(current_user.id),
        file_name=original_name,
        file_key=file_key,
        file_hash=file_hash,
        file_type=file_ext,
        file_size_kb=max(1, len(file_bytes) // 1024),
        doc_type=doc_type,
        processing_status="pending",
    )
    await doc.insert()

    async def _run_ocr_background(doc_id: str, fb: bytes, dt: str) -> None:
        from app.services.ai.ocr import ocr_service
        try:
            await ocr_service.get_or_extract(fb, dt, doc_id)
            logger.info("Background OCR completed for document %s", doc_id)
        except Exception as ocr_err:
            logger.error("Background OCR failed for document %s: %s", doc_id, ocr_err)

    # Use Celery only if a worker is actively running; otherwise use BackgroundTask
    celery_queued = False
    try:
        from app.tasks.document_processor import celery_app, process_document
        workers = celery_app.control.inspect(timeout=0.5).ping()
        if workers:
            process_document.delay(str(doc.id), base64.b64encode(file_bytes).decode(), doc_type)
            celery_queued = True
            logger.info("Queued OCR via Celery worker for document %s", doc.id)
    except Exception as e:
        logger.debug("Celery worker check failed: %s", e)

    if not celery_queued:
        background_tasks.add_task(_run_ocr_background, str(doc.id), file_bytes, doc_type)
        logger.info("Scheduled OCR as background task for document %s", doc.id)

    presigned_url = get_presigned_url(file_key)

    return DocumentUploadResponse(
        document_id=str(doc.id),
        file_name=doc.file_name,
        doc_type=doc.doc_type,
        file_size_kb=doc.file_size_kb,
        presigned_url=presigned_url,
        processing_status=doc.processing_status,
        created_at=doc.created_at,
    )


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    docs = await Document.find(Document.user_id == str(current_user.id)).to_list()
    return [DocumentResponse.from_doc(d) for d in docs]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")
    return DocumentResponse.from_doc(doc)


@router.get("/{document_id}/download-url")
async def get_download_url(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")
    return {"presigned_url": get_presigned_url(doc.file_key)}


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")
    try:
        await delete_file(doc.file_key)
    except Exception as e:
        logger.warning("Could not delete file from storage: %s", e)
    await doc.delete()


@router.get("/{document_id}/ocr", response_model=DocumentOCRResponse)
async def get_ocr_result(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> DocumentOCRResponse:
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")
    return DocumentOCRResponse(
        document_id=str(doc.id),
        processing_status=doc.processing_status,
        structured_data=doc.structured_data,
        ocr_confidence=doc.ocr_confidence,
        needs_manual_review=doc.needs_manual_review,
        low_confidence_fields=doc.low_confidence_fields,
    )


@router.put("/{document_id}/fields")
async def update_fields(
    document_id: str,
    fields: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    from datetime import datetime
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")

    doc.edit_history.append({
        "version": doc.version,
        "changed_at": datetime.utcnow().isoformat(),
        "fields": {k: doc.structured_data.get(k) for k in fields},
    })
    doc.structured_data.update(fields)
    doc.version += 1
    doc.updated_at = datetime.utcnow()
    await doc.save()
    return {"ok": True, "version": doc.version}


@router.get("/{document_id}/export")
async def export_document(
    document_id: str,
    fmt: str = "json",
    current_user: User = Depends(get_current_user),
) -> dict:
    import json
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")

    if fmt == "markdown":
        lines = [f"# {doc.doc_type.upper()} — {doc.file_name}\n"]
        for key, val in doc.structured_data.items():
            if key == "overall_confidence":
                continue
            value = val.get("value") if isinstance(val, dict) else val
            conf = val.get("confidence") if isinstance(val, dict) else None
            line = f"- **{key}**: {value}"
            if conf is not None:
                line += f" _(confidence: {conf:.0%})_"
            lines.append(line)
        return {"format": "markdown", "content": "\n".join(lines)}

    return {"format": "json", "content": json.dumps(doc.structured_data, ensure_ascii=False, indent=2)}


@router.post("/{document_id}/reprocess", status_code=202)
async def reprocess_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Re-run OCR on a pending/failed document by re-downloading from storage."""
    doc = await Document.get(document_id)
    if not doc or doc.user_id != str(current_user.id):
        raise HTTPException(404, "Document not found")
    # Allow reprocess even if stuck at "processing" (may have crashed mid-run)

    try:
        file_bytes = await download_file(doc.file_key)
    except Exception as e:
        raise HTTPException(502, f"Failed to retrieve file from storage: {e}") from e

    from app.services.ai.ocr import ocr_service
    try:
        await ocr_service.get_or_extract(file_bytes, doc.doc_type, document_id)
    except Exception as e:
        raise HTTPException(502, f"OCR failed: {e}") from e

    return {"ok": True, "document_id": document_id}


@router.post("/merge", status_code=201)
async def merge_documents(
    body: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    from app.services.ai.merger import merger_service
    doc_ids: list[str] = body.get("document_ids", [])
    if len(doc_ids) < 2:
        raise HTTPException(400, "Provide at least 2 document_ids")
    try:
        result = await merger_service.merge(doc_ids, str(current_user.id))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return result


@router.post("/bundle-ocr", status_code=201)
@limiter.limit("20/minute")
async def bundle_ocr(
    request: Request,
    body: dict,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Holistic OCR across N documents — single Gemini PRO call → consolidated profile +
    inconsistencies + missing-for-insurance. Caches by MD5(file_hashes + doc_ids)."""
    doc_ids: list[str] = body.get("document_ids", [])
    if len(doc_ids) < 2:
        raise HTTPException(400, "Provide at least 2 document_ids for bundle OCR")
    if len(doc_ids) > 8:
        raise HTTPException(400, "Maximum 8 documents per bundle")

    files: list[tuple[bytes, str]] = []
    for did in doc_ids:
        doc = await Document.get(did)
        if not doc or doc.user_id != str(current_user.id):
            raise HTTPException(404, f"Document {did} not found")
        try:
            fb = await download_file(doc.file_key)
        except Exception as e:
            raise HTTPException(502, f"Failed to fetch {did} from storage: {e}") from e
        files.append((fb, doc.doc_type))

    from app.services.ai.ocr import ocr_service
    try:
        result = await ocr_service.holistic_extract(
            files=files,
            user_id=str(current_user.id),
            document_ids=doc_ids,
        )
    except Exception as e:
        logger.error("Bundle OCR failed: %s", e)
        raise HTTPException(502, f"Bundle OCR failed: {e}") from e

    return result


@router.get("/bundles/{bundle_id}")
async def get_bundle(
    bundle_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Retrieve a previously computed bundle — used by TASK-033 form auto-fill."""
    from app.models.ocr_bundle import OCRBundle
    bundle = await OCRBundle.get(bundle_id)
    if not bundle or bundle.user_id != str(current_user.id):
        raise HTTPException(404, "Bundle not found")
    return {
        "bundle_id": str(bundle.id),
        "document_ids": bundle.document_ids,
        "documents": bundle.documents,
        "consolidated_profile": bundle.consolidated_profile,
        "inconsistencies": bundle.inconsistencies,
        "missing_for_insurance": bundle.missing_for_insurance,
        "created_at": bundle.created_at,
    }
