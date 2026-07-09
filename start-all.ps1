# start-all.ps1 — Khởi động cả 4 terminal ClaimFlow trong Windows Terminal (wt)
# Tab 2 (Backend) & 3 (Celery) tự Activate.ps1 venv TRƯỚC rồi mới chạy uvicorn/celery.
# Dùng: mở PowerShell ở thư mục gốc repo -> .\start-all.ps1

$root = "C:\Project\AI-Claims-Processing-Assistant"

# Lưu ý: dấu `;` BÊN TRONG mỗi -Command phải escape thành `\;` để wt không cắt nhầm
# thành tab mới (wt dùng `;` làm dấu ngăn tab). `; ở đầu dòng = dấu ngăn tab cho wt.
wt --title "1·Infra"    -d "$root"          powershell -NoExit -Command "docker compose up -d\; docker compose ps" `
 `; new-tab --title "2·Backend"  -d "$root\backend"  powershell -NoExit -ExecutionPolicy Bypass -Command ".\venv\Scripts\Activate.ps1\; uvicorn app.main:app --reload --port 8000" `
 `; new-tab --title "3·Celery"   -d "$root\backend"  powershell -NoExit -ExecutionPolicy Bypass -Command ".\venv\Scripts\Activate.ps1\; celery -A app.tasks worker --loglevel=info --pool=solo" `
 `; new-tab --title "4·Frontend" -d "$root\frontend" powershell -NoExit -Command "npm run dev"
