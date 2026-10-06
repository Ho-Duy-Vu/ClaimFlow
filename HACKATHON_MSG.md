# ClaimFlow — Tin nhắn giới thiệu ngắn gọn cho BGK

> Dùng khi trao đổi nhắn tin với doanh nghiệp (Tasco) để nắm rõ đề tài.
> Chọn 1 trong các mẫu bên dưới tùy ngữ cảnh.

---

## ✉️ MẪU 1 — Giới thiệu lần đầu (3–4 dòng)

Xin chào anh/chị, em xin giới thiệu dự án **ClaimFlow** tham dự Track Map.

Ý tưởng chính: xây dựng **lớp bản đồ rủi ro thiên tai** trên 63 tỉnh/thành Việt Nam — người dùng upload CCCD hoặc các giấy tờ tùy thân, hệ thống **OCR tự động trích xuất thông tin cá nhân** (họ tên, ngày sinh, địa chỉ, tỉnh/thành). Nếu upload nhiều file, hệ thống **merge tất cả theo dạng field-value** thành một bộ dữ liệu hoàn chỉnh — tự động detect tỉnh → hiển thị risk score trên bản đồ → **pre-fill sẵn form mua bảo hiểm**, không cần nhập tay. Khi có sự cố, form nộp bồi thường hỗ trợ **upload trực tiếp ảnh/chứng từ hiện trường làm nguồn chính** song song với **tái sử dụng kho hồ sơ đã OCR làm nguồn phụ đồng bộ**, AI pre-screen hồ sơ và tự động quyết định với claim đơn giản, claim lớn hoặc nghi ngờ gian lận sẽ chuyển reviewer con người.

Dự án kết hợp cả bản đồ (Leaflet/GeoJSON) lẫn insurtech — em thấy khá phù hợp với hệ sinh thái Vmap + Tasco Insurance.

---

## ✉️ MẪU 2 — Trả lời khi BGK hỏi "dự án làm gì?"

ClaimFlow gồm 3 phần chính:
1. 🗺️ **Bản đồ rủi ro thiên tai số (63/63 tỉnh thành)** — chuẩn WGS84, lọc động nhiệt độ rủi ro theo từng loại thiên tai (Bão/Lũ/Sạt lở/Ngập úng/Hạn hán), kèm tổng quan rủi ro quốc gia và tìm kiếm nhanh tỉnh.
2. 🤖 **AI gợi ý & Pre-fill bảo hiểm** — phân tích OCR giấy tờ hoặc vị trí tỉnh để tự động điền form và đề xuất đúng gói bảo hiểm phù hợp vùng địa lý.
3. ⚡ **AI claim processing & nộp chứng từ 2 nguồn** — hỗ trợ upload trực tiếp ảnh/chứng từ hiện trường làm nguồn chính kết hợp tái sử dụng hồ sơ OCR làm nguồn phụ đồng bộ; AI pre-screen và tự động duyệt claim nhỏ, chuyển reviewer con người với claim lớn.

Stack: Next.js + FastAPI + Leaflet + Google Gemini + LangGraph + Qdrant RAG.

---

## ✉️ MẪU 3 — Trả lời khi BGK hỏi "liên quan Map như thế nào?"

Yếu tố bản đồ là **trung tâm** của ClaimFlow, không phải phụ trợ:
- Bản đồ số phủ trọn vẹn 63/63 tỉnh thành Việt Nam (đã chuẩn hóa WGS84 GeoJSON không thiếu tỉnh nào).
- **Lớp dữ liệu đa chiều:** xem nhiệt rủi ro theo từng loại thiên tai (Bão ở miền Trung, Ngập úng ở ĐBSCL, Sạt lở ở miền núi phía Bắc).
- **Tương tác thời gian thực:** click vào tỉnh hiển thị bảng phân tích rủi ro chi tiết + gợi ý gói bảo hiểm phù hợp + nút mua ngay cho địa phương đó.
- **Tích hợp ngược với OCR:** người dùng tải CCCD → hệ thống tự nhận diện tỉnh → tự động zoom bản đồ và tính toán rủi ro khu vực đó để khuyến nghị bảo hiểm.

Lớp dữ liệu chuyên đề rủi ro thiên tai này hiện chưa có trên bất kỳ nền tảng bản đồ số nào tại Việt Nam.

---

## ✉️ MẪU 4 — Trả lời khi BGK hỏi "liên quan Tasco như thế nào?"

Tasco có 2 mảng: **Vmap** (bản đồ) và **Tasco Insurance** (bảo hiểm).
ClaimFlow là lớp ứng dụng AI kết nối 2 mảng đó:

> Dữ liệu địa lý Vmap → Rủi ro thiên tai → Gợi ý bảo hiểm Tasco → Tự động bồi thường

Đề xuất tích hợp: nhúng lớp rủi ro thiên tai vào Vmap, người dùng thấy ngay vùng mình đang đứng rủi ro như thế nào và mua bảo hiểm phù hợp ngay trên bản đồ.

---

## ✉️ MẪU 5 — Trả lời khi BGK hỏi "dữ liệu lấy từ đâu?"

- **GeoJSON 63 tỉnh:** tự convert từ UTM48N → WGS84 chuẩn quốc tế
- **Risk Score:** tính từ dữ liệu thiên tai lịch sử 10 năm (Bộ NN&PTNT public data)
- **Demo data:** 63 tỉnh geo_risk, ~80 claims, ~30 policies giả lập
- **V2:** tích hợp API NCHMF (Trung tâm khí tượng thủy văn) để cập nhật real-time khi có bão/lũ

---

## ✉️ MẪU 6 — Trả lời khi BGK hỏi "AI duyệt bồi thường vài giây — có đúng không?"

Dạ đúng một phần — em xin làm rõ hơn:

AI trong ClaimFlow đóng vai trò **pre-screening**, không phải duyệt toàn bộ:
- ✅ **Claim đơn giản, rõ ràng** (đủ giấy tờ, số tiền nhỏ, không nghi ngờ) → AI tự duyệt nhanh
- ⚠️ **Claim trung bình** → AI phân tích + chuyển reviewer con người xác nhận lần cuối
- 🔴 **Claim lớn hoặc fraud score cao** → bắt buộc chuyển Manual Review, reviewer xem xét toàn bộ hồ sơ và AI reasoning trước khi quyết định

Giá trị thực sự là: **AI loại bỏ ~70% thao tác thủ công** ở khâu đọc hồ sơ, kiểm tra điều khoản, phát hiện gian lận — reviewer chỉ cần ra quyết định cuối thay vì xử lý từ đầu.

---

## ✉️ MẪU 7 — Trả lời khi BGK hỏi "Tài khoản cá nhân có mua được cho người thân không? Đăng ký có phiền không?"

Dạ ClaimFlow được thiết kế theo tư duy **Hộ gia đình (Family Hub)** chứ không giới hạn trong 1 cá nhân:
- **Bên mua bảo hiểm vs Người được bảo hiểm:** Một chủ tài khoản có thể mua và quản lý nhiều hợp đồng cho bản thân, vợ/chồng, con cái hoặc bố mẹ già, cũng như bảo hiểm cho nhiều tài sản khác nhau (nhiều xe máy/ô tô, nhiều nhà ở).
- **Tự động điền & Cách ly dữ liệu an toàn (State Isolation):** Hệ thống tự động nhận diện tài liệu thuộc về chính chủ hay người thân. Khi chuyển đổi qua lại giữa "Bản thân" và "Người thân", dữ liệu cá nhân (CCCD, ngày sinh, địa chỉ) được cách ly tuyệt đối, không bao giờ bị lai ghép sai lệch; ngày sinh tự động chuẩn hóa ISO `YYYY-MM-DD` hiển thị mượt mà trên mọi trình duyệt.
- **Đăng ký siêu tinh giản:** Form đăng ký chỉ cần Email + Mật khẩu (5 giây), không bắt chọn tỉnh thành ban đầu. Toàn bộ thông tin địa bàn và rủi ro thiên tai sẽ được AI tự nhận diện qua tài liệu thực tế hoặc vị trí GPS/IP khi người dùng trải nghiệm.

---

## 🎯 Một câu tóm tắt toàn bộ (học thuộc):

> **"ClaimFlow biến bản đồ Việt Nam thành công cụ bảo hiểm thông minh — người dân biết rủi ro nơi họ sống, mua đúng bảo hiểm cho cả gia đình bằng tài liệu số hóa với độ chính xác và bảo mật thông tin tuyệt đối, và khi có sự cố AI pre-screen hồ sơ bồi thường thay vì xử lý thủ công từ đầu — reviewer chỉ cần ra quyết định cuối."**
