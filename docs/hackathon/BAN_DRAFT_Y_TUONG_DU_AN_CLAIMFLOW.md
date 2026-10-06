# BẢN ĐỀ ÁN Ý TƯỞNG DỰ ÁN (PROJECT PROPOSAL)
## TRACK MAP BY TASCO — CUỘC THI XÂY DỰNG LỚP ỨNG DỤNG CHO BẢN ĐỒ CỦA NGƯỜI VIỆT

---

## 📌 THÔNG TIN TỔNG QUAN DỰ ÁN

* **Tên đội thi:** **VM Team**
* **Tên dự án:** **ClaimFlow** — Nền Tảng Bản Đồ Cảnh Báo Thiên Tai, Né Ngập Úng & Bảo Trợ Di Chuyển Thông Minh Cho Người Việt
* **Slogan định vị:** *"Thấy trước rủi ro ngập lụt – Vững tay lái trên mọi nẻo đường – Cứu hộ & Bảo trợ cùng hệ sinh thái Tasco"*
* **Hệ sinh thái liên kết chiến lược:** **Vmap by Tasco** (Hạ tầng bản đồ số người Việt làm chủ) $\times$ **VETC Cứu Hộ 1900 6010** $\times$ **Chuỗi Gara Tasco Auto** $\times$ **Tasco Insurance** (Bảo trợ chi phí)
* **Vệt chuyên đề (Track tham gia):** 
  * **Track chính:** **Giao thông và di chuyển thông minh** *(Tối ưu hành trình di chuyển, cảnh báo rủi ro ngập úng, triều cường, đề xuất cứu hộ và sửa chữa gara)*.
  * **Track phụ:** **Dữ liệu, dịch vụ đô thị và an toàn cộng đồng** *(Bản đồ ngập úng đô thị 63 tỉnh, phản ánh sự cố giao thông, an toàn đô thị mùa bão lũ)*.
* **Trạng thái phát triển:** **Bản thử nghiệm hoàn chỉnh (Working Prototype)** — Đã tích hợp trọn vẹn bản đồ WGS84 63 tỉnh thành, thuật toán định vị GPS và khoảng cách Goong/Vmap API, AI Vision giám định hiện trường, OCR giấy tờ xe và giao diện điều phối cứu hộ.

---

## 1. BỐI CẢNH & NHẬN ĐỊNH TỪ BUỔI ĐÁNH GIÁ (PROBLEM & CONTEXT)

### 1.1. Bối cảnh Bản đồ số & Rủi ro Di chuyển tại Việt Nam
Bản đồ số đang là hạ tầng sống còn của nền kinh tế số và hệ sinh thái di chuyển (Mobility). Tuy nhiên, phần lớn nền tảng bản đồ tại Việt Nam hiện nay do doanh nghiệp ngoại nắm giữ (Google Maps, Apple Maps), tập trung tối ưu chỉ đường và mật độ kẹt xe thông thường. 

Việt Nam nằm trong top 5 quốc gia chịu tổn thương nặng nề nhất bởi bão lũ và biến đổi khí hậu:
* **Hà Nội & TP.HCM:** Hơn 100 điểm đen ngập úng cục bộ mỗi trận mưa to hoặc triều cường. Hàng nghìn ô tô bị chết máy, ngập nước, thiệt hại hàng trăm tỷ đồng do **thủy kích** (hỏng động cơ).
* **Miền Trung:** Rốn bão dồn dập, đường phố ngập chia cắt cục bộ.
* **Vùng núi Tây Bắc & Tây Nguyên:** Nguy cơ sạt lở đèo dốc và chia cắt giao thông mùa mưa bão.

### 1.2. Phân tích Khoảng trống Thị trường Hiện hữu (Competitor & Gap Analysis)

Hiện tại, người tham gia giao thông tại Việt Nam đang bị chia cắt giữa 3 nhóm phần mềm rời rạc:

```
[ NHÓM 1: BẢN ĐỒ DẪN ĐƯỜNG ]       [ NHÓM 2: ỨNG DỤNG BÁO NGẬP ]       [ NHÓM 3: TỔNG ĐÀI CỨU HỘ ]
Google Maps, Apple Maps, Waze      UDI Maps (TP.HCM), HSDC (Hà Nội)    VETC Cứu hộ (1900 6010), eCarAid
  ↳ Dẫn đường giỏi, nhưng            ↳ Có điểm ngập nhưng không          ↳ Có xe kéo nhưng người lái xe
    "MÙ" ĐIỂM NGẬP VIỆT NAM            biết dẫn đường, UX rất tệ           PHẢI GỌI TẢ ĐƯỜNG BẰNG MIỆNG
```

1. **Google Maps / Apple Maps:** 
   * *Điểm yếu chí mạng:* Hoàn toàn "mù" ngập úng đô thị và thiên tai tại Việt Nam. Khi tuyến phố ngập 50cm xe chết máy la liệt, Google Maps vẫn chỉ đường cho tài xế lao thẳng vào điểm ngập!
2. **UDI Maps (TP.HCM) / HSDC Maps (Hà Nội) / iHanoi mini app:** 
   * *Điểm yếu chí mạng:* Manh mún theo từng địa phương (Hà Nội không xem được TP.HCM), giao diện webview giật lag. Chỉ là bản đồ "xem tĩnh", không có tính năng dẫn đường vòng tránh và hoàn toàn không có mạng lưới cứu hộ.
3. **Tổng đài cứu hộ giao thông (VETC Cứu hộ 1900 6010, cứu hộ tư nhân):** 
   * *Điểm yếu chí mạng:* Vận hành hoàn toàn bằng gọi điện hotline. Giữa trời mưa to bão gió, tài xế hoảng loạn **không biết mình đang ở tọa độ nào để tả đường bằng miệng cho tổng đài**. Người dùng hoàn toàn bị động, không biết xe kéo đang ở đâu và luôn lo sợ bị "chặt chém" giá sửa chữa.

---

## 2. GIẢI PHÁP CLAIMFLOW: ĐẶT BẢN ĐỒ VMAP LÀM TRUNG TÂM
 
**ClaimFlow** định vị là lớp dữ liệu chuyên đề và ứng dụng an toàn di chuyển trên nền tảng bản đồ Vmap, tạo thành chu trình khép kín 3 bước: **Trước hành trình $\to$ Khi gặp nạn $\to$ Sau sự cố**:
 
```
                     HỆ SINH THÁI DI CHUYỂN TOÀN DIỆN CỦA TASCO
       ┌─────────────────────────────────────────────────────────────────┐
       │                          VMAP BY TASCO                          │
       │    (Hạ tầng Bản đồ Số Việt Nam — Định vị, Tuyến đường di chuyển) │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ Nhúng lớp chuyên đề
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │                    CLAIMFLOW (DỰ ÁN CỦA ĐỘI)                    │
       │  1. Bản đồ nhiệt cảnh báo ngập lụt, triều cường & bão 63 tỉnh   │
       │  2. Thuật toán dẫn đường thông minh né các tuyến phố ngập úng   │
       │  3. Nút bấm 🚨 SOS 1-chạm: Bắt GPS & kết nối cứu hộ gần nhất    │
       │  4. AI Vision khảo sát hiện trường xe ngập nước / va chạm       │
       │  5. Ví giấy tờ xe số hóa & Biên bản sự cố điện tử chống cãi vã  │
       └──────────────────┬─────────────────────────────┬────────────────┘
                          │ Điều phối cứu hộ kéo xe     │ Hỗ trợ chi phí sửa chữa
                          ▼                             ▼
       ┌──────────────────────────────────┐ ┌────────────────────────────┐
       │       TASCO AUTO & VETC CỨU HỘ   │ │       TASCO INSURANCE      │
       │  • Mạng lưới Gara sửa chữa xe    │ │  • Bảo trợ rủi ro thủy kích│
       │  • Đội xe cẩu kéo cứu hộ 24/7    │ │  • Bảo lãnh chi phí sửa xe │
       └──────────────────────────────────┘ └────────────────────────────┘
```

---

## 3. BÓC TÁCH CÁC TÍNH NĂNG VÀ NĂNG LỰC CỐT LÕI

### 3.1. Bản Đồ Rủi Ro Ngập Úng & Rốn Bão 63 Tỉnh Thành Toàn Diện (Geo-Flood & Storm Intelligence)
* **Bản đồ không gian chuẩn WGS84:** Bao phủ toàn vẹn 63/63 tỉnh thành Việt Nam, tích hợp các lớp dữ liệu không gian GeoJSON.
* **Choropleth Nhiệt Rủi ro & 5 Lớp Thiên tai Chuyên biệt:**
  * Bộ lọc linh hoạt: 🌧️ **Ngập úng đô thị** (Hà Nội, TP.HCM, Đà Nẵng) · 🌀 **Bão nhiệt đới & Lũ lụt** (duyên hải Miền Trung) · ⛰️ **Sạt lở đất đèo dốc** (Tây Bắc, Tây Nguyên) · 🌊 **Triều cường & Sụt lún** (ĐBSCL) · ☀️ **Tổng hợp an toàn hành trình**.
  * Phân tầng rủi ro từ 0 đến 100: *Rất cao (Đỏ), Cao (Cam), Trung bình (Vàng), An toàn (Xanh)*.
* **Hoạt ảnh Khí tượng Vi mô (Micro-Weather Animations):**
  * Lớp phủ mưa rơi động (`.rain-overlay`) trực quan, radar quét sóng tại các tâm bão và điểm ngập sâu.
  * Thước đo chất lỏng dâng (Liquid Wave Gauge Card) mô phỏng mức cảnh báo mực nước ngập theo cm tại điểm tra cứu.
* **Thuật toán Dẫn đường Thông minh Né Ngập (Flood-Avoidance Dynamic Routing):**
  * Tự động cảnh báo khi cung đường dự kiến đi qua vùng có nguy cơ ngập sâu, đề xuất lộ trình thay thế cao ráo, ngăn ngừa triệt để nguy cơ thủy kích hỏng máy.

### 3.2. Tính Năng SOS 1-Chạm Bắt GPS & Điều Phối Xe Cứu Hộ Giao Thông
* **1-Chạm Bắt GPS Hiện Trường:** Khi xe chết máy giữa đường ngập hoặc va chạm trong mưa bão, tài xế chỉ cần bấm nút `🚨 SOS CỨU HỘ KHẨN CẤP` trên bản đồ. Hệ thống tự động thu nhận tọa độ GPS WGS84 chính xác đến từng mét.
* **Tìm kiếm & Phân tích Cự ly qua Vmap / Goong API:**
  * Tự động quét và xếp hạng 3 trạm cứu hộ **VETC Cứu Hộ (1900 6010)** và xưởng dịch vụ **Tasco Auto** gần nhất theo khoảng cách thực tế (Distance Matrix API).
* **Mô phỏng Xe Cứu Hộ Tiếp Cận Hiện Trường Thời Gian Thực:**
  * Bản đồ tự động vẽ tuyến đường và hiển thị xe cứu hộ đang di chuyển về phía phương tiện gặp nạn kèm thời gian dự kiến tiếp cận (ETA).

### 3.3. AI Vision Giám Định Xe Ngập Nước & Xuất Biên Bản Hiện Trường Số Hóa
* **Phân tích Thiệt hại Tức thì tại Hiện trường:**
  * Người lái xe chụp ảnh xe tại điểm ngập. Mô hình **Gemini 1.5 Vision** tự động nhận diện: Biển số xe, mức nước ngập (ngập bánh xe, ngập sàn hay ngập capo/khoang máy), mức độ biến dạng thân vỏ nếu có va chạm.
* **Biên Bản Hiện Trường Số Hóa Chống Cãi Vã (Digital Incident Report):**
  * Hệ thống gắn kèm tọa độ GPS thời gian thực, dấu thời gian (timestamp) và trích xuất thông tin thành biên bản hiện trường số hóa.
  * Giúp quản đốc gara Tasco Auto chuẩn bị sẵn phương án cẩu kéo, phụ tùng thay thế và báo giá sửa chữa minh bạch, xóa tan nỗi ám ảnh bị "chặt chém".

### 3.4. Ví Giấy Tờ Xe Số Hóa (Digital Vehicle Wallet) Bằng OCR Tiếng Việt
* **OCR Cà vẹt xe, Bằng lái, CCCD:** Nhận diện văn bản tiếng Việt chính xác cao, tự động trích xuất Biển số xe, Số khung, Số máy, Tên chủ xe.
* **Tự động Đồng bộ Lệnh Cứu hộ:** Khi bấm SOS, toàn bộ thông tin phương tiện được tự động đính kèm vào yêu cầu cứu hộ, tài xế không cần bới tìm giấy tờ bị ướt giữa trời mưa to gió lớn.

### 3.5. Bảng Điều Phối Cứu Hộ Dành Cho Tổng Đài & Gara (Dispatcher Cockpit)
* **Dành cho điều phối viên VETC và quản đốc Gara Tasco Auto:**
  * Tiếp nhận yêu cầu cứu hộ trực tiếp từ bản đồ theo thời gian thực.
  * Xem ảnh hiện trường, tọa độ GPS, mức độ ngập và lịch sử phương tiện để điều phối xe cẩu sàn phẳng hoặc xe kéo chuyên dụng phù hợp nhất.

### 3.6. Trợ Lý Lái Xe AI 24/7 & Hỗ Trợ Kỹ Thuật Khi Chết Máy Nước
* Trợ lý ảo AI trực quan hướng dẫn tài xế các thao tác khẩn cấp khi xe bị chết máy trong vũng ngập: **Tuyệt đối không đề lại máy để tránh vỡ lốc động cơ do thủy kích**, cách tắt hệ thống điện, cách đặt cảnh báo an toàn và gọi cứu hộ.

---

## 4. MA TRẬN SO SÁNH VƯỢT TRỘI CỦA CLAIMFLOW

| Tiêu chí | Google Maps | UDI Maps / HSDC Maps | Tổng đài Cứu hộ Truyền thống | **ClaimFlow (Dự án của đội)** |
|---|:---:|:---:|:---:|:---:|
| **Bản đồ do người Việt làm chủ** | ❌ (Ngoại) | ⚠️ (Cục bộ địa phương) | ❌ (Chỉ có số hotline) | ✅ **Nền tảng Vmap by Tasco** |
| **Bao phủ ngập úng & bão lũ 63 tỉnh** | ❌ | ❌ (Chỉ HN hoặc HCM) | ❌ | ✅ **Toàn diện 63/63 tỉnh thành Việt Nam** |
| **Dẫn đường né điểm ngập (Flood-Avoidance)**| ❌ (Chỉ né kẹt xe) | ❌ (Chỉ là ảnh tĩnh) | ❌ | ✅ **Chủ động gợi ý lộ trình an toàn** |
| **SOS 1-Chạm định vị GPS xe gặp nạn** | ❌ | ❌ | ⚠️ (Tả địa chỉ bằng miệng) | ✅ **1-Chạm bắt GPS truyền thẳng cho xe kéo** |
| **Theo dõi xe cứu hộ real-time trên map** | ❌ | ❌ | ❌ | ✅ **Thấy lộ trình xe cứu hộ đang di chuyển đến** |
| **AI Vision đo mức ngập & tạo biên bản số** | ❌ | ❌ | ❌ | ✅ **Gemini Vision đo ngập & xuất biên bản** |
| **Sức mạnh Hệ sinh thái cộng hưởng** | ❌ | ❌ | ⚠️ (Rời rạc) | ✅ **Vmap $\times$ VETC $\times$ Tasco Auto $\times$ Tasco Insurance** |

---

## 5. TÍNH KHẢ THI VÀ GIÁ TRỊ THƯƠNG MẠI CHO HỆ SINH THÁI TASCO

1. **Gia tăng giá trị trực tiếp cho Vmap:** Biến Vmap từ một ứng dụng bản đồ dẫn đường thông thường thành **công cụ bảo vệ an toàn giao thông không thể thiếu của mọi lái xe Việt mùa mưa bão**.
2. **Kích hoạt mạng lưới dịch vụ Tasco Auto & VETC Cứu hộ:** Mang lại nguồn khách hàng cứu hộ và sửa chữa tự nhiên cho chuỗi xưởng dịch vụ của Tasco thông qua nút bấm SOS trên bản đồ.
3. **Mở rộng tệp khách hàng cho Tasco Insurance:** Giới thiệu các gói bảo hiểm vật chất xe cơ giới và bảo hiểm thủy kích đúng thời điểm khách hàng có nhu cầu bảo vệ phương tiện cao nhất.

---

## 6. KẾT LUẬN

**ClaimFlow** là lời giải trọn vẹn nhất cho bài toán Hackathon của Tasco: Một ứng dụng bản đồ đậm chất Việt Nam, phục vụ trực tiếp nỗi đau ngập úng và thiên tai của người lái xe Việt, tích hợp hoàn hảo với hệ sinh thái Tasco (Vmap, VETC, Tasco Auto, Tasco Insurance), và hoàn toàn khả thi để ứng dụng vào thực tế ngay hôm nay.
