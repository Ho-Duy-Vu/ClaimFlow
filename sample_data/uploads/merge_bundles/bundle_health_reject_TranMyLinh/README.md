# Combo demo — Bồi thường SỨC KHỎE (kịch bản TỪ CHỐI)

Khách hàng **Trần Mỹ Linh** · TP.HCM · phẫu thuật **thẩm mỹ tự nguyện** (không phải y tế cần thiết → thuộc điều khoản LOẠI TRỪ).

| File | Vai trò |
|------|---------|
| `cccd_tran_my_linh.pdf` | CCCD |
| `policy_health_linh.pdf` | Hợp đồng bảo hiểm sức khỏe (hạn mức 500.000.000 VND) |
| `invoice_tham_my_linh_REJECT.pdf` | Hóa đơn thẩm mỹ (nâng ngực + hút mỡ) — **78.000.000 VND** |

## Cách chạy
1. Mua gói **Sức khỏe (health)**.
2. Upload 3 file.
3. Tạo claim: loại **Sức khỏe**, số tiền **78.000.000**, mô tả "phẫu thuật thẩm mỹ nâng ngực + hút mỡ".

## Vì sao TỪ CHỐI
- Node `check_coverage` (RAG trên điều khoản gói sức khỏe) nhận diện **thẩm mỹ tự nguyện thuộc mục loại trừ** → `is_covered=false` → **reject**.
- Đây là combo để test nhánh **từ chối** + nút **"Vì sao?"** giải thích lý do cho khách hàng.

> Kết quả phụ thuộc RAG đọc đúng điều khoản loại trừ. Nếu policy chưa ingest vào Qdrant, chạy `python scripts/ingest_policies.py` trước.
