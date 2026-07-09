# CLAUDE.md — ClaimFlow

> File này giúp Claude hiểu toàn bộ context dự án. Đọc trước khi bắt đầu bất kỳ task nào.

---

## Dự án là gì

**ClaimFlow** — Nền tảng insurtech tích hợp AI cho thị trường Việt Nam gồm 3 core module:
1. **Document Intelligence** — OCR CCCD/hợp đồng bảo hiểm bằng Gemini Vision, merge nhiều tài liệu
2. **Geo Risk Intelligence** — Phân tích rủi ro thiên tai theo tỉnh/vùng miền, bản đồ Leaflet
3. **AI Chatbot** — Tư vấn bảo hiểm 24/7, bảo vệ PII, tư vấn theo vùng miền

**Domain:** Insurtech
**Developer:** Hồ Duy Vũ — AI Engineer

---

## Tech Stack

```
Frontend:  Next.js 14 + TypeScript + Tailwind + shadcn/ui + Leaflet
           next-intl (bilingual EN/VI, URL-based locale)
Backend:   FastAPI (Python 3.11) + Beanie ODM + Celery
AI:        Gemini Vision (OCR) + Gemini Pro (LLM) + text-embedding-004
           LangGraph + LangChain + Qdrant (vector store)
Queue:     Redis + Celery
DB:        MongoDB 7.0 (Motor + Beanie)
Storage:   MinIO (dev) / AWS S3 (prod)
Infra:     Docker Compose
```

---

## Cấu trúc thư mục quan trọng

```
backend/app/
├── api/routes/      auth · documents · geo_risk · chatbot · claims · user_policies
│                   analytics · reviewer · admin · notifications
├── core/            config · security (JWT+bcrypt) · database (MongoDB) · middleware · rate_limit
├── models/          user · document · claim · geo_risk · chat_session · policy · audit_log · user_policy
│                   ocr_bundle · notification · payment
├── schemas/         auth · document
├── services/
│   ├── ai/          agent · ocr · merger · chatbot · rag
│   ├── geo/         risk_engine (incl. province_data, _normalize_vn, aliases)
│   ├── notifications.py   (per-user WS manager + notify())
│   ├── pdf_generator.py   (contract · invoice · payment receipt)
│   ├── email.py · province_mapper.py
│   └── storage.py
└── tasks/           document_processor (Celery: process_document, process_claim,
                    ingest_policy_to_qdrant, check_expiring_policies + beat_schedule)

frontend/src/
├── app/[locale]/
│   ├── (auth)/      login · register
│   └── (app)/       layout với Sidebar role-based + LanguageSwitcher (KHÔNG còn ChatWidget bubble)
│       ├── dashboard/      DashboardClient — welcome + snapshots + recent claims + quick actions
│       ├── documents/      DocumentsClient — upload + OCR + merge + InsuranceRegistrationModal
│       ├── risk-map/       RiskMapClient — Leaflet choropleth
│       ├── claims/         ClaimsClient — list + submit modal + detail modal + WebSocket
│       ├── policies/       PoliciesClient — Tab "Gói của tôi" + Tab "Mua gói mới"
│       ├── analytics/      AnalyticsClient — 4 metric cards + daily/region/disaster/type charts (SVG)
│       ├── chatbot/        ChatbotClient — full-page chat (thay cho ChatWidget bubble cũ)
│       ├── reviewer/       ReviewerClient — queue + stats + detail panel với Approve/Reject
│       └── admin/          AdminClient — 5 tabs (Users · Analytics · Policies · Audit Logs · Health)
├── components/
│   ├── documents/   InsuranceRegistrationModal, các sub-component upload/merge
│   ├── risk-map/    LeafletMap
│   ├── layout/      Sidebar (role-based + logout), LanguageSwitcher
│   ├── ui/          shadcn (button, card, input, label, skeleton)
│   └── ErrorBoundary.tsx
├── messages/        vi.json (default) · en.json — namespaces: common, nav, auth, documents, claims,
│                    geo, chatbot, admin, reviewer, analytics, policies, dashboard, errors
├── lib/             api.ts (axios + CSRF), provinces.ts, utils.ts
├── types/           index.ts (User, Claim, UserPolicy, DocumentRecord, GeoRisk)
├── i18n.ts          next-intl config
└── middleware.ts    locale detection + routing
```

---

## Nguyên tắc làm việc với Claude

### Backend
- Luôn `async/await` — FastAPI là async
- Pydantic schema cho mọi request/response
- HTTPException với detail rõ ràng
- Logging thay vì print()
- bcrypt cost=12, JWT expire=10080 phút (7 ngày)
- Token lưu httpOnly cookie — KHÔNG localStorage
- **CSRF middleware** bắt buộc cho POST/PUT/DELETE/PATCH
- **Rate limiting** per endpoint với slowapi
- **Request ID** prefix mọi log để trace bug
- **Input sanitization** trước khi xử lý — strip HTML, check injection patterns
- **OCR cache** bằng MD5 file hash — cùng file không gọi Gemini 2 lần
- **Confidence threshold** 0.7 cho OCR — dưới ngưỡng thì flag manual review

### Frontend
- `'use client'` khi cần state/effect
- Server Component là default
- shadcn/ui thay vì tự viết component
- TypeScript strict — không dùng `any`
- Leaflet lazy load (SSR safe) — dynamic import, ssr:false
- **Error Boundary** bọc mọi component có thể crash (map, OCR display)
- **Loading skeleton** thay vì blank screen khi đang fetch
- **CSRF token** attach vào header mọi mutating request
- Simplified GeoJSON (< 500KB) — không dùng full resolution

### i18n (next-intl)
- **KHÔNG hardcode chuỗi UI** — luôn dùng `useTranslations()` hook
- Default locale: `vi` — fallback: `en`
- URL pattern: `/vi/dashboard`, `/en/dashboard`
- Key naming: `namespace.key` — ví dụ `auth.login`, `nav.dashboard`, `claims.status.approved`
- Server Component dùng `getTranslations()`, Client Component dùng `useTranslations()`
- `LanguageSwitcher` component trong layout header — toggle VI ↔ EN không reload
- Xem CONVENTIONS.md → mục i18n để biết đầy đủ pattern và key structure

### AI / LangGraph
- State là TypedDict đầy đủ type
- Mỗi node là pure function
- Gemini Vision cho OCR, Gemini Pro cho chatbot/reasoning
- Model: `gemini-1.5-flash` (OCR), `gemini-1.5-pro` (chatbot)
- Embedding: `text-embedding-004`
- **Confidence threshold** 0.7 — retry với enhanced prompt nếu thấp hơn
- Chatbot KHÔNG tiết lộ: CCCD number, địa chỉ chi tiết, SĐT
- **Prompt injection defense** — sanitize user input trước khi vào Gemini
- Privacy system prompt kết thúc bằng reinforcement statement

### Database (MongoDB + Beanie)
- Xem SCHEMA.md trước khi viết query
- Không có migration — thêm field vào model là xong
- ID luôn là string khi expose qua API
- ChatSession giữ tối đa 50 messages — tránh 16MB document limit
- Document model có `file_hash` cho OCR cache
- Document model có `edit_history` cho version tracking

---

## Environment Variables

```env
GEMINI_API_KEY=AIza...
# Local MongoDB không auth (dùng cho dev nhanh — match .env hiện tại):
MONGODB_URL=mongodb://localhost:27017
# Docker mongo từ docker-compose.yml ở port 27018 cần auth admin:admin
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

## Authorization — 3 Roles

| Role | Quyền |
|------|-------|
| **user** | Tài liệu + claims của mình, chatbot, geo risk map |
| **reviewer** | Tất cả claims, override AI decision, reviewer queue & stats |
| **admin** | Tất cả + user management, policy management, audit logs, system health |

**Dependency Injection:**
- `get_current_user` — mọi protected route
- `require_reviewer` — role reviewer hoặc admin
- `require_admin` — role admin only

**Audit Log:** Mọi action admin (role_change, user_deactivate, policy_upload...) phải ghi `AuditLog`. Không bỏ qua.

---

## Collections MongoDB (tóm tắt)

```
users           → auth, role (user/reviewer/admin), province, is_active
documents       → OCR result, extracted_data, merged_data, file_key, file_hash, ocr_confidence
claims          → status, claim_type, ai_decision, fraud_score, reviewer_note, documents (embedded)
geo_risks       → province, risk_scores, disaster_types, recommendations (63 tỉnh seeded)
chat_sessions   → user_id, messages[] (max 50), context
policies        → RAG source (ingested vào Qdrant, chunk_count, last_ingested)
user_policies   → gói bảo hiểm user đã mua (policy_type ∈ 6 loại mới, status active|expired|cancelled,
                  + expiry_reminder_sent, renewed_from)
audit_logs      → mọi action admin: role_change, user_deactivate/activate, policy_upload/delete, claim_override,
                  policy_purchased, policy_renewed, payment_marked_paid
ocr_bundles     → holistic multi-doc OCR (bundle_hash, consolidated_profile, inconsistencies)
notifications   → in-app notify (user_id, type, title, body, link, read) — realtime qua WS per-user
payments        → kỳ đóng phí của user_policy (installment_no, amount, due_date, status paid|pending, transaction_ref)
```

**Lưu ý migration:** Type cũ `medical/dental/hospitalization/medication` đã được migrate sang `health` (xem `claim_type` + `policy_type`). Nếu thấy DB còn record cũ, chạy lại `db.user_policies.updateMany({policy_type: 'hospitalization'}, {$set: {policy_type: 'health'}})`.

---

## API Endpoints tóm tắt

```
POST  /auth/register · /auth/login · GET /auth/me

POST  /documents/upload          Upload + OCR (Gemini Vision)
POST  /documents/merge           Merge nhiều docs, loại bỏ field trùng
GET   /documents/{id}            Chi tiết + extracted data
PUT   /documents/{id}/fields     Chỉnh sửa field đã extract
GET   /documents/{id}/export     Export JSON hoặc Markdown

GET   /geo-risk/province/{name}  Risk score + disaster types
GET   /geo-risk/map              All provinces risk data cho Leaflet
POST  /geo-risk/recommend        Insurance recommendation từ địa chỉ

POST  /chatbot/message           Gửi message, nhận AI response
GET   /chatbot/session/{id}      Lịch sử conversation
DELETE/chatbot/session/{id}      Xóa session

POST  /claims/submit             Submit claim (JSON body — claim_type ∈ 6 loại mới)
GET   /claims · /claims/{id} · DELETE /claims/{id}
PATCH /claims/{id}/review        Reviewer override

# User Policy (insurance registration & management)
GET   /policies/plans            Danh sách 6 loại × 3 gói (public, không cần auth)
GET   /policies                  Gói của user hiện tại (auto-expire end_date < now)
POST  /policies/purchase         { policy_type, plan_index, ... } → UserPolicy active + sinh lịch phí + notify
POST  /policies/quote            Báo giá realtime (age multiplier)
DELETE/policies/{id}             Cancel gói
POST  /policies/{id}/renew       Gia hạn → UserPolicy mới nối tiếp, gói cũ → expired
GET   /policies/{id}/payments    Lịch đóng phí + summary (đã đóng/còn lại/kỳ tới)
POST  /policies/{id}/payments/{pid}/pay        Đóng 1 kỳ (mô phỏng)
GET   /policies/{id}/payments/{pid}/receipt.pdf Biên lai PDF
GET   /policies/{id}/contract.pdf              Hợp đồng PDF

# Notifications (in-app, realtime)
GET   /notifications             { items[], unread } — ?unread_only ?limit
GET   /notifications/unread-count
PATCH /notifications/{id}/read · PATCH /notifications/read-all
WS    /notifications/ws          Realtime per-user (auth cookie JWT)

GET   /analytics/summary         Total/approved/rejected/manual_review/processing,
                                 approval_rate, avg_processing_minutes, total_approved_amount
                                 (scope theo role: admin/reviewer = all, user = own)
GET   /analytics/daily?days=30   daily_counts, region_breakdown, disaster_types, claim_types

WS    /claims/ws/{claim_id}      Real-time status push

# Reviewer (role: reviewer | admin)
GET   /reviewer/queue            Claims manual_review, filter province/disaster/min_fraud
GET   /reviewer/stats            Stats cá nhân: reviewed_today/week/total, avg time, override rate

# Admin (role: admin only)
GET   /admin/users               Filter role + is_active, pagination skip/limit
PATCH /admin/users/{id}/role     Đổi role user (audit log ghi old_role + new_role)
PATCH /admin/users/{id}/status   Activate/deactivate (audit log)
GET   /admin/policies            Policy docs (RAG) — list với chunk_count, last_ingested
POST  /admin/policies            JSON body — trigger Celery task ingest_policy_to_qdrant
DELETE/admin/policies/{id}       Deactivate + xóa vectors khỏi Qdrant
GET   /admin/audit-logs          Filter action/target_type/from_date/to_date
GET   /admin/system/health       Ping mongodb/redis/qdrant/celery + latency
GET   /admin/analytics/full      Full system: users, claims, fraud_rate, top_high_risk_provinces,
                                 reviewer_performance, daily_claims, region_breakdown
GET   /admin/audit-logs          History mọi action quan trọng
GET   /admin/system/health       Status MongoDB, Redis, Qdrant, Celery
GET   /admin/analytics/full      Full system analytics
```

---

## Những thứ Claude KHÔNG nên làm

- Không dùng localStorage cho JWT token — dùng httpOnly cookie
- Không tiết lộ PII trong chatbot (CCCD, SĐT, địa chỉ chi tiết)
- Không hardcode API key hay secret
- Không bỏ qua type hints Python
- Không dùng `any` trong TypeScript
- Không gọi Gemini Pro khi Gemini Flash đủ dùng (tiết kiệm quota)
- Không import Leaflet ở Server Component (SSR không hỗ trợ)
- **Không hardcode chuỗi UI** — dùng `useTranslations()` / `getTranslations()`, không viết string trực tiếp vào JSX

---

## Cách tôi muốn Claude trả lời

1. Code trước, giải thích sau
2. Chỉ file cần sửa — không paste lại toàn bộ
3. Luôn include import
4. Nói rõ nếu cần xem thêm file context
5. Assumption hợp lý và note rõ

---

## Lệnh hay dùng

```bash
docker compose up -d
cd backend && uvicorn app.main:app --reload
cd backend && celery -A app.tasks worker --loglevel=info
cd frontend && npm run dev

python scripts/seed.py
python scripts/ingest_policies.py
python scripts/generate_sample_pdfs.py

pytest tests/ -v
pytest --cov=app/services tests/
docker compose exec mongodb mongosh claimflow_db
```

---

## Task hiện tại

Xem TASKS.md. Khi bắt đầu task mới: `"Bắt đầu TASK-XXX"`
