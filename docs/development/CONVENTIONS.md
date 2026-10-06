# CONVENTIONS.md — Code Conventions

> Quy ước code toàn dự án ClaimFlow. Claude generate code đúng pattern ngay từ đầu.

---

## Git Commits

`type(scope): description`

```
feat(ocr): add Gemini Vision CCCD extraction
feat(geo): add province risk scoring engine
feat(chatbot): add privacy guard for PII protection
feat(merge): implement document field deduplication
fix(leaflet): fix SSR window is not defined error
fix(auth): use httpOnly cookie instead of localStorage
refactor(agent): split fraud_detector into separate node
test(ocr): add unit tests with mock Gemini API
docs(readme): update architecture diagram
chore(deps): upgrade langchain-google-genai to 1.0.6
```

**Scopes:** `auth` · `ocr` · `merge` · `geo` · `chatbot` · `claims` · `agent` · `frontend` · `infra` · `db` · `i18n`

---

## Python — Backend

### Naming

```python
# snake_case cho files, functions, variables
ocr_service.py, province_risk.py
async def extract_cccd_data(): ...
fraud_score = 0

# PascalCase cho classes
class OCRService: ...
class GeoRiskEngine: ...
class DocumentMerger: ...

# SCREAMING_SNAKE cho constants
MAX_FILE_SIZE_MB = 20
HIGH_RISK_PROVINCES = ["Quảng Bình", "Hà Tĩnh", ...]
GEMINI_VISION_MODEL = "gemini-1.5-flash"
GEMINI_PRO_MODEL = "gemini-1.5-pro"
```

### FastAPI Route Pattern

```python
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from app.api.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Upload tài liệu để OCR processing."""
    # validate → upload S3 → create DB record → enqueue Celery task
    ...
```

### Service Pattern (Beanie)

```python
class OCRService:
    def __init__(self):
        self.model = genai.GenerativeModel(GEMINI_VISION_MODEL)

    async def extract(self, file_path: str, doc_type: str) -> dict:
        # 1. Read file
        # 2. Call Gemini Vision
        # 3. Parse JSON response
        # 4. Return structured data
        ...

    def _build_prompt(self, doc_type: str) -> str:
        prompts = {
            "cccd": CCCD_PROMPT,
            "driver_license": DRIVER_LICENSE_PROMPT,
            "insurance_policy": INSURANCE_POLICY_PROMPT,
        }
        return prompts.get(doc_type, GENERIC_DOC_PROMPT)
```

### Gemini API Pattern

```python
import google.generativeai as genai
from langchain_google_genai import ChatGoogleGenerativeAI

# Vision (OCR)
vision_model = genai.GenerativeModel("gemini-1.5-flash")
response = vision_model.generate_content([image_part, prompt])

# LLM (Chatbot, reasoning)
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=0.3)

# Embedding (RAG)
embedding_model = "models/text-embedding-004"
```

### Privacy Guard Pattern (Chatbot)

```python
PRIVACY_SYSTEM_PROMPT = """
Bạn là AI tư vấn bảo hiểm ClaimFlow.

QUY TẮC BẮT BUỘC — KHÔNG được vi phạm:
- KHÔNG đọc to hoặc xác nhận số CCCD/CMND trong response
- KHÔNG tiết lộ địa chỉ chi tiết (số nhà, tên phố)
- KHÔNG nhắc số điện thoại trong response
- Chỉ dùng vùng miền hoặc tên tỉnh để tư vấn

Bạn ĐƯỢC PHÉP sử dụng context để:
- Tư vấn gói bảo hiểm phù hợp vùng miền
- Đề xuất combo bảo hiểm theo rủi ro địa lý
"""
```

---

## TypeScript — Frontend

### Naming

```typescript
// kebab-case cho files
risk-map.tsx, ocr-result-table.tsx, use-claim-status.ts

// PascalCase cho components
export function RiskMapComponent({ province }: RiskMapProps) {}
export function OCRResultTable({ fields }: OCRResultTableProps) {}

// camelCase với prefix 'use' cho hooks
function useClaimStatus(claimId: string) {}
function useProvinceRisk(provinceName: string) {}

// SCREAMING_SNAKE cho constants
const HIGH_RISK_THRESHOLD = 70;
const SUPPORTED_DOC_TYPES = ['cccd', 'driver_license', ...] as const;
```

### Component Pattern

```typescript
// components/risk-map/ProvincePanel.tsx
interface ProvincePanelProps {
  province: ProvinceRisk | null;
  onClose: () => void;
}

export function ProvincePanel({ province, onClose }: ProvincePanelProps) {
  if (!province) return null;
  return (
    <div className="absolute right-4 top-4 w-80 bg-white rounded-lg shadow-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium">{province.province_name}</h3>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      <RiskScoreBadge score={province.overall_risk_score} />
      {/* ... */}
    </div>
  );
}
```

### Leaflet Pattern (SSR safe)

```typescript
// components/risk-map/LeafletMap.tsx — Client component only
'use client';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// app/risk-map/page.tsx — Dynamic import
import dynamic from 'next/dynamic';
const LeafletMap = dynamic(() => import('@/components/risk-map/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-96 bg-gray-100 animate-pulse rounded" />
});
```

### API Call Pattern

```typescript
// lib/api.ts
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,  // Quan trọng cho httpOnly cookie
});

export const documentsApi = {
  upload: (formData: FormData) =>
    api.post<{ document_id: string; processing_status: string }>('/documents/upload', formData),
  merge: (docIds: string[]) =>
    api.post<MergeResult>('/documents/merge', { document_ids: docIds }),
  getById: (id: string) =>
    api.get<DocumentDetail>(`/documents/${id}`),
};

export const geoApi = {
  getProvince: (name: string) =>
    api.get<ProvinceRisk>(`/geo-risk/province/${encodeURIComponent(name)}`),
  getMapData: () =>
    api.get<{ provinces: ProvinceRisk[] }>('/geo-risk/map'),
  recommend: (address: string) =>
    api.post<RecommendResult>('/geo-risk/recommend', { address }),
};
```

---

## LangGraph — AI Agent

### State Pattern

```python
class ClaimState(TypedDict):
    claim_id: str
    raw_text: str
    doc_type: str
    province: str | None
    disaster_type: str | None
    # After node 1
    parsed_data: dict
    parsing_confidence: float
    # After node 2
    is_covered: bool
    coverage_limit: float
    coverage_reason: str
    # After node 3
    fraud_score: int
    fraud_flags: list[str]
    # After node 4
    final_decision: str
    final_reasoning: str
    missing_fields: list[str]
    error: str | None
```

### Node Pattern

```python
def document_parser_node(state: ClaimState) -> dict:
    """Extract structured data từ raw OCR text."""
    try:
        result = parse_with_gemini(state["raw_text"], state["doc_type"])
        return {
            "parsed_data": result["data"],
            "parsing_confidence": result["confidence"],
        }
    except Exception as e:
        logger.error("document_parser failed: %s", str(e))
        return {"error": f"parsing_failed: {str(e)}"}
```

---

## Database Rules (Beanie)

- Không có migration — thêm field vào model là đủ
- Embedded documents cho data luôn đọc cùng nhau (DocumentEmbed trong Claim)
- Reference (string ObjectId) cho data đọc độc lập
- Index khai báo trong `class Settings`
- ID luôn là `str` khi expose qua API

### Security Middleware Pattern

```python
# app/core/middleware.py — thêm vào main.py theo thứ tự

import uuid, re
from fastapi import Request
from fastapi.responses import JSONResponse

# 1. Request ID — trace mọi request
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    logger.info("[%s] %s %s", request_id, request.method, request.url.path)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# 2. CSRF Protection
@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        # Bỏ qua auth endpoints (login/register không có cookie)
        if request.url.path.startswith("/auth"):
            return await call_next(request)
        csrf_header = request.headers.get("X-CSRF-Token")
        csrf_cookie = request.cookies.get("csrf_token")
        if not csrf_header or csrf_header != csrf_cookie:
            return JSONResponse({"detail": "CSRF validation failed"}, 403)
    return await call_next(request)
```

### Rate Limiting Pattern

```python
# app/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# Áp dụng per endpoint
@router.post("/documents/upload")
@limiter.limit("10/minute")      # OCR nặng → giới hạn chặt
async def upload_document(...): ...

@router.post("/chatbot/message")
@limiter.limit("30/minute")      # Chat bình thường
async def send_message(...): ...

@router.post("/auth/login")
@limiter.limit("5/minute")       # Chống brute force
async def login(...): ...
```

### Input Sanitization Pattern

```python
# app/services/sanitizer.py
import re
from fastapi import HTTPException

INJECTION_PATTERNS = [
    "ignore previous", "forget your rules", "you are now",
    "pretend you are", "reveal system prompt", "bypass",
    "disregard instructions", "new instructions",
]

def sanitize_chat_input(message: str) -> str:
    """Sanitize chatbot input — strip HTML, check injection."""
    # Check prompt injection
    lower = message.lower()
    for pattern in INJECTION_PATTERNS:
        if pattern in lower:
            raise HTTPException(400, "Input không hợp lệ")
    # Strip HTML tags
    cleaned = re.sub(r'<[^>]+>', '', message).strip()
    # Limit length
    return cleaned[:2000]

def sanitize_general_input(text: str) -> str:
    """Sanitize general text input."""
    return re.sub(r'<[^>]+>', '', text).strip()[:500]
```

### OCR Cache Pattern

```python
# app/services/ai/ocr.py
import hashlib

class OCRService:
    async def get_or_extract(
        self, file_bytes: bytes, doc_type: str, user_id: str
    ) -> dict:
        file_hash = hashlib.md5(file_bytes).hexdigest()
      
        # Check cache
        cached = await Document.find_one(Document.file_hash == file_hash)
        if cached and cached.structured_data and cached.processing_status == "done":
            logger.info("OCR cache hit: %s", file_hash[:8])
            return {"data": cached.structured_data, "cached": True}
      
        # Cache miss → call Gemini
        result = await self._extract_with_retry(file_bytes, doc_type)
        return {"data": result, "cached": False}

    async def _extract_with_retry(self, file_bytes: bytes, doc_type: str) -> dict:
        result = await self._call_gemini(file_bytes, doc_type)
      
        if result.get("confidence", 0) < 0.7:
            logger.warning("Low confidence %.2f, retrying with enhanced prompt",
                          result["confidence"])
            result = await self._call_gemini(file_bytes, doc_type, enhanced=True)
      
        result["needs_manual_review"] = result.get("confidence", 0) < 0.7
        return result
```

### Python

```python
# 1. stdlib
import re, json, logging
from datetime import datetime

# 2. third-party
import google.generativeai as genai
from fastapi import APIRouter, Depends
from beanie import Document

# 3. internal
from app.core.config import settings
from app.models.document import Document as DocModel
from app.schemas.document import DocumentResponse
```

### TypeScript

```typescript
// 1. React/Next
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// 2. Third-party
import axios from 'axios';
import { MapContainer } from 'react-leaflet';

// 3. Internal components
import { Button } from '@/components/ui/button';
import { ProvincePanel } from '@/components/risk-map';

// 4. Internal lib/types
import { geoApi } from '@/lib/api';
import type { ProvinceRisk, DocType } from '@/types';
```

---

## Security Patterns

### Error Boundary Pattern

```typescript
// components/ErrorBoundary.tsx
'use client';
import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mb-4" />
          <p className="text-gray-600 mb-4">Có lỗi xảy ra.</p>
          <Button onClick={() => this.setState({ hasError: false })}>Thử lại</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
// Dùng: <ErrorBoundary><LeafletMap /></ErrorBoundary>
```

### OCR Loading Skeleton Pattern

```typescript
// components/documents/OCRProcessing.tsx
'use client';
import { CheckCircle2, Loader2 } from 'lucide-react';

const STEPS = [
  { label: 'Nhận tài liệu', doneWhen: ['processing', 'done'] },
  { label: 'OCR nhận diện văn bản', doneWhen: ['done'] },
  { label: 'AI phân tích cấu trúc', doneWhen: ['done'] },
];

export function OCRProcessing({ status }: { status: string }) {
  return (
    <div className="space-y-3 p-4">
      {STEPS.map((step, i) => {
        const isDone = step.doneWhen.includes(status);
        const isActive = !isDone && status === 'processing';
        return (
          <div key={i} className="flex items-center gap-3">
            {isDone ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : isActive ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              : <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
            <span className={isDone ? 'text-gray-700' : 'text-gray-400'}>{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
```

### CSRF Token (Frontend axios)

```typescript
// lib/api.ts
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

### Rate Limiting (Backend)

```python
# pip install slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@router.post("/documents/upload")
@limiter.limit("10/minute")
async def upload_document(...): ...

@router.post("/chatbot/message")
@limiter.limit("30/minute")
async def send_message(...): ...

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(...): ...
```

---

## i18n — Bilingual UI (EN / VI)

### Thư viện & cấu hình

```
next-intl v3 — chuẩn cho Next.js 14 App Router
Locales:  vi (default), en
URL:      /vi/dashboard, /en/dashboard
```

### File structure

```
frontend/src/
├── messages/
│   ├── vi.json      ← Vietnamese (default)
│   └── en.json      ← English
├── i18n.ts          ← getRequestConfig
└── middleware.ts    ← locale routing
```

### Namespace & Key naming

Format: `namespace.key` hoặc `namespace.nested.key`

```
common.*          loading, error, save, cancel, confirm, back, search, submit
nav.*             dashboard, documents, riskMap, claims, analytics, chatbot, admin, reviewer
auth.*            login, register, logout, email, password, fullName, province, weakPassword
documents.*       upload, ocr, merge, export, confidence, needsReview, dragDrop
claims.status.*   pending, processing, approved, rejected, manualReview
geo.*             riskMap, riskScore, highRisk, recommendations, disasterTypes
chatbot.*         placeholder, typing, clearSession, suggestedActions
admin.*           users, policies, auditLogs, systemHealth, analytics
errors.*          unauthorized, forbidden, notFound, serverError, rateLimited, csrfFailed
```

### Server Component pattern

```typescript
// app/[locale]/dashboard/page.tsx
import { getTranslations } from 'next-intl/server';

export default async function DashboardPage() {
  const t = await getTranslations('nav');
  return <h1>{t('dashboard')}</h1>;
}
```

### Client Component pattern

```typescript
// components/documents/UploadButton.tsx
'use client';
import { useTranslations } from 'next-intl';

export function UploadButton() {
  const t = useTranslations('documents');
  return <button>{t('upload')}</button>;
}
```

### LanguageSwitcher

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

### messages/vi.json (cấu trúc mẫu)

```json
{
  "common": {
    "loading": "Đang tải...",
    "error": "Có lỗi xảy ra",
    "save": "Lưu",
    "cancel": "Hủy",
    "confirm": "Xác nhận",
    "back": "Quay lại",
    "search": "Tìm kiếm",
    "submit": "Gửi"
  },
  "nav": {
    "dashboard": "Tổng quan",
    "documents": "Tài liệu",
    "riskMap": "Bản đồ rủi ro",
    "claims": "Yêu cầu bồi thường",
    "analytics": "Phân tích",
    "chatbot": "Tư vấn AI"
  },
  "auth": {
    "login": "Đăng nhập",
    "register": "Đăng ký",
    "logout": "Đăng xuất",
    "email": "Email",
    "password": "Mật khẩu",
    "fullName": "Họ và tên",
    "province": "Tỉnh / Thành phố",
    "weakPassword": "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, thường và số"
  },
  "claims": {
    "submit": "Gửi yêu cầu",
    "status": {
      "pending": "Chờ xử lý",
      "processing": "Đang xử lý",
      "approved": "Đã duyệt",
      "rejected": "Từ chối",
      "manualReview": "Cần xét duyệt thủ công"
    }
  },
  "errors": {
    "unauthorized": "Vui lòng đăng nhập",
    "forbidden": "Bạn không có quyền thực hiện thao tác này",
    "notFound": "Không tìm thấy tài nguyên",
    "serverError": "Lỗi máy chủ, vui lòng thử lại",
    "rateLimited": "Quá nhiều yêu cầu, vui lòng đợi"
  }
}
```

### messages/en.json (cấu trúc tương tự)

```json
{
  "common": {
    "loading": "Loading...",
    "error": "An error occurred",
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "back": "Back",
    "search": "Search",
    "submit": "Submit"
  },
  "nav": {
    "dashboard": "Dashboard",
    "documents": "Documents",
    "riskMap": "Risk Map",
    "claims": "Claims",
    "analytics": "Analytics",
    "chatbot": "AI Advisor"
  },
  "auth": {
    "login": "Log In",
    "register": "Sign Up",
    "logout": "Log Out",
    "email": "Email",
    "password": "Password",
    "fullName": "Full Name",
    "province": "Province / City",
    "weakPassword": "Password must be at least 8 characters with uppercase, lowercase, and number"
  },
  "claims": {
    "submit": "Submit Claim",
    "status": {
      "pending": "Pending",
      "processing": "Processing",
      "approved": "Approved",
      "rejected": "Rejected",
      "manualReview": "Manual Review Required"
    }
  },
  "errors": {
    "unauthorized": "Please log in to continue",
    "forbidden": "You do not have permission to perform this action",
    "notFound": "Resource not found",
    "serverError": "Server error, please try again",
    "rateLimited": "Too many requests, please wait"
  }
}
```

### Quy tắc bắt buộc

| ✅ Đúng                                            | ❌ Sai                                       |
| ---------------------------------------------------- | -------------------------------------------- |
| `t('auth.login')`                                  | `"Đăng nhập"` hardcoded                 |
| `getTranslations('nav')` trong Server Component    | `useTranslations` trong Server Component   |
| `useTranslations('claims')` trong Client Component | Hardcode`"Approved"`                       |
| Key kiểu`camelCase`                               | Key kiểu`snake_case` hoặc `kebab-case` |
