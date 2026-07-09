# TASKS.md — ClaimFlow

> Kế hoạch task chi tiết 4 tuần. Mỗi task có description rõ ràng, output mong đợi, ghi chú kỹ thuật.

**Status:** `[ ]` Chưa | `[~]` Đang | `[x]` Xong
**Labels:** `[BE]` Backend · `[FE]` Frontend · `[AI]` AI/LangGraph · `[INFRA]` DevOps · `[SETUP]` Config

---

## Tuần 1 — Foundation: Setup & Core Backend

**Mục tiêu:** Auth chạy được, upload file lên MinIO, MongoDB collections khởi tạo đúng, Geo Risk data seeded.

---

### TASK-001 `[SETUP]` Init GitHub repo ClaimFlow ✅

**Mô tả:** Tạo repo `claimflow`, init folder structure, copy toàn bộ `.md` docs vào root, tạo `.gitignore` và `.env.example`, commit đầu tiên.

**Output:**
- Repo GitHub tên `claimflow`
- Folder: `backend/` `frontend/` `sample_data/` `.github/workflows/`
- `.env.example` đầy đủ keys

```bash
mkdir claimflow && cd claimflow
mkdir -p backend/app frontend sample_data/policies .github/workflows
git init && git add . && git commit -m "chore: init claimflow project"
```

---

### TASK-002 `[INFRA]` Docker Compose — 5 services ✅

**Mô tả:** Viết `docker-compose.yml` khởi động MongoDB, Redis, Qdrant, MinIO, và thêm mongo-express để xem data trong browser.

**Output:**
- `docker compose up -d` chạy được 5 services
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`
- Qdrant dashboard: `http://localhost:6333/dashboard`
- MinIO console: `http://localhost:9001`
- Mongo Express: `http://localhost:8081`

```yaml
services:
  mongodb:
    image: mongo:7.0
    ports: ["27017:27017"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
      MONGO_INITDB_DATABASE: claimflow_db
    volumes: [mongodb_data:/data/db]

  mongo-express:
    image: mongo-express
    ports: ["8081:8081"]
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: admin
      ME_CONFIG_MONGODB_ADMINPASSWORD: admin
      ME_CONFIG_MONGODB_URL: mongodb://admin:admin@mongodb:27017/

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333"]
    volumes: [qdrant_data:/qdrant/storage]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes: [minio_data:/data]
```

---

### TASK-003 `[BE]` FastAPI skeleton + health check ✅

**Mô tả:** Init FastAPI app với CORS, routers structure, và health check endpoint. Server chạy tại `localhost:8000`. Setup ngay 3 middleware quan trọng: Request ID, CSRF Protection, Rate Limiting.

**Output:**
- `GET /health` → `{"status":"ok","db":"connected","version":"1.0.0"}`
- Swagger UI tại `localhost:8000/docs`
- CORS cho `localhost:3000` và `localhost:5173`
- Mọi response có header `X-Request-ID`
- POST/PUT/DELETE/PATCH bị block nếu thiếu CSRF token (trừ /auth/*)
- Rate limit: 10/min upload, 30/min chatbot, 5/min login

**requirements.txt:**
```txt
fastapi==0.111.0
uvicorn[standard]==0.30.1
motor==3.4.0
beanie==1.26.0
pymongo==4.7.2
redis==5.0.4
celery==5.4.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
boto3==1.34.110
google-generativeai==0.7.2
langchain==0.2.3
langgraph==0.1.1
langchain-google-genai==1.0.6
langchain-qdrant==0.1.1
qdrant-client==1.9.1
pymupdf==1.24.5
python-dotenv==1.0.1
pydantic-settings==2.3.0
httpx==0.27.0
slowapi==0.1.9
pytest==8.2.2
pytest-asyncio==0.23.7
```

**3 Middleware cần setup ngay từ đầu:**
```python
# app/core/middleware.py
import uuid, re
from fastapi import Request
from fastapi.responses import JSONResponse

# 1. Request ID
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = str(uuid.uuid4())[:8]
    request.state.request_id = rid
    logger.info("[%s] %s %s", rid, request.method, request.url.path)
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response

# 2. CSRF
@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if request.method in ["POST","PUT","DELETE","PATCH"]:
        if not request.url.path.startswith("/auth"):
            csrf_h = request.headers.get("X-CSRF-Token")
            csrf_c = request.cookies.get("csrf_token")
            if not csrf_h or csrf_h != csrf_c:
                return JSONResponse({"detail": "CSRF validation failed"}, 403)
    return await call_next(request)
```

---

### TASK-004 `[BE]` MongoDB models + Beanie init ✅

**Mô tả:** Tạo Beanie Document models cho 6 collections. Init Beanie khi FastAPI startup. Seed province risk data cho 64 tỉnh.

**Output:**
- 6 collections khởi tạo: `users`, `documents`, `claims`, `geo_risks`, `chat_sessions`, `policies`
- Indexes đúng trên mỗi collection
- `python scripts/seed.py` tạo được: 1 admin, 1 reviewer, 3 users mẫu, và 64 province risk records
- `mongosh claimflow_db` → `db.geo_risks.count()` = 64

**Province data structure:**
```python
# scripts/seed_provinces.py
HIGH_RISK_PROVINCES = [
    "Quảng Bình", "Hà Tĩnh", "Nghệ An", "Quảng Nam",
    "Thừa Thiên Huế", "Quảng Ngãi", "Bình Định"
]
# Seed risk score dựa trên region + high_risk flag
```

---

### TASK-005 `[BE]` Auth: JWT httpOnly Cookie ✅

**Mô tả:** Register, login, logout với JWT lưu trong httpOnly cookie. Password validation: min 8 ký tự, chữ hoa + thường + số. bcrypt cost=12. JWT expire 7 ngày.

**Output:**
- `POST /auth/register` → tạo user, set cookie
- `POST /auth/login` → validate, set httpOnly cookie
- `POST /auth/logout` → clear cookie
- `GET /auth/me` → trả user info từ cookie token
- Password `"weak"` → 400 error với message rõ ràng
- Cookie: `httponly=True, secure=False (dev), samesite="lax"`

---

### TASK-006 `[BE]` File upload → MinIO ✅

**Mô tả:** Endpoint upload file PDF/JPG/PNG lên MinIO. Validate type và size (max 20MB). Trả về `document_id` và presigned URL.

**Output:**
- `POST /documents/upload` với `multipart/form-data` → 201
- File trong MinIO bucket `claimflow-documents`
- Reject file > 20MB → 413
- Reject file type sai → 415
- Presigned download URL (1 giờ)

---

### TASK-007 `[FE]` Next.js setup + Leaflet-safe config + Security ✅

**Mô tả:** Init Next.js 14 + TypeScript + Tailwind + shadcn/ui. Cấu hình Leaflet không bị SSR error. Setup axios với cookie auth + CSRF token interceptor. Tạo ErrorBoundary component và Loading Skeleton template.

**Output:**
- `npm run dev` tại `localhost:3000`
- Layout: sidebar nav (Dashboard, Upload Docs, Risk Map, Claims, Analytics)
- Leaflet dynamic import — không SSR crash
- Axios attach CSRF token tự động cho mọi mutating request
- `ErrorBoundary` component sẵn dùng
- `OCRProcessing` skeleton component sẵn dùng

---

### TASK-007b `[FE]` i18n — Bilingual UI (EN / VI) ✅

**Mô tả:** Tích hợp `next-intl` vào Next.js 14 App Router. Toàn bộ chuỗi UI có bản dịch EN + VI. Toggle ngôn ngữ không reload trang. URL-based locale.

**Output:**
- `npm install next-intl`
- URL `/vi/dashboard` hiển thị tiếng Việt, `/en/dashboard` hiển thị tiếng Anh
- `middleware.ts` tự detect và redirect về locale mặc định `vi`
- `LanguageSwitcher` component trong header — click toggle EN ↔ VI
- `messages/vi.json` + `messages/en.json` — đầy đủ keys cho tất cả trang
- Server Components dùng `getTranslations()`, Client Components dùng `useTranslations()`
- KHÔNG hardcode bất kỳ chuỗi UI nào — mọi text đều qua translation key

**Cấu trúc messages:**
```json
{
  "common":    { "loading", "error", "save", "cancel", "confirm", "back" },
  "nav":       { "dashboard", "documents", "riskMap", "claims", "analytics", "chatbot" },
  "auth":      { "login", "register", "logout", "email", "password", "fullName", "province" },
  "documents": { "upload", "ocr", "merge", "export", "confidence", "needsReview" },
  "claims":    { "submit", "status": { "pending", "approved", "rejected", "manualReview" } },
  "geo":       { "riskMap", "riskScore", "highRisk", "recommendations", "disasterTypes" },
  "chatbot":   { "placeholder", "typing", "clearSession", "suggestedActions" },
  "admin":     { "users", "policies", "auditLogs", "systemHealth", "analytics" },
  "errors":    { "unauthorized", "forbidden", "notFound", "serverError", "rateLimited" }
}
```

**Key files:**
```typescript
// frontend/src/i18n.ts
import { getRequestConfig } from 'next-intl/server';
export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
}));

// frontend/src/middleware.ts
import createMiddleware from 'next-intl/middleware';
export default createMiddleware({
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
});
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };

// Usage in Server Component
const t = await getTranslations('nav');
<span>{t('dashboard')}</span>

// Usage in Client Component
'use client';
const t = useTranslations('auth');
<button>{t('login')}</button>
```

**LanguageSwitcher:**
```typescript
// components/layout/LanguageSwitcher.tsx
'use client';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggle = () => {
    const next = locale === 'vi' ? 'en' : 'vi';
    router.replace(pathname.replace(`/${locale}`, `/${next}`));
  };

  return (
    <button onClick={toggle} className="text-sm font-medium px-2 py-1 rounded border">
      {locale === 'vi' ? '🇻🇳 VI' : '🇺🇸 EN'}
    </button>
  );
}
```

```typescript
// Leaflet SSR fix
const LeafletMap = dynamic(() => import('@/components/risk-map/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 animate-pulse rounded-lg" />
});

// Axios CSRF interceptor
function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}
api.interceptors.request.use((config) => {
  if (['post','put','delete','patch'].includes(config.method ?? '')) {
    config.headers['X-CSRF-Token'] = getCsrfToken();
  }
  return config;
});
```

---

### TASK-008 `[FE]` Login/Register UI ✅

**Mô tả:** Trang login và register hoàn chỉnh. Form validation client-side. Kết nối API thật. Sau login redirect về dashboard.

**Output:**
- UI shadcn/ui form đẹp
- Validation: email format, password rules (8 ký tự, hoa + thường + số)
- Loading state khi gọi API
- Error toast khi thất bại
- Field `province` trong register form (dropdown 64 tỉnh)

---

## Tuần 2 — AI Core: OCR, Merge, Geo Risk

**Mục tiêu:** Upload CCCD → AI extract thông tin → Merge 2 docs → Geo Risk analysis hoạt động.

---

### TASK-009 `[AI]` Gemini Vision OCR pipeline + Cache + Confidence ✅

**Mô tả:** Service dùng Gemini Vision để OCR tài liệu và extract structured data. Hỗ trợ CCCD, bằng lái, hộ chiếu, hợp đồng bảo hiểm. Tích hợp: (1) MD5 cache tránh gọi API lại, (2) Confidence threshold 0.7 với auto-retry, (3) Flag manual review khi confidence thấp.

**Output:**
- `OCRService.get_or_extract(file_bytes, doc_type)` → structured JSON + confidence
- Cùng file (MD5 hash giống nhau) → trả cache, không gọi Gemini
- Confidence < 0.7 → retry với enhanced prompt
- Confidence vẫn < 0.7 sau retry → `needs_manual_review=True`, list `low_confidence_fields`
- Field `ocr_confidence` lưu vào MongoDB Document

**Implementation:**
```python
import hashlib

CONFIDENCE_THRESHOLD = 0.7

class OCRService:
    async def get_or_extract(self, file_bytes: bytes, doc_type: str) -> dict:
        file_hash = hashlib.md5(file_bytes).hexdigest()
        
        # Cache check
        cached = await Document.find_one(Document.file_hash == file_hash)
        if cached and cached.structured_data and cached.processing_status == "done":
            return {"data": cached.structured_data, "cached": True,
                    "confidence": cached.ocr_confidence}
        
        return await self._extract_with_retry(file_bytes, doc_type)

    async def _extract_with_retry(self, file_bytes: bytes, doc_type: str) -> dict:
        result = await self._call_gemini(file_bytes, doc_type, enhanced=False)
        
        if result.get("confidence", 0) < CONFIDENCE_THRESHOLD:
            logger.warning("Low confidence %.2f, retrying", result["confidence"])
            result = await self._call_gemini(file_bytes, doc_type, enhanced=True)
        
        result["needs_manual_review"] = result.get("confidence", 0) < CONFIDENCE_THRESHOLD
        result["low_confidence_fields"] = [
            k for k, v in result.get("fields", {}).items()
            if isinstance(v, dict) and v.get("confidence", 1) < CONFIDENCE_THRESHOLD
        ]
        return result
```

**Test:**
```python
# tests/test_ocr.py
import google.generativeai as genai
import os
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-1.5-flash")
response = model.generate_content([image_part, CCCD_PROMPT])
print(response.text)
```

---

### TASK-010 `[AI]` Document Merge Logic ✅

**Mô tả:** Service merge nhiều document đã OCR thành 1 hồ sơ duy nhất. Loại bỏ field trùng lặp. Phát hiện conflict khi cùng field có 2 giá trị khác nhau.

**Output:**
- `MergerService.merge(doc_ids)` → merged_data + conflicts
- `POST /documents/merge` endpoint hoạt động
- Conflicts được flag rõ ràng để user review
- Merged document lưu vào MongoDB với `is_merged=True`

**Algorithm:**
```python
def merge_documents(docs: list[dict]) -> tuple[dict, dict]:
    merged = {}
    conflicts = {}
    for doc in docs:
        for key, value in doc.get("structured_data", {}).items():
            if key not in merged or merged[key] is None:
                merged[key] = value
            elif merged[key] != value and value is not None:
                conflicts[key] = {"values": [merged[key], value], "source_docs": [...]}
    return merged, conflicts
```

---

### TASK-011 `[BE]` Geo Risk Engine ✅

**Mô tả:** Service tính risk score cho từng tỉnh, nhận diện vùng miền từ địa chỉ, generate insurance recommendations. Đã fix `detect_province_from_text()` để nhận diện tên tỉnh không có dấu và alias (HCM, TP HCM, Saigon, HN).

**Output:**
- `GET /geo-risk/province/{name}` → full risk data (hỗ trợ tên không dấu)
- `GET /geo-risk/map` → all provinces data cho Leaflet choropleth
- `POST /geo-risk/recommend` nhận địa chỉ → trả recommendations
- Province detection từ free-text address ("45 Tran Hung Dao, Quang Binh" → "Quảng Bình")
- 64 tỉnh đã có risk data trong DB
- `_normalize_vn()`: NFD decomposition → strip diacritics → đ→d, để match tên tỉnh không dấu
- Aliases: "HCM", "TP HCM", "Saigon", "Sài Gòn" → "Hồ Chí Minh"; "HN" → "Hà Nội"

**Risk scoring logic:**
```python
def calculate_risk_score(province: str) -> int:
    base_scores = {
        "central": 70,   # Miền Trung rủi ro cao nhất
        "north": 45,
        "south": 40,
    }
    high_risk_bonus = 20 if province in HIGH_RISK_PROVINCES else 0
    return min(100, base_scores[region] + high_risk_bonus)
```

---

### TASK-012 `[FE]` Document Upload UI + OCR result display + Skeleton ✅

**Mô tả:** Trang upload documents đầy đủ. Drag & drop, preview file, dropdown chọn doc_type, progress bar. Sau OCR: hiển thị extracted data dạng form editable. Tích hợp OCRProcessing skeleton (3-step indicator) và ErrorBoundary bọc toàn bộ component.

**Output:**
- Drag & drop area với hover effect
- Preview: ảnh → thumbnail, PDF → icon + tên + size
- OCRProcessing step indicator: Nhận tài liệu → OCR → AI phân tích
- Field extraction hiển thị trong bảng editable
- Visual region highlighting (overlay bbox trên ảnh gốc)
- Badge "Cần xác nhận" cho low_confidence_fields
- Nút "Export JSON" và "Export Markdown"
- ErrorBoundary bọc toàn bộ OCR display component
- Nút "Đăng ký bảo hiểm" hiển thị sau khi OCR done → mở InsuranceRegistrationModal

---

### TASK-013 `[FE]` Risk Map với Leaflet ✅

**Mô tả:** Bản đồ tương tác Việt Nam hiển thị risk score theo tỉnh bằng choropleth (màu sắc theo mức độ rủi ro). Click vào tỉnh → hiển thị risk detail panel. GeoJSON dùng file static đã convert UTM→WGS84.

**Output:**
- Bản đồ Leaflet load đúng (SSR safe — dynamic import ssr:false)
- Choropleth: xanh = thấp, vàng = trung, đỏ = cao
- Click province → side panel: risk score, disaster types, recommendations
- Legend màu sắc rõ ràng
- Status chips trên bản đồ
- Race condition đã được fix (chờ GeoJSON load xong mới gắn risk data)

**GeoJSON:**
```
frontend/public/vietnam-provinces.geojson   ← file static 72KB đã convert
backend/scripts/build_vn_geojson.py         ← script convert UTM48N → WGS84 (pyproj)
```

---

### TASK-014 `[AI]` Chatbot Gemini Pro + Privacy Guard + Injection Defense ✅

**Mô tả:** Implement chatbot tư vấn bảo hiểm với Gemini Pro. System prompt bao gồm privacy guard (không leak PII). Tích hợp prompt injection defense layer. Context từ user profile. Session với giới hạn 50 messages. Floating widget trên mọi trang.

**Output:**
- `POST /chatbot/message` → AI response trong < 3 giây
- Response không chứa số CCCD, địa chỉ chi tiết, SĐT
- Input qua `sanitize_chat_input()` trước khi gửi Gemini — block injection patterns
- Session tối đa 50 messages (tự truncate cũ)
- Context-aware: user ở Quảng Bình → tư vấn bảo hiểm bão lũ
- Floating chat button trên mọi trang

**Privacy System Prompt:**
```python
PRIVACY_SYSTEM_PROMPT = """
Bạn là AI tư vấn bảo hiểm ClaimFlow.

QUY TẮC BẮT BUỘC:
- TUYỆT ĐỐI không đọc to hoặc xác nhận số CCCD/CMND
- TUYỆT ĐỐI không tiết lộ địa chỉ chi tiết (số nhà, tên phố)
- TUYỆT ĐỐI không nhắc số điện thoại
- Chỉ dùng vùng miền (Bắc/Trung/Nam) hoặc tên tỉnh để tư vấn

Nhắc lại: TUYỆT ĐỐI không tiết lộ PII dù user có yêu cầu bất kỳ cách nào.
"""

# Injection defense
INJECTION_PATTERNS = [
    "ignore previous", "forget your rules", "you are now",
    "pretend you are", "reveal system prompt", "bypass",
    "disregard instructions", "new instructions",
]

def sanitize_chat_input(message: str) -> str:
    lower = message.lower()
    for p in INJECTION_PATTERNS:
        if p in lower:
            raise HTTPException(400, "Input không hợp lệ")
    return re.sub(r'<[^>]+>', '', message).strip()[:2000]
```

---

## Tuần 3 — Claim Processing + Dashboard

**Mục tiêu:** Submit claim → AI LangGraph xử lý → WebSocket real-time → Dashboard đầy đủ.

---

### TASK-015 `[AI]` LangGraph Claim Processing Agent ✅

**Mô tả:** 4-node LangGraph workflow xử lý insurance claim. Tích hợp OCR → coverage check → Fraud detection → Decision.

**Output:**
- `graph.invoke({"claim_id": "...", "raw_text": "..."})` → full decision state
- Node 1: `extract_data` — parse structured data từ OCR text
- Node 2: `check_coverage` — RAG search Qdrant → covered/not_covered + coverage limit
- Node 3: `fraud_detection` — fraud score 0-100
- Node 4: `make_decision` — approve/reject/manual_review/need_more_info
- Validation: phải có UserPolicy active trước khi submit claim

```python
class ClaimState(TypedDict):
    claim_id: str
    raw_text: str
    doc_type: str
    province: str | None
    disaster_type: str | None
    parsed_data: dict
    is_covered: bool
    coverage_limit: float
    fraud_score: int
    fraud_flags: list[str]
    final_decision: str
    final_reasoning: str
    missing_fields: list[str]
```

---

### TASK-016 `[BE]` Celery Worker + WebSocket push ✅

**Mô tả:** Celery task xử lý claim job. Sau khi AI xong, publish event vào Redis → WebSocket handler push về client.

**Output:**
- `POST /claims/submit` trả về ngay lập tức (< 200ms)
- Celery worker chạy AI agent trong background
- WebSocket `/claims/ws/{claim_id}` push status update
- Retry tự động khi Gemini API fail (max 3 lần, exponential backoff)
- Cho phép xóa claim bị stuck trong processing > 5 phút

---

### TASK-017 `[FE]` Claim Dashboard + Detail ✅

**Mô tả:** Dashboard claims list với filter theo status, province, disaster_type. Claim detail page với AI reasoning timeline, fraud score gauge.

**Output:**
- Table claims với filter bar
- Status badge màu (pending=vàng, approved=xanh, rejected=đỏ, manual_review=cam)
- Detail page: AI reasoning đẹp, fraud score progress bar
- Real-time status update qua WebSocket (không cần refresh)

---

### TASK-018 `[FE]` Document Merge UI ✅

**Mô tả:** UI để chọn nhiều documents đã upload và merge lại. Hiển thị merged result với conflict resolution panel.

**Output:**
- Checkbox select nhiều documents
- Preview merged data side-by-side
- Conflict panel: hiển thị 2 giá trị khác nhau, cho user chọn đúng
- "Apply merge" → tạo merged document

---

### TASK-019 `[BE]` Qdrant + RAG Pipeline ✅

**Mô tả:** Setup Qdrant, ingest policy documents vào vector store. RAG service search relevant chunks.

**Output thực tế:**
- Collection `insurance_policies` với **3072-dim** vectors (dùng `gemini-embedding-001` — `text-embedding-004` đã deprecated 2026)
- Script `scripts/ingest_policies.py` ingest 6 policy files vào Qdrant (18 chunks tổng)
- `VectorService.search(query, top_k, category)` → relevant chunks, similarity score 0.7-0.79 cho queries phù hợp
- Policy files đã sinh đầy đủ trong `sample_data/policies/`:
  - `health_policy_2024.txt` (Sức khỏe)
  - `disaster_policy_2024.txt` (Thiên tai)
  - `life_policy_2024.txt` (Nhân thọ)
  - `property_policy_2024.txt` (Tài sản)
  - `vehicle_policy_2024.txt` (Xe cộ)
  - `income_policy_2024.txt` (Thu nhập & An sinh)
- Mỗi file ~500-800 từ với section: Phạm vi · Quyền lợi 3 gói · Loại trừ · Quy trình bồi thường

**Integration:**
- **`agent.check_coverage`**: dùng `vector_service.search(category=claim_type)` → Gemini Pro reasoning over retrieved chunks → return `is_covered + reason + matched_clause`. Graceful fallback rule-based nếu Qdrant down hoặc chunks không liên quan.
- **`chatbot.chat`**: với mỗi user message (skip greeting), gọi `vector_service.search(top_k=3, min_score=0.35)` → inject policy chunks vào system prompt với note "không tiết lộ rằng đây là retrieved context".
- **Admin upload**: Celery task `ingest_policy_to_qdrant` tự động chunk + embed + upsert khi admin POST policy mới.

**Seed:** `seed.py` thêm `seed_policies()` đọc `.txt` từ `sample_data/policies/` → insert vào MongoDB `policies` collection. Idempotent (skip nếu title đã có).

**Run pipeline:**
```bash
python scripts/seed.py             # → 6 policy docs vào MongoDB
python scripts/ingest_policies.py  # → 18 chunks vào Qdrant
```

---

### TASK-020 `[FE]` Chatbot UI ✅ (yêu cầu thay đổi: full-page thay vì floating widget)

**Mô tả:** Floating chat button ở góc phải màn hình, expand thành chat panel. Persist session khi navigate giữa các trang.

**Output:**
- Floating button không che content chính
- Chat panel slide-in animation
- Message bubbles (user vs AI phân biệt màu)
- Typing indicator khi AI đang respond
- Session persist qua localStorage (session_id)

---

## Tuần 4 — Polish + Analytics + Demo Prep

**Mục tiêu:** Analytics hoàn chỉnh, UI polish, demo script sẵn sàng.

> TASK-025, TASK-026 là **optional** — chỉ làm nếu còn thời gian.

---

### TASK-021 `[FE]` Analytics Dashboard ✅

**Mô tả:** Trang analytics với charts: claims theo ngày, breakdown theo region, disaster types, approval rate.

**Output:**
- 4 metric cards: total claims, approval rate, avg processing time, total approved amount
- Line chart: claims theo ngày 30 ngày gần nhất
- Pie chart: breakdown theo region (Bắc/Trung/Nam)
- Bar chart: disaster types phổ biến nhất

---

### TASK-022 `[BE]` Human Review Interface ✅

**Mô tả:** API cho reviewer override AI decision. Email notification sau khi review.

**Output:**
- `PATCH /claims/{id}/review` — role `reviewer`/`admin` qua `require_reviewer` dep
- Pydantic `ClaimReviewRequest` (decision, note min=3, amount_approved ≥ 0)
- Validate: claim đã `approved`/`rejected` → 409; `amount_approved > amount_claimed` → 422
- Audit log `claim_override` với `previous_status`, `ai_decision`, `is_override` flag + IP
- WebSocket push event `"reviewed"` để client cập nhật real-time không refresh
- Email gửi cho user qua **Resend API** (`backend/app/services/email.py`)
  - HTML bilingual (VI) với accent color theo decision (xanh/đỏ)
  - Fire-and-forget qua `BackgroundTasks` — không chặn response
  - No-op gracefully nếu `RESEND_API_KEY` rỗng (dev/test mode)
  - Dùng httpx.AsyncClient → POST `https://api.resend.com/emails` (không cần SDK)
- Reviewer dashboard list claims: đã có từ TASK-020e (`/reviewer/queue`)

---

### TASK-023 `[INFRA]` GitHub Actions CI

**Mô tả:** CI pipeline chạy khi push: lint + test backend, type-check frontend.

```yaml
name: CI
on: [push, pull_request]
jobs:
  backend:
    services:
      mongodb: { image: mongo:7.0, ports: ["27017:27017"] }
      redis: { image: redis:7-alpine, ports: ["6379:6379"] }
    steps:
      - run: pip install -r requirements.txt
      - run: flake8 app/
      - run: pytest tests/ -v
  frontend:
    steps:
      - run: npm ci && npm run lint && npm run type-check
```

---

### TASK-024 `[BE]` Unit tests — AI nodes + Security + OCR cache

**Mô tả:** Unit tests cho OCR service (với cache và confidence), merge logic, LangGraph nodes, CSRF middleware, rate limiting, và injection defense. Mock Gemini API — không dùng quota thật.

**Output:**
- `pytest tests/ -v` pass tất cả
- Coverage ≥ 70% cho `services/ai/` và `services/geo/`
- Test OCR cache: cùng hash → không gọi Gemini lần 2
- Test confidence retry: confidence < 0.7 → trigger retry
- Test CSRF: request thiếu token → 403
- Test rate limit: >5 login/phút → 429
- Test injection defense: "ignore previous instructions" → 400
- Mock Gemini API với `unittest.mock.patch`

---

### TASK-025 `[SETUP]` ⚡ OPTIONAL — README + Demo Script

**Mô tả:** README hoàn chỉnh, screenshot/GIF demo, chuẩn bị demo 5 phút cho mentor.

**Demo script:**
```
1. Bài toán (1 phút)
   → Người dân vùng thiên tai không biết cần bảo hiểm gì
   → Xử lý giấy tờ bảo hiểm thủ công chậm

2. Live demo localhost:3000 (3 phút)
   → Nhập địa chỉ Quảng Bình → xem risk map + recommendations
   → Upload CCCD + hợp đồng bảo hiểm → AI extract → Đăng ký bảo hiểm
   → Merge 2 documents → Submit disaster claim → WebSocket real-time
   → Chatbot hỏi "Tôi ở Quảng Bình cần mua gì?"

3. Tech Q&A (1 phút)
   → Tại sao Gemini Vision thay vì Tesseract?
   → Tại sao Merge logic loại bỏ field trùng?
   → Tại sao httpOnly cookie thay vì localStorage?
```

---

### TASK-026 `[INFRA]` ⚡ OPTIONAL — Deploy Railway + Vercel

**Mô tả:** Deploy backend lên Railway, frontend lên Vercel. MongoDB Atlas free tier.

---

## Tuần 3 bổ sung — Admin & Reviewer Dashboard

> Thêm vào sau TASK-020, trước TASK-021.

---

### TASK-020b `[BE]` Admin API — User management + Audit logs ✅

**Mô tả:** Implement toàn bộ `/admin/*` endpoints. CRUD user, đổi role, xem audit logs. Mọi action admin đều ghi vào `audit_logs` collection. Middleware `require_admin` dependency.

**Output:**
- `GET /admin/users` — list all users với filter role, is_active, pagination
- `PATCH /admin/users/{id}/role` — đổi role (ghi audit log)
- `PATCH /admin/users/{id}/status` — activate/deactivate user
- `GET /admin/audit-logs` — history mọi action quan trọng
- `GET /admin/system/health` — ping MongoDB, Redis, Qdrant, Celery
- `GET /admin/analytics/full` — full system analytics không filter theo user
- Mọi action ghi `AuditLog` với actor, target, details, timestamp
- `require_admin` dependency — 403 nếu không phải admin

**Ghi audit log mỗi action:**
```python
async def log_action(actor: User, action: str, target_type: str, target_id: str, details: dict):
    await AuditLog(
        actor_id=str(actor.id),
        actor_email=actor.email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    ).insert()
```

---

### TASK-020c `[BE]` Admin Policy Management ✅

**Mô tả:** Admin upload policy documents mới → tự động ingest vào Qdrant vector store. Deactivate policy → xóa khỏi vector store. Xem danh sách policies với chunk count.

**Output:**
- `GET /admin/policies` — list all policies + chunk count + last ingested
- `POST /admin/policies` — upload file + ingest vào Qdrant (Celery background job)
- `DELETE /admin/policies/{id}` — deactivate + xóa vectors khỏi Qdrant
- Sau khi upload: `celery task → chunk → embed → upsert Qdrant`
- Ghi audit log cho upload và delete

---

### TASK-020d `[FE]` Admin Dashboard UI ✅

**Mô tả:** Trang Admin dashboard đầy đủ — chỉ hiển thị khi role = admin. Bao gồm: User management table, System health panel, Full analytics, Policy management, Audit log viewer.

**Output:**
- Route `/admin` — redirect về `/dashboard` nếu không phải admin
- **Tab Users:** table tất cả users, filter theo role/status, nút đổi role (dropdown), nút deactivate
- **Tab Analytics:** full system metrics — total users, claims, fraud rate, top provinces rủi ro, reviewer performance table
- **Tab Policies:** list policy documents, nút upload mới, nút deactivate, badge chunk count
- **Tab Audit Logs:** timeline mọi action, filter theo action type và date range
- **Tab System Health:** card từng service (MongoDB, Redis, Qdrant, Celery) với status badge + latency

**UI Layout:**
```
/admin
  ├── Sidebar tabs: Users | Analytics | Policies | Audit Logs | System Health
  ├── Header: "Admin Dashboard" + current admin name
  └── Content area theo tab active
```

---

### TASK-020e `[FE]` Reviewer Dashboard UI ✅

**Mô tả:** Trang Reviewer dashboard — chỉ hiển thị khi role = reviewer hoặc admin. Queue claims cần review, personal stats, detail view với AI reasoning.

**Output:**
- Route `/reviewer` — redirect nếu không đủ quyền
- **Queue panel:** danh sách claims `manual_review`, sort oldest first, badge waiting time
- **Stats panel:** claims reviewed today, total, avg review time, override rate
- **Detail modal:** click vào claim → xem AI reasoning đầy đủ, fraud score gauge, fraud flags list
- Nút "Approve" và "Reject" với confirm dialog + required note field
- Badge màu fraud score: xanh (<30), vàng (30-70), đỏ (>70)

---

### TASK-020f `[BE]` Reviewer Stats API ✅

**Mô tả:** Endpoint trả stats cá nhân của reviewer đang login. Dùng cho Reviewer dashboard.

**Output:**
- `GET /reviewer/queue` — claims cần review (manual_review), có filter và sort
- `GET /reviewer/stats` — claims reviewed today/total, avg time, override rate
- Tính `avg_review_time` từ `reviewed_at - created_at` của các claims đã review

---

## Phase A — Business Logic + OCR Enhancement (PROPOSED)

> Cuộc thảo luận tuần 5: form đăng ký bảo hiểm & yêu cầu bồi thường hiện tại quá mỏng, OCR chưa có bbox, không multi-doc, không auto-fill. Quyết định **làm Phase A trước TASK-023/024/025** vì:
> - Demo trước mentor cần nghiệp vụ thật, không cần CI badge
> - Viết test (024) cho schema chưa ổn = throwaway work
> - Forms hiện tại không phản ánh quy trình bảo hiểm thực tế
>
> **Thứ tự đề xuất:** foundational (035, 036) → OCR core (031→033) → forms (027, 028) → reviewer/polish (029, 030, 034) → mới sang Phase B (023, 024, 025).
>
> **Tham chiếu quyết định:** xem Decisions Log mục 2026-06-01.

---

### TASK-035 `[AI]` Refactor model tier strategy `[FOUNDATION]` ✅

**Mô tả:** Hiện code hard-code `gemini-3.1-flash-lite` ở 3 chỗ (`ocr.py:122`, `agent.py:75`, `chatbot.py:104`). Mọi task chạy cùng tier → flash-lite quá yếu cho multi-doc / handwriting / claim agent. Tách thành **3 alias config** để switch tier dễ dàng cho từng task.

**Output:**
- `Settings` thêm: `GEMINI_MODEL_LITE`, `GEMINI_MODEL_DEFAULT`, `GEMINI_MODEL_PRO`
- Audit + replace hard-code ở 3 file → đọc từ settings
- Mapping tier:
  - OCR CCCD đơn lẻ → LITE
  - OCR handwriting / multi-doc / bbox → PRO
  - Claim agent (LangGraph) → DEFAULT (cần reasoning ổn định)
  - Chatbot Q&A → LITE
- Verify spec `gemini-3.1-flash-lite` (context window, multi-image limit, pricing) — chạy benchmark nhỏ
- Update `.env.example` với 3 var mới

**Effort:** 1 ngày (incl. verification)
**Blocked by:** —
**Blocks:** TASK-031, TASK-032, TASK-034 (cần tier chính xác)

**Done — implementation:**
- `app/core/config.py:49-51` thêm 3 settings (docstring chỉ rõ mapping tier)
- `app/services/ai/ocr.py:121` `_model` → `GEMINI_MODEL_LITE`; thêm `_model_heavy` → `GEMINI_MODEL_PRO` (sẵn cho TASK-031/032/034 dùng cho handwriting/multi-doc/bbox)
- `app/services/ai/agent.py:75` claim agent → `GEMINI_MODEL_DEFAULT`
- `app/services/ai/chatbot.py:104` chatbot → `GEMINI_MODEL_LITE`
- `.env.example` thêm 3 var với comment + upgrade hint
- **Zero behavior change:** cả 3 default = `gemini-3.1-flash-lite` → bằng đúng hành vi hiện tại. Khi user verify được `gemini-3.1-flash` / `gemini-3.1-pro` available, chỉ cần đổi env var, không đụng code.
- **Pending (user verification — không block code refactor):** benchmark thực tế lite vs pro cho handwriting Vietnamese — đợi có API quota để chạy

---

### TASK-036 `[FE]` Policies page — tách read/review khỏi purchase flow ✅

**Mô tả:** Hiện `PoliciesClient.tsx` chứa cả buy flow + my-policies. User muốn:
- Policies page = **chỉ đọc/review** (gói đã mua + tham khảo catalog)
- Mua = qua **Documents page** → upload CCCD → OCR auto-fill → `InsuranceRegistrationModal` (đã có sẵn từ TASK-012)

**Output:**
- **Tab "Gói của tôi":** list cards như cũ + click card → `PolicyDetailModal` mới
  - Thông tin đầy đủ: số HĐ, plan, mô tả, dates, insurer
  - Coverage breakdown: total / đã được duyệt từ claims trước / còn lại
  - Danh sách claim liên quan (filter `/claims` theo `policy_type`)
  - Nút: Cancel (if active), Xem claims (link), Tải hợp đồng PDF (placeholder TASK-030)
- **Tab "Tham khảo gói"** (rename từ "Mua gói mới"):
  - Giữ 6×3 plan grid catalog
  - **Bỏ nút "Mua"** → thay banner CTA "Đăng ký qua trang Tài liệu → AI OCR tự fill form"
  - Mỗi plan card có nút **"Đăng ký từ trang Tài liệu →"** link `/documents`
- i18n: thêm `tabBrowseRef, viewDetails, purchaseFlowHint, goToDocuments, policyDetailsTitle, relatedClaims, coverageRemaining, downloadContract, noClaimsForPolicy`; xóa `buyBtn, buying, buySuccess`
- `DocumentsClient.tsx`: verify CTA "Đăng ký bảo hiểm" hiển thị đủ nổi bật sau OCR done

**Files:**
- `frontend/src/app/[locale]/(app)/policies/PoliciesClient.tsx` (heavy rewrite ~50%)
- `frontend/src/messages/vi.json` + `en.json` (~8 key)
- `frontend/src/app/[locale]/(app)/documents/DocumentsClient.tsx` (tweak CTA)

**Decisions chốt:**
- (A) Modal popup cho PolicyDetailModal (không tạo route riêng `/policies/[id]`)
- (A) Claim liên quan filter theo `claim_type` tạm thời — chờ TASK-027 link đúng `policy_id`

**Effort:** ~2 giờ
**Blocked by:** —
**Blocks:** TASK-027 (Claim model bổ sung `policy_id` → policy detail mới link đúng được)

**Done — bổ sung ngoài plan ban đầu:**
- `GET /policies/terms/{category}` (public) — trả full `Policy.content` từ MongoDB cho viewer xem điều khoản
- `PolicyTermsModal` shared component (`frontend/src/components/policies/PolicyTermsModal.tsx`) — inline markdown renderer (h1/h2/h3/bullets/**bold**) XSS-safe, không add lib mới. Support `zIndexClass` prop để stack với modal khác
- Nút "Xem điều khoản đầy đủ" ở 3 chỗ:
  1. Tab "Tham khảo gói" — trên mỗi plan card
  2. `PolicyDetailModal` footer (gói đã mua)
  3. `InsuranceRegistrationModal` ở Documents page (link "Xem thêm điều khoản" cạnh tab loại)
- `PolicyDetailModal` thêm section **"Thông tin người đăng ký"** — fetch `/auth/me` show name/email/province
- Script `backend/scripts/clear_user_policies.py` — reset UserPolicy (all hoặc theo email) với confirm prompt
- Smoke test: JSON + TypeScript `tsc --noEmit` PASS

---

### TASK-031 `[AI+FE]` OCR bounding box extraction + visual overlay ⭐ ✅

**Mô tả:** Hiện OCR trả `{field: {value, confidence}}` thuần text — user không biết Gemini đọc từ vùng nào trên ảnh. Thêm bbox vào output + render SVG overlay trên ảnh gốc.

**Output:**
- Prompt OCR thêm `"bounding_box": [y_min, x_min, y_max, x_max]` normalized 0-1000
- `ExtractedField.bbox` đã có sẵn trong model (`document.py:13`) — chỉ cần populate
- FE: SVG overlay tuyệt đối trên `<img>` gốc — hover field → highlight box; click box → focus field input
- Low-confidence field tự động highlight bằng border màu cam
- Toggle "Hiển thị vùng trích xuất" để user bật/tắt overlay

**Tier model:** LITE cho CCCD, PRO cho doc free-form (bệnh án, hóa đơn)
**Effort:** 2 ngày
**Blocked by:** TASK-035
**Blocks:** TASK-032 (bundle pass cần bbox để render)
**Demo value:** ⭐⭐⭐⭐⭐ — visual wow moment

**Done — implementation:**
- `app/services/ai/ocr.py`: thêm `_BBOX_INSTRUCTION` chung, append vào 7 prompt (cccd/cmnd/driver_license/passport/insurance_policy/vehicle_registration/other) → Gemini trả `bounding_box: [y_min, x_min, y_max, x_max]` normalized 0-1000
- `_normalize_bboxes()` chạy sau JSON parse: clamp [0,1000], drop bbox sai shape/order/non-numeric → graceful degradation khi Gemini hallucinate bbox xấu
- Dispatch tier: free-form docs (`insurance_policy`/`vehicle_registration`/`other`) → `_model_heavy` (PRO), card layouts → `_model` (LITE). Hiện default cả 2 = `gemini-3.1-flash-lite` → zero behavior change đến khi user upgrade env
- `frontend/src/components/documents/BBoxOverlay.tsx`: SVG `viewBox="0 0 1000 1000"` `preserveAspectRatio="none"` overlay tuyệt đối trên `<img>` → bbox align tự động không cần image dimensions từ BE. Hover box → highlight + tên field; click box → focus input. Border cam cho low-confidence
- `DocumentsClient.tsx`: state `showBBox` (toggle), `hoveredField`, `fieldRefs` (cho focus jump); hover field row ↔ hover bbox 2 chiều; click bbox → bật edit mode + focus đúng input; dot xanh nhỏ cạnh tên field báo "có bbox"
- i18n: thêm `showBBox`, `bboxCount` (placeholder `{count}`), `hasBBox` cho cả vi.json + en.json
- TS `tsc --noEmit` PASS; Python bbox normalization smoke test PASS (valid kept, bad-string/reversed nulled)

---

### TASK-032 `[AI]` Multi-document holistic OCR ✅

**Mô tả:** Hiện mỗi file gọi Gemini riêng → không cross-reference. Đổi thành **1 call với N image parts** + prompt master → consolidated_profile + inconsistencies + missing_fields.

**Output:**
- New endpoint `POST /documents/bundle-ocr` nhận `document_ids[]`
- Service `OCRService.holistic_extract(file_bytes_list)` → 1 Gemini call
- Output JSON:
  ```
  {
    "documents": [{"index": 0, "doc_type": "...", "fields": {...}}, ...],
    "consolidated_profile": { "full_name": {...}, ... },
    "inconsistencies": [{"field": "address", "values_by_doc": [...], "severity": "high"}],
    "missing_for_insurance": ["occupation", "beneficiary_name"]
  }
  ```
- Mỗi field trong consolidated_profile có `source_doc_index` → provenance tracking
- Frontend: panel hiển thị "AI đã đọc N tài liệu — phát hiện X inconsistency, thiếu Y field"
- Cache MD5 cho bundle (hash combined của tất cả file)

**Tier model:** PRO (bắt buộc, flash-lite không xử lý nổi 3-5 image cùng lúc)
**Effort:** 2 ngày
**Blocked by:** TASK-035, TASK-031
**Blocks:** TASK-033

**Done — implementation:**
- `app/models/ocr_bundle.py`: Beanie `OCRBundle` collection (`bundle_hash`, `document_ids`, `documents`, `consolidated_profile`, `inconsistencies`, `missing_for_insurance`) + indexes user_id/bundle_hash. Registered trong `core/database.py`
- `app/services/ai/ocr.py`:
  - `_HOLISTIC_PROMPT` master prompt tiếng Việt — yêu cầu 4 phần (per-doc extraction với bbox, consolidated_profile với `source_doc_index`, inconsistencies với severity high/medium/low, missing_for_insurance)
  - `holistic_extract(files, user_id, document_ids)` → MD5 bundle_hash (concat file hashes + sorted doc_ids), cache check OCRBundle, gọi `_call_gemini_holistic` với N image parts trên `_model_heavy` (PRO tier), timeout 120s, retry 429
  - `_call_gemini_holistic` single call với list parts → 1 image_part per file + prompt cuối
  - `_parse_holistic_response` defensive — set default keys, normalize bbox cho từng `doc.fields`
- `app/api/routes/documents.py`:
  - `POST /documents/bundle-ocr` (rate limit 5/min) — validate ownership, 2-8 docs, download từ MinIO, gọi `holistic_extract`, trả `{bundle_id, cached, documents, consolidated_profile, inconsistencies, missing_for_insurance}`
  - `GET /documents/bundles/{bundle_id}` — retrieve cho TASK-033 form auto-fill
- `frontend/src/components/documents/BundleResultPanel.tsx`: panel mới với 3 summary tiles (docs read / inconsistencies / missing fields), inconsistency list với severity badge (high=red/medium=orange/low=yellow), missing fields chip list, consolidated_profile table với provenance (`source_doc_index` + doc_type label)
- `DocumentsClient.tsx`: button mới "AI hợp nhất hồ sơ" (gradient purple→pink, Sparkles icon) trên cùng button merge khi 2+ docs selected; render `BundleResultPanel` ở right panel ưu tiên trước merge result; reuse `mergeIds` checkbox
- i18n: 15 keys cho cả vi.json + en.json (`bundleBtn`, `bundleTitle`, `bundleDocsRead`, `bundleInconsistencies`, `bundleMissingFields`, `bundleConsolidated`, `bundleFromDoc`, `bundleInconsistenciesTitle`, `bundleMissingTitle`, `bundleNoInconsistency`, `bundleNoMissing`, `bundleCached`, `bundleFailed`, `severityHigh/Medium/Low`)
- Smoke tests PASS: `_parse_holistic_response` parse + normalize bbox; FastAPI app loads với 51 routes; TS `tsc --noEmit` clean

---

### TASK-033 `[AI+FE]` Auto-fill insurance form từ OCR bundle ⭐ ✅

**Mô tả:** Đây là "magic moment" của demo. Sau khi user upload bundle docs → OCR holistic → form bảo hiểm + form claim tự fill 80% + highlight field còn thiếu.

**Output:**
- Backend mapping rule:
  ```python
  INSURANCE_FORM_MAPPING = {
    "policy_purchase.health": {
      "insured_name": "consolidated_profile.full_name",
      "insured_dob": "consolidated_profile.date_of_birth",
      ...
    },
    "claim_submit.disaster": {...},
  }
  ```
- `InsuranceRegistrationModal` nhận `consolidated_profile` thay vì single `ocrData`
- Field đã auto-fill → highlight xanh "Từ tài liệu X" + click để xem source bbox (link TASK-031)
- Field thiếu → highlight cam "Cần nhập thủ công"
- Nút **"Tạo form từ hồ sơ này"** trên trang Documents sau khi merge bundle

**Effort:** 2 ngày
**Blocked by:** TASK-032
**Blocks:** TASK-027 (claim form v2 cũng dùng cơ chế này), TASK-028 (policy form v2)
**Demo value:** ⭐⭐⭐⭐⭐ — value chính

**Done — implementation:**
- `frontend/src/types/index.ts`: shared types `ConsolidatedField`, `BundleDoc`, `BundleInconsistency`, `BundleResult` cho cross-component use
- `InsuranceRegistrationModal.tsx` được mở rộng:
  - Props mới optional: `consolidatedProfile`, `bundleDocuments`, `missingFields`
  - Khi `consolidatedProfile` present (bundle mode) → `extractFromConsolidated()` build `info` + parallel `provenance: Partial<Record<keyof CustomerInfo, number>>` map (field → source_doc_index)
  - Sub-component `FieldWithProvenance` render label + badge "Tài liệu #N · {doc_type}" + input có border purple khi có provenance
  - Badge tự rớt khi user edit field (`handleFieldChange` clear provenance entry) — UI honest về việc field nào còn AI-sourced
  - Missing-fields banner amber phía trên form: chip list cho mỗi missing field với label "Cần nhập thủ công"
  - Header badge: bundle mode → "Hồ sơ hợp nhất từ AI" (purple) + count tài liệu; single-doc → giữ nguyên "Tự điền từ OCR" (blue) — không break legacy flow
- `BundleResultPanel.tsx`: button xanh `ShieldPlus` "Tạo form từ hồ sơ này" trên header bên cạnh close
- `DocumentsClient.tsx`: `onCreateForm` → `setShowInsuranceReg(true)`; conditional pass cho `InsuranceRegistrationModal` (bundle ưu tiên hơn single-doc nếu cả hai available); reset `bundleResult` + `mergeIds` sau khi register success
- i18n: `claims.manualEntryNeeded`, `documents.bundleCreateForm` (cả vi/en)
- TS `tsc --noEmit` PASS

**Mô tả:** Form claim hiện tại `{claim_type, amount, province, disaster_type, description, document_ids}` quá mỏng. Bổ sung cho đúng quy trình bồi thường thật.

**Output:**
- **Claim model** bổ sung field:
  - `policy_id: str` (link UserPolicy cụ thể — claim against which policy)
  - `incident_date: datetime`, `incident_time: str | None`
  - `incident_location: dict` (address + lat/long nếu có)
  - `incident_type: str` (chi tiết hơn claim_type — collision/theft/illness/...)
  - `evidence_files: list[DocumentEmbed]` (multi photo/video/document)
  - `bank_account: dict` (số TK + ngân hàng + chủ TK)
  - `witness_info: dict | None`
  - `hospital_admission_number: str | None`
  - `police_report_number: str | None`
  - `fact_declaration: bool` (e-signature checkbox)
- Validation:
  - `incident_date >= policy.start_date`
  - `incident_date <= now`
  - `policy_id` thuộc về `current_user` + status active
  - `coverage_remaining > 0` (tính từ `coverage_amount - sum(approved claims)`)
- Type-specific required docs checklist:
  - health: hóa đơn viện phí + đơn thuốc + bệnh án
  - vehicle: biên bản CSGT + báo giá sửa + ảnh thiệt hại
  - property: ảnh thiệt hại + báo giá sửa + biên bản công an (nếu trộm)
  - disaster: xác nhận thiên tai chính quyền + ảnh
  - life: giấy chứng tử + bệnh án
  - income: giấy thôi việc / biên bản tai nạn lao động
- FE: form wizard 3-step (Sự cố → Chứng từ → Xác nhận)
- AI fraud detector update: thêm signal "evidence_count < required" → tăng fraud score
- AuditLog thêm action `claim_submitted` để track

**Effort:** 3 ngày (BE 1.5 + FE 1.5)
**Blocked by:** TASK-033 (form auto-fill)
**Status:** ✅ Done

**Done — implementation:**
- `app/models/claim.py`: Claim model thêm 11 field v2 (`policy_id`, `incident_date`, `incident_time`, `incident_location` dict, `incident_type`, `description`, `evidence_files` list[DocumentEmbed], `bank_account` dict, `witness_info` dict, `hospital_admission_number`, `police_report_number`, `fact_declaration`). Index mới trên `policy_id`. Mọi field optional → backward-compat với legacy claims
- `app/api/routes/claims.py`:
  - `IncidentLocation`, `BankAccount`, `WitnessInfo` Pydantic models
  - `REQUIRED_EVIDENCE_COUNT` dict per claim_type (health=3, vehicle=3, property=3, disaster=2, life=2, income=1)
  - `ClaimSubmitRequest` v2: thêm `policy_id`, `incident_date`, `incident_location`, `evidence_document_ids`, `bank_account`, `witness_info`, `hospital_admission_number`, `police_report_number`, `fact_declaration`
  - Submit endpoint mới: 4 lớp validation (policy ownership + status + type match; incident_date in [policy.start_date, now, policy.end_date]; coverage_remaining > 0; amount_claimed ≤ coverage_remaining), helper `_embed_docs()` tách logic, audit log `claim_submitted`
  - `GET /claims/policy-context/{policy_id}` mới → FE wizard fetch coverage_remaining + required_evidence_count realtime
- `app/services/ai/agent.py`: `ClaimState` thêm `evidence_count` + `required_evidence_count`; `fraud_detection` node thêm signal "+15 if evidence_count < required" với flag tiếng Việt; `run_claim_agent()` signature thêm 2 params
- `frontend/src/components/claims/ClaimSubmitWizard.tsx`: 3-step wizard mới (Sự cố → Chứng từ → Xác nhận)
  - Step 1: policy picker (filter active) → fetch policy-context realtime hiển thị coverage spent/remaining tile; incident date/time/address/type; province/disaster_type; amount với inline coverage warning đỏ; description
  - Step 2: REQUIRED_DOCS_BY_TYPE checklist (informational), evidence multi-select với count vs required, supporting docs trong `<details>` (CCCD/hợp đồng tham chiếu thêm)
  - Step 3: bank account (3 field bắt buộc), type-specific optional (hospital_admission_number cho health; police_report_number cho vehicle/property), witness optional trong `<details>`, summary tile, fact_declaration checkbox bắt buộc tick
  - Step indicator gradient blue→green, Back/Next nav, validation per-step trước khi cho phép Next, single error banner đỏ
  - "No active policy" guard modal → suggest user mua qua Documents page
- `ClaimsClient.tsx`: thay `SubmitModal` cũ bằng `ClaimSubmitWizard`, fetch thêm `/policies` parallel với claims+documents, cleanup imports/constants unused (`Input`, `Label`, `PROVINCES`, `CLAIM_TYPES`, `DISASTER_TYPES`)
- i18n: namespace mới `claimWizard` với 50+ keys (vi/en) — step labels, field labels, placeholders, required-docs labels (9 keys), 12 validation error messages, summary labels
- Smoke test PASS: FastAPI app loads 52 routes, `REQUIRED_EVIDENCE_COUNT` config visible, `Claim.policy_id` field exists; `tsc --noEmit` clean

---

### TASK-028 `[BE+FE]` Policy purchase form v2 — insured/beneficiary/effective date

**Mô tả:** Form mua hiện `{policy_type, plan_index}` → quá ít. Bổ sung field theo chuẩn bảo hiểm thật.

**Output:**
- **UserPolicy model** bổ sung field:
  - `insured_person: dict` (nếu khác buyer — name, dob, id_number, relationship)
  - `beneficiaries: list[dict]` (cho life/income — name, relationship, percentage, must sum to 100)
  - `start_date: datetime` (user chọn, không auto)
  - `term_years: int` (1/3/5/10)
  - `subject_details: dict` (type-specific:
    - health: chiều cao, cân nặng, BMI, occupation
    - property: address, building_type, building_value
    - vehicle: license_plate, brand, model, year, engine
  )
  - `health_declaration: dict | None` (cho health/life — chronic illness, surgery history)
  - `payment_frequency: str` ("monthly"/"quarterly"/"yearly")
  - `terms_accepted: bool` (e-sig)
  - `payment_method: str` (mock — "bank_transfer"/"cash"/"card")
- FE: form wizard 4-step:
  1. Chọn loại + gói (đã làm)
  2. Thông tin người được bảo hiểm + người thụ hưởng
  3. Đối tượng cụ thể + khai báo sức khỏe (nếu cần)
  4. Xác nhận + e-sign + payment
- Auto-fill bước 2-3 từ TASK-033 consolidated_profile
- Premium calculator đơn giản (placeholder — chỉ apply theo age + plan):
  - Age 18-30: ×1.0
  - Age 31-50: ×1.2
  - Age 51-65: ×1.5
- AuditLog `policy_purchased`

**Effort:** 3 ngày (BE 1.5 + FE 1.5)
**Blocked by:** TASK-033
**Status:** ✅ Done

**Done — implementation:**
- `app/models/user_policy.py`: UserPolicy thêm 11 field v2 (`base_premium`, `age_multiplier`, `term_years`, `insured_person` dict, `beneficiaries` list, `subject_details` dict, `health_declaration` dict, `payment_frequency`, `payment_method`, `terms_accepted`). Mọi field optional → backward compat
- `app/api/routes/user_policies.py`:
  - Helpers `_age_from_dob()` (parse 4 format date), `_age_multiplier()` (<18:1.5, 18-30:1.0, 31-50:1.2, 51-65:1.5, >65:2.0)
  - Pydantic models `InsuredPerson`, `Beneficiary` (percentage 0-100); `PurchaseRequest.beneficiaries_sum_100` validator
  - Validation: life/income bắt buộc beneficiaries; start_date không quá khứ; existing active policy → 409; tổng beneficiary % phải =100±0.01
  - Tính `end_date = start_date + 365*term_years`; tính `annual_premium = base * age_multiplier`
  - Audit log `policy_purchased` với chi tiết (base/final premium, multiplier, term, frequency, has_beneficiaries, has_health_declaration)
  - `POST /policies/quote` endpoint mới — báo giá realtime (FE wizard fetch khi user thay đổi DOB/term/plan)
- `frontend/src/components/policies/PolicyPurchaseWizard.tsx` (~700 dòng): 4-step wizard
  - Step 1: type tabs (geo recommendation chips ở trên) + 3 plan cards. Bỏ tab catalog cũ
  - Step 2: insured (name/dob/id/relationship/start_date/term_years/province), beneficiaries conditional cho life/income với add/remove/percentage tracker realtime + tổng = 100% indicator
  - Step 3: type-specific subject_details (health: cao/nặng/nghề; property: address/loại nhà/giá trị; vehicle: biển/hãng/dòng/năm; disaster/income: skip); health_declaration conditional cho health/life (chronic illness + surgery + smoker)
  - Step 4: live quote tile (base × multiplier = final, total cho cả term), payment freq + method, terms_accepted checkbox
  - Auto-fill từ bundle consolidated_profile (props `consolidatedProfile`, `bundleDocuments`, `missingFields` từ TASK-033 reused) hoặc single-doc ocrData (backward compat)
  - Step indicator gradient blue→green, validation per-step, "AI-filled" badge khi bundle mode
- `DocumentsClient.tsx`: thay `InsuranceRegistrationModal` (đã xóa) bằng `PolicyPurchaseWizard` — props giống hệt, drop-in replacement
- i18n namespace mới `policyWizard` (~80 keys vi + en) — step labels, all field labels, plan options, relationship enum, building types, payment options, validation errors
- `tsc --noEmit` PASS; smoke test BE age multiplier + beneficiary validator (90% rejected, 100% accepted) PASS; FastAPI 53 routes (+`/policies/quote`)
- Old `InsuranceRegistrationModal.tsx` deleted — không còn usage

---

### TASK-029 `[BE+FE]` Reviewer v2 — request more info + partial approval ✅

**Mô tả:** Bổ sung action cho reviewer ngoài approve/reject binary.

**Output:**
- **Backend `PATCH /claims/{id}/review`** nhận thêm `decision`:
  - `"info_requested"` — claim status `info_requested`, gửi email user request chứng cứ bổ sung + danh sách field cần thêm
  - `"partial_approved"` — duyệt với `amount_approved < amount_claimed` + `reduction_reason`
- Claim model thêm field:
  - `additional_info_requested: list[str]` (list field/document missing)
  - `additional_info_provided_at: datetime | None`
- User dashboard: status `info_requested` → banner "Cần bổ sung — bấm để upload"
- Reviewer UI: 3-button row (Approve / Reject / Request Info) + slider "Mức duyệt %" cho partial
- Email template thêm "info_requested" variant
- AuditLog: action `claim_info_requested`, `claim_partial_approved`

**Effort:** 2 ngày
**Blocked by:** TASK-022 ✅ (cơ chế review base đã có)
**Status:** ✅ Done

**Done — implementation:**
- `app/models/claim.py`: Claim model thêm `status='info_requested'` literal, `additional_info_requested: list[str]`, `additional_info_requested_at`, `additional_info_provided_at`, `reduction_reason`, `is_partial_approval: bool`
- `app/api/routes/claims.py`:
  - `ClaimReviewRequest` mở rộng `decision` Literal: `approved | rejected | info_requested | partial_approved` + new fields `fields_needed: list[str]`, `reduction_reason: str | None`
  - `review_claim` 4 branch validation: partial yêu cầu `amount_approved < amount_claimed + reduction_reason`; info_requested yêu cầu `fields_needed`; persist `is_partial_approval`, `additional_info_requested[_at]`
  - Audit log action tự chọn theo decision: `claim_info_requested` / `claim_partial_approved` / `claim_override`
  - WebSocket push event v2 với `is_partial`, `reduction_reason`, `fields_needed`
- `app/services/email.py`: `_DecisionType` 4-variant; `_decision_display()` tách color theo decision; HTML thêm `reduction_block` (yellow), `fields_block` (orange với `<ul>`); plain-text rewrite từ list; subject map 4 case
- `app/api/routes/reviewer.py`: queue serializer + status counts thêm `info_requested`; `_VALID_STATUSES` mở rộng
- `frontend/src/types/index.ts`: `Claim.status` thêm `'info_requested'`; thêm `is_partial_approval`, `reduction_reason`, `additional_info_requested[_at]`, `additional_info_provided_at`
- `ReviewerClient.tsx`:
  - State mới `reductionReason`, `fieldsNeededRaw`; `decide()` accept 4 decisions với per-decision validation client-side
  - Editable form: Auto-detect partial khi `amount_approved < amount_claimed` → hiện amber input cho `reduction_reason`; collapsible "Yêu cầu bổ sung tài liệu" với textarea (newline/comma split); 4-button row (Hủy / Duyệt|Duyệt 1 phần / Yêu cầu bổ sung / Từ chối) auto-switch text & màu theo state
  - Read-only mode: 4-variant color theme (green/yellow/red/amber); hiển thị `reduction_reason`, danh sách `additional_info_requested`, % giảm số tiền
  - Tab status mới `info_requested` (amber) trong tab bar
- `ClaimsClient.tsx` (user side):
  - StatusBadge thêm `info_requested` (amber); `statusLabel()` map `info_requested → infoRequested`
  - DetailModal: banner amber "Cần bổ sung tài liệu" khi `status='info_requested'` — list `additional_info_requested` + reviewer note
  - Banner vàng "Yêu cầu được duyệt 1 phần" khi `is_partial_approval` — show approved/claimed ratio + reduction_reason
- i18n vi+en: thêm `claim.status.infoRequested`, `claims.infoRequestedTitle/Body/ListTitle/partialApprovalTitle/reductionReason/reviewerNote`, reviewer namespace ~25 keys (`tabInfoRequested`, `partial*/infoRequested*/decision*/err*/reductionReasonPh/fieldsNeededPh/...`)
- Smoke test BE: 54 routes, `decision` literals = 4 variants, `Claim.is_partial_approval` exists; JSON + `tsc --noEmit` clean

---

### TASK-030 `[BE]` Invoice / Policy PDF generation ✅

**Status:** ✅ Done — `app/services/pdf_generator.py` có `generate_policy_contract()` + `generate_claim_invoice()` (reportlab, bilingual header, font VN); route `GET /policies/{id}/contract.pdf` và `GET /claims/{id}/invoice.pdf` (chỉ approved) với cache MinIO theo version key.

**Mô tả:** Generate PDF cho 2 use case:
- Hợp đồng bảo hiểm sau khi mua (download từ PolicyDetailModal — TASK-036)
- Hóa đơn chi trả bồi thường sau khi claim approved

**Output:**
- Service `pdf_generator.py` dùng `reportlab` (đã có trong requirements từ generate_sample_docs)
- `GET /policies/{id}/contract.pdf` → trả PDF hợp đồng (logo, điều khoản, signature placeholder)
- `GET /claims/{id}/invoice.pdf` → trả PDF hóa đơn chi trả (chỉ approved claim)
- Template song ngữ (header bilingual)
- Cache PDF vào MinIO để không generate lại

**Effort:** 1.5 ngày
**Blocked by:** TASK-028 (need new policy fields), TASK-029 (need partial approval data)

---

### TASK-034 `[AI]` Handwriting-optimized OCR mode

**Mô tả:** Chữ viết tay (bệnh án bác sĩ) confidence luôn thấp với flash-lite. Thêm path riêng dùng PRO + prompt specialized.

**Output:**
- Detect handwritten: heuristic (user toggle "Tài liệu viết tay" hoặc Gemini classify pre-step)
- Nếu handwritten → switch model PRO + prompt prefix:
  ```
  Đây là tài liệu CHỮ VIẾT TAY tiếng Việt (thường là bệnh án).
  Lưu ý: tên thuốc viết tắt (amox=amoxicillin), ICD-10 viết Latin,
  chữ ký bác sĩ thường không đọc được → trả null cho doctor_signature.
  ```
- Test 5-10 sample bệnh án viết tay → benchmark confidence trước/sau
- Confidence threshold giảm xuống 0.6 cho doc_type handwritten (vì baseline thấp hơn)

**Effort:** 1 ngày
**Blocked by:** TASK-035
**Priority:** ⭐⭐ — edge case, có thể skip nếu deadline gấp

---

## Phase B — Test + CI + Demo Prep (sau Phase A)

> Sau khi Phase A xong, schema đã ổn → an toàn viết test, setup CI, prep demo.

### TASK-023 `[INFRA]` GitHub Actions CI (đã có outline ở Tuần 4)

### TASK-024 `[BE]` Unit tests — viết SAU khi Phase A schema chốt

**Bổ sung sau Phase A:**
- Test claim form validation (incident_date trong policy period, coverage_remaining check)
- Test policy form validation (beneficiaries sum 100%, health declaration required cho health/life)
- Test OCR bbox extraction (mock Gemini response có bbox)
- Test multi-doc holistic (mock 3 images → consolidated_profile)
- Test reviewer info_requested + partial_approved flows

### TASK-025 `[SETUP]` README + Demo Script (cập nhật theo Phase A)

**Demo script v2:**
```
1. Bài toán (1 phút)
2. Live demo (3 phút)
   → Upload bundle 5 file (Quảng Bình bão)
   → AI multi-doc OCR → bbox overlay + consolidated profile
   → Form bảo hiểm auto-fill 80% → user xác nhận → mua gói
   → Submit claim → form claim auto-fill từ biên bản UBND
   → AI agent xử lý → manual_review (high amount)
   → Login reviewer → request_more_info → user nộp bổ sung
   → Reviewer partial_approved → email tự động
3. Tech Q&A (1 phút)
```

---

## Phase C — Hoàn thiện UX (Nhóm A) ✅

> Sau đánh giá tuần 6: 3 lỗ hổng "chưa khép kín" (không có thông báo in-app, payment không lưu vết, policy hết hạn âm thầm) + thiếu dark/mobile. Triển khai trọn Nhóm A.

### TASK-037 `[BE+FE]` Notification Center (chuông + inbox realtime) ✅

**Mô tả:** Thông báo in-app cho mọi sự kiện của user, realtime qua WebSocket per-user (mirror pattern claims WS nhưng theo user_id).

**Done — implementation:**
- `models/notification.py` — collection `notifications` (user_id, type, title, body, link, read, created_at) + indexes
- `services/notifications.py` — `_UserWsManager` (in-memory per-user) + `notify()` (persist + push, best-effort không raise)
- `api/routes/notifications.py` — `GET /notifications`, `GET /notifications/unread-count`, `PATCH /{id}/read`, `PATCH /read-all`, `WS /notifications/ws` (auth cookie JWT)
- Hook `notify()` vào: `review_claim` (approved/partial/rejected/info_requested), `mark_claim_paid`, `purchase_policy`, `renew_policy`, expiry/expired
- FE `components/layout/NotificationBell.tsx` — chuông + badge unread + dropdown, WS client auto-reconnect, mark-read on click → deep-link, mark-all-read
- Đặt trong header (`AppShell`) cạnh Theme + Language; i18n namespace `notifications` (vi/en)

### TASK-038 `[BE+FE]` Lịch đóng phí + biên lai (payment schedule) ✅

**Mô tả:** Nối tiếp payment sim — sinh lịch đóng phí theo `payment_frequency`, cho đóng từng kỳ (mô phỏng) + xuất biên lai PDF.

**Done — implementation:**
- `models/payment.py` — collection `payments` (installment_no, total, amount, due_date, status, paid_at, method, transaction_ref)
- `user_policies.py` — `_generate_payment_schedule()` sinh khi mua/gia hạn (kỳ đầu = paid; ppy yearly/quarterly/monthly, cap 60 kỳ); routes `GET /policies/{id}/payments`, `POST /.../payments/{pid}/pay`, `GET /.../payments/{pid}/receipt.pdf`
- `pdf_generator.generate_payment_receipt()` — biên lai PDF song ngữ, reuse helper contract/invoice
- FE `PaymentSchedule` trong `PolicyDetailModal` — summary (đã đóng/còn lại) + list kỳ + nút Đóng phí (pending) / tải Biên lai (paid); i18n

### TASK-039 `[BE+FE]` Policy expiry reminder + renew ✅

**Mô tả:** Nhắc gói sắp hết hạn (≤30 ngày) + cho gia hạn nối tiếp.

**Done — implementation:**
- `UserPolicy` thêm `expiry_reminder_sent`, `renewed_from`
- Lazy reminder trong `GET /policies` (notify `policy_expiring` ≤30 ngày idempotent, `policy_expired` khi auto-expire) + Celery beat task `check_expiring_policies` (daily) cho cơ chế chủ động
- `POST /policies/{id}/renew` — tạo UserPolicy mới nối tiếp cùng plan/term, gói cũ active → expired, sinh lịch phí mới, audit `policy_renewed`, notify
- FE `PolicyDetailModal` — banner cam/đỏ khi sắp/đã hết hạn + nút Gia hạn (banner + footer); i18n

### TASK-040 `[FE]` Dark mode + mobile responsive ✅

**Mô tả:** Bật dark mode (tailwind `darkMode:'class'` đã có) + sidebar drawer cho mobile.

**Done — implementation:**
- `components/layout/ThemeSwitcher.tsx` — toggle `dark` class, persist localStorage, tôn trọng `prefers-color-scheme`
- `components/layout/AppShell.tsx` (client) — bọc layout, giữ state `mobileOpen`, header với hamburger (md:hidden) + Bell + Theme + Language, backdrop mobile
- `Sidebar` nhận props `mobileOpen/onNavigate` → drawer trượt (`fixed ... -translate-x-full` mobile, `md:static` desktop), đóng khi điều hướng
- `dark:` áp cho app shell (bg/header/main) + NotificationBell dropdown; **per-page dark polish còn lại là follow-up** (chrome + notification đã dark-aware)

---

## Nhóm B — Đề xuất (CHƯA CHỐT thành task)

> Đã thảo luận tuần 6, giá trị cao và hợp project nhưng **chưa quyết làm**. Ghi lại để cân nhắc; khi chốt sẽ nâng thành TASK-04x.

- **B1 — AI explainer cho claim** ⭐: chatbot đọc `ai_decision + fraud_flags + matched_clause` của 1 claim cụ thể → giải thích dễ hiểu "vì sao duyệt/từ chối" + gợi ý bổ sung. Tận dụng chatbot RAG sẵn có.
- **B2 — So sánh gói side-by-side**: bảng so sánh 3 gói (coverage/premium/loại trừ) của 1 loại trước khi đăng ký. (trùng 1 mục Backlog)
- **B3 — Semantic search hồ sơ**: search claims/tài liệu bằng ngôn ngữ tự nhiên qua Qdrant (embedding hạ tầng đã có).
- **B4 — Claim timeline cho user**: timeline trực quan vòng đời claim (submitted → processed → review → info_requested → approved → paid) từ audit log/status history.
- **B5 — KYC face match**: so khớp ảnh chân dung CCCD (đã crop được qua bbox TASK-031) với selfie khi đăng ký bằng Gemini Vision.

---

## Backlog

- `[x]` So sánh gói bảo hiểm side-by-side → chuyển thành đề xuất **B2**
- `[ ]` Lịch sử thiên tai theo tỉnh (timeline chart)
- `[ ]` Export hồ sơ merged ra DOCX
- `[ ]` Thêm doc types: Giấy khai sinh, Sổ hộ khẩu
- `[x]` Dark mode → **TASK-040** ✅
- `[ ]` Mobile responsive chatbot widget (chatbot page — sidebar/mobile shell đã responsive từ TASK-040)

---

## Decisions Log

| Ngày | Quyết định | Lý do |
|------|-----------|-------|
| 2026-06-01 | Re-order roadmap: Phase A (business + OCR enhancements: TASK-027 → 035, 036) **trước** Phase B (CI/test/demo: TASK-023, 024, 025) | Forms hiện tại quá mỏng (claim chỉ có amount + description, không có evidence, không có incident details, không có bank account) → demo trước mentor không thuyết phục. Viết test cho schema chưa ổn = throwaway work. CI cho intern solo ROI thấp. |
| 2026-06-01 | Tách model tier (LITE/DEFAULT/PRO) thành config alias, không hard-code | Hiện `gemini-3.1-flash-lite` rải 3 chỗ — không phù hợp cho multi-doc/handwriting/agent. Tách config 1 lần, switch tier theo task. |
| 2026-06-01 | Policies page = read-only (chỉ tham khảo + review gói đã mua). Đăng ký chuyển hết qua Documents → OCR → InsuranceRegistrationModal | Tách rõ trách nhiệm UX. Tận dụng OCR auto-fill làm "magic moment" của demo. InsuranceRegistrationModal đã có từ TASK-012 — không phí công build lại. |
| 2026-06-01 | PolicyDetailModal dạng popup, claim liên quan filter theo `claim_type` tạm thời | Tránh thêm route `/policies/[id]` khi chưa cần share URL. Filter `policy_id` đợi TASK-027 update Claim model. |

---

## Ngoài task list — Features implement thêm

Các tính năng sau không có trong task list ban đầu nhưng đã được implement trong quá trình phát triển:

### UserPolicy System (Insurance Registration)
- Collection `user_policies` trong MongoDB — lưu gói bảo hiểm đang active của mỗi user
- 6 loại bảo hiểm: `health`, `life`, `property`, `vehicle`, `disaster`, `income`
- Mỗi loại có 3 gói: **Cơ Bản / Nâng Cao / Toàn Diện**
- Router `user_policies.py`: `POST /policies/purchase`, `GET /policies`, `DELETE /policies/{id}`, `GET /policies/plans`
- Validation: phải có ít nhất 1 UserPolicy active trước khi submit claim
- Policy number auto-generate: `CF-HEA-XXXXXXXX`, `CF-LIF-XXXXXXXX`, v.v.

### InsuranceRegistrationModal (Documents page)
- Component `InsuranceRegistrationModal.tsx` trong Documents page
- Nút "Đăng ký bảo hiểm" hiển thị sau khi OCR done
- Pre-fill thông tin khách hàng từ `structured_data` của OCR (họ tên, ngày sinh, địa chỉ)
- Auto-detect tỉnh từ `place_of_origin` / `place_of_residence` (normalize + longest-match)
- Fetch geo risk của tỉnh detected → hiển thị risk score + đề xuất gói phù hợp
- User chọn loại bảo hiểm + gói → `POST /policies/purchase` → UserPolicy active

### GeoJSON UTM→WGS84 Conversion
- Highcharts GeoJSON nguồn gốc dùng tọa độ UTM Zone 48N (không phải WGS84)
- Tọa độ UTM cần convert: `utm = (pre - jsonmargin) / (scale * jsonres) + offset`
- Script `backend/scripts/build_vn_geojson.py` dùng `pyproj` để convert UTM48N → WGS84
- Output: `frontend/public/vietnam-provinces.geojson` (72KB static file — thay thế URL remote)
- Leaflet nhận đúng tọa độ WGS84 → bản đồ render đúng vị trí địa lý

### Province Detection Rewrite (`risk_engine.py`)
- `_normalize_vn()`: Unicode NFD decomposition → strip combining diacritics → đ→d, Đ→D
- `detect_province_from_text()`: substring match + word boundary check
- Aliases dictionary: `"HCM"/"TP HCM"/"Saigon"/"Sài Gòn"` → `"Hồ Chí Minh"`, `"HN"` → `"Hà Nội"`
- `get_province_risk()` endpoint chấp nhận tên tỉnh không dấu
- Giải quyết vấn đề user nhập "Quang Binh" (không dấu) không tìm thấy tỉnh

### 6-type Insurance Redesign
- Bỏ hệ thống cũ: `medical / dental / hospitalization / medication / disaster`
- Thay bằng 6 nhóm mới tổng quát hơn: `health / life / property / vehicle / disaster / income`
- Claim types cũng cập nhật theo để khớp với UserPolicy system
- **Migration script:** convert legacy DB records `hospitalization → health` (xem MongoDB log session 2026-05-29)

### Dedicated Pages Rebuild
Trước đây Dashboard chỉ là stub 4 cards `"—"` và Chatbot là floating bubble — đã được làm lại thành các page riêng biệt.

- **`/dashboard` (DashboardClient):** Homepage thật — welcome banner gradient theo role, snapshot cards (Active Claims / Active Policies / Area Risk / Pending Review / Deep Dive), high-risk alert tự động, recent claims, quick action tiles, my policies grid. Phân biệt rõ với `/analytics` (deep-dive charts).
- **`/chatbot` (ChatbotClient):** Full-page chat thay thế hoàn toàn `ChatWidget` floating bubble (đã xóa). Bố cục: header với clear-session button, messages area scroll riêng (max-width 3xl centered), welcome block với icon gradient, typing indicator 3-dots animate, suggestion chips, input textarea. Session persist qua localStorage.
- **`/policies` (PoliciesClient):** Trang riêng để xem & mua bảo hiểm — 2 tabs (Gói của tôi với gradient card theo loại + filter Active/Expired/Cancelled + cancel button; Mua gói mới với type selector 6 ô + 3 plans grid Cơ Bản/Nâng Cao/Toàn Diện). Stats banner total/coverage/premium. Thêm vào Sidebar giữa Claims và Analytics.

### Role-based Sidebar Filter
- `Sidebar.tsx` gọi `/auth/me` ở mount, filter nav links theo role
- User: Dashboard/Documents/Risk Map/Claims/Policies/Analytics/Chatbot
- Reviewer: + Reviewer Queue
- Admin: + Admin (all roles)
- Footer hiển thị tên + email + role badge (xanh/cam/đỏ) + logout button
- **Defense-in-depth:** Sidebar ẩn link + `/admin` và `/reviewer` self-check qua `/auth/me` redirect + backend `require_admin` / `require_reviewer` trả 403

### Admin / Reviewer / Analytics Backend Implementation
Các route trước đây là 3-line stubs đã được implement đầy đủ:

- **`admin.py`** (~330 dòng): 10 endpoints — `/admin/users` (GET + PATCH role/status), `/admin/audit-logs`, `/admin/system/health` (ping mongodb/redis/qdrant/celery), `/admin/analytics/full`, `/admin/policies` (GET/POST/DELETE với Celery `ingest_policy_to_qdrant`). Mọi action gắn `log_action()` helper.
- **`reviewer.py`** (~120 dòng): `/reviewer/queue` (filter province/disaster/min_fraud, sort oldest first) + `/reviewer/stats` (today/week/total reviewed, avg time, override rate, pending in queue).
- **`analytics.py`** (~100 dòng): `/analytics/summary` (total/approved/rejected/manual_review/processing, approval_rate, avg_processing_minutes, total_approved_amount) + `/analytics/daily?days=30` (daily_counts, region_breakdown, disaster_types, claim_types). Backend tự scope theo role.

### Celery Task `ingest_policy_to_qdrant`
- Trong `tasks/document_processor.py`: chunk policy text → embed Gemini text-embedding-004 → upsert Qdrant collection `insurance_policies`
- Idempotent: xóa chunk cũ theo `policy_id` filter trước khi upsert
- Trigger từ `POST /admin/policies` (best-effort — fail silent nếu Celery không có worker)

### Seed Script Bug Fix
- `scripts/seed.py:18` thiếu `from datetime import datetime` → `seed_user_policies()` crash khi dùng `datetime.utcnow()` trong scope hàm
- Đã fix import top-level
