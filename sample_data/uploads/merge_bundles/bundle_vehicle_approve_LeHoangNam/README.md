# Combo demo — Bồi thường XE CỘ (kịch bản DUYỆT)

Khách hàng **Lê Hoàng Nam** · Hà Nội · va chạm giao thông, lỗi thuộc bên thứ ba.

| File | Vai trò |
|------|---------|
| `cccd_le_hoang_nam.pdf` | CCCD |
| `policy_vehicle_nam.pdf` | Hợp đồng bảo hiểm xe cộ (hạn mức 300.000.000 VND) |
| `dangky_xe_nam.pdf` | Giấy đăng ký xe (Toyota Vios 30K-123.45) |
| `bienban_csgt_nam.pdf` | Biên bản tai nạn giao thông (CSGT) |
| `baogia_sua_xe_nam_APPROVE.pdf` | Báo giá sửa chữa — **33.000.000 VND** |

## Cách chạy
1. Mua gói **Xe cộ (vehicle)**.
2. Upload 5 file (đính kèm biên bản CSGT + báo giá làm chứng từ — vehicle cần ~3 chứng từ).
3. Tạo claim: loại **Xe cộ**, số tiền **33.000.000**, mô tả va chạm rõ.

## Vì sao DUYỆT
- `is_covered=true`: claim vehicle, số tiền ≤ hạn mức.
- fraud thấp: có biên bản CSGT + báo giá gara chính hãng + mô tả rõ → auto-approve.
