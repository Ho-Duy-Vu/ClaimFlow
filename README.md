# ClaimFlow 🌊

> Nền tảng bảo hiểm thông minh — Xử lý tài liệu AI, phân tích rủi ro thiên tai, và tư vấn bảo hiểm cá nhân hóa cho thị trường Việt Nam.

---

## Giới thiệu

ClaimFlow là ứng dụng insurtech tích hợp AI giúp người dùng Việt Nam hiểu rõ rủi ro thiên tai tại địa phương, xử lý tài liệu bảo hiểm tự động, và nhận tư vấn gói bảo hiểm phù hợp — tất cả trong một nền tảng duy nhất.

Dự án được xây dựng trong context của CoverGo (insurtech), tích hợp các khái niệm System Design thực tế: LangGraph agent, RAG pipeline, event-driven architecture, message queue, WebSocket, và containerization.

---

## Tính năng chính

### 📄 Document Intelligence
- Upload nhiều tài liệu: CCCD, hợp đồng bảo hiểm, bằng lái xe, hộ chiếu, giấy đăng ký xe
- OCR tiếng Việt chính xác cao với Gemini Vision API
- Trích xuất dữ liệu có cấu trúc từ PDF/PNG/JPG/JPEG
- **Merge nhiều tài liệu** — loại bỏ field trùng lặp, hợp nhất thành 1 hồ sơ
- Visual region highlighting — đánh dấu vùng đã trích xuất
- Chỉnh sửa dữ liệu qua giao diện trực quan
- Export JSON và Markdown

### 📋 Insurance Registration Flow
- Sau khi OCR xong, nút **"Đăng ký bảo hiểm"** xuất hiện tự động
- Pre-fill thông tin khách hàng từ dữ liệu OCR (họ tên, ngày sinh, địa chỉ)
- Auto-detect tỉnh → fetch geo risk → hiển thị điểm rủi ro + đề xuất gói phù hợp
- 6 loại bảo hiểm: **Sức khỏe · Nhân thọ · Tài sản · Xe cộ · Thiên tai · Thu nhập**
- Mỗi loại có 3 gói: **Cơ Bản / Nâng Cao / Toàn Diện**
- Chọn gói → mua → UserPolicy active → có thể submit claim ngay

### 🌍 Geo Risk Intelligence
- Nhận diện vùng miền từ địa chỉ (23 tỉnh Bắc / 19 tỉnh Trung / 22 tỉnh Nam)
- Risk score theo tỉnh/vùng dựa trên dữ liệu thiên tai lịch sử
- Phát hiện tỉnh rủi ro cao: Quảng Bình, Hà Tĩnh, Nghệ An, Quảng Nam...
- Cảnh báo thiên tai: Bão, Lũ lụt, Ngập úng, Sạt lở
- Bản đồ choropleth tương tác (Leaflet) — GeoJSON WGS84 chuẩn
- Đề xuất gói bảo hiểm phù hợp theo rủi ro địa lý
- Province detection hỗ trợ tên không dấu và alias (HCM, TP HCM, Saigon, HN)

### 💬 AI Insurance Chatbot
- Powered by Google Gemini Pro
- Tư vấn bảo hiểm 24/7 — cá nhân hóa theo nhu cầu
- Giải thích thuật ngữ bảo hiểm bằng ngôn ngữ đơn giản
- Tư vấn theo vùng miền (Bắc/Trung/Nam)
- Cross-sell gợi ý combo: Nhân thọ + Sức khỏe + Thiên tai
- Bảo vệ thông tin nhạy cảm — không tiết lộ CCCD, địa chỉ chi tiết, SĐT
- **Trang chuyên dụng `/chatbot`** — full-page chat với suggestion chips + welcome block + typing indicator + session persist qua localStorage

### 🛡️ Insurance Browse & Buy (`/policies`)
- Trang riêng để xem và mua bảo hiểm — không còn ẩn trong flow OCR
- **Tab "Gói của tôi":** list tất cả gói với gradient card theo loại, filter Active/Expired/Cancelled, nút Cancel với confirm dialog, badge "còn X ngày" + cảnh báo gần hết hạn
- **Tab "Mua gói mới":** chọn 1 trong 6 loại → hiện 3 gói Cơ Bản / Nâng Cao / Toàn Diện, đánh dấu loại đã sở hữu để tránh mua trùng
- Stats banner: tổng số gói active + tổng coverage + tổng premium/năm

### 🏠 Dashboard (Homepage `/dashboard`)
- Welcome banner gradient với tên + subtitle theo role
- Snapshot cards theo role: Active Claims / Active Policies / Area Risk Score (user) / Pending Review (reviewer/admin)
- High-risk alert tự động khi user ở tỉnh `is_high_risk`
- Recent claims (5 mới nhất) + Quick action tiles (Submit Claim / Upload Doc / Buy Policy / Chatbot / Risk Map + extra theo role)
- My policies grid (6 gói active đầu tiên với policy number, premium, expiry)

### 🔍 Claim Processing (AI Agent)
- LangGraph 4-node workflow: `extract_data` → `check_coverage` → `fraud_detection` → `make_decision`
- RAG search trong policy documents (Qdrant)
- Validation: phải có UserPolicy active trước khi submit
- Real-time status update qua WebSocket
- Human review interface cho reviewer
- Analytics dashboard

### 📊 Analytics Dashboard (`/analytics`)
- 4 metric cards: Total Claims · Approval Rate · Avg Processing Time · Total Approved Amount
- Daily bar chart 30 ngày — total + approved layered
- Region pie chart (SVG thuần) — Bắc / Trung / Nam / unknown
- Top disaster types + claim types breakdown
- Backend scope tự động: admin/reviewer thấy all, user thường chỉ thấy claim của mình

### 🌐 Bilingual UI (EN / VI)
- Toàn bộ giao diện hỗ trợ 2 ngôn ngữ: Tiếng Việt (mặc định) và English
- Chuyển ngôn ngữ tức thì — không reload trang
- URL-based locale: `/vi/dashboard` · `/en/dashboard`
- Powered by **next-intl** (Next.js 14 App Router native)
- Tất cả labels, messages, error texts đều có bản dịch đầy đủ

---

## Tech Stack

### Frontend
| Công nghệ | Mục đích |
|---|---|
| Next.js 14 (App Router) | Framework React SSR/SSG |
| TypeScript | Type safety |
| Tailwind CSS + shadcn/ui | Styling + Component library |
| Leaflet + React Leaflet | Bản đồ tương tác rủi ro thiên tai |
| SVG thuần | Analytics charts (bar / pie / horizontal bars — không cần thư viện ngoài) |
| WebSocket API | Real-time claim status |
| next-intl | Bilingual UI — EN / VI (URL-based locale) |

### Backend
| Công nghệ | Mục đích |
|---|---|
| FastAPI | REST API async, tự gen OpenAPI docs |
| Beanie + Motor | Async ODM cho MongoDB |
| Celery + Redis | Async task queue + Message broker |
| slowapi | Rate limiting per endpoint per IP |
| JWT (HS256) | Authentication — 7 ngày expire, httpOnly cookie |
| bcrypt (cost 12) | Password hashing |
| Pydantic | Input validation + schemas |

### AI Layer
| Công nghệ | Mục đích |
|---|---|
| Google Gemini Vision (`gemini-1.5-flash`) | OCR tiếng Việt + Document parsing |
| Google Gemini Pro (`gemini-1.5-pro`) | LLM chatbot + RAG reasoning |
| Google text-embedding-004 | Embedding cho vector search |
| LangGraph | Orchestrate AI agent workflow |
| LangChain | RAG pipeline, tool integration |
| Qdrant | Vector database cho RAG |
| PyMuPDF | Extract text từ PDF nhiều trang |

### Infrastructure
| Công nghệ | Mục đích |
|---|---|
| MongoDB 7.0 | Primary database (document store) |
| Redis | Cache + Celery broker + Pub/Sub |
| MinIO (dev) / AWS S3 (prod) | File storage |
| Docker Compose | Development environment |
| GitHub Actions | CI/CD pipeline |

---

## Kiến trúc hệ thống

```
┌──────────────────────────────────────────────────────────┐
│                      Client Layer                        │
│    Next.js 14 — React + TypeScript + Tailwind + Leaflet  │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTP REST + WebSocket
┌───────────────────────▼──────────────────────────────────┐
│                API Gateway + Auth                        │
│      FastAPI — JWT · Rate Limiting · CORS · Routing      │
└──────┬──────────────┬───────────────┬────────────────────┘
       │              │               │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────────┐
│  Document   │ │  Geo Risk  │ │   Chatbot      │
│  Service    │ │  Service   │ │   Service      │
│             │ │            │ │                │
│ OCR·Merge   │ │ Province   │ │ Gemini Pro     │
│ Gemini      │ │ Risk Score │ │ RAG · Memory   │
│ Vision      │ │ Map data   │ │ Privacy guard  │
└──────┬──────┘ └─────┬──────┘ └─────┬──────────┘
       │              │               │
┌──────▼──────────────▼───────────────▼──────────┐
│          Message Queue (Redis + Celery)         │
│   Document jobs · AI inference · Notifications  │
└──────┬──────────────┬───────────────┬───────────┘
       │              │               │
┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│  MongoDB    │ │   Qdrant   │ │  MinIO/S3  │
│             │ │            │ │            │
│ Users·Docs  │ │ Policy RAG │ │ PDF·Images │
│ Claims·Risk │ │ Vectors    │ │ Documents  │
│ UserPolicies│ └────────────┘ └────────────┘
└─────────────┘
```

### AI Agent Flow (Claim Processing)

```
Submit claim
      │
      ▼
[Node 1] extract_data
  Gemini Vision OCR → parse structured data từ text
  Xác định province, disaster_type, amount
      │
      ▼
[Node 2] check_coverage
  RAG search Qdrant → kiểm tra điều khoản bảo hiểm
  Covered? Coverage limit? → is_covered + coverage_limit
      │
      ▼
[Node 3] fraud_detection
  Amount anomaly? Duplicate claim? Provider whitelist?
  Fraud score: 0–100 + fraud_flags list
      │
      ▼
[Node 4] make_decision
  score < 30 + covered   → APPROVE
  not covered            → REJECT + reason
  score > 70             → MANUAL REVIEW
  thiếu thông tin        → NEED MORE INFO
      │
      ▼
  WebSocket push → Client real-time
```

### Luồng đăng ký bảo hiểm (Insurance Registration)

```
User upload CCCD / tài liệu
      │
      ▼
OCR done → extracted_data có địa chỉ
      │
      ▼
Nút "Đăng ký bảo hiểm" xuất hiện
      │
      ▼
InsuranceRegistrationModal mở
  ├── Pre-fill thông tin từ structured_data
  ├── Auto-detect tỉnh từ place_of_origin / place_of_residence
  └── Fetch GET /geo-risk/province/{name}
      │
      ▼
Hiển thị risk score + recommended packages
  ├── Sức khỏe (health)   — 3 gói: Cơ Bản / Nâng Cao / Toàn Diện
  ├── Nhân thọ (life)
  ├── Tài sản (property)
  ├── Xe cộ (vehicle)
  ├── Thiên tai (disaster) ← ưu tiên cao nếu tỉnh rủi ro cao
  └── Thu nhập (income)
      │
      ▼
User chọn gói → POST /policies/purchase
      │
      ▼
UserPolicy active → có thể submit claim ngay
```

### Geo Intelligence Flow

```
User nhập địa chỉ
      │
      ▼
Geo Service nhận diện tỉnh/vùng miền
  (_normalize_vn: strip diacritics + alias matching)
      │
      ▼
Risk Score Engine
  ├── Dữ liệu thiên tai lịch sử
  ├── Phân loại rủi ro: Bão / Lũ / Sạt lở / Ngập úng
  └── Score theo tỉnh (0–100)
      │
      ▼
Insurance Recommendation AI
  ├── 95% risk → Bảo hiểm bão bắt buộc
  ├── 90% risk → Bảo hiểm ngập nước
  └── Combo suggestion: Nhân thọ + Sức khỏe + Thiên tai
      │
      ▼
Hiển thị bản đồ Leaflet choropleth + Báo cáo rủi ro
(GeoJSON WGS84 từ static file vietnam-provinces.geojson)
```

---

## Cấu trúc thư mục

```
claimflow/
├── backend/
│   └── app/
│       ├── api/routes/
│       │   ├── auth.py
│       │   ├── documents.py        # Upload, OCR, merge
│       │   ├── geo_risk.py         # Province risk analysis
│       │   ├── chatbot.py          # AI chatbot endpoint
│       │   ├── claims.py           # Claim processing
│       │   ├── user_policies.py    # Insurance registration + purchase
│       │   ├── analytics.py
│       │   ├── reviewer.py
│       │   └── admin.py
│       ├── core/
│       │   ├── config.py
│       │   ├── security.py         # JWT + bcrypt
│       │   ├── database.py         # MongoDB + Beanie init (incl. UserPolicy)
│       │   ├── middleware.py       # Request ID + CSRF
│       │   └── rate_limit.py       # slowapi setup
│       ├── models/
│       │   ├── user.py
│       │   ├── document.py         # OCR document model
│       │   ├── claim.py
│       │   ├── geo_risk.py         # Province risk data
│       │   ├── chat_session.py
│       │   ├── policy.py           # RAG policy documents
│       │   ├── user_policy.py      # User insurance registrations (NEW)
│       │   └── audit_log.py
│       ├── schemas/
│       ├── services/
│       │   ├── ai/
│       │   │   ├── agent.py        # LangGraph workflow
│       │   │   ├── nodes.py        # 4 agent nodes
│       │   │   ├── rag.py          # RAG pipeline
│       │   │   ├── ocr.py          # Gemini Vision OCR
│       │   │   ├── merger.py       # Document merge logic
│       │   │   └── chatbot.py      # Gemini Pro chatbot
│       │   ├── geo/
│       │   │   ├── province_data.py   # Static risk data 64 tỉnh
│       │   │   └── risk_engine.py     # Risk scoring + province detection
│       │   ├── province_mapper.py     # province → region lookup
│       │   ├── storage.py
│       │   └── notification.py
│       ├── tasks/
│       │   └── document_processor.py
│       └── main.py
├── frontend/
│   └── src/
│       ├── app/
│       │   └── [locale]/           # next-intl locale segment
│       │       ├── (auth)/login · register
│       │       └── (app)/          # group layout with Sidebar
│       │           ├── dashboard/    # Homepage — Welcome + snapshots + recent claims + quick actions
│       │           │   ├── page.tsx
│       │           │   └── DashboardClient.tsx
│       │           ├── documents/    # Upload + OCR UI
│       │           │   ├── page.tsx
│       │           │   └── DocumentsClient.tsx
│       │           ├── risk-map/     # Leaflet choropleth
│       │           │   ├── page.tsx
│       │           │   └── RiskMapClient.tsx
│       │           ├── claims/       # Claim list + detail modal + submit form
│       │           │   ├── page.tsx
│       │           │   └── ClaimsClient.tsx
│       │           ├── policies/     # NEW: Browse + Buy insurance + My policies
│       │           │   ├── page.tsx
│       │           │   └── PoliciesClient.tsx
│       │           ├── analytics/    # Charts dashboard
│       │           │   ├── page.tsx
│       │           │   └── AnalyticsClient.tsx
│       │           ├── chatbot/      # Full-page AI advisor (replaces floating widget)
│       │           │   ├── page.tsx
│       │           │   └── ChatbotClient.tsx
│       │           ├── reviewer/     # Reviewer queue + personal stats
│       │           │   ├── page.tsx
│       │           │   └── ReviewerClient.tsx
│       │           └── admin/        # 5 tabs: Users · Analytics · Policies · Audit Logs · Health
│       │               ├── page.tsx
│       │               └── AdminClient.tsx
│       ├── components/
│       │   ├── documents/
│       │   │   ├── InsuranceRegistrationModal.tsx   # Pre-fill flow từ OCR
│       │   │   └── (upload, merge, highlight...)
│       │   ├── risk-map/
│       │   │   └── LeafletMap.tsx  # Choropleth map
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx              # Role-based nav + user info + logout
│       │   │   └── LanguageSwitcher.tsx     # EN ↔ VI toggle
│       │   └── ui/                 # shadcn components
│       ├── messages/
│       │   ├── vi.json             # Vietnamese strings (default)
│       │   └── en.json             # English strings
│       ├── i18n.ts                 # next-intl config
│       ├── middleware.ts           # locale detection + routing
│       ├── lib/
│       │   ├── api.ts
│       │   └── websocket.ts
│       └── types/
├── scripts/
│   └── build_vn_geojson.py        # Convert GeoJSON UTM48N → WGS84 (pyproj)
├── sample_data/
│   ├── policies/                   # Policy docs cho RAG
│   ├── province_risk.json          # Risk data 64 tỉnh
│   └── generate_sample_pdfs.py
├── public/
│   └── vietnam-provinces.geojson  # 72KB static WGS84 GeoJSON (frontend)
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── README.md
├── TASKS.md
├── SCHEMA.md
├── ARCHITECTURE.md
├── CONVENTIONS.md
├── API.md
└── ERRORS.md
```

---

## Loại bảo hiểm

ClaimFlow hỗ trợ 6 nhóm bảo hiểm, mỗi nhóm có 3 gói (Cơ Bản / Nâng Cao / Toàn Diện):

| Loại | Mã | Mô tả |
|---|---|---|
| **Sức khỏe** | `health` | Khám chữa bệnh, nội trú, ngoại trú, phẫu thuật |
| **Nhân thọ** | `life` | Bảo vệ thu nhập gia đình, tử vong, thương tật |
| **Tài sản** | `property` | Nhà ở, đồ dùng, thiệt hại do thiên tai hoặc trộm cắp |
| **Xe cộ** | `vehicle` | Tai nạn xe, va chạm, trộm cắp phương tiện |
| **Thiên tai** | `disaster` | Bão, lũ lụt, sạt lở, ngập úng — ưu tiên vùng rủi ro cao |
| **Thu nhập** | `income` | Mất việc làm, tai nạn lao động, an sinh xã hội |

---

## Phân quyền (Authorization)

ClaimFlow có 3 roles với quyền hạn khác nhau. Sidebar tự động filter các trang theo role:

| Trang | user | reviewer | admin |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Documents | ✅ | ✅ | ✅ |
| Risk Map | ✅ | ✅ | ✅ |
| Claims | ✅ | ✅ | ✅ |
| **Policies (Bảo hiểm)** | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ |
| Chatbot | ✅ | ✅ | ✅ |
| Reviewer | ❌ | ✅ | ✅ |
| Admin | ❌ | ❌ | ✅ |

**Defense-in-depth:** Sidebar ẩn link + page tự gọi `/auth/me` redirect nếu sai role + backend dependency `require_admin`/`require_reviewer` trả 403.

### Admin Dashboard (`/admin`) — 5 tabs
- **Users tab:** Bảng tất cả users, filter role/status, dropdown đổi role inline, nút Activate/Deactivate
- **Analytics tab:** Full system metrics — total users, claims, approval rate, fraud rate, top high-risk provinces, reviewer performance table, daily bar chart, region breakdown
- **Policies tab:** Upload policy mới (auto-trigger Celery ingest vào Qdrant), grid card hiển thị chunk count + last ingested, nút Delete (xóa cả vectors)
- **Audit Logs tab:** Timeline mọi action với filter theo action type + target type + from_date
- **System Health tab:** Card status realtime của MongoDB, Redis, Qdrant, Celery — hiển thị latency_ms + workers + collections

### Reviewer Dashboard (`/reviewer`)
- **Queue panel:** claims `manual_review` sort oldest first, filter province/disaster_type/min fraud score, badge "đã chờ X phút/giờ"
- **Detail panel:** AI reasoning đầy đủ + fraud gauge progress bar + fraud flags list + attached documents
- **Decision:** Approve hoặc Reject với note bắt buộc + amount_approved editable
- **Stats banner:** Pending in queue · Reviewed today · Reviewed this week · Avg review time · Override rate

---

## Bảo mật

### Authentication
- JWT HS256, expire 7 ngày (10080 phút)
- Password: bcrypt cost factor 12, min 8 ký tự, phải có chữ hoa + chữ thường + số
- Token lưu **httpOnly cookie** (không localStorage — tránh XSS)

### CSRF Protection
httpOnly cookie ngăn XSS nhưng tạo CSRF vulnerability. Giải pháp Double Submit Cookie:
- Login set 2 cookie: `access_token` (httpOnly) + `csrf_token` (non-httpOnly)
- Frontend đọc `csrf_token` và attach vào header `X-CSRF-Token`
- Middleware verify header == cookie trước mọi mutating request

### CORS Policy
```
Allowed Origins: http://localhost:3000, http://localhost:5173, production URL
Methods: GET, POST, PUT, DELETE, PATCH
Headers: Content-Type, Authorization, X-CSRF-Token
Credentials: true
```

### Rate Limiting (per IP)
```
POST /auth/login        → 5/phút   (chống brute force)
POST /documents/upload  → 10/phút  (OCR nặng)
POST /chatbot/message   → 30/phút  (chat bình thường)
```

### Data Protection
- Không tiết lộ CCCD, địa chỉ chi tiết, SĐT trong chatbot response
- Prompt injection defense — block "ignore previous instructions" và tương tự
- Chỉ dùng vùng miền (Bắc/Trung/Nam) để tư vấn
- Input validation toàn bộ qua Pydantic schemas + sanitize function
- Request ID header (`X-Request-ID`) cho mọi response — trace bug dễ hơn

### OCR Privacy
- File hash (MD5) cache OCR results — cùng file không gọi Gemini API 2 lần
- Confidence threshold 0.7 — field dưới ngưỡng được flag "Cần xác nhận"
- Không lưu raw image vào DB — chỉ lưu extracted text và S3 key

---

## Cài đặt & Chạy local

### Yêu cầu
- Docker Desktop, Python 3.11+, Node.js 18+

### 1. Clone và cấu hình
```bash
git clone https://github.com/your-username/claimflow.git
cd claimflow
cp .env.example .env
# Điền GEMINI_API_KEY vào .env
```

### 2. Chạy với Docker Compose
```bash
docker compose up -d
cd backend && python scripts/seed.py
cd backend && python scripts/ingest_policies.py
```

### 3. Chạy riêng lẻ
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
celery -A app.tasks worker --loglevel=info

# Frontend
cd frontend && npm install && npm run dev
```

### 4. Build GeoJSON (nếu cần rebuild)
```bash
cd backend
pip install pyproj
python scripts/build_vn_geojson.py
# Output: ../frontend/public/vietnam-provinces.geojson
```

### Truy cập
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs
- Qdrant: http://localhost:6333/dashboard
- MinIO: http://localhost:9001

---

## Environment Variables

```env
GEMINI_API_KEY=AIza...
# Local MongoDB (không qua docker, không auth):
MONGODB_URL=mongodb://localhost:27017
# Docker mongo trong docker-compose dùng port 27018 và auth admin:admin@
# MONGODB_URL=mongodb://admin:admin@localhost:27018
MONGODB_DB_NAME=claimflow_db
REDIS_URL=redis://localhost:6379
SECRET_KEY=change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_BUCKET_NAME=claimflow-documents
S3_ENDPOINT_URL=http://localhost:9000
QDRANT_URL=http://localhost:6333
RESEND_API_KEY=re_...
```

---

## System Design Concepts Áp dụng

| Concept | Áp dụng trong ClaimFlow |
|---|---|
| Message Queue | Redis + Celery xử lý OCR job async |
| Pub/Sub | Redis Pub/Sub → WebSocket push real-time |
| Event-Driven | Submit doc → event → worker → AI → notify |
| RAG | Qdrant vector search policy cho claim check |
| LangGraph Agent | 4-node stateful workflow, conditional routing, auto-retry |
| API Gateway | FastAPI: auth + rate limit + CSRF + routing tập trung |
| Embedded Documents | DocumentEmbed trong Claim, ChatMessage trong Session |
| Database Indexing | Index user_id, status, province, file_hash, created_at |
| Containerization | Docker Compose 5 services |
| CQRS (nhẹ) | Write: Celery worker / Read: API GET tách biệt |
| Geo Intelligence | Province risk scoring + Leaflet map visualization |
| Data Privacy | PII protection, prompt injection defense, CSRF protection |
| Caching | OCR result cache bằng MD5 file hash |
| Rate Limiting | slowapi per endpoint per IP |
| Distributed Tracing | Request ID header trên mọi response |
| Coordinate Conversion | pyproj UTM48N → WGS84 cho GeoJSON chuẩn |

---

## Tác giả

**Hồ Duy Vũ** — AI Engineer Intern @ CoverGo
vu.hoduy@covergo.com

---

## License

MIT License
