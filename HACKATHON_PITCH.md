# ClaimFlow × Track Map — Mô tả dự án cho Hackathon

> 📄 File này được tạo cho cuộc thi Hackathon Track Map by Tasco.
> Xem bản tin nhắn ngắn gọn cho BGK ở file `HACKATHON_MSG.md`.

---

## 🎯 TÊN DỰ ÁN

**ClaimFlow** — Nền tảng bảo hiểm thông minh tích hợp Bản đồ Rủi ro Thiên tai Việt Nam

> *"Biết địa điểm bạn sống — biết rủi ro bạn đối mặt — bảo vệ đúng thứ bạn cần"*

---

## 📌 MÔ TẢ NGẮN (1 đoạn — dùng cho slide đầu)

ClaimFlow là ứng dụng insurtech AI tích hợp **lớp bản đồ rủi ro thiên tai** dành riêng cho người Việt Nam. Dựa trên vị trí địa lý của người dùng (tỉnh/thành phố), hệ thống tự động đánh giá điểm rủi ro thiên tai (Bão · Lũ · Sạt lở · Ngập úng) theo từng tỉnh trong 63 tỉnh/thành, gợi ý gói bảo hiểm phù hợp, và xử lý yêu cầu bồi thường bằng AI — tất cả hiển thị trực quan trên bản đồ choropleth Leaflet phủ toàn bộ lãnh thổ Việt Nam.

---

## 🗺️ LỚP BẢN ĐỒ CHUYÊN ĐỀ — Điểm cốt lõi

**Track phù hợp:** Y tế & Tiếp cận dịch vụ / **Dữ liệu & Đô thị** / Quy hoạch & Hạ tầng  
→ **Cụ thể nhất:** Lớp dữ liệu **Rủi ro Thiên tai theo Tỉnh/Thành** (Disaster Risk Intelligence Layer)

| Lớp dữ liệu | Nội dung |
|---|---|
| **Choropleth Risk Map** | 63 tỉnh màu sắc theo risk score 0–100 (đỏ = rủi ro cao) |
| **Disaster Type Layer** | Mỗi tỉnh gắn nhãn loại thiên tai chính: Bão / Lũ / Ngập / Sạt lở |
| **Insurance Recommendation Layer** | Popup gợi ý gói bảo hiểm phù hợp khi click vào tỉnh |
| **Claim Density Layer** | Mật độ yêu cầu bồi thường theo vùng (Bắc/Trung/Nam) |

---

## 🏆 TÍNH NĂNG CHÍNH (Core Features)

### 1. 🌍 Geo Risk Intelligence — Bản đồ Rủi ro Thiên tai Số Toàn diện
- **Bản đồ số Leaflet chuẩn WGS84 phủ toàn bộ 63/63 tỉnh thành Việt Nam** (đã chuẩn hóa địa giới toàn quốc, không thiếu tỉnh nào).
- **Lớp nền Streets mặc định:** Bản đồ dạng đường phố quen thuộc, sắc nét, định vị các tuyến đường và quận/huyện trực quan.
- **Dropdown thông minh 5 lớp thiên tai:** Lọc động nhiệt rủi ro chuyên biệt với icon và badge số tỉnh nguy cơ cao: 🌀 Bão · 🌊 Lũ lụt · ⛰️ Sạt lở · 🌧️ Ngập úng · ☀️ Hạn hán, hoặc chế độ 🌈 Tổng hợp.
- **Định vị thông minh chống Cold-Start:** Nhận diện vị trí tự động qua GPS và IP Geolocation, kèm nút bấm "Vị trí của tôi" bay thẳng tới địa phương.
- **Thống kê rủi ro quốc gia & Top 5 vùng nguy cơ:** Bảng tổng quan phân bố mức độ rủi ro (Rất cao, Cao, Trung bình, Thấp) và danh sách Top 5 tỉnh nguy cơ cao nhất kèm phím tắt zoom trực tiếp.
- **Gắn kết trực tiếp với sản phẩm bảo hiểm:** Click vào tỉnh mở ngay thẻ phân tích chi tiết yếu tố địa hình, thanh đo rủi ro 5 loại thiên tai, khuyến nghị AI và nút chuyển thẳng sang mua bảo hiểm cho địa phương đó.

### 2. 📄 Document Intelligence — OCR Thông minh Tiếng Việt
- Upload CCCD, hợp đồng bảo hiểm, bằng lái xe, hộ chiếu, đăng ký xe
- OCR tiếng Việt độ chính xác cao bằng **Gemini Vision API**
- Trích xuất có cấu trúc → JSON → auto-detect tỉnh → fetch risk map ngay lập tức
- Merge nhiều tài liệu, highlight vùng đã trích xuất, export JSON/Markdown

### 3. 📋 Insurance Registration Flow & Family Hub — Đăng ký Hộ gia đình
- **Chuẩn hóa ngày sinh tự động (`YYYY-MM-DD`):** Tự động chuyển đổi ngày sinh Việt Nam (`DD/MM/YYYY`) sang chuẩn quốc tế, triệt tiêu hoàn toàn lỗi trắng ô input trên trình duyệt.
- **Mô hình Hộ gia đình (Family Hub):** Một tài khoản có thể mua và quản lý hợp đồng cho bản thân, vợ/chồng, con cái, cha mẹ già.
- **Kiến trúc State Isolation (Cách ly dữ liệu an toàn):** Tự động nhận diện tài liệu của người thân hay chính chủ; chuyển đổi qua lại giữa "Bản thân" và "Người thân" mà không làm rò rỉ hay lai ghép số CCCD, ngày sinh, địa chỉ.
- **Nghiệp vụ Đa Hợp đồng & Chống trùng lặp theo đối tượng:** Cho phép 1 tài khoản mua nhiều xe (kiểm tra theo biển số), nhiều nhà (kiểm tra theo địa chỉ) và nhiều người thân trong gia đình.
- **6 loại bảo hiểm** (Sức khỏe / Nhân thọ / Tài sản / Xe cộ / Thiên tai / Thu nhập) × 3 gói (Cơ Bản / Nâng Cao / Toàn Diện).

### 4. 🔍 AI Claim Processing — Xử lý Yêu cầu Bồi thường Tự động
- **Gửi chứng từ linh hoạt**: Hỗ trợ **upload trực tiếp tài liệu & hình ảnh** hiện trường, hóa đơn viện phí (Upload chính) song song với **tái sử dụng kho hồ sơ đã OCR** (Upload phụ / đồng bộ), giúp người dùng không phải nhập hay tải lại giấy tờ đã có.
- **LangGraph 4-node agent**: `extract_data → check_coverage → fraud_detection → make_decision`
- RAG pipeline trên Qdrant: tìm kiếm điều khoản chính sách liên quan
- Real-time qua WebSocket: người dùng thấy tiến trình xử lý live
- Kết quả: **Tự động duyệt / Từ chối / Chuyển Reviewer / Cần thêm hồ sơ**

### 5. 💬 AI Insurance Chatbot — Tư vấn theo Vùng miền
- Gemini Pro tư vấn 24/7, cá nhân hóa theo **vị trí địa lý** người dùng
- Gợi ý combo phù hợp vùng cao rủi ro: "Sống ở miền Trung → nên mua thêm bảo hiểm Thiên tai + Tài sản"
- Điều hướng hành động trực tiếp bằng liên kết trong câu trả lời (Actionable Links)
- Bảo vệ PII: không lộ CCCD/SĐT/địa chỉ, chỉ dùng tên tỉnh và vùng miền

### 6. 👁️ AI Vision Giám Định Tổn Thất & Chống Gian Lận (AI Loss Adjuster & Fraud Detection)
- **Giám định thị giác thông minh:** Sử dụng Gemini Vision phân tích trực tiếp ảnh hiện trường tai nạn xe, ngập nước, tốc mái hoặc hóa đơn điều trị.
- **Bóc tách tổn thất có cấu trúc:** Phân loại mức độ thiệt hại (`minor` | `moderate` | `severe` | `total_loss`), tính tỷ lệ % tổn thất, liệt kê chi tiết linh kiện hỏng hóc và ước tính khung chi phí bồi thường thực tế (VND).
- **Hành động 1 chạm:** Tự động điền số tiền khuyến nghị của AI vào form yêu cầu bồi thường.
- **Lá chắn chống gian lận:** Tự động phát hiện ảnh chụp lại từ màn hình khác, ảnh cắt ghép, hoặc sự bất nhất giữa ảnh với mô tả sự cố để cảnh báo Thẩm định viên (Reviewer).

### 7. 🚨 Mạng Lưới Đối Tác Bảo Lãnh & Cứu Hộ Khẩn Cấp SOS (SOS & Cashless Network)
- **Bản đồ hành động thực tế (Actionable Partner Map):** Số hóa mạng lưới Gara sửa chữa ô tô/xe máy, Bệnh viện đa khoa liên kết và Đội cứu hộ 24/7 phủ khắp các vùng miền (Hà Nội, Đà Nẵng, Quảng Bình, TP.HCM, Cần Thơ, Hải Phòng).
- **Điều phối cứu hộ 1 chạm (🚨 SOS Hiện trường):** Tự động bắt tọa độ GPS, quét và gợi ý 3 cơ sở cứu trợ/gara gần nhất dựa trên khoảng cách địa lý (thuật toán Haversine km).
- **Mã bảo lãnh khẩn cấp tức thì (Cashless QR Guarantee):** Xuất trình mã QR bảo lãnh sự cố tại chỗ với hạn mức tạm ứng lên tới 30.000.000 đ, cho phép khách hàng được cứu hộ, nhập viện hoặc sửa xe ngay lập tức mà không cần trả tiền túi trước.

---

## 🔧 TÍNH NĂNG PHỤ (Supporting Features)

| Tính năng | Mô tả |
|---|---|
| **📊 Analytics Deep-Dive** | Bộ lọc thời gian sâu (Tất cả / Năm nay / Tháng này / Hôm nay / Tùy chọn) + Tổng quan danh mục bảo hiểm cá nhân (Portfolio Overview) |
| **🛡️ Policy Management** | Hành trình 3 tabs: "Tham khảo gói" (Mặc định) $\rightarrow$ "Gói của tôi" (filter Active/Expired/Cancelled) $\rightarrow$ "Lịch sử" |
| **🔔 Notification Center** | Thông báo realtime qua WebSocket: claim duyệt, gói sắp hết hạn |
| **💳 Payment & Renewal** | Lịch đóng phí, QR ngân hàng giả lập, biên lai PDF, gia hạn 1 chạm |
| **👥 Role-based System** | 3 roles: User / Reviewer / Admin với dashboard riêng |
| **🌗 Dark Mode & Mobile** | Responsive, sidebar drawer, lưu theme preference |
| **🌐 Bilingual (EN/VI)** | next-intl, URL-based locale /vi · /en, instant switch |
| **🔒 Security** | JWT httpOnly, CSRF, Rate Limiting, Prompt Injection Defense |

---

## 💡 GIÁ TRỊ ĐẶC THÙ VIỆT NAM (Phù hợp tiêu chí cuộc thi)

### Khai thác đặc điểm riêng của Việt Nam:
- **Địa lý phân vùng rõ ràng:** Bắc (ít bão, rủi ro lũ núi) / Trung (rủi ro cao nhất: bão + lũ + sạt lở) / Nam (ngập úng ĐBSCL)
- **63 tỉnh được cá nhân hóa risk score** dựa trên dữ liệu thiên tai lịch sử Việt Nam
- **Nhận diện địa danh không dấu:** "Quang Binh", "TP HCM", "HN", "Saigon" → detect đúng tỉnh
- **6 loại bảo hiểm align với thị trường bảo hiểm Việt Nam** (không copy từ nước ngoài)
- **OCR tiếng Việt** với CCCD Việt Nam, format địa chỉ Việt Nam

### Vấn đề thực tế được giải quyết:
> Người dân miền Trung sống ở vùng nguy cơ bão lũ cao nhưng không biết mình cần loại bảo hiểm nào, không biết rủi ro địa phương mình ở mức nào, và khi có sự cố thì quy trình bồi thường chậm và phức tạp.

**ClaimFlow giải quyết 3 điểm đau này cùng lúc:**
1. 🗺️ Bản đồ trực quan → biết ngay rủi ro địa phương
2. 🤖 AI gợi ý → biết ngay mua gói nào
3. ⚡ AI xử lý bồi thường → không còn chờ đợi lâu

---

## 🔗 Liên kết với hệ sinh thái Tasco

```
Vmap by Tasco (bản đồ nền)  +  Tasco Insurance (sản phẩm bảo hiểm)
                    ↕
         ClaimFlow — Lớp ứng dụng AI kết nối:
         Dữ liệu địa lý → Rủi ro thiên tai → Đúng gói bảo hiểm → Tự động bồi thường
```

**Đề xuất tích hợp V2:** Nhúng lớp rủi ro thiên tai của ClaimFlow vào Vmap —
người dùng Vmap thấy ngay vùng đang đứng có rủi ro gì và được gợi ý bảo hiểm Tasco ngay trên bản đồ.

---

## 🛠️ STACK CÔNG NGHỆ (Cho Pitch Deck)

```
Frontend:  Next.js 14 · TypeScript · Tailwind CSS · Leaflet (bản đồ) · WebSocket
Backend:   FastAPI · MongoDB · Celery + Redis · WebSocket · Docker Compose
AI Layer:  Google Gemini Vision (OCR) · Gemini Pro (Chatbot + Agent) · LangGraph · Qdrant RAG
Bản đồ:   Leaflet choropleth · GeoJSON WGS84 (63 tỉnh) · pyproj UTM48N→WGS84
```

---

## 📈 CHIẾN LƯỢC DỮ LIỆU (Cho Pitch Deck)

| Nguồn dữ liệu | Mô tả |
|---|---|
| **Dữ liệu địa lý** | GeoJSON 63 tỉnh Việt Nam chuẩn WGS84 (tự convert từ UTM48N) |
| **Risk Score** | Tính từ dữ liệu thiên tai lịch sử 10 năm (Bộ NN&PTNT public data) |
| **Dữ liệu giả lập** | 63 tỉnh geo_risk · 12 users demo · ~80 claims · ~30 policies |
| **RAG Policy** | Tài liệu bảo hiểm → vector hóa → Qdrant → grounding cho AI agent |
| **Cập nhật V2** | Tích hợp OpenWeatherMap API real-time khi bão/lũ thực tế xảy ra |

---

## 🎯 ĐỐI TƯỢNG NGƯỜI DÙNG

| Nhóm | Nhu cầu giải quyết |
|---|---|
| **Người dân vùng thiên tai** (Trung bộ, ĐBSCL) | Biết rủi ro vùng mình, mua đúng bảo hiểm |
| **Công ty bảo hiểm** | Tự động hóa xử lý yêu cầu bồi thường, giảm fraud |
| **Reviewer/Adjuster** | Dashboard xét duyệt thông minh với AI reasoning |
| **Admin hệ thống** | Audit logs, quản lý người dùng, system health |

---

## 🚀 KHẢ NĂNG MỞ RỘNG

- **Tích hợp Vmap by Tasco:** Lớp rủi ro thiên tai có thể nhúng trực tiếp vào VMap
- **Real-time Weather Layer:** Thêm cảnh báo bão/lũ theo API NCHMF (Trung tâm khí tượng thủy văn)
- **Cộng đồng đóng góp:** Người dân báo cáo điểm ngập, sạt lở, thiệt hại trực tiếp trên bản đồ
- **PostGIS V2:** Chuyển từ static GeoJSON sang spatial queries động
- **Mobile App:** React Native với Leaflet embedded

---

> **Demo:** http://localhost:3000/vi/risk-map  
> **GitHub:** github.com/Ho-Duy-Vu/ClaimFlow  
> **Author:** Hồ Duy Vũ — AI Engineer
