# API.md — API Reference

> Request/response format đầy đủ. Claude đọc khi viết code FE gọi API hoặc viết endpoint mới.
> Cập nhật: bao gồm security headers, CSRF, rate limit, confidence fields, edit history, UserPolicy endpoints.

---

## Base URL & Auth

```
Development: http://localhost:8000
Production:  https://claimflow-backend.railway.app
```

**Auth:** JWT trong **httpOnly cookie** — browser tự attach, không cần code thêm.

**CSRF:** Mọi `POST/PUT/DELETE/PATCH` phải kèm header `X-CSRF-Token` (lấy từ cookie `csrf_token` non-httpOnly).

**Response headers chuẩn:**
```
X-Request-ID: a3f8b2c1     ← trace bug theo request
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1716000000
```

---

## Error Codes

| Code | Ý nghĩa | Ví dụ |
|------|---------|-------|
| 400 | Bad request / validation error | Email sai format, password yếu |
| 401 | Chưa đăng nhập / token hết hạn | Cookie không có hoặc expired |
| 403 | Không đủ quyền hoặc CSRF fail | User thường vào reviewer endpoint, thiếu X-CSRF-Token |
| 404 | Resource không tồn tại | Document ID không tìm thấy |
| 409 | Conflict / duplicate | Email đã đăng ký |
| 413 | File quá lớn | Upload > 20MB |
| 415 | File type không hỗ trợ | Upload .docx |
| 422 | Pydantic validation fail | FastAPI tự handle |
| 429 | Rate limit exceeded | Quá 5 login/phút |
| 500 | Server error | Unexpected exception |

**Error response format:**
```json
{ "detail": "Human-readable error message" }
```

---

## Auth

### POST `/auth/register`
```json
// Request
{
  "email": "user@example.com",
  "password": "StrongPass123!",
  "full_name": "Nguyễn Văn A",
  "province": "Quảng Bình"
}

// Response 201
{
  "id": "...",
  "email": "user@example.com",
  "full_name": "Nguyễn Văn A",
  "role": "user",
  "province": "Quảng Bình",
  "region": "central"
}
// Errors: 400 (email exists), 400 (password weak), 422 (validation)
```

### POST `/auth/login`
```json
// Request
{ "email": "user@example.com", "password": "StrongPass123!" }

// Response 200 — set 2 httpOnly+non-httpOnly cookies
{
  "message": "Login successful",
  "user": { "id": "...", "email": "...", "role": "user", "province": "Quảng Bình" }
}
// Rate limit: 5/phút per IP → 429 nếu vượt
// Error 401: sai email/password
```

### POST `/auth/logout`
```json
// Response 200 — clear cookies
{ "message": "Logged out" }
```

### GET `/auth/me`
```json
// Response 200
{
  "id": "...",
  "email": "...",
  "full_name": "...",
  "role": "user",
  "province": "Quảng Bình",
  "region": "central",
  "is_active": true
}
```

---

## Documents

### POST `/documents/upload`
`multipart/form-data` — Rate limit: **10/phút per IP**

```
file:      [binary]   PDF/PNG/JPG/JPEG — max 20MB
doc_type:  "cccd"     cccd|cmnd|driver_license|passport|vehicle_registration|insurance_policy|other
```

```json
// Response 201
{
  "document_id": "...",
  "file_name": "cccd_front.jpg",
  "file_hash": "a3f8b2c1d4e5f6...",
  "doc_type": "cccd",
  "processing_status": "pending",
  "message": "Uploaded. OCR processing started.",
  "cached": false
}
// cached=true nếu file hash đã OCR trước đó → trả ngay không queue Celery
```

### GET `/documents/{id}`
```json
// Response 200
{
  "id": "...",
  "doc_type": "cccd",
  "file_name": "cccd_front.jpg",
  "file_hash": "a3f8b2c1...",
  "file_size_kb": 245,
  "processing_status": "done",

  "ocr_confidence": 0.94,
  "needs_manual_review": false,
  "low_confidence_fields": [],

  "structured_data": {
    "id_number": "001234567890",
    "full_name": "NGUYỄN VĂN AN",
    "date_of_birth": "15/03/1990",
    "sex": "Nam",
    "place_of_origin": "Hà Nội",
    "place_of_residence": "45 Trần Hưng Đạo, Hà Nội",
    "expiry_date": "15/03/2035"
  },
  "extracted_fields": [
    {
      "key": "id_number",
      "value": "001234567890",
      "confidence": 0.98,
      "bbox": [120, 45, 280, 30]
    },
    {
      "key": "place_of_residence",
      "value": "45 Trần Hưng Đạo, Hà Nội",
      "confidence": 0.62,
      "bbox": [80, 180, 400, 25]
    }
  ],

  "version": 2,
  "edit_history": [
    {
      "field": "place_of_residence",
      "old_value": "45 Trần Hưng Đao, Hà Nội",
      "new_value": "45 Trần Hưng Đạo, Hà Nội",
      "edited_by": "user-id-...",
      "timestamp": "2024-05-15T11:00:00Z"
    }
  ],

  "is_merged": false,
  "merged_from": [],

  "download_url": "https://presigned-s3-url...",
  "created_at": "...",
  "updated_at": "..."
}

// Khi needs_manual_review = true:
{
  "needs_manual_review": true,
  "low_confidence_fields": ["place_of_residence", "expiry_date"],
  "ocr_confidence": 0.58
}
```

### POST `/documents/merge`
```json
// Request
{ "document_ids": ["id1", "id2", "id3"] }

// Response 200
{
  "merged_document_id": "...",
  "merged_data": {
    "id_number": "001234567890",
    "full_name": "NGUYỄN VĂN AN",
    "policy_number": "BH-2024-001234",
    "insurance_type": "Nhân thọ"
  },
  "conflicts": {
    "date_of_birth": {
      "values": ["15/03/1990", "1990-03-15"],
      "source_docs": ["id1", "id2"]
    }
  },
  "stats": {
    "total_fields": 12,
    "merged_clean": 10,
    "conflicts": 2
  }
}
```

### PUT `/documents/{id}/fields`
Yêu cầu `X-CSRF-Token` header.
```json
// Request
{
  "field_updates": {
    "place_of_residence": "45 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội"
  }
}

// Response 200
{
  "id": "...",
  "structured_data": { "...updated..." },
  "version": 3,
  "edit_history": ["..."]
}
```

### GET `/documents/{id}/export`
```
// Query: ?format=json hoặc ?format=markdown
// Response: file download với Content-Disposition header
```

---

## Geo Risk

### GET `/geo-risk/province/{province_name}`
Hỗ trợ tên tỉnh không dấu ("Quang Binh") và alias ("HCM", "HN", "TP HCM").
```json
// Response 200
{
  "province_name": "Quảng Bình",
  "province_code": "QB",
  "region": "central",
  "overall_risk_score": 92,
  "is_high_risk": true,
  "risk_factors": ["typhoon_path", "flood_prone", "mountainous"],
  "disaster_risks": [
    { "type": "storm", "risk_score": 95, "frequency": "high", "historical_events": 47 },
    { "type": "flood", "risk_score": 90, "frequency": "high", "historical_events": 38 },
    { "type": "landslide", "risk_score": 75, "frequency": "medium", "historical_events": 12 }
  ],
  "recommendations": [
    {
      "insurance_type": "Bảo hiểm bão lũ",
      "priority_score": 95,
      "reason": "Nằm trực tiếp trên đường đi của bão Tây Bắc Thái Bình Dương",
      "estimated_premium": "2,000,000 - 5,000,000 VND/năm"
    },
    {
      "insurance_type": "Bảo hiểm nhà ở",
      "priority_score": 88,
      "reason": "Nguy cơ ngập lụt và sạt lở đất cao",
      "estimated_premium": "1,500,000 - 3,000,000 VND/năm"
    }
  ]
}
```

### GET `/geo-risk/map`
```json
// Response 200 — dùng cho Leaflet choropleth (simplified, < 500KB)
{
  "provinces": [
    {
      "name": "Quảng Bình", "code": "QB",
      "lat": 17.47, "lng": 106.62,
      "risk_score": 92, "is_high_risk": true,
      "region": "central",
      "top_risk": "storm"
    },
    {
      "name": "Hà Nội", "code": "HN",
      "lat": 21.02, "lng": 105.84,
      "risk_score": 35, "is_high_risk": false,
      "region": "north",
      "top_risk": "flood"
    }
  ],
  "summary": {
    "high_risk_count": 12,
    "medium_risk_count": 28,
    "low_risk_count": 24
  }
}
```

### POST `/geo-risk/recommend`
Yêu cầu `X-CSRF-Token` header.
```json
// Request
{ "address": "45 Trần Hưng Đạo, Quảng Bình" }

// Response 200
{
  "detected_province": "Quảng Bình",
  "detected_region": "central",
  "risk_level": "HIGH",
  "overall_score": 92,
  "recommendations": [
    {
      "insurance_type": "Bảo hiểm bão lũ",
      "priority_score": 95,
      "reason": "Quảng Bình nằm trên đường đi của bão",
      "estimated_premium": "2,000,000 - 5,000,000 VND/năm"
    }
  ],
  "combo_suggestion": {
    "packages": ["Nhân thọ", "Sức khỏe", "Thiên tai"],
    "discount": "15% khi mua combo 3 gói",
    "reason": "Bảo vệ toàn diện cho vùng rủi ro cao"
  }
}
```

---

## Policies (User Insurance)

> Endpoints quản lý gói bảo hiểm của user — không nhầm với Admin policy (RAG documents).

### GET `/policies/plans`
Catalog tất cả gói — public, không cần auth.
```json
// Response 200
{
  "plans": {
    "health": [
      {
        "plan_index": 0,
        "plan_name": "Sức Khỏe Cơ Bản",
        "description": "Bảo hiểm sức khỏe cơ bản: khám ngoại trú, nội trú, cấp cứu",
        "coverage_amount": 100000000,
        "annual_premium": 2400000
      },
      {
        "plan_index": 1,
        "plan_name": "Sức Khỏe Nâng Cao",
        "description": "Bảo hiểm toàn diện: khám, phẫu thuật, điều trị ung thư",
        "coverage_amount": 300000000,
        "annual_premium": 6000000
      },
      {
        "plan_index": 2,
        "plan_name": "Sức Khỏe Toàn Diện",
        "description": "Bảo hiểm cao cấp: tất cả dịch vụ y tế + chăm sóc nha khoa",
        "coverage_amount": 500000000,
        "annual_premium": 12000000
      }
    ],
    "disaster": [...],
    "life": [...],
    "property": [...],
    "vehicle": [...],
    "income": [...]
  }
}
```

### GET `/policies`
Danh sách gói đang active của user hiện tại.
```json
// Response 200
{
  "items": [
    {
      "id": "...",
      "policy_number": "CF-HEA-A1B2C3D4",
      "policy_type": "health",
      "plan_name": "Sức Khỏe Nâng Cao",
      "coverage_amount": 300000000,
      "annual_premium": 6000000,
      "status": "active",
      "start_date": "2024-06-01T00:00:00Z",
      "end_date": "2025-06-01T00:00:00Z",
      "insurer": "ClaimFlow Insurance"
    }
  ],
  "total": 2
}
```

### POST `/policies/purchase`
Yêu cầu `X-CSRF-Token` header.
```json
// Request
{
  "policy_type": "disaster",
  "plan_index": 1
}

// Response 201
{
  "id": "...",
  "policy_number": "CF-DIS-E5F6G7H8",
  "policy_type": "disaster",
  "plan_name": "Thiên Tai Nâng Cao",
  "coverage_amount": 150000000,
  "annual_premium": 4800000,
  "status": "active",
  "start_date": "2024-06-15T00:00:00Z",
  "end_date": "2025-06-15T00:00:00Z"
}
// Error 400: plan_index không hợp lệ (0, 1, 2)
// Error 409: đã có policy_type này đang active
```

### DELETE `/policies/{id}`
Hủy gói bảo hiểm. Yêu cầu `X-CSRF-Token` header.
```json
// Response 200
{ "message": "Policy cancelled successfully.", "policy_number": "CF-DIS-E5F6G7H8" }
// Error 404: policy không tồn tại hoặc không phải của user
```

### POST `/policies/{id}/renew`
Gia hạn — tạo `UserPolicy` mới nối tiếp cùng plan/term; gói cũ (nếu active) → `expired`. Sinh lịch phí mới + notify. Trả policy mới (201). CSRF required.

### GET `/policies/{id}/payments`
Lịch đóng phí + tóm tắt.
```json
{
  "items": [{ "id": "...", "installment_no": 1, "total_installments": 12,
              "amount": 700000, "due_date": "2026-07-09T...", "status": "paid",
              "paid_at": "...", "transaction_ref": "CF-PAY-A1B2C3D4" }],
  "summary": { "total_installments": 12, "paid_count": 1, "pending_count": 11,
               "paid_amount": 700000, "remaining_amount": 7700000,
               "next_due_date": "...", "frequency": "monthly" }
}
```

### POST `/policies/{id}/payments/{payment_id}/pay`
Đóng 1 kỳ (mô phỏng — local). Trả payment đã cập nhật `status:"paid"`. CSRF required. 409 nếu đã đóng.

### GET `/policies/{id}/payments/{payment_id}/receipt.pdf`
Biên lai PDF (chỉ kỳ đã `paid`). `Content-Type: application/pdf`.

### GET `/policies/{id}/contract.pdf`
Hợp đồng PDF (cache MinIO). `Content-Type: application/pdf`.

---

## Notifications

Thông báo in-app realtime. Tất cả cần auth (cookie JWT).

### GET `/notifications`
Query: `unread_only` (bool), `limit` (1-100, default 30).
```json
{
  "items": [{ "id": "...", "type": "claim_reviewed", "title": "Yêu cầu bồi thường được duyệt",
              "body": "...", "link": "/claims", "read": false, "created_at": "..." }],
  "unread": 3
}
```

### GET `/notifications/unread-count`
```json
{ "unread": 3 }
```

### PATCH `/notifications/{id}/read` · PATCH `/notifications/read-all`
Đánh dấu đã đọc (1 hoặc tất cả). CSRF required. → `{ "ok": true }`

### `WS /notifications/ws`
Kênh realtime per-user (auth cookie). Server push:
```json
{ "event": "notification", "id": "...", "type": "policy_expiring",
  "title": "...", "body": "...", "link": "/policies", "created_at": "..." }
```

---

## Chatbot

Rate limit: **30/phút per IP**

### POST `/chatbot/message`
Yêu cầu `X-CSRF-Token` header.
```json
// Request
{
  "message": "Tôi ở Quảng Bình, cần mua bảo hiểm gì?",
  "session_id": "optional-existing-session-id"
}

// Response 200
{
  "session_id": "...",
  "response": "Vì bạn ở vùng Bắc Trung Bộ — khu vực có rủi ro bão lũ cao, tôi khuyên...",
  "suggested_actions": [
    { "label": "Xem bản đồ rủi ro", "action": "navigate", "path": "/risk-map" },
    { "label": "Xem gói bảo hiểm bão lũ", "action": "navigate", "path": "/compare" }
  ]
}

// Error 400: input chứa injection patterns
{ "detail": "Input không hợp lệ" }

// Error 429: vượt rate limit
{ "detail": "Rate limit exceeded. Retry after 60 seconds." }
```

### GET `/chatbot/session/{session_id}`
```json
// Response 200
{
  "session_id": "...",
  "message_count": 12,
  "messages": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "..." }
  ]
}
// Lưu ý: chỉ trả 50 messages gần nhất — tránh response quá lớn
```

### DELETE `/chatbot/session/{session_id}`
```json
// Response 200
{ "message": "Session cleared" }
```

---

## Claims

### POST `/claims/submit`
JSON body — Yêu cầu `X-CSRF-Token` header. Rate limit 5/phút.
```json
// Request
{
  "claim_type": "disaster",       // health|life|property|vehicle|disaster|income (6 loại MỚI)
  "amount_claimed": 15000000,     // > 0, max 10 tỷ VND
  "province": "Quảng Bình",
  "disaster_type": "flood",        // chỉ khi claim_type = "disaster"
  "description": "Nhà bị ngập lụt do bão số 5",  // min 10 chars
  "document_ids": ["doc-id-1", "doc-id-2"]       // optional, max 5 — phải thuộc cùng user
}

// Response 201 — async processing (Celery hoặc BackgroundTask fallback)
{ "claim_id": "...", "status": "processing" }

// Error 422: user chưa có UserPolicy active loại claim_type tương ứng
{ "detail": "Bạn chưa mua gói bảo hiểm 'disaster'. Vui lòng mua gói phù hợp..." }
```
> **Migration note:** type cũ `medical/dental/hospitalization/medication` không còn được chấp nhận. Gửi với type cũ sẽ trả 422 Pydantic Literal validation error.

### GET `/claims`
```
// Query: ?status=approved&province=Quảng Bình&claim_type=disaster&page=1&page_size=10
```
```json
// Response 200
{
  "items": [
    {
      "id": "...",
      "claim_type": "disaster",
      "status": "approved",
      "amount_claimed": 15000000,
      "amount_approved": 12000000,
      "province": "Quảng Bình",
      "disaster_type": "flood",
      "ai_fraud_score": 8,
      "created_at": "...",
      "processed_at": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 10,
  "total_pages": 5
}
```

### GET `/claims/{id}`
```json
// Response 200
{
  "id": "...",
  "status": "approved",
  "claim_type": "disaster",
  "disaster_type": "flood",
  "province": "Quảng Bình",
  "amount_claimed": 15000000,
  "amount_approved": 12000000,

  "ai_decision": "approved",
  "ai_reasoning": "Claim hợp lệ. Lũ lụt tháng 10/2024 tại Quảng Bình được ghi nhận lịch sử. Số tiền trong giới hạn bảo hiểm thiên tai 20,000,000 VND.",
  "ai_fraud_score": 8,
  "ai_fraud_flags": [],
  "ai_parsed_data": { "disaster_type": "flood", "damage_type": "residential" },

  "documents": [
    { "id": "...", "doc_type": "insurance_policy", "file_name": "hopd_bh.pdf" }
  ],

  "reviewer_id": null,
  "reviewer_note": null,
  "reviewed_at": null,

  "created_at": "...",
  "processed_at": "...",
  "updated_at": "..."
}
```

### DELETE `/claims/{id}`
Yêu cầu `X-CSRF-Token` header.
```json
// Response 200
{ "message": "Claim deleted." }

// Error 400: claim đang trong trạng thái processing < 5 phút
{ "detail": "Claim đang được xử lý. Vui lòng chờ hoặc thử lại sau 5 phút." }

// Error 403: không phải owner của claim
// Error 404: claim không tồn tại
```

### PATCH `/claims/{id}/review`
Chỉ role `reviewer` hoặc `admin`. Yêu cầu `X-CSRF-Token`.
```json
// Request
{ "decision": "approved", "note": "Đã xác minh thiệt hại qua ảnh vệ tinh khu vực." }

// Response 200
{
  "id": "...",
  "status": "approved",
  "reviewer_id": "...",
  "reviewer_note": "Đã xác minh...",
  "reviewed_at": "2024-10-16T14:00:00Z"
}
// Error 403: không phải reviewer
// Error 400: claim không ở trạng thái manual_review
```

---

## Analytics

> **Scope theo role:** `admin` và `reviewer` thấy toàn bộ claims; `user` chỉ thấy claims của mình. Backend tự thêm filter `user_id` cho non-admin/reviewer.

### GET `/analytics/summary`
```json
// Response 200
{
  "scope": "all",                 // "all" cho admin/reviewer, "user" cho người dùng thường
  "total_claims": 127,
  "approved": 89,
  "rejected": 18,
  "manual_review": 12,
  "processing": 8,
  "approval_rate": 70.1,          // % (tính từ approved/total)
  "avg_processing_minutes": 18.4, // tính từ processed_at - created_at trên claim đã processed
  "total_approved_amount": 134050000  // sum amount_approved (fallback amount_claimed)
}
```

### GET `/analytics/daily`
```json
// Query: ?days=30 (clamp 1..90)
{
  "days": 30,
  "daily_counts": [
    { "date": "2026-04-30", "count": 12, "approved": 9 }
    // ... 30 buckets, sort theo ngày tăng dần
  ],
  "region_breakdown": { "north": 45, "central": 62, "south": 20, "unknown": 0 },
  "disaster_types": [
    ["flood", 38], ["storm", 25], ["landslide", 12]
    // Counter.most_common(10) — list of [name, count]
  ],
  "claim_types": { "health": 50, "disaster": 30, "vehicle": 12, "property": 8, "life": 5, "income": 2 }
}
```

> `/analytics/breakdown` không còn — gộp vào `/analytics/daily` (region/disaster/claim type) và `/admin/analytics/full` (top high-risk provinces + reviewer performance).

---

## WebSocket

### `WS /claims/ws/{claim_id}`

```json
// Khi processing
{ "event": "status_update", "status": "processing", "message": "Đang phân tích tài liệu..." }

// Khi xong — approved
{
  "event": "processing_complete",
  "status": "approved",
  "ai_decision": "approved",
  "ai_reasoning": "Claim hợp lệ...",
  "amount_approved": 12000000,
  "fraud_score": 8
}

// Khi cần manual review
{
  "event": "processing_complete",
  "status": "manual_review",
  "ai_decision": "manual_review",
  "fraud_score": 78,
  "fraud_flags": ["amount_anomaly", "provider_not_whitelisted"]
}

// Khi cần thêm thông tin (OCR confidence thấp)
{
  "event": "need_more_info",
  "status": "pending",
  "missing_fields": ["id_number", "expiry_date"],
  "low_confidence_fields": ["place_of_residence"],
  "message": "Vui lòng upload lại ảnh rõ hơn hoặc chỉnh sửa thông tin."
}

// Khi lỗi
{ "event": "processing_error", "status": "pending", "message": "Processing failed. Please retry." }
```

---

## TypeScript Types

```typescript
// types/document.ts
export type DocType =
  | 'cccd' | 'cmnd' | 'driver_license' | 'passport'
  | 'vehicle_registration' | 'insurance_policy' | 'other';

export type ProcessingStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ExtractedField {
  key: string;
  value: string | null;
  confidence: number;     // 0.0 - 1.0
  bbox?: number[];        // [x, y, w, h] cho visual highlighting
}

export interface EditHistoryEntry {
  field: string;
  old_value: string;
  new_value: string;
  edited_by: string;
  timestamp: string;
}

export interface DocumentDetail {
  id: string;
  doc_type: DocType;
  file_name: string;
  file_hash: string;
  file_size_kb: number;
  processing_status: ProcessingStatus;

  ocr_confidence: number | null;
  needs_manual_review: boolean;
  low_confidence_fields: string[];

  structured_data: Record<string, unknown>;
  extracted_fields: ExtractedField[];

  version: number;
  edit_history: EditHistoryEntry[];

  is_merged: boolean;
  merged_from: string[];
  merged_data: Record<string, unknown>;

  download_url: string;
  created_at: string;
  updated_at: string;
}

export interface MergeResult {
  merged_document_id: string;
  merged_data: Record<string, unknown>;
  conflicts: Record<string, { values: string[]; source_docs: string[] }>;
  stats: { total_fields: number; merged_clean: number; conflicts: number };
}

// types/geo.ts
export type Region = 'north' | 'central' | 'south';
export type DisasterType = 'storm' | 'flood' | 'landslide' | 'inundation' | 'drought';

export interface DisasterRisk {
  type: DisasterType;
  risk_score: number;
  frequency: 'high' | 'medium' | 'low';
  historical_events: number;
}

export interface InsuranceRecommendation {
  insurance_type: string;
  priority_score: number;
  reason: string;
  estimated_premium: string;
}

export interface ProvinceRisk {
  province_name: string;
  province_code: string;
  lat: number;
  lng: number;
  region: Region;
  overall_risk_score: number;
  is_high_risk: boolean;
  top_risk: DisasterType;
  risk_factors?: string[];
  disaster_risks?: DisasterRisk[];
  recommendations?: InsuranceRecommendation[];
}

export interface MapData {
  provinces: ProvinceRisk[];
  summary: { high_risk_count: number; medium_risk_count: number; low_risk_count: number };
}

// types/claim.ts
export type ClaimStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'manual_review';
export type ClaimType = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';

export interface ClaimSummary {
  id: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  amount_claimed: number;
  amount_approved: number | null;
  province: string | null;
  disaster_type: string | null;
  ai_fraud_score: number | null;
  created_at: string;
  processed_at: string | null;
}

export interface ClaimDetail extends ClaimSummary {
  ai_decision: string | null;
  ai_reasoning: string | null;
  ai_fraud_flags: string[];
  ai_parsed_data: Record<string, unknown> | null;
  reviewer_id: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  documents: { id: string; doc_type: DocType; file_name: string }[];
  updated_at: string;
}

// types/policy.ts
export type PolicyType = 'health' | 'life' | 'property' | 'vehicle' | 'disaster' | 'income';
export type PolicyStatus = 'active' | 'expired' | 'cancelled';

export interface UserPolicy {
  id: string;
  policy_number: string;           // CF-HEA-XXXXXXXX
  policy_type: PolicyType;
  plan_name: string;
  description: string;
  insurer: string;
  coverage_amount: number;
  annual_premium: number;
  status: PolicyStatus;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface PolicyPlan {
  plan_index: number;
  plan_name: string;
  description: string;
  coverage_amount: number;
  annual_premium: number;
}

export interface PoliciesCatalog {
  plans: Record<PolicyType, PolicyPlan[]>;
}

// types/chatbot.ts
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatResponse {
  session_id: string;
  response: string;
  suggested_actions?: { label: string; action: string; path: string }[];
}

export interface ChatSession {
  session_id: string;
  message_count: number;
  messages: ChatMessage[];
}

// types/analytics.ts
export interface AnalyticsSummary {
  total_claims: number;
  pending_claims: number;
  approval_rate: number;
  avg_processing_seconds: number;
  total_amount_claimed: number;
  total_amount_approved: number;
  fraud_flagged_count: number;
  by_region: Record<string, number>;
  by_disaster_type: Record<string, number>;
  ocr_cache_hit_rate: number;
}

export interface DailyStats {
  date: string;
  total: number;
  approved: number;
  rejected: number;
  manual_review: number;
  disaster_claims: number;
  avg_confidence: number;
}

// types/auth.ts
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'reviewer' | 'admin';
  province: string | null;
  region: 'north' | 'central' | 'south' | null;
  is_active: boolean;
}

// types/websocket.ts
export type WSEventType =
  | 'status_update'
  | 'processing_complete'
  | 'need_more_info'
  | 'processing_error';

export interface WSMessage {
  event: WSEventType;
  status: ClaimStatus;
  message?: string;
  ai_decision?: string;
  ai_reasoning?: string;
  amount_approved?: number;
  fraud_score?: number;
  fraud_flags?: string[];
  missing_fields?: string[];
  low_confidence_fields?: string[];
}
```

---

## Authorization Matrix

| Endpoint | User | Reviewer | Admin |
|---|:---:|:---:|:---:|
| `POST /auth/*` | ✓ | ✓ | ✓ |
| `POST /documents/upload` | ✓ | ✓ | ✓ |
| `POST /documents/merge` | ✓ | ✓ | ✓ |
| `GET /documents/{id}` | Own only | ✓ | ✓ |
| `POST /chatbot/message` | ✓ | ✓ | ✓ |
| `GET /geo-risk/*` | ✓ | ✓ | ✓ |
| `GET /policies/plans` | ✓ (public) | ✓ | ✓ |
| `GET /policies` | Own only | ✓ | ✓ |
| `POST /policies/purchase` | ✓ | ✓ | ✓ |
| `DELETE /policies/{id}` | Own only | ✓ | ✓ |
| `POST /claims/submit` | ✓ | ✓ | ✓ |
| `GET /claims` | Own only | All | All |
| `GET /claims/{id}` | Own only | All | All |
| `DELETE /claims/{id}` | Own only | ✓ | ✓ |
| `PATCH /claims/{id}/review` | ✗ | ✓ | ✓ |
| `GET /analytics/summary` | Own stats | All claims | Full system |
| **Admin only** | | | |
| `GET /admin/users` | ✗ | ✗ | ✓ |
| `PATCH /admin/users/{id}/role` | ✗ | ✗ | ✓ |
| `DELETE /admin/users/{id}` | ✗ | ✗ | ✓ |
| `GET /admin/policies` | ✗ | ✗ | ✓ |
| `POST /admin/policies` | ✗ | ✗ | ✓ |
| `DELETE /admin/policies/{id}` | ✗ | ✗ | ✓ |
| `GET /admin/audit-logs` | ✗ | ✗ | ✓ |
| `GET /admin/system/health` | ✗ | ✗ | ✓ |
| `GET /admin/analytics/full` | ✗ | ✗ | ✓ |

---

## Admin Endpoints

> Tất cả `/admin/*` endpoints yêu cầu role `admin`. Trả 403 nếu không phải admin.

### GET `/admin/users`
```
// Query: ?role=reviewer&is_active=true&skip=0&limit=100
```
```json
// Response 200 (pagination dạng skip/limit)
{
  "total": 150,
  "skip": 0,
  "limit": 100,
  "items": [
    {
      "id": "...",
      "email": "reviewer@claimflow.vn",
      "full_name": "Trần Thị Bình",
      "role": "reviewer",
      "province": "TP. Hồ Chí Minh",
      "region": "south",
      "is_active": true,
      "created_at": "2026-05-28T12:00:00Z"
    }
  ]
}
```

### PATCH `/admin/users/{id}/role`
```json
// Request
{ "role": "reviewer" }       // user | reviewer | admin

// Response 200 — trả full user object đã update
{ "id": "...", "email": "...", "role": "reviewer", "is_active": true, ... }
// AuditLog: action="role_change", details: {old_role, new_role, target_email}

// Error 400: không thể tự hạ role của chính mình
{ "detail": "Không thể tự hạ quyền admin của chính mình" }
```

### PATCH `/admin/users/{id}/status`
```json
// Request — activate hoặc deactivate
{ "is_active": false }

// Response 200 — full user object
{ "id": "...", "is_active": false, ... }
// AuditLog: action="user_activate" hoặc "user_deactivate"

// Error 400: không thể tự deactivate chính mình
{ "detail": "Không thể tự vô hiệu hóa chính mình" }
```

> Không có `DELETE /admin/users/{id}` — soft delete dùng PATCH `/status` với `is_active=false`.

### GET `/admin/policies`
```
// Query: ?is_active=true
```
```json
// Response 200 — plain array (không wrap items/total)
[
  {
    "id": "...",
    "title": "Điều khoản bảo hiểm y tế 2024",
    "category": "health",
    "version": "1.0",
    "is_active": true,
    "chunk_count": 48,
    "coverage_types": ["health"],
    "last_ingested": "2026-05-01T00:00:00Z",
    "created_at": "...",
    "content_preview": "Điều 1: ... (200 ký tự đầu)..."
  }
]
```

### POST `/admin/policies`
JSON body — KHÔNG dùng multipart. Sau khi tạo doc, Celery task `ingest_policy_to_qdrant` chạy ngầm.
```json
// Request
{
  "title": "Điều khoản bảo hiểm bão lũ 2026",
  "content": "<full policy text — min 100 chars>",
  "category": "disaster",
  "version": "1.0",
  "coverage_types": ["disaster"]
}

// Response 201 — chunk_count=0 tại thời điểm tạo, sẽ update khi Celery xong
{
  "id": "...",
  "title": "...",
  "category": "disaster",
  "version": "1.0",
  "is_active": true,
  "chunk_count": 0,
  "coverage_types": ["disaster"],
  "last_ingested": null,
  "created_at": "...",
  "content_preview": "..."
}
// AuditLog: action="policy_upload"
```

### DELETE `/admin/policies/{id}`
```json
// Response 200 — soft delete + xóa vectors khỏi Qdrant
{ "ok": true, "vectors_deleted": 52 }
// Sets is_active=false + chunk_count=0
// Best-effort Qdrant delete (silent failure nếu Qdrant down)
// AuditLog: action="policy_delete"
```

### GET `/admin/audit-logs`
```
// Query (tất cả optional):
?action=role_change
&target_type=user
&actor_id=...
&from_date=2026-05-01T00:00:00      ISO 8601
&to_date=2026-05-31T23:59:59
&skip=0&limit=50
```
```json
// Response 200 — sort timestamp DESC
{
  "total": 234,
  "skip": 0,
  "limit": 50,
  "items": [
    {
      "id": "...",
      "timestamp": "2026-05-29T10:30:00Z",
      "actor_id": "...",
      "actor_email": "admin@claimflow.vn",
      "action": "role_change",
      "target_type": "user",
      "target_id": "...",
      "details": {
        "old_role": "user",
        "new_role": "reviewer",
        "target_email": "..."
      },
      "ip_address": "127.0.0.1"
    }
  ]
}
// action enum: role_change | user_deactivate | user_activate
//              policy_upload | policy_delete | claim_override
//              login_failed | login_success
// target_type enum: user | policy | claim
```

### GET `/admin/system/health`
```json
// Response 200 — ping mỗi service realtime
{
  "overall": "up",    // "up" | "degraded"
  "checked_at": "2026-05-29T10:30:00Z",
  "services": {
    "mongodb": { "status": "up", "latency_ms": 2.1 },
    "redis":   { "status": "up", "latency_ms": 1.4 },
    "qdrant":  { "status": "up", "latency_ms": 5.2, "collections": ["insurance_policies"] },
    "celery":  { "status": "up", "workers": ["celery@host"] }
    // hoặc { "status": "down", "error": "ConnectionRefused: ..." }
  }
}
```

### GET `/admin/analytics/full`
```json
// Response 200 — full system analytics (không filter theo user)
{
  "users": {
    "total": 150,
    "active": 142,
    "reviewers": 3
  },
  "claims": {
    "total": 534,
    "approved": 389,
    "rejected": 72,
    "manual_review": 45,
    "processing": 28,
    "approval_rate": 72.8,
    "fraud_rate": 6.2          // % claims có ai_fraud_score >= 70
  },
  "top_high_risk_provinces": [
    { "name": "Quảng Bình", "region": "central", "risk_score": 92 },
    { "name": "Hà Tĩnh",    "region": "central", "risk_score": 89 }
    // top 5 by overall_risk_score (chỉ tỉnh is_high_risk=true)
  ],
  "reviewer_performance": [
    {
      "reviewer_id": "...",
      "email": "reviewer@claimflow.vn",
      "full_name": "Trần Thị Bình",
      "total_reviewed": 47,
      "approved": 38,
      "approval_rate": 80.9
    }
    // sort by total_reviewed DESC, top 10
  ],
  "daily_claims": [
    { "date": "2026-04-30", "count": 12 }
    // 30 buckets, sort tăng dần
  ],
  "region_breakdown": { "north": 189, "central": 245, "south": 100, "unknown": 0 }
}
```

### GET `/admin/user-policies`
Danh sách user đã mua bảo hiểm + số lượng gói (để check bất thường). Admin only.
```json
{
  "total_buyers": 12,
  "buyers": [
    { "user_id": "...", "email": "a@x.vn", "full_name": "Nguyễn Văn A", "province": "Quảng Bình",
      "is_active": true, "total": 6, "active": 4, "expired": 1, "cancelled": 0, "voided": 1,
      "active_coverage": 2100000000, "active_premium": 21000000 }
    // sort total DESC
  ]
}
```

### GET `/admin/user-policies/user/{user_id}`
Drill-down tất cả gói của 1 user. Admin only.
```json
{ "user": { "id": "...", "email": "...", "full_name": "...", "province": "..." },
  "policies": [ { "id": "...", "policy_number": "CF-HEA-...", "policy_type": "health",
                  "plan_name": "...", "status": "voided", "voided_reason": "...", "voided_at": "..." } ] }
```

### PATCH `/admin/user-policies/{policy_id}/void`
Vô hiệu hoá gói bảo hiểm khi phát hiện bất thường. **Role `reviewer` hoặc `admin`** (`require_reviewer`). CSRF required. Ghi audit `policy_voided` + notify chủ gói.
```json
// Body
{ "reason": "Phát hiện gian lận / thông tin sai lệch" }   // min 3 ký tự
// Response 200 → policy đã cập nhật status:"voided"
// 409 nếu đã voided; 422 nếu thiếu reason
```

---

## Reviewer Endpoints

> Yêu cầu role `reviewer` hoặc `admin` (dependency `require_reviewer`). 403 nếu không đủ quyền.

### GET `/reviewer/queue`
```
// Query params (tất cả optional):
?province=Quảng Bình
&disaster_type=flood
&min_fraud_score=70
&skip=0&limit=50
```
```json
// Response 200 — Claims status=manual_review, sort created_at ASC (oldest first)
{
  "total": 12,
  "skip": 0,
  "limit": 50,
  "items": [
    {
      "id": "...",
      "user_id": "...",
      "claim_type": "disaster",
      "status": "manual_review",
      "amount_claimed": 30000000,
      "province": "Quảng Bình",
      "disaster_type": "flood",
      "ai_decision": "manual_review",
      "ai_reasoning": "Số tiền yêu cầu cao hơn 80% so với trung bình các claim disaster trong vùng.",
      "ai_fraud_score": 78,
      "ai_fraud_flags": ["amount_anomaly", "provider_not_whitelisted"],
      "ai_parsed_data": { "disaster_type": "flood", "damage_type": "residential" },
      "documents": [{ "id": "...", "doc_type": "insurance_policy", "file_name": "..." }],
      "created_at": "2026-05-29T07:00:00Z",
      "waiting_seconds": 7200
    }
  ]
}
```

### GET `/reviewer/stats`
```json
// Stats cá nhân của reviewer đang login
{
  "reviewer_id": "...",
  "reviewer_email": "reviewer@claimflow.vn",
  "reviewed_today": 5,
  "reviewed_week": 23,
  "reviewed_total": 47,
  "avg_review_time_minutes": 12.4,   // (reviewed_at - created_at) avg
  "override_rate": 8.5,               // %, claim có status ≠ ai_decision mapping
  "pending_in_queue": 12              // toàn hệ thống, không chỉ riêng reviewer
}
```

---

## TypeScript Types bổ sung

```typescript
// types/admin.ts
export type UserRole = 'user' | 'reviewer' | 'admin';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  province: string | null;
  region: string | null;
  is_active: boolean;
  claims_reviewed: number;
  created_at: string;
  last_login: string | null;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor_id: string;
  actor_email: string;
  action: 'role_change' | 'user_deactivate' | 'policy_upload'
        | 'policy_delete' | 'claim_override' | 'login_failed';
  target_type: 'user' | 'policy' | 'claim';
  target_id: string;
  details: Record<string, unknown>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  services: Record<string, { status: 'ok' | 'error'; latency_ms: number }>;
  celery: { workers_online: number; queue_depth: number; tasks_processed_today: number };
}

export interface AdminAnalytics {
  overview: {
    total_users: number;
    active_users_30d: number;
    new_users_7d: number;
    total_documents_ocr: number;
    ocr_cache_hit_rate: number;
    avg_ocr_confidence: number;
    total_claims: number;
    approval_rate: number;
    avg_processing_seconds: number;
    fraud_flagged_rate: number;
  };
  by_region: Record<string, number>;
  by_doc_type: Record<string, number>;
  by_disaster_type: Record<string, number>;
  top_high_risk_provinces: { province: string; claims_count: number; risk_score: number }[];
  reviewer_performance: {
    reviewer_id: string;
    reviewer_name: string;
    claims_reviewed: number;
    avg_review_time_minutes: number;
    override_rate: number;
  }[];
}

export interface PolicyDocument {
  id: string;
  title: string;
  category: string;
  version: string;
  is_active: boolean;
  chunk_count: number;
  last_ingested: string;
  created_at: string;
}

export interface ReviewerQueueItem {
  id: string;
  status: 'manual_review';
  claim_type: ClaimType;
  province: string | null;
  amount_claimed: number;
  ai_fraud_score: number;
  ai_fraud_flags: string[];
  submitted_by: { id: string; full_name: string };
  created_at: string;
  waiting_since: string;
}
```
