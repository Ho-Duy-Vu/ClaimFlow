# Combo demo — Bồi thường SỨC KHỎE (kịch bản DUYỆT)

Bộ 3 file tự nhất quán để test AI agent đánh giá & **duyệt** một yêu cầu bồi thường sức khỏe hợp lệ.

| File | Vai trò |
|------|---------|
| `cccd_tran_van_minh.pdf` | CCCD — định danh khách hàng |
| `policy_health_minh.pdf` | Hợp đồng bảo hiểm sức khỏe (hạn mức 500.000.000 VND) |
| `invoice_ruot_thua_minh_APPROVE.pdf` | Hóa đơn viện phí — viêm ruột thừa cấp, tổng **12.350.000 VND** |

**Khách hàng:** Trần Văn Minh · CCCD 075088001234 · Bình Dương (không phải vùng thiên tai → hợp gói sức khỏe).

## Cách chạy demo
1. **Mua gói** bảo hiểm loại **Sức khỏe** (health) cho tài khoản đang đăng nhập (hạn mức ≥ 12,35tr — mọi gói health đều đủ).
2. Vào **Tài liệu** → upload 3 file trên (hoặc dùng "AI hợp nhất hồ sơ").
3. Vào **Yêu cầu bồi thường** → tạo claim:
   - Loại: **Sức khỏe (health)**
   - Số tiền: **12.350.000** (≤ hạn mức)
   - Tỉnh: **Bình Dương** · Không chọn loại thiên tai
   - Mô tả: *"Nhập viện mổ nội soi viêm ruột thừa cấp tại BV Đa khoa Bình Dương, nằm viện 3 ngày."*
   - Đính kèm **hóa đơn viện phí** làm chứng từ (đính kèm cả 3 file càng tốt — health cần ~3 chứng từ).

## Vì sao AI nên DUYỆT
- **is_covered = true**: claim health, không có disaster_type, số tiền ≤ hạn mức.
- **fraud thấp**: mô tả rõ ràng + chứng từ đầy đủ + số tiền hợp lý với chẩn đoán → điểm ~15-30.
- Ngưỡng auto-approve mới: fraud < 70 → **duyệt tự động**.

> Nếu vẫn ra `manual_review`/điểm cao bất thường: kiểm tra `GEMINI_MODEL_DEFAULT` — nên trỏ tới model đủ mạnh (model quá yếu dễ chấm fraud sai).
