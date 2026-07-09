# ClaimFlow 🌊

> AI-powered insurtech platform — automated document processing, natural-disaster risk analytics, and personalized insurance advisory, built for the Vietnamese market.

**Language:** 🇬🇧 English (primary) · 🇻🇳 Tiếng Việt — *click the collapsible section just below to expand the Vietnamese version*

<details>
<summary>🇻🇳 <b>Phiên bản Tiếng Việt</b> — nhấp để mở / click to expand</summary>

<br>

## Giới thiệu

ClaimFlow là ứng dụng insurtech tích hợp AI giúp người dùng Việt Nam hiểu rõ rủi ro thiên tai tại địa phương, xử lý tài liệu bảo hiểm tự động, và nhận tư vấn gói bảo hiểm phù hợp — tất cả trong một nền tảng duy nhất.

Dự án là một sản phẩm insurtech cá nhân, tích hợp các khái niệm System Design thực tế: LangGraph agent, RAG pipeline, event-driven architecture, message queue, WebSocket, và containerization.

## Tính năng chính

- **📄 Document Intelligence** — OCR tiếng Việt độ chính xác cao (Gemini Vision), trích xuất dữ liệu có cấu trúc từ PDF/PNG/JPG, merge nhiều tài liệu (loại field trùng), highlight vùng đã trích xuất, chỉnh sửa trực quan, export JSON/Markdown.
- **📋 Insurance Registration Flow** — sau OCR hiện nút "Đăng ký bảo hiểm", pre-fill thông tin khách hàng, auto-detect tỉnh → fetch geo risk → đề xuất gói. 6 loại × 3 gói (Cơ Bản / Nâng Cao / Toàn Diện).
- **🌍 Geo Risk Intelligence** — risk score theo tỉnh/vùng miền (Bắc/Trung/Nam), cảnh báo Bão/Lũ/Ngập/Sạt lở, bản đồ choropleth Leaflet (GeoJSON WGS84), nhận diện tỉnh không dấu + alias (HCM, Saigon, HN).
- **💬 AI Insurance Chatbot** — Gemini Pro tư vấn 24/7 theo vùng miền, cross-sell combo, bảo vệ PII (không lộ CCCD/SĐT/địa chỉ), trang chuyên dụng `/chatbot`.
- **🛡️ Insurance Browse & Buy (`/policies`)** — Tab "Gói của tôi" (filter Active/Expired/Cancelled, cancel có confirm, badge còn X ngày) + Tab "Mua gói mới".
- **🏠 Dashboard** — welcome banner theo role, snapshot cards, high-risk alert, recent claims, quick actions, my policies grid.
- **🔍 Claim Processing (AI Agent)** — LangGraph 4 node `extract_data → check_coverage → fraud_detection → make_decision`, RAG trên Qdrant, real-time qua WebSocket, human review.
- **📊 Analytics Dashboard (`/analytics`)** — 4 metric card, daily bar chart, region pie (SVG thuần), disaster/claim type breakdown, scope tự động theo role.
- **🔔 Notification Center** — thông báo in-app realtime (WebSocket per-user): claim được duyệt/chi trả, cần bổ sung, mua/gia hạn/sắp hết hạn gói. Chuông + badge chưa đọc trên header.
- **💳 Payment & Renewal** — lịch đóng phí theo kỳ (tháng/quý/năm) + đóng phí mô phỏng (QR ngân hàng giả lập) + biên lai PDF; nhắc gói sắp hết hạn (≤30 ngày) + gia hạn 1 chạm.
- **🌗 Dark mode & Mobile** — chuyển sáng/tối (nhớ lựa chọn), sidebar dạng drawer + header responsive cho màn hình nhỏ.
- **🌐 Bilingual UI (EN / VI)** — chuyển ngôn ngữ tức thì, URL-based locale `/vi` · `/en`, powered by next-intl.

## Loại bảo hiểm

| Loại | Mã | Mô tả |
|---|---|---|
| **Sức khỏe** | `health` | Khám chữa bệnh, nội trú, ngoại trú, phẫu thuật |
| **Nhân thọ** | `life` | Bảo vệ thu nhập gia đình, tử vong, thương tật |
| **Tài sản** | `property` | Nhà ở, đồ dùng, thiệt hại do thiên tai hoặc trộm cắp |
| **Xe cộ** | `vehicle` | Tai nạn xe, va chạm, trộm cắp phương tiện |
| **Thiên tai** | `disaster` | Bão, lũ lụt, sạt lở, ngập úng — ưu tiên vùng rủi ro cao |
| **Thu nhập** | `income` | Mất việc làm, tai nạn lao động, an sinh xã hội |

## Phân quyền

3 roles: **user** (tài liệu + claims của mình, chatbot, geo risk), **reviewer** (tất cả claims, override AI, queue & stats), **admin** (tất cả + quản lý user/policy, audit logs, system health). Defense-in-depth: Sidebar ẩn link + page redirect nếu sai role + backend dependency `require_admin`/`require_reviewer` trả 403.

## Bảo mật

- **Auth:** JWT HS256 expire 7 ngày, bcrypt cost 12, token trong httpOnly cookie (không localStorage).
- **CSRF:** Double Submit Cookie — verify header `X-CSRF-Token` == cookie trước mọi mutating request.
- **Rate limiting** per IP (login 5/phút, upload 10/phút, chat 30/phút).
- **Data protection:** không lộ PII trong chatbot, prompt injection defense, input validation qua Pydantic, Request ID mọi response.
- **OCR:** cache theo MD5 file hash, confidence threshold 0.7 flag "Cần xác nhận".

## Cài đặt & Chạy local

```bash
git clone https://github.com/Ho-Duy-Vu/ClaimFlow.git
cd ClaimFlow
cp .env.example .env          # điền GEMINI_API_KEY
docker compose up -d
cd backend && pip install -r requirements.txt && python scripts/seed.py && python scripts/ingest_policies.py
uvicorn app.main:app --reload --port 8000
celery -A app.tasks worker --loglevel=info --pool=solo
cd ../frontend && npm install && npm run dev
```

Truy cập: Frontend http://localhost:3000 · API Docs http://localhost:8000/docs · Qdrant http://localhost:6333/dashboard · MinIO http://localhost:9001

> 💡 Trên Windows có thể dùng `.\start-all.ps1` để mở cả 4 terminal (Infra · Backend · Celery · Frontend) trong Windows Terminal — xem `Start.md`.

</details>

---

## Overview

ClaimFlow is an AI-integrated insurtech application that helps users in Vietnam understand local natural-disaster risk, process insurance documents automatically, and receive tailored policy recommendations — all within a single platform.

It is a personal insurtech product that puts real-world system-design concepts into practice: a LangGraph agent, a RAG pipeline, event-driven architecture, a message queue, WebSockets, and containerization.

---

## Key Features

### 📄 Document Intelligence
- Upload multiple document types: national ID (CCCD), insurance contracts, driver's licenses, passports, and vehicle registrations
- High-accuracy Vietnamese OCR powered by the Gemini Vision API
- Structured data extraction from PDF / PNG / JPG / JPEG
- **Multi-document merge** — deduplicates overlapping fields and consolidates everything into a single profile
- Visual region highlighting to mark extracted areas
- Inline editing of extracted data through an intuitive UI
- Export to JSON and Markdown

### 📋 Insurance Registration Flow
- An **"Register insurance"** button appears automatically once OCR completes
- Customer details are pre-filled from the OCR result (full name, date of birth, address)
- Auto-detects the province → fetches geo risk → shows the risk score and recommended plans
- Six insurance categories: **Health · Life · Property · Vehicle · Disaster · Income**
- Each category offers three tiers: **Basic / Advanced / Comprehensive**
- Pick a plan → purchase → the `UserPolicy` becomes active → you can file a claim immediately

### 🌍 Geo Risk Intelligence
- Region detection from an address (23 northern / 19 central / 22 southern provinces)
- Per-province and per-region risk scoring based on historical disaster data
- Flags high-risk provinces such as Quảng Bình, Hà Tĩnh, Nghệ An, and Quảng Nam
- Disaster alerts: typhoons, floods, waterlogging, and landslides
- Interactive Leaflet choropleth map built on standard WGS84 GeoJSON
- Insurance recommendations aligned with geographic risk
- Province detection handles diacritic-free names and aliases (HCM, TP HCM, Saigon, HN)

### 💬 AI Insurance Chatbot
- Powered by Google Gemini Pro
- 24/7 insurance advice, personalized to the user's needs
- Explains insurance terminology in plain language
- Region-aware guidance (North / Central / South)
- Cross-sell suggestions for bundles, e.g. Life + Health + Disaster
- Protects sensitive data — never discloses the CCCD number, detailed address, or phone number
- **Dedicated `/chatbot` page** — a full-page chat with suggestion chips, a welcome block, a typing indicator, and session persistence via localStorage

### 🛡️ Insurance Browse & Buy (`/policies`)
- A standalone page to view and purchase insurance — no longer buried inside the OCR flow
- **"My plans" tab:** lists every policy with a category-themed gradient card, an Active/Expired/Cancelled filter, a Cancel action guarded by a confirmation dialog, and a "X days left" badge with near-expiry warnings
- **"Buy a new plan" tab:** pick one of the six categories → see the Basic / Advanced / Comprehensive tiers, with already-owned categories marked to prevent duplicate purchases
- Stats banner: total active plans + total coverage + total annual premium

### 🏠 Dashboard (Home — `/dashboard`)
- Gradient welcome banner with the user's name and a role-based subtitle
- Role-based snapshot cards: Active Claims / Active Policies / Area Risk Score (user) / Pending Review (reviewer & admin)
- Automatic high-risk alert when the user lives in an `is_high_risk` province
- Recent claims (five latest) plus quick-action tiles (Submit Claim / Upload Doc / Buy Policy / Chatbot / Risk Map, with extras by role)
- "My policies" grid (first six active plans with policy number, premium, and expiry)

### 🔍 Claim Processing (AI Agent)
- A four-node LangGraph workflow: `extract_data` → `check_coverage` → `fraud_detection` → `make_decision`
- RAG search over policy documents (Qdrant)
- Validation: an active `UserPolicy` is required before a claim can be submitted
- Real-time status updates over WebSocket
- Human-review interface for reviewers
- Analytics dashboard

### 📊 Analytics Dashboard (`/analytics`)
- Four metric cards: Total Claims · Approval Rate · Avg. Processing Time · Total Approved Amount
- 30-day daily bar chart — total and approved, layered
- Region pie chart (pure SVG) — North / Central / South / unknown
- Top disaster types and claim-type breakdowns
- Automatic backend scoping: admins and reviewers see everything; regular users see only their own claims

### 🔔 Notification Center
- Real-time in-app notifications over a **per-user WebSocket** channel (`/notifications/ws`)
- Fires on claim reviewed / paid / info-requested, policy purchased / renewed / expiring / expired
- Header bell with an unread badge, a dropdown inbox, mark-as-read and mark-all-read
- Every notification is persisted, so it's there even if the user was offline

### 💳 Payments & Renewal
- Premium **payment schedule** generated on purchase from the chosen frequency (monthly / quarterly / yearly)
- Pay each installment (simulated — local demo, with a mock bank QR) and download a **PDF receipt**
- Policy **expiry reminders** (≤ 30 days, idempotent) via both a lazy check and a daily Celery beat job
- One-click **renewal** that chains a new policy from the current one and regenerates the schedule

### 🌗 Dark Mode & Mobile
- Light/dark theme toggle, persisted to `localStorage` and honoring `prefers-color-scheme`
- Responsive app shell: the sidebar becomes a slide-in drawer with a hamburger on small screens

### 🌐 Bilingual UI (EN / VI)
- The entire interface is available in two languages: Vietnamese (default) and English
- Instant language switching — no page reload
- URL-based locale: `/vi/dashboard` · `/en/dashboard`
- Powered by **next-intl** (native to the Next.js 14 App Router)
- All labels, messages, and error texts are fully translated

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| Next.js 14 (App Router) | React SSR/SSG framework |
| TypeScript | Type safety |
| Tailwind CSS + shadcn/ui | Styling + component library |
| Leaflet + React Leaflet | Interactive natural-disaster risk map |
| Pure SVG | Analytics charts (bar / pie / horizontal bars — no external library) |
| WebSocket API | Real-time claim status |
| next-intl | Bilingual UI — EN / VI (URL-based locale) |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | Async REST API with auto-generated OpenAPI docs |
| Beanie + Motor | Async ODM for MongoDB |
| Celery + Redis | Async task queue + message broker |
| slowapi | Per-endpoint, per-IP rate limiting |
| JWT (HS256) | Authentication — 7-day expiry, httpOnly cookie |
| bcrypt (cost 12) | Password hashing |
| Pydantic | Input validation + schemas |

### AI Layer
| Technology | Purpose |
|---|---|
| Google Gemini Vision (`gemini-1.5-flash`) | Vietnamese OCR + document parsing |
| Google Gemini Pro (`gemini-1.5-pro`) | LLM chatbot + RAG reasoning |
| Google text-embedding-004 | Embeddings for vector search |
| LangGraph | Orchestrates the AI agent workflow |
| LangChain | RAG pipeline + tool integration |
| Qdrant | Vector database for RAG |
| PyMuPDF | Text extraction from multi-page PDFs |

### Infrastructure
| Technology | Purpose |
|---|---|
| MongoDB 7.0 | Primary database (document store) |
| Redis | Cache + Celery broker + Pub/Sub |
| MinIO (dev) / AWS S3 (prod) | File storage |
| Docker Compose | Development environment |
| GitHub Actions | CI/CD pipeline |

---

## System Architecture

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
  Gemini Vision OCR → parse structured data from text
  Determine province, disaster_type, amount
      │
      ▼
[Node 2] check_coverage
  RAG search in Qdrant → verify policy terms
  Covered? Coverage limit? → is_covered + coverage_limit
      │
      ▼
[Node 3] fraud_detection
  Amount anomaly? Duplicate claim? Provider whitelist?
  Fraud score: 0–100 + list of fraud_flags
      │
      ▼
[Node 4] make_decision
  score < 30 and covered → APPROVE
  not covered            → REJECT + reason
  score > 70             → MANUAL REVIEW
  missing information     → NEED MORE INFO
      │
      ▼
  WebSocket push → client in real time
```

### Insurance Registration Flow

```
User uploads CCCD / document
      │
      ▼
OCR done → extracted_data includes an address
      │
      ▼
"Register insurance" button appears
      │
      ▼
InsuranceRegistrationModal opens
  ├── Pre-fills details from structured_data
  ├── Auto-detects province from place_of_origin / place_of_residence
  └── Fetches GET /geo-risk/province/{name}
      │
      ▼
Shows risk score + recommended packages
  ├── Health   — 3 tiers: Basic / Advanced / Comprehensive
  ├── Life
  ├── Property
  ├── Vehicle
  ├── Disaster ← prioritized for high-risk provinces
  └── Income
      │
      ▼
User picks a plan → POST /policies/purchase
      │
      ▼
UserPolicy active → can file a claim immediately
```

### Geo Intelligence Flow

```
User enters an address
      │
      ▼
Geo Service detects the province / region
  (_normalize_vn: strip diacritics + alias matching)
      │
      ▼
Risk Score Engine
  ├── Historical disaster data
  ├── Risk classification: Typhoon / Flood / Landslide / Waterlogging
  └── Per-province score (0–100)
      │
      ▼
Insurance Recommendation AI
  ├── 95% risk → mandatory typhoon insurance
  ├── 90% risk → flood insurance
  └── Bundle suggestion: Life + Health + Disaster
      │
      ▼
Renders a Leaflet choropleth map + a risk report
(WGS84 GeoJSON from the static file vietnam-provinces.geojson)
```

---

## Project Structure

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
│       │   ├── user_policy.py      # User insurance registrations
│       │   └── audit_log.py
│       ├── schemas/
│       ├── services/
│       │   ├── ai/
│       │   │   ├── agent.py        # LangGraph workflow
│       │   │   ├── rag.py          # RAG pipeline
│       │   │   ├── ocr.py          # Gemini Vision OCR
│       │   │   ├── merger.py       # Document merge logic
│       │   │   └── chatbot.py      # Gemini Pro chatbot
│       │   ├── geo/
│       │   │   └── risk_engine.py  # Risk scoring + province detection
│       │   ├── province_mapper.py  # province → region lookup
│       │   └── storage.py
│       ├── tasks/
│       │   └── document_processor.py
│       └── main.py
├── frontend/
│   └── src/
│       ├── app/
│       │   └── [locale]/           # next-intl locale segment
│       │       ├── (auth)/login · register
│       │       └── (app)/          # group layout with Sidebar
│       │           ├── dashboard/  # Home — welcome + snapshots + recent claims + quick actions
│       │           ├── documents/  # Upload + OCR UI
│       │           ├── risk-map/   # Leaflet choropleth
│       │           ├── claims/     # Claim list + detail modal + submit wizard
│       │           ├── policies/   # Browse + buy insurance + my policies
│       │           ├── analytics/  # Charts dashboard
│       │           ├── chatbot/    # Full-page AI advisor
│       │           ├── reviewer/   # Reviewer queue + personal stats
│       │           └── admin/      # 5 tabs: Users · Analytics · Policies · Audit Logs · Health
│       ├── components/
│       │   ├── documents/          # OCR upload, merge, bbox highlight, registration modal
│       │   ├── risk-map/           # LeafletMap (choropleth)
│       │   ├── layout/             # Sidebar (role-based) + LanguageSwitcher
│       │   └── ui/                 # shadcn components (incl. PasswordInput)
│       ├── messages/
│       │   ├── vi.json             # Vietnamese strings (default)
│       │   └── en.json             # English strings
│       ├── i18n.ts                 # next-intl config
│       ├── middleware.ts           # locale detection + routing
│       ├── lib/                    # api.ts, provinces.ts, utils.ts
│       └── types/
├── backend/scripts/
│   └── build_vn_geojson.py         # Convert GeoJSON UTM48N → WGS84 (pyproj)
├── frontend/public/
│   └── vietnam-provinces.geojson   # ~72 KB static WGS84 GeoJSON
├── docker-compose.yml
├── .env.example
├── start-all.ps1                   # One-command launcher (Windows Terminal)
├── CLAUDE.md · README.md · TASKS.md · SCHEMA.md · ARCHITECTURE.md · API.md
```

---

## Insurance Categories

ClaimFlow supports six insurance groups, each with three tiers (Basic / Advanced / Comprehensive):

| Category | Code | Description |
|---|---|---|
| **Health** | `health` | Medical care, inpatient, outpatient, surgery |
| **Life** | `life` | Family income protection, death, disability |
| **Property** | `property` | Home and belongings, damage from disasters or theft |
| **Vehicle** | `vehicle` | Vehicle accidents, collisions, theft |
| **Disaster** | `disaster` | Typhoons, floods, landslides, waterlogging — prioritized in high-risk regions |
| **Income** | `income` | Job loss, workplace accidents, social security |

---

## Authorization

ClaimFlow defines three roles with distinct permissions. The sidebar filters pages automatically by role:

| Page | user | reviewer | admin |
|---|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ |
| Documents | ✅ | ✅ | ✅ |
| Risk Map | ✅ | ✅ | ✅ |
| Claims | ✅ | ✅ | ✅ |
| **Policies** | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ✅ |
| Chatbot | ✅ | ✅ | ✅ |
| Reviewer | ❌ | ✅ | ✅ |
| Admin | ❌ | ❌ | ✅ |

**Defense in depth:** the sidebar hides links, each page calls `/auth/me` and redirects on a role mismatch, and the backend dependencies `require_admin` / `require_reviewer` return 403.

### Admin Dashboard (`/admin`) — six tabs
- **Users:** a table of all users, filterable by role/status, with an inline role dropdown and Activate/Deactivate buttons
- **User Policies:** buyers list with per-user policy counts (flags anomalies like ≥5 policies) → drill-down to a user's policies → **void** a specific policy with a reason. Voiding is also available to **reviewers** from the claim they're reviewing.
- **Analytics:** full system metrics — total users, claims, approval rate, fraud rate, top high-risk provinces, a reviewer-performance table, a daily bar chart, and a region breakdown
- **Policies:** upload a new policy (auto-triggers a Celery job that ingests it into Qdrant), a card grid showing chunk count and last-ingested time, and a Delete button (which also removes the vectors)
- **Audit Logs:** a timeline of every action, filterable by action type, target type, and start date
- **System Health:** real-time status cards for MongoDB, Redis, Qdrant, and Celery — showing latency (ms), workers, and collections

### Reviewer Dashboard (`/reviewer`)
- **Queue panel:** `manual_review` claims sorted oldest-first, filterable by province / disaster type / minimum fraud score, with a "waiting X minutes/hours" badge
- **Detail panel:** the full AI reasoning, a fraud-gauge progress bar, a fraud-flags list, and attached documents
- **Decision:** Approve or Reject with a mandatory note and an editable approved amount
- **Stats banner:** Pending in queue · Reviewed today · Reviewed this week · Avg. review time · Override rate

---

## Security

### Authentication
- JWT HS256, 7-day expiry (10,080 minutes)
- Passwords: bcrypt with cost factor 12; minimum 8 characters including an uppercase letter, a lowercase letter, and a digit
- Tokens are stored in an **httpOnly cookie** (never localStorage — to prevent XSS)

### CSRF Protection
An httpOnly cookie prevents XSS but introduces a CSRF risk. The mitigation is the Double Submit Cookie pattern:
- Login sets two cookies: `access_token` (httpOnly) and `csrf_token` (non-httpOnly)
- The frontend reads `csrf_token` and attaches it as the `X-CSRF-Token` header
- Middleware verifies that the header matches the cookie before every mutating request

### CORS Policy
```
Allowed origins: http://localhost:3000, http://localhost:5173, production URL
Methods: GET, POST, PUT, DELETE, PATCH
Headers: Content-Type, Authorization, X-CSRF-Token
Credentials: true
```

### Rate Limiting (per IP)
```
POST /auth/login        → 5/min    (brute-force protection)
POST /documents/upload  → 10/min   (OCR is heavy)
POST /chatbot/message   → 30/min   (normal chat)
```

### Data Protection
- Never discloses the CCCD number, detailed address, or phone number in chatbot responses
- Prompt-injection defense — blocks "ignore previous instructions" and similar patterns
- Uses only the region (North / Central / South) for advisory purposes
- Validates all input through Pydantic schemas plus a sanitization function
- Adds a Request ID header (`X-Request-ID`) to every response for easier debugging

### OCR Privacy
- Caches OCR results by file hash (MD5) — the same file never hits the Gemini API twice
- A confidence threshold of 0.7 flags below-threshold fields as "Needs review"
- Never stores the raw image in the database — only the extracted text and the S3 key

---

## Getting Started (local)

### Requirements
- Docker Desktop, Python 3.11+, Node.js 18+

### 1. Clone and configure
```bash
git clone https://github.com/Ho-Duy-Vu/ClaimFlow.git
cd ClaimFlow
cp .env.example .env
# Set GEMINI_API_KEY in .env
```

### 2. Run with Docker Compose
```bash
docker compose up -d
cd backend && python scripts/seed.py
cd backend && python scripts/ingest_policies.py
```

### 3. Run each service individually
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
celery -A app.tasks worker --loglevel=info --pool=solo   # --pool=solo required on Windows

# Frontend
cd frontend && npm install && npm run dev
```

> 💡 **On Windows**, run `.\start-all.ps1` to open all four terminals (Infra · Backend · Celery · Frontend) as tabs in Windows Terminal in one command. See `Start.md` for details.

### 4. Rebuild the GeoJSON (only if needed)
```bash
cd backend
pip install pyproj
python scripts/build_vn_geojson.py
# Output: ../frontend/public/vietnam-provinces.geojson
```

### Access
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs
- Qdrant: http://localhost:6333/dashboard
- MinIO: http://localhost:9001

---

## Environment Variables

```env
GEMINI_API_KEY=AIza...
# Local MongoDB (no Docker, no auth):
MONGODB_URL=mongodb://localhost:27017
# The Docker mongo in docker-compose uses port 27018 with admin:admin auth:
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

## System-Design Concepts Applied

| Concept | How it's used in ClaimFlow |
|---|---|
| Message queue | Redis + Celery process OCR jobs asynchronously |
| Pub/Sub | Redis Pub/Sub → WebSocket real-time push |
| Event-driven | Submit doc → event → worker → AI → notify |
| RAG | Qdrant vector search over policies for claim checks |
| LangGraph agent | A four-node stateful workflow with conditional routing and auto-retry |
| API gateway | FastAPI centralizes auth, rate limiting, CSRF, and routing |
| Embedded documents | DocumentEmbed inside Claim, ChatMessage inside Session |
| Database indexing | Indexes on user_id, status, province, file_hash, created_at |
| Containerization | Docker Compose across five services |
| Lightweight CQRS | Writes via the Celery worker; reads via API GET — kept separate |
| Geo intelligence | Province risk scoring + Leaflet map visualization |
| Data privacy | PII protection, prompt-injection defense, CSRF protection |
| Caching | OCR results cached by MD5 file hash |
| Rate limiting | slowapi, per endpoint and per IP |
| Distributed tracing | A Request ID header on every response |
| Coordinate conversion | pyproj UTM48N → WGS84 for standards-compliant GeoJSON |

---

## Author

**Hồ Duy Vũ** — AI Engineer
duyvu11092004@gmail.com

---

## License

MIT License
