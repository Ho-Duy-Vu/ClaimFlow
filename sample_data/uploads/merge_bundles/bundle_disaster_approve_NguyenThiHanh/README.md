# Combo demo — Bồi thường THIÊN TAI (kịch bản DUYỆT)

Khách hàng **Nguyễn Thị Hạnh** · Quảng Bình (vùng rủi ro cao) · lũ lụt.

| File | Vai trò |
|------|---------|
| `cccd_nguyen_thi_hanh.pdf` | CCCD |
| `policy_disaster_hanh.pdf` | Hợp đồng bảo hiểm thiên tai (hạn mức 500.000.000 VND) |
| `disaster_report_hanh_APPROVE.pdf` | Biên bản UBND xác nhận thiệt hại lũ lụt — **85.000.000 VND** |

## Cách chạy
1. Mua gói **Thiên tai (disaster)**.
2. Upload 3 file.
3. Tạo claim: loại **Thiên tai**, **loại thiên tai = Lũ lụt (flood)**, tỉnh **Quảng Bình**, số tiền **85.000.000**, mô tả rõ, đính kèm biên bản.

## Vì sao DUYỆT
- `is_covered=true`: claim disaster + có disaster_type + Quảng Bình thuộc vùng rủi ro cao + số tiền ≤ hạn mức.
- fraud thấp (vùng đúng, chứng từ chính quyền, mô tả rõ) → auto-approve.
