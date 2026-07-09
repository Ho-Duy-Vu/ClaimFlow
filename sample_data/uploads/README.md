# Sample Documents — ClaimFlow

Thư mục này chứa file mẫu để test pipeline OCR + Merge + Submit Claim.

## Cấu trúc

- `cccd/` — Căn cước công dân (3 PDF + 2 JPG)
- `driver_license/` — Giấy phép lái xe (2 PDF + 1 JPG)
- `insurance_policy/` — Hợp đồng bảo hiểm (3 PDF — health/disaster/vehicle)
- `medical_invoice/` — Hóa đơn viện phí (4 PDF — bao gồm 1 case REJECT)
- `disaster_report/` — Biên bản thiên tai (3 PDF — flood/storm/landslide)
- `vehicle_doc/` — Đăng ký xe + biên bản tai nạn (2 PDF + 1 JPG)
- `merge_bundles/` — Bộ tài liệu cùng người để test Merge

## Test Scenarios

### Scenario A — OCR đơn lẻ
Upload `cccd/cccd_nguyen_van_an.jpg` → trang Documents → verify field
`id_number, full_name, place_of_origin, place_of_residence` đúng.

### Scenario B — OCR + Submit Claim disaster (APPROVE)
1. Đăng ký bảo hiểm: chọn `disaster` → gói **Nâng Cao**
2. Upload `disaster_report/disaster_flood_QB_AN.pdf` (có chứng từ chính quyền)
3. Submit claim type=`disaster`, amount=45,000,000, province="Quảng Bình"
4. AI nên `approve` (low fraud, có biên bản UBND, trong coverage)

### Scenario C — OCR + Submit Claim health (REJECT)
1. Mua gói `health` cơ bản
2. Upload `medical_invoice/invoice_tham_my_REJECT.pdf`
3. Submit claim type=`health`, amount=18,000,000
4. AI nên `reject` (thẩm mỹ không nằm trong phạm vi bảo hiểm sức khỏe)

### Scenario D — Merge bundle
1. Vào trang Documents
2. Upload toàn bộ folder `merge_bundles/bundle_1_NguyenVanAn_QuangBinh/`
3. Bấm **Merge** → kết quả gộp 5 file thành 1 hồ sơ:
   - Personal info từ CCCD + GPLX (khớp nhau)
   - Policy info từ insurance contract
   - Medical history từ hóa đơn
   - Disaster info từ biên bản UBND
4. Conflict expected: address có thể khác nhau giữa CCCD và GPLX → flag

### Scenario E — Reviewer manual review (high fraud)
1. Bundle 3 (Phạm Thị Hoa — Hà Tĩnh):
   - Upload đăng ký xe + biên bản tai nạn + biên bản bão
   - Submit 2 claim cùng tuần → fraud detector flag `similar_recent_claim`
2. Login as `reviewer@claimflow.vn` / `Reviewer@123`
3. Vào `/reviewer` → thấy 2 claim trong queue → review

## Login mẫu

Sau khi chạy `seed.py` + `seed_demo_data.py`:

| Email                       | Password    | Role     | Tỉnh           |
|-----------------------------|-------------|----------|----------------|
| admin@claimflow.vn          | Admin@123   | admin    | Hà Nội         |
| reviewer@claimflow.vn       | Reviewer@123| reviewer | TP. HCM        |
| pham.huong@example.com      | Demo@123    | user     | Quảng Bình     |
| bui.thuy@example.com        | Demo@123    | user     | TP. HCM        |
| user1@example.com           | User1@123   | user     | Quảng Bình     |

## Regenerate

```bash
cd backend
python scripts/generate_sample_docs.py
```

Script idempotent — file đã có sẽ bị ghi đè.
