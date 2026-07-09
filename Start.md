# Start.md — ClaimFlow Startup Guide

> Chuỗi lệnh chuẩn để khởi động ClaimFlow mỗi lần bắt đầu phiên làm việc.
> Mỗi block chạy ở **một terminal riêng** (trừ block 1).

---

## 0. One-command launch (Windows Terminal — chạy hết 4 terminal cho lẹ)

> Yêu cầu **Windows Terminal** (`wt`). Mở 4 tab: Infra · Backend · Celery · Frontend.
> Backend/Celery tự `Activate.ps1` venv **trước rồi mới** chạy uvicorn/celery.
> Paste nguyên dòng dưới vào **PowerShell** (chú ý các `` `; `` ngăn cách giữa các tab):

```powershell
wt --title "1·Infra" -d "C:\Project\AI-Claims-Processing-Assistant" powershell -NoExit -Command "docker compose up -d\; docker compose ps" `; new-tab --title "2·Backend" -d "C:\Project\AI-Claims-Processing-Assistant\backend" powershell -NoExit -ExecutionPolicy Bypass -Command ".\venv\Scripts\Activate.ps1\; uvicorn app.main:app --reload --port 8000" `; new-tab --title "3·Celery" -d "C:\Project\AI-Claims-Processing-Assistant\backend" powershell -NoExit -ExecutionPolicy Bypass -Command ".\venv\Scripts\Activate.ps1\; celery -A app.tasks worker --loglevel=info --pool=solo" `; new-tab --title "4·Frontend" -d "C:\Project\AI-Claims-Processing-Assistant\frontend" powershell -NoExit -Command "npm run dev"
```

> **Lưu ý escape:** dấu `;` **bên trong** mỗi `-Command` phải viết thành `\;` để Windows Terminal không cắt nhầm thành tab mới (wt dùng `;` làm dấu ngăn tab). Dấu `` `; `` ở giữa các tab là dấu ngăn tab cố ý.

> Muốn để dành xài lại: lưu nội dung trên thành `start-all.ps1` ở thư mục gốc rồi chỉ cần gõ `.\start-all.ps1`.
> Các block 1–4 bên dưới là phiên bản chạy **thủ công từng terminal** (khi cần debug riêng lẻ).

---

## 1. Hạ tầng (Docker — chạy 1 lần, để nền)

```bash
cd C:/Project/AI-Claims-Processing-Assistant
docker compose up -d
docker compose ps        # verify mongodb, redis, qdrant, minio đều "healthy"
```

**Service map:**

| Service        | URL / Port                        | Credentials              |
|----------------|-----------------------------------|--------------------------|
| MongoDB        | `localhost:27018`                 | admin:admin              |
| Mongo Express  | http://localhost:8081             | —                        |
| Redis          | `localhost:6379`                  | —                        |
| Qdrant         | http://localhost:6333             | —                        |
| MinIO API      | http://localhost:9000             | minioadmin:minioadmin    |
| MinIO Console  | http://localhost:9001             | minioadmin:minioadmin    |

> ⚠ `.env` đang trỏ `MONGODB_URL=mongodb://localhost:27017` (local mongo không auth).
> Nếu xài Docker mongo, đổi sang `mongodb://admin:admin@localhost:27018`.

---

## 2. Backend API (Terminal 2)

```bash
cd C:/Project/AI-Claims-Processing-Assistant/backend
# Lần đầu / sau khi đổi dependency:
# python -m venv venv && source venv/Scripts/activate && pip install -r requirements.txt
source venv/Scripts/activate
uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/docs

---

## 3. Celery worker (Terminal 3 — bắt buộc cho OCR + ingest policy)

```bash
cd C:/Project/AI-Claims-Processing-Assistant/backend
source venv/Scripts/activate
celery -A app.tasks worker --loglevel=info --pool=solo    # --pool=solo cần thiết trên Windows
```

> Celery tìm app instance qua `app/tasks/__init__.py` (re-export `celery_app`).
> Nếu lỗi `Module 'app.tasks' has no attribute 'celery'` → kiểm tra `__init__.py`
> có dòng `from app.tasks.document_processor import celery_app` không.

---

## 4. Frontend (Terminal 4)

```bash
cd C:/Project/AI-Claims-Processing-Assistant/frontend
npm run dev
```

App: http://localhost:3000/vi (default locale `vi`, switch sang `/en` qua LanguageSwitcher)

---

## 5. Seed dữ liệu (chỉ lần đầu, hoặc khi reset DB)

```bash
cd C:/Project/AI-Claims-Processing-Assistant/backend
source venv/Scripts/activate
python scripts/seed.py                  # base: users + 63 tỉnh geo_risks + policies
python scripts/seed_demo_data.py        # +12 users, ~30 policies, ~80 claims, docs, chats, audit logs
python scripts/ingest_policies.py       # đẩy policies vào Qdrant cho RAG chatbot
python scripts/generate_sample_docs.py  # PDF + JPG + merge bundles → sample_data/uploads/
```

> Sau khi chạy: file mẫu nằm ở `sample_data/uploads/` chia theo loại (cccd, driver_license, ...).
> Login: `pham.huong@example.com` / `Demo@123` (Quảng Bình) hoặc dùng bảng trong `sample_data/uploads/README.md`.

---

## Lệnh tắt khi nghỉ

```bash
docker compose stop          # giữ data
# hoặc
docker compose down          # xóa container, giữ volume
# docker compose down -v     # ⚠ xóa luôn dữ liệu MongoDB / Qdrant / MinIO
```

---

## Thứ tự khuyến nghị mỗi sáng

1. `docker compose up -d` → đợi `docker compose ps` thấy tất cả healthy.
2. Mở **Terminal 2** → `uvicorn app.main:app --reload --port 8000`.
3. Mở **Terminal 3** → `celery -A app.tasks worker --loglevel=info --pool=solo`.
4. Mở **Terminal 4** → `npm run dev`.
5. Vào http://localhost:3000/vi để xác nhận login chạy.

---

## Troubleshooting nhanh

| Triệu chứng                                | Cách xử lý                                                                 |
|--------------------------------------------|----------------------------------------------------------------------------|
| `uvicorn: command not found`               | Chưa activate venv → `source venv/Scripts/activate`                        |
| Backend báo `ServerSelectionTimeoutError`  | MongoDB chưa up → `docker compose ps`, đợi `healthy`                       |
| OCR upload xong không có kết quả           | Celery worker chưa chạy → mở Terminal 3                                    |
| Frontend lỗi `ECONNREFUSED localhost:8000` | Backend chưa start → kiểm tra Terminal 2                                   |
| Port 27017 / 6379 / 9000 bị chiếm          | Tắt service local trùng port, hoặc đổi port mapping trong `docker-compose` |
| Chatbot trả lời generic, không có RAG      | Chưa chạy `python scripts/ingest_policies.py`                              |
