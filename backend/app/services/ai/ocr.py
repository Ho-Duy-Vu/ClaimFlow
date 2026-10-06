import base64
import hashlib
import json
import logging
import re

import google.generativeai as genai

from app.core.config import settings
from app.models.document import Document

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.7

# Card layouts (chuẩn) → LITE đủ dùng. Free-form (hợp đồng/biên bản) → PRO cho bbox chính xác.
_FREE_FORM_DOC_TYPES = {"insurance_policy", "vehicle_registration", "other"}

_BBOX_INSTRUCTION = """
For EACH field, ALSO return a "bounding_box" giving the location of the text on the page,
normalized to 0–1000 in the order [y_min, x_min, y_max, x_max]
(top-left origin; y_max > y_min; x_max > x_min). Example:
  "full_name": {"value": "NGUYEN VAN A", "confidence": 0.95, "bounding_box": [120, 80, 165, 520]}
If a field is not visible in the image, set bounding_box to null.
Do NOT add bounding_box for "overall_confidence"."""

_OCR_PROMPTS: dict[str, str] = {
    "cccd": """Extract all text from this Vietnamese CCCD (National ID card) image.
Return ONLY valid JSON with this structure:
{
  "id_number": {"value": "...", "confidence": 0.0, "bounding_box": [y_min, x_min, y_max, x_max]},
  "full_name": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "date_of_birth": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "gender": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "nationality": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "place_of_origin": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "place_of_residence": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "expiry_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}
Confidence scores must be 0.0–1.0. Use null for missing fields.""" + _BBOX_INSTRUCTION,

    "cmnd": """Extract all text from this Vietnamese CMND (old National ID) image.
Return ONLY valid JSON with the same structure as CCCD but adapted for CMND fields.
Include overall_confidence as average of field confidences.""" + _BBOX_INSTRUCTION,

    "driver_license": """Extract all text from this Vietnamese Driver's License image.
Return ONLY valid JSON:
{
  "license_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "full_name": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "date_of_birth": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "address": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "license_class": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "issue_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "expiry_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}""" + _BBOX_INSTRUCTION,

    "passport": """Extract all text from this passport image (MRZ and biographical data).
Return ONLY valid JSON:
{
  "passport_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "full_name": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "nationality": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "date_of_birth": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "gender": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "place_of_birth": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "issue_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "expiry_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}""" + _BBOX_INSTRUCTION,

    "insurance_policy": """Extract key information from this Vietnamese insurance policy document.
Return ONLY valid JSON:
{
  "policy_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "insured_name": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "coverage_types": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "coverage_amount": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "premium": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "start_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "end_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "insurer": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}""" + _BBOX_INSTRUCTION,

    "vehicle_registration": """Extract all text from this Vietnamese vehicle registration document.
Return ONLY valid JSON:
{
  "plate_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "owner_name": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "owner_address": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "vehicle_type": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "brand": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "color": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "engine_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "chassis_number": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "registration_date": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}""" + _BBOX_INSTRUCTION,

    "other": """Extract all readable text from this document image.
Return ONLY valid JSON:
{
  "raw_text": {"value": "...", "confidence": 0.0, "bounding_box": [...]},
  "overall_confidence": 0.0
}""" + _BBOX_INSTRUCTION,
}

_ENHANCED_SUFFIX = """
IMPORTANT: This image may be low quality. Use maximum effort to extract any visible text.
Increase confidence only for clearly readable fields. Set confidence=0.0 for unreadable fields."""


_HOLISTIC_PROMPT = """Bạn nhận được __N__ tài liệu tiếng Việt thuộc về MỘT người dùng (CCCD, hộ chiếu, bằng lái, giấy đăng ký xe, hợp đồng bảo hiểm, hoặc hồ sơ y tế / biên bản). Hint doc_type người dùng khai: __DOC_TYPES_HINT__.

Nhiệm vụ:
1. Với MỖI tài liệu (theo index 0, 1, ..., __LAST__):
   - Xác định doc_type (cccd/cmnd/driver_license/passport/vehicle_registration/insurance_policy/other)
   - Trích xuất TẤT CẢ trường thông tin đọc được. Mỗi trường: value, confidence (0.0-1.0), bounding_box [y_min, x_min, y_max, x_max] normalized 0-1000.

2. Hợp nhất thành consolidated_profile của người này — chọn các trường chung:
   full_name, date_of_birth, gender, nationality, id_number (CCCD), passport_number, license_number,
   place_of_origin, place_of_residence, address, phone_number, email, occupation,
   vehicle_plate, vehicle_brand, vehicle_year,
   policy_number, insurer, coverage_amount, coverage_types, premium, policy_start_date, policy_end_date.
   Mỗi trường trong consolidated_profile có: {"value": "...", "confidence": 0.0, "source_doc_index": N}.
   Chọn giá trị từ doc có confidence cao nhất. Bỏ qua trường không có thông tin trong bất kỳ tài liệu nào.

3. Phát hiện inconsistencies — các trường có giá trị KHÁC NHAU giữa các tài liệu (cùng người nhưng tên/ngày sinh/địa chỉ khác nhau, sau khi normalize whitespace + case):
   - severity: "high" nếu id_number / full_name / date_of_birth khác; "medium" nếu địa chỉ khác; "low" nếu chỉ khác định dạng (vd 01/01/1990 vs 1990-01-01)
   - Bỏ qua nếu chỉ 1 doc có giá trị (không phải inconsistency)

4. missing_for_insurance — danh sách các trường thường cần cho đăng ký bảo hiểm mà CHƯA xuất hiện trong consolidated_profile. Cân nhắc: occupation, phone_number, email, beneficiary_name, beneficiary_relationship, bank_account, height, weight, vehicle_plate, property_address.

Chỉ trả về JSON hợp lệ, KHÔNG markdown, KHÔNG văn bản giải thích, theo schema:
{
  "documents": [
    {"index": 0, "doc_type": "...", "fields": {"field_name": {"value": "...", "confidence": 0.0, "bounding_box": [y_min, x_min, y_max, x_max]}, ...}}
  ],
  "consolidated_profile": {
    "full_name": {"value": "...", "confidence": 0.0, "source_doc_index": 0},
    ...
  },
  "inconsistencies": [
    {"field": "place_of_residence", "values_by_doc": [{"doc_index": 0, "value": "Hà Nội"}, {"doc_index": 1, "value": "TP HCM"}], "severity": "medium"}
  ],
  "missing_for_insurance": ["occupation", "phone_number"]
}"""


def _build_prompt(doc_type: str, enhanced: bool = False) -> str:
    base = _OCR_PROMPTS.get(doc_type, _OCR_PROMPTS["other"])
    return base + _ENHANCED_SUFFIX if enhanced else base


def _parse_gemini_response(text: str) -> dict:
    text = text.strip()
    # Extract JSON from markdown code blocks if present
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    parsed = json.loads(text)
    _normalize_bboxes(parsed)
    return parsed


def _parse_holistic_response(text: str) -> dict:
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        text = match.group(1)
    parsed = json.loads(text)
    # Defensive shape: ensure required keys exist
    parsed.setdefault("documents", [])
    parsed.setdefault("consolidated_profile", {})
    parsed.setdefault("inconsistencies", [])
    parsed.setdefault("missing_for_insurance", [])
    # Normalize bbox inside each per-document fields dict
    for doc in parsed["documents"]:
        if isinstance(doc, dict) and isinstance(doc.get("fields"), dict):
            _normalize_bboxes(doc["fields"])
    return parsed


def _normalize_bboxes(parsed: dict) -> None:
    """In-place: ensure every field's bounding_box is either a sane 4-list of floats in [0, 1000] or None.
    Gemini occasionally returns wrong-order coords, strings, or extra elements — clamp + drop."""
    for key, field in parsed.items():
        if not isinstance(field, dict):
            continue
        bbox = field.get("bounding_box")
        if bbox is None:
            continue
        if not isinstance(bbox, list) or len(bbox) != 4:
            field["bounding_box"] = None
            continue
        try:
            y_min, x_min, y_max, x_max = (float(v) for v in bbox)
        except (TypeError, ValueError):
            field["bounding_box"] = None
            continue
        # Clamp into [0, 1000]
        y_min = max(0.0, min(1000.0, y_min))
        x_min = max(0.0, min(1000.0, x_min))
        y_max = max(0.0, min(1000.0, y_max))
        x_max = max(0.0, min(1000.0, x_max))
        # Sanity: positive area
        if y_max <= y_min or x_max <= x_min:
            field["bounding_box"] = None
            continue
        field["bounding_box"] = [y_min, x_min, y_max, x_max]


class OCRService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        # LITE cho path mặc định (CCCD/passport/license layout chuẩn)
        self._model = genai.GenerativeModel(settings.GEMINI_MODEL_LITE)
        # PRO sẵn sàng cho handwriting / multi-doc / bbox (TASK-031/032/034)
        self._model_heavy = genai.GenerativeModel(settings.GEMINI_MODEL_PRO)

    async def get_or_extract(self, file_bytes: bytes, doc_type: str, document_id: str) -> dict:
        file_hash = hashlib.md5(file_bytes).hexdigest()

        cached = await Document.find_one(
            Document.file_hash == file_hash,
            Document.processing_status == "done",
        )
        if cached and cached.structured_data and str(cached.id) != document_id:
            logger.info("OCR cache hit for hash %s", file_hash)
            # Apply cached result to the current document
            doc = await Document.get(document_id)
            if doc:
                doc.structured_data = cached.structured_data
                doc.ocr_confidence = cached.ocr_confidence
                doc.needs_manual_review = cached.needs_manual_review
                doc.low_confidence_fields = cached.low_confidence_fields
                doc.processing_status = "done"
                doc.file_hash = file_hash
                await doc.save()
            return {
                "data": cached.structured_data,
                "confidence": cached.ocr_confidence,
                "cached": True,
                "needs_manual_review": cached.needs_manual_review,
                "low_confidence_fields": cached.low_confidence_fields,
            }

        return await self._extract_with_retry(file_bytes, doc_type, document_id, file_hash)

    async def _extract_with_retry(
        self, file_bytes: bytes, doc_type: str, document_id: str, file_hash: str
    ) -> dict:
        doc = await Document.get(document_id)
        if doc:
            doc.processing_status = "processing"
            await doc.save()

        try:
            result = await self._call_gemini(file_bytes, doc_type, enhanced=False)
            confidence = result.get("overall_confidence", 0.0)

            if confidence < CONFIDENCE_THRESHOLD:
                logger.warning("[%s] Low confidence %.2f, retrying with enhanced prompt", document_id, confidence)
                retry = await self._call_gemini(file_bytes, doc_type, enhanced=True)
                if retry.get("overall_confidence", 0.0) >= confidence:
                    result = retry
                    confidence = result.get("overall_confidence", 0.0)

            low_conf_fields = [
                k for k, v in result.items()
                if isinstance(v, dict) and v.get("confidence", 1.0) < CONFIDENCE_THRESHOLD
            ]
            needs_review = confidence < CONFIDENCE_THRESHOLD

            if doc:
                doc.structured_data = result
                doc.ocr_confidence = confidence
                doc.needs_manual_review = needs_review
                doc.low_confidence_fields = low_conf_fields
                doc.processing_status = "done"
                doc.file_hash = file_hash
                await doc.save()

                # Auto-sync user province if address found in this document
                try:
                    from app.models.user import User
                    from app.services.geo.risk_engine import detect_province_from_text
                    from app.services.province_mapper import PROVINCE_REGION
                    addr_val = (
                        result.get("place_of_residence")
                        or result.get("address")
                        or result.get("place_of_origin")
                    )
                    if isinstance(addr_val, dict):
                        addr_val = addr_val.get("value")
                    if addr_val and isinstance(addr_val, str):
                        p = detect_province_from_text(addr_val)
                        if p:
                            user = await User.get(doc.user_id)
                            if user and user.province != p:
                                user.province = p
                                user.region = PROVINCE_REGION.get(p, user.region or "north")
                                await user.save()
                                logger.info("Auto-updated user %s province to %s from doc %s", user.id, p, doc.id)
                except Exception as sync_err:
                    logger.debug("Non-critical: Failed syncing user province from doc OCR: %s", sync_err)

            return {
                "data": result,
                "confidence": confidence,
                "cached": False,
                "needs_manual_review": needs_review,
                "low_confidence_fields": low_conf_fields,
            }

        except Exception as exc:
            logger.error("[%s] OCR failed: %s", document_id, exc)
            if doc:
                doc.processing_status = "failed"
                await doc.save()
            raise

    async def holistic_extract(
        self,
        files: list[tuple[bytes, str]],
        user_id: str,
        document_ids: list[str],
    ) -> dict:
        """Single Gemini PRO call across N documents → consolidated profile + inconsistencies + missing fields.

        `files`: list of (file_bytes, doc_type_hint). Order is preserved as document index.
        `document_ids`: parallel list of MongoDB Document ids — used to link bundle back.
        """
        from app.models.ocr_bundle import OCRBundle

        if not files:
            raise ValueError("Bundle OCR requires at least 1 document")

        # Bundle hash = MD5 of concatenated file hashes + sorted doc_ids → stable cache key
        combined = b""
        for fb, _ in files:
            combined += hashlib.md5(fb).digest()
        combined += "|".join(sorted(document_ids)).encode()
        bundle_hash = hashlib.md5(combined).hexdigest()

        cached = await OCRBundle.find_one(
            OCRBundle.user_id == user_id,
            OCRBundle.bundle_hash == bundle_hash,
        )
        if cached:
            logger.info("Bundle OCR cache hit %s", bundle_hash)
            return {
                "bundle_id": str(cached.id),
                "cached": True,
                "documents": cached.documents,
                "consolidated_profile": cached.consolidated_profile,
                "inconsistencies": cached.inconsistencies,
                "missing_for_insurance": cached.missing_for_insurance,
            }

        result = await self._call_gemini_holistic(files)

        # Persist bundle for TASK-033 form auto-fill + future cache hits
        bundle = OCRBundle(
            user_id=user_id,
            bundle_hash=bundle_hash,
            document_ids=document_ids,
            documents=result.get("documents", []),
            consolidated_profile=result.get("consolidated_profile", {}),
            inconsistencies=result.get("inconsistencies", []),
            missing_for_insurance=result.get("missing_for_insurance", []),
        )
        await bundle.insert()

        return {
            "bundle_id": str(bundle.id),
            "cached": False,
            **result,
        }

    async def _call_gemini_holistic(self, files: list[tuple[bytes, str]]) -> dict:
        import asyncio
        import functools

        n = len(files)
        doc_types_hint = ", ".join(f"#{i}:{dt}" for i, (_, dt) in enumerate(files))
        # Use literal placeholders + replace (not .format) — prompt contains JSON braces
        # that .format would misinterpret as format fields.
        prompt = (
            _HOLISTIC_PROMPT
            .replace("__N__", str(n))
            .replace("__LAST__", str(n - 1))
            .replace("__DOC_TYPES_HINT__", doc_types_hint)
        )

        parts: list[dict | str] = []
        for file_bytes, _ in files:
            if file_bytes[:4] == b"%PDF":
                mime = "application/pdf"
            elif file_bytes[:3] == b"\xff\xd8\xff":
                mime = "image/jpeg"
            else:
                mime = "image/png"
            parts.append({
                "mime_type": mime,
                "data": base64.b64encode(file_bytes).decode(),
            })
        parts.append(prompt)

        def _sync_call() -> str:
            response = self._model_heavy.generate_content(parts)
            return response.text

        loop = asyncio.get_running_loop()
        last_exc: Exception = RuntimeError("Gemini holistic call failed")
        # Higher timeout for multi-image
        for attempt in range(3):
            try:
                raw_text = await asyncio.wait_for(
                    loop.run_in_executor(None, functools.partial(_sync_call)),
                    timeout=120.0,
                )
                parsed = _parse_holistic_response(raw_text)
                return parsed
            except asyncio.TimeoutError:
                logger.error("Gemini holistic call timed out after 120s")
                raise RuntimeError("Gemini API timeout")
            except (json.JSONDecodeError, ValueError) as e:
                logger.error("Gemini holistic parse error: %s", e)
                return {
                    "documents": [],
                    "consolidated_profile": {},
                    "inconsistencies": [],
                    "missing_for_insurance": [],
                    "parse_error": str(e),
                }
            except Exception as e:
                last_exc = e
                err_str = str(e)
                if "429" in err_str or "quota" in err_str.lower():
                    wait = 15 * (2 ** attempt)
                    logger.warning("Gemini 429 on holistic, waiting %ds (attempt %d/3)", wait, attempt + 1)
                    await asyncio.sleep(wait)
                else:
                    logger.error("Gemini holistic error: %s", e)
                    raise
        raise last_exc

    async def _call_gemini(self, file_bytes: bytes, doc_type: str, enhanced: bool) -> dict:
        import asyncio
        import functools

        prompt = _build_prompt(doc_type, enhanced)
        image_data = base64.b64encode(file_bytes).decode()

        if file_bytes[:4] == b"%PDF":
            mime = "application/pdf"
        elif file_bytes[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        else:
            mime = "image/png"

        image_part = {"mime_type": mime, "data": image_data}

        # Free-form docs cần PRO để bbox chính xác; card layouts dùng LITE
        model = self._model_heavy if doc_type in _FREE_FORM_DOC_TYPES else self._model

        def _sync_call() -> str:
            response = model.generate_content([image_part, prompt])
            return response.text

        loop = asyncio.get_running_loop()
        last_exc: Exception = RuntimeError("Gemini call failed")
        for attempt in range(3):
            try:
                raw_text = await asyncio.wait_for(
                    loop.run_in_executor(None, functools.partial(_sync_call)),
                    timeout=60.0,
                )
                return _parse_gemini_response(raw_text)
            except asyncio.TimeoutError:
                logger.error("Gemini call timed out after 60s")
                raise RuntimeError("Gemini API timeout")
            except (json.JSONDecodeError, ValueError) as e:
                logger.error("Gemini response parse error: %s", e)
                return {"overall_confidence": 0.0, "parse_error": str(e)}
            except Exception as e:
                last_exc = e
                err_str = str(e)
                # 429 rate limit — wait and retry
                if "429" in err_str or "quota" in err_str.lower():
                    wait = 15 * (2 ** attempt)
                    logger.warning("Gemini 429, waiting %ds (attempt %d/3)", wait, attempt + 1)
                    await asyncio.sleep(wait)
                else:
                    logger.error("Gemini API error: %s", e)
                    raise
        raise last_exc


ocr_service = OCRService()
