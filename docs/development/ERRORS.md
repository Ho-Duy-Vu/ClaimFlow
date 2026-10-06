# ERRORS.md — Bug Log & Solutions

> Ghi lại bug đã gặp. Claude đọc trước khi debug để check xem vấn đề đã từng gặp chưa.

---

## Format

```
### [DATE] ERR-XXX: Tên lỗi

**Triệu chứng:**
**Root cause:**
**Fix:**
**Lesson:**
```

---

## Common Pitfalls — ClaimFlow specific

### Leaflet SSR Error trong Next.js

**Triệu chứng:** `ReferenceError: window is not defined` khi load map page.

**Fix:**
```typescript
// KHÔNG làm
import { MapContainer } from 'react-leaflet';

// LÀM — dynamic import, tắt SSR
const LeafletMap = dynamic(() => import('@/components/risk-map/LeafletMap'), { ssr: false });
```

**Lesson:** Leaflet dùng `window` object — không chạy được trên server. Luôn dùng dynamic import.

---

### Gemini Vision trả về text không phải JSON

**Triệu chứng:** `json.JSONDecodeError` khi parse Gemini response.

**Root cause:** Gemini đôi khi thêm text giải thích trước/sau JSON block.

**Fix:**
```python
import re, json

def extract_json(text: str) -> dict:
    # Remove markdown code blocks
    cleaned = re.sub(r'```json\n?|\n?```', '', text).strip()
    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Find JSON object in text
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"No valid JSON found in: {text[:200]}")
```

---

### MongoDB / Beanie

**`DocumentNotFound` khi dùng `.get(id)`:**

Fix: validate ObjectId format trước:
```python
from bson import ObjectId
from bson.errors import InvalidId

def validate_object_id(id: str) -> str:
    try:
        ObjectId(id); return id
    except InvalidId:
        raise HTTPException(400, "Invalid ID format")
```

**Beanie không tìm thấy collection khi test:**

Fix: fixture init trong `tests/conftest.py`:
```python
@pytest_asyncio.fixture(autouse=True)
async def init_db():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["test_db"],
        document_models=[User, Document, Claim, GeoRisk, ChatSession, Policy])
    yield
    await client.drop_database("test_db")
```

---

### CSRF Token không match khi test với curl

**Triệu chứng:** 403 CSRF validation failed khi test API bằng curl/Postman.

**Root cause:** curl không tự gửi cookie, nên csrf_token cookie không có trong request.

**Fix khi test local:**
```bash
# Login trước để lấy cookie
curl -c cookies.txt -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test1234!"}'

# Đọc csrf_token từ cookie file
CSRF=$(grep csrf_token cookies.txt | awk '{print $7}')

# Gửi request với đúng header
curl -b cookies.txt -X POST http://localhost:8000/documents/upload \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@test.pdf" -F "doc_type=cccd"
```

---

### slowapi Rate Limit không hoạt động

**Triệu chứng:** Không bị limit dù gửi nhiều request.

**Root cause:** Thiếu `app.state.limiter = limiter` hoặc thiếu `@app.exception_handler(RateLimitExceeded)`.

**Fix:**
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

---

### OCR confidence luôn trả về None

**Triệu chứng:** `result["confidence"]` là None, không trigger retry.

**Root cause:** Gemini response không có confidence score — cần tự tính từ field-level confidences.

**Fix:**
```python
def calculate_overall_confidence(fields: list[dict]) -> float:
    if not fields:
        return 0.0
    scores = [f.get("confidence", 0.5) for f in fields if f.get("value")]
    return sum(scores) / len(scores) if scores else 0.0
```

---



**422 khi gửi multipart form:**

Fix: dùng `Form(...)` và `File(...)` thay vì Pydantic model:
```python
@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
):
```

**CORS block từ frontend:**

Fix: thêm middleware đúng cách:
```python
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### Celery / Redis

**Task chạy 2 lần (duplicate):**

Fix: idempotency check đầu task:
```python
@celery_app.task(bind=True, acks_late=True)
def process_claim(self, claim_id: str):
    claim = get_claim(claim_id)
    if claim.status != "pending":
        return  # Đã xử lý, skip
```

---

### JWT httpOnly Cookie

**Cookie không được gửi kèm request từ frontend:**

Fix: axios phải có `withCredentials: true`:
```typescript
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,   // Quan trọng!
});
```

**Cookie bị block khi frontend và backend khác port:**

Fix: CORS phải có `allow_credentials=True` và không dùng `allow_origins=["*"]`.

---

### Gemini API Rate Limit

**Triệu chứng:** `429 Too Many Requests` khi OCR nhiều file.

**Fix:** Exponential backoff trong Celery task:
```python
@celery_app.task(bind=True, max_retries=3)
def process_document(self, doc_id: str):
    try:
        # ... OCR logic
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

---

## Performance Issues Log

| Ngày | Vấn đề | Fix | Kết quả |
|------|---------|-----|---------|
| | | | |

---

## Dependencies Version Conflicts

| Library | Issue | Fix |
|---------|-------|-----|
| | | |

### FastAPI

**422 khi gửi multipart form:**

Fix: dùng `Form(...)` và `File(...)` thay vì Pydantic model:
```python
@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
):
```

**CORS block từ frontend (credentials):**

Fix: không dùng `allow_origins=["*"]` khi có `allow_credentials=True`:
```python
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-CSRF-Token"],
)
```

---

### Celery / Redis

**Task chạy 2 lần (duplicate execution):**

Fix: idempotency check đầu task:
```python
@celery_app.task(bind=True, acks_late=True)
def process_document(self, doc_id: str):
    doc = get_document(doc_id)
    if doc.processing_status != "pending":
        return  # Đã xử lý, skip
    # Update status trước khi xử lý
    update_status(doc_id, "processing")
```

**Gemini API rate limit (429) khi OCR nhiều file:**

Fix: exponential backoff trong Celery:
```python
@celery_app.task(bind=True, max_retries=3)
def process_document(self, doc_id: str):
    try:
        # OCR logic...
        pass
    except Exception as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
        # Retry sau: 1s, 2s, 4s
```

---

### Next.js / Frontend

**Hydration error với dynamic data:**

Nguyên nhân: server và client render khác nhau (Date.now(), Math.random()).
Fix:
```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <Skeleton />;
```

**WebSocket disconnect không reconnect:**

Fix: implement reconnection với exponential backoff:
```typescript
function useClaimStatus(claimId: string) {
  const [status, setStatus] = useState<ClaimStatus>('pending');
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/${claimId}`);
    ws.onmessage = (e) => {
      const data: WSMessage = JSON.parse(e.data);
      setStatus(data.status);
      retryRef.current = 0;  // Reset retry count on success
    };
    ws.onclose = () => {
      if (retryRef.current < 5) {
        setTimeout(connect, 1000 * 2 ** retryRef.current);
        retryRef.current++;
      }
    };
    wsRef.current = ws;
  }, [claimId]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return status;
}
```

**WebSocket URL cần `wss://` trên HTTPS:**

Fix:
```typescript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${new URL(process.env.NEXT_PUBLIC_API_URL!).host}`;
```

---

## Performance Issues Log

| Ngày | Vấn đề | Đo lường | Fix | Kết quả |
|------|---------|----------|-----|---------|
| | | | | |

---

## Dependencies Version Conflicts

| Library | Version | Vấn đề | Fix |
|---------|---------|---------|-----|
| | | | |
