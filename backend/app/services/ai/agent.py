"""
TASK-015 — LangGraph 4-node claim processing agent.

Flow: extract_data → check_coverage → fraud_detection → make_decision
"""

import asyncio
import functools
import json
import logging
import re
from typing import Optional

import google.generativeai as genai
from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── State ──────────────────────────────────────────────────────────────────────

class ClaimState(TypedDict):
    # Input fields (set before graph runs)
    claim_id: str
    user_id: str
    raw_text: str
    claim_type: str
    province: Optional[str]
    disaster_type: Optional[str]
    amount_claimed: float

    # Node 1 — extract_data
    parsed_data: dict
    missing_fields: list

    # Node 2 — check_coverage
    is_covered: bool
    coverage_limit: float
    coverage_reason: str

    # Evidence-count signal (TASK-027)
    evidence_count: int
    required_evidence_count: int

    # Node 3 — fraud_detection
    fraud_score: int
    fraud_flags: list

    # Node 4 — make_decision
    final_decision: str          # approve | reject | manual_review | need_more_info
    final_reasoning: str
    amount_approved: Optional[float]


# ── Helpers ────────────────────────────────────────────────────────────────────

_HIGH_RISK = {
    "Quảng Bình", "Hà Tĩnh", "Nghệ An", "Quảng Nam",
    "Thừa Thiên Huế", "Quảng Ngãi", "Bình Định", "Quảng Trị",
}
_FLOOD_SOUTH = {"An Giang", "Đồng Tháp", "Long An", "Tiền Giang", "Kiên Giang", "Cà Mau"}


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if m:
        text = m.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


async def _gemini_call(prompt: str, timeout: float = 30.0) -> str:
    genai.configure(api_key=settings.GEMINI_API_KEY)
    # DEFAULT tier — claim agent cần reasoning ổn định cho approve/reject + fraud
    model = genai.GenerativeModel(settings.GEMINI_MODEL_DEFAULT)

    def _sync():
        return model.generate_content(prompt).text

    loop = asyncio.get_running_loop()
    last_exc: Exception = RuntimeError("Gemini call failed")
    for attempt in range(3):
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, functools.partial(_sync)),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Gemini timeout")
        except Exception as exc:
            err = str(exc)
            if "429" in err or "quota" in err.lower():
                wait = 15 * (2 ** attempt)
                logger.warning("Gemini 429 in agent, waiting %ds", wait)
                await asyncio.sleep(wait)
                last_exc = exc
            else:
                raise
    raise last_exc


# ── Node 1: extract_data ───────────────────────────────────────────────────────

async def extract_data(state: ClaimState) -> dict:
    prompt = f"""Phân tích yêu cầu bồi thường bảo hiểm sau và trích xuất thông tin.

Loại yêu cầu: {state['claim_type']}
Mô tả: {state['raw_text'][:1500]}
Tỉnh đã khai: {state.get('province')}
Loại thiên tai đã khai: {state.get('disaster_type')}

Trả về JSON:
{{
  "province": "tên tỉnh (null nếu không rõ)",
  "disaster_type": "flood|storm|landslide|drought|inundation|null",
  "event_date": "YYYY-MM-DD hoặc null",
  "description_quality": "high|medium|low",
  "key_facts": ["fact1", "fact2"],
  "missing_critical": ["trường còn thiếu"]
}}
Chỉ trả về JSON hợp lệ."""

    try:
        raw = await _gemini_call(prompt)
        parsed = _parse_json(raw)
    except Exception as exc:
        logger.error("[%s] extract_data failed: %s", state["claim_id"], exc)
        parsed = {}

    # Merge AI-extracted with user-provided (user-provided takes priority)
    province = state.get("province") or parsed.get("province")
    disaster_type = state.get("disaster_type") or parsed.get("disaster_type")

    missing = parsed.get("missing_critical", [])
    if not state["raw_text"].strip():
        missing.append("description")

    return {
        "province": province,
        "disaster_type": disaster_type,
        "parsed_data": {
            "event_date": parsed.get("event_date"),
            "description_quality": parsed.get("description_quality", "medium"),
            "key_facts": parsed.get("key_facts", []),
        },
        "missing_fields": missing,
    }


# ── Node 2: check_coverage ─────────────────────────────────────────────────────
# RAG-based via VectorService (Qdrant + Gemini). Falls back to rule-based stub
# if Qdrant unavailable / collection empty (e.g. before ingest_policies.py ran).

_COVERAGE_PROMPT = """\
Bạn là chuyên viên thẩm định bảo hiểm. Hãy kiểm tra yêu cầu bồi thường dưới đây có được bảo hiểm theo điều khoản policy được trích dẫn không.

YÊU CẦU BỒI THƯỜNG:
- Loại: {claim_type}
- Tỉnh: {province}
- Loại thiên tai (nếu có): {disaster_type}
- Số tiền yêu cầu: {amount:,.0f} VND
- Mức bảo hiểm tối đa của user (coverage_limit từ UserPolicy): {limit:,.0f} VND
- Mô tả sự kiện: {description}

ĐIỀU KHOẢN POLICY LIÊN QUAN (truy xuất từ vector store):
{context}

NHIỆM VỤ: dựa vào điều khoản trên, trả lời JSON với format:
{{
  "is_covered": true | false,
  "reason": "<lý do ngắn 1-2 câu, trích dẫn cụ thể điều khoản nếu được>",
  "matched_clause": "<đoạn text từ policy đã thuyết phục bạn — copy nguyên văn ngắn>"
}}

QUY TẮC BẮT BUỘC:
- Nếu loại claim không phải "disaster" nhưng có disaster_type → NOT covered (phải dùng gói thiên tai riêng).
- Nếu số tiền > mức bảo hiểm tối đa của user → NOT covered (vượt hạn mức).
- Nếu loại claim là "disaster" nhưng không có disaster_type cụ thể → NOT covered (yêu cầu thông tin).
- Ngoài 3 quy tắc trên, dựa hoàn toàn vào điều khoản policy bên trên để quyết định.
- Trả về JSON thuần, KHÔNG kèm code fence hay text giải thích thêm.
"""


def _rule_based_coverage(state: ClaimState) -> dict:
    """Fallback khi Qdrant không khả dụng."""
    claim_type = state["claim_type"]
    province = state.get("province") or ""
    disaster_type = state.get("disaster_type") or ""
    amount = state["amount_claimed"]
    limit = state["coverage_limit"]

    is_covered = True
    reason = f"Gói bảo hiểm {claim_type} của bạn có mức bồi thường tối đa {limit:,.0f} VND."

    if claim_type == "disaster":
        if not disaster_type:
            is_covered = False
            reason = "Yêu cầu thiên tai cần ghi rõ loại thiên tai (bão/lũ/sạt lở/hạn hán)."
        elif province and (province in _HIGH_RISK or province in _FLOOD_SOUTH):
            reason = (
                f"{province} là vùng thiên tai cao — {disaster_type}. "
                f"Gói thiên tai của bạn bảo hiểm tối đa {limit:,.0f} VND."
            )

    if claim_type in ("health", "life", "income") and disaster_type:
        is_covered = False
        reason = (
            f"Thiệt hại do thiên tai không được bảo hiểm bởi gói {claim_type}. "
            "Vui lòng dùng gói bảo hiểm thiên tai."
        )

    if amount > limit:
        is_covered = False
        reason = (
            f"Số tiền yêu cầu ({amount:,.0f} VND) vượt hạn mức gói ({limit:,.0f} VND). "
            "Vui lòng nâng cấp gói hoặc điều chỉnh số tiền."
        )

    return {
        "is_covered": is_covered,
        "coverage_limit": limit,
        "coverage_reason": reason,
    }


async def check_coverage(state: ClaimState) -> dict:
    from app.services.ai.rag import vector_service

    claim_type = state["claim_type"]
    province = state.get("province") or ""
    disaster_type = state.get("disaster_type") or ""
    amount = state["amount_claimed"]
    limit = state["coverage_limit"]

    # Hard rules first — these don't need RAG
    if claim_type in ("health", "life", "income") and disaster_type:
        return {
            "is_covered": False,
            "coverage_limit": limit,
            "coverage_reason": (
                f"Thiệt hại do thiên tai không được bảo hiểm bởi gói {claim_type}. "
                "Vui lòng dùng gói bảo hiểm thiên tai."
            ),
        }
    if amount > limit:
        return {
            "is_covered": False,
            "coverage_limit": limit,
            "coverage_reason": (
                f"Số tiền yêu cầu ({amount:,.0f} VND) vượt hạn mức gói ({limit:,.0f} VND). "
                "Vui lòng nâng cấp gói hoặc điều chỉnh số tiền."
            ),
        }

    # Try RAG. If unavailable, fall back to rule-based.
    if not vector_service.is_available():
        logger.info("check_coverage: Qdrant unavailable, using rule-based fallback")
        return _rule_based_coverage(state)

    # Build query from claim context
    query_parts = [f"yêu cầu bồi thường {claim_type}"]
    if disaster_type:
        query_parts.append(f"{disaster_type}")
    if province:
        query_parts.append(f"tại {province}")
    raw_text = (state.get("raw_text") or "")[:300]
    if raw_text:
        query_parts.append(raw_text)
    query = " ".join(query_parts)

    chunks = await vector_service.search(query, top_k=4, category=claim_type)
    if not chunks:
        # No relevant chunks — try without category filter
        chunks = await vector_service.search(query, top_k=4)
    if not chunks:
        logger.info("check_coverage: no chunks retrieved, falling back to rules")
        return _rule_based_coverage(state)

    context = vector_service.format_context(chunks, max_chars=3500)
    prompt = _COVERAGE_PROMPT.format(
        claim_type=claim_type,
        province=province or "không rõ",
        disaster_type=disaster_type or "không có",
        amount=amount,
        limit=limit,
        description=raw_text or "không có mô tả",
        context=context,
    )

    try:
        response = await _gemini_call(prompt, timeout=30.0)
        parsed = _parse_json(response)
    except Exception as e:
        logger.warning("check_coverage: Gemini reasoning failed: %s", e)
        return _rule_based_coverage(state)

    if not parsed or "is_covered" not in parsed:
        logger.warning("check_coverage: Gemini returned malformed JSON, falling back")
        return _rule_based_coverage(state)

    matched = parsed.get("matched_clause", "")
    reason = parsed.get("reason", "")
    if matched:
        reason = f"{reason}\n\nTrích điều khoản: \"{matched[:200]}...\""

    return {
        "is_covered": bool(parsed["is_covered"]),
        "coverage_limit": limit,
        "coverage_reason": reason or f"Đã kiểm tra theo điều khoản policy {claim_type}.",
    }


# ── Node 3: fraud_detection ────────────────────────────────────────────────────

async def fraud_detection(state: ClaimState) -> dict:
    province = state.get("province") or "Không rõ"
    in_high_risk = province in _HIGH_RISK or province in _FLOOD_SOUTH
    disaster_type = state.get("disaster_type") or "không có"
    desc_quality = state["parsed_data"].get("description_quality", "medium")
    amount = state["amount_claimed"]
    claim_type = state["claim_type"]
    limit = state.get("coverage_limit", 0.0)
    is_covered = state.get("is_covered", True)
    evidence_count = state.get("evidence_count", 0)
    required = state.get("required_evidence_count", 1)
    evidence_ok = evidence_count >= required

    prompt = f"""Bạn là chuyên viên thẩm định bảo hiểm GIÀU KINH NGHIỆM. Chấm điểm nguy cơ gian lận (0-100) cho yêu cầu bồi thường dưới đây.

NGUYÊN TẮC CHẤM (BẮT BUỘC — tránh nghi oan khách hàng chân chính):
- MẶC ĐỊNH: một yêu cầu HỢP LỆ, mô tả rõ ràng, số tiền hợp lý, có chứng từ → RỦI RO THẤP (0-25).
- CHỈ nâng điểm khi có DẤU HIỆU GIAN LẬN CỤ THỂ, ví dụ:
  • Mô tả mâu thuẫn / phi lý / chung chung như sao chép mẫu
  • Số tiền cao bất thường so với loại sự cố hoặc vượt xa mặt bằng
  • Thiếu ngày xảy ra sự cố, thiếu chứng từ bắt buộc
  • Thông tin không khớp (địa điểm/thời gian/loại hình)
- KHÔNG nâng điểm chỉ vì "chưa đủ thông tin để chắc chắn". Không có dấu hiệu rõ ràng → chấm THẤP.

THANG ĐIỂM:
- 0-25  = bình thường, không dấu hiệu → nên DUYỆT
- 26-55 = vài điểm cần lưu ý nhưng chưa nghiêm trọng
- 56-100 = có dấu hiệu gian lận rõ → cần thẩm định thủ công

BỐI CẢNH YÊU CẦU:
- Loại bảo hiểm: {claim_type}
- Số tiền yêu cầu: {amount:,.0f} VND (hạn mức gói: {limit:,.0f} VND)
- Đã qua kiểm tra điều khoản (is_covered): {is_covered}
- Tỉnh: {province} (vùng rủi ro cao thiên tai: {in_high_risk})
- Loại thiên tai: {disaster_type}
- Chất lượng mô tả: {desc_quality}
- Chứng từ đính kèm: {evidence_count}/{required} (đầy đủ: {evidence_ok})
- Tóm tắt sự cố: {state['raw_text'][:600]}
- Dữ liệu trích xuất: {json.dumps(state.get('parsed_data', {}), ensure_ascii=False)}

Trả về CHỈ JSON (không kèm giải thích ngoài JSON):
{{
  "fraud_score": <số nguyên 0-100>,
  "fraud_flags": [<mã ngắn snake_case tiếng Anh, vd: unreasonable_claim_amount, missing_event_date>],
  "reasoning": "lý do ngắn gọn"
}}"""

    fraud_score = 15  # default: low risk unless a concrete signal is found
    fraud_flags: list[str] = []

    try:
        raw = await _gemini_call(prompt)
        result = _parse_json(raw)
        fraud_score = max(0, min(100, int(result.get("fraud_score", 15))))
        fraud_flags = result.get("fraud_flags", []) or []
    except Exception as exc:
        logger.error("[%s] fraud_detection failed: %s", state["claim_id"], exc)
        # Calm heuristic fallback — only concrete signals raise the score
        if desc_quality == "low":
            fraud_score = 45
            fraud_flags.append("low_description_quality")
        if claim_type == "disaster" and not in_high_risk:
            fraud_score = max(fraud_score, 40)
            fraud_flags.append("province_mismatch")

    # Evidence-count signal (TASK-027): mild nudge, not decisive on its own
    if not evidence_ok:
        fraud_score = min(100, fraud_score + 10)
        fraud_flags.append("insufficient_evidence")

    return {"fraud_score": fraud_score, "fraud_flags": fraud_flags}


# ── Node 4: make_decision ──────────────────────────────────────────────────────

async def make_decision(state: ClaimState) -> dict:
    missing = state.get("missing_fields", [])
    is_covered = state.get("is_covered", False)
    coverage_reason = state.get("coverage_reason", "")
    fraud_score = state.get("fraud_score", 0)
    fraud_flags = state.get("fraud_flags", [])
    limit = state.get("coverage_limit", 0.0)
    amount = state["amount_claimed"]

    critical_missing = [f for f in missing if f in ("description", "province")]

    if critical_missing:
        return {
            "final_decision": "need_more_info",
            "final_reasoning": f"Hồ sơ thiếu thông tin bắt buộc: {', '.join(critical_missing)}. Vui lòng bổ sung.",
            "amount_approved": None,
        }

    if not is_covered:
        return {
            "final_decision": "reject",
            "final_reasoning": f"Yêu cầu không đủ điều kiện bồi thường. {coverage_reason}",
            "amount_approved": None,
        }

    # Only genuinely high fraud risk goes to manual review — a well-documented,
    # plausible claim should auto-approve (avoid false positives on real users).
    if fraud_score >= 70:
        flags_str = "; ".join(fraud_flags) if fraud_flags else "Phân tích AI phát hiện bất thường"
        return {
            "final_decision": "manual_review",
            "final_reasoning": (
                f"Điểm rủi ro gian lận cao ({fraud_score}/100). "
                f"Cần xét duyệt thủ công. Các cờ: {flags_str}."
            ),
            "amount_approved": None,
        }

    # Approve
    approved = min(amount, limit)
    return {
        "final_decision": "approve",
        "final_reasoning": (
            f"{coverage_reason} "
            f"Điểm rủi ro gian lận: {fraud_score}/100 (thấp). "
            f"Duyệt bồi thường {approved:,.0f} VND."
        ),
        "amount_approved": approved,
    }


# ── Build graph ────────────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    g = StateGraph(ClaimState)
    g.add_node("extract_data", extract_data)
    g.add_node("check_coverage", check_coverage)
    g.add_node("fraud_detection", fraud_detection)
    g.add_node("make_decision", make_decision)

    g.set_entry_point("extract_data")
    g.add_edge("extract_data", "check_coverage")
    g.add_edge("check_coverage", "fraud_detection")
    g.add_edge("fraud_detection", "make_decision")
    g.add_edge("make_decision", END)

    return g.compile()


claim_graph = _build_graph()


async def run_claim_agent(
    claim_id: str,
    user_id: str,
    claim_type: str,
    amount_claimed: float,
    raw_text: str,
    province: str | None = None,
    disaster_type: str | None = None,
    coverage_limit: float = 0,
    evidence_count: int = 0,
    required_evidence_count: int = 1,
    progress_cb=None,
) -> ClaimState:
    """Run the 4-node LangGraph and return final state. Optional progress_cb(step, data)."""

    initial: ClaimState = {
        "claim_id": claim_id,
        "user_id": user_id,
        "raw_text": raw_text,
        "claim_type": claim_type,
        "province": province,
        "disaster_type": disaster_type,
        "amount_claimed": amount_claimed,
        "parsed_data": {},
        "missing_fields": [],
        "is_covered": True,   # policy already validated before graph runs
        "coverage_limit": float(coverage_limit),
        "coverage_reason": "",
        "evidence_count": evidence_count,
        "required_evidence_count": required_evidence_count,
        "fraud_score": 0,
        "fraud_flags": [],
        "final_decision": "",
        "final_reasoning": "",
        "amount_approved": None,
    }

    if progress_cb:
        await progress_cb("processing", {"step": "extract_data"})

    final_state = await claim_graph.ainvoke(initial)

    if progress_cb:
        await progress_cb("done", {
            "decision": final_state["final_decision"],
            "fraud_score": final_state["fraud_score"],
            "amount_approved": final_state.get("amount_approved"),
        })

    return final_state
