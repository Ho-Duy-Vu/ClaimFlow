# KẾ HOẠCH TỔNG THỂ CHUYỂN TRỤC DỰ ÁN (MASTER PIVOT PLAN)
## DỰ ÁN: VMAP SAFEDRIVE — LỚP BẢN ĐỒ CẢNH BÁO NGẬP LỤT, DẪN ĐƯỜNG TRÁNH THỦY KÍCH & ĐIỀU PHỐI CỨU HỘ GIAO THÔNG 1-CHẠM
### TRACK MAP BY TASCO — CUỘC THI XÂY DỰNG LỚP ỨNG DỤNG CHO BẢN ĐỒ CỦA NGƯỜI VIỆT

---

## 📌 BỐI CẢNH & ĐÁNH GIÁ SAU BUỔI GÓP Ý DỰ ÁN

### 1. Nhìn thẳng vào phản hồi thực tế từ Ban Giám khảo & Mentors
Trong buổi đánh giá và phản biện dự án vừa qua, Hội đồng chuyên môn đã đưa ra 2 nhận định mang tính sống còn:
1. **Dự án bị "lạc đề" Hackathon Bản đồ:** Đề bài của Tasco yêu cầu *"Xây dựng một lớp ứng dụng và/hoặc lớp dữ liệu chuyên đề trên nền tảng bản đồ Vmap"*, giải quyết nhu cầu đi lại, an toàn và đời sống của người Việt. Tuy nhiên, sản phẩm của đội lại mang hình hài của một phần mềm quản trị bồi thường nội bộ của công ty bảo hiểm (Core InsurTech Claims System). Bản đồ trong phiên bản cũ chỉ đóng vai trò là một tiện ích phụ.
2. **Dự án bị đánh giá "thiếu tính thực tế":** Lời hứa *"AI tự động duyệt bồi thường và chi trả tiền trong 3 phút"* vấp phải rào cản pháp lý rất lớn (Luật Kinh doanh Bảo hiểm, quy định giám định hiện trường có biên bản công an, hóa đơn tài chính gốc, chữ ký số và đối soát công nợ phức tạp). Người lái xe mở ứng dụng bản đồ Vmap để tìm đường di chuyển an toàn, chứ không ai mở Vmap để "nộp hồ sơ bồi thường".

### 2. Nguyên tắc vàng của đợt chuyển trục (Strategic Pivot)
* **KHÔNG ĐẬP BỎ MÃ NGUỒN:** Giữ lại và tái sử dụng **100% công nghệ và code đã hoàn thiện**: Bản đồ số 63 tỉnh WGS84, định vị GPS, thuật toán tìm kiếm khoảng cách và chỉ đường cứu hộ qua Goong/Vmap API, công nghệ AI Vision phân tích hư hại xe, OCR giấy tờ.
* **TÁI ĐỊNH VỊ TOÀN DIỆN (REFRAMING):** Chuyển dịch trọng tâm từ *"Hệ thống bồi thường bảo hiểm"* sang **"Nền Tảng Bản Đồ Cảnh Báo Ngập Lụt, Dẫn Đường An Toàn & Điều Phối Cứu Hộ Giao Thông Hiện Trường Cho Người Việt"**.

```
[ ĐỊNH VỊ CŨ - BỊ CHÊ LẠCH ĐỀ & PHI THỰC TẾ ]         [ ĐỊNH VỊ MỚI - TRÚNG 100% ĐỀ BÀI TASCO ]
ClaimFlow: Core InsurTech & Claims                  Vmap SafeDrive: Mobility Hazard & Rescue Layer
• Trọng tâm: Hồ sơ, giấy tờ, duyệt chi trả tiền      • Trọng tâm: BẢN ĐỒ VMAP HỖ TRỢ LÁI XE AN TOÀN
• Người dùng: Khách bảo hiểm & Thẩm định viên        • Người dùng: Lái xe ô tô/xe máy, tài xế VETC, Gara
• Bản đồ: Chỉ là widget phụ họa                      • Bản đồ: TRUNG TÂM ĐIỀU HÀNH TOÀN BỘ TRẢI NGHIỆM
```

---

## 🔍 PHẦN 1: NGHIÊN CỨU THỊ TRƯỜNG & PHÂN TÍCH ĐỐI THỦ CHUYÊN SÂU (COMPETITOR & MARKET RESEARCH)

Hiện tại ở Việt Nam, bài toán an toàn di chuyển mùa mưa bão đang bị **chia cắt manh mún thành 3 nhóm phần mềm độc lập**, không nhóm nào giải quyết trọn vẹn:

```
[ NHÓM 1: BẢN ĐỒ DẪN ĐƯỜNG ]       [ NHÓM 2: ỨNG DỤNG BÁO NGẬP ]       [ NHÓM 3: TỔNG ĐÀI CỨU HỘ ]
Google Maps, Apple Maps, Waze      UDI Maps (TP.HCM), HSDC (Hà Nội)    VETC Cứu hộ (1900 6010), eCarAid
  ↳ Dẫn đường giỏi, nhưng            ↳ Có điểm ngập nhưng không          ↳ Có xe kéo nhưng người lái xe
    "MÙ" ĐIỂM NGẬP VIỆT NAM            biết dẫn đường, UX rất tệ           PHẢI GỌI TẢ ĐƯỜNG BẰNG MIỆNG
```

### 1. Phân tích chi tiết từng nhóm phần mềm

#### Nhóm 1: Bản đồ dẫn đường toàn cầu (Google Maps, Apple Maps, Waze)
* **Điểm mạnh:** Thuật toán dẫn đường và lưu lượng giao thông (Traffic kẹt xe) tối ưu toàn cầu; người dùng đông đảo.
* **Điểm yếu & Khoảng trống chết người tại Việt Nam:**
  * **Hoàn toàn "mù" ngập úng và thiên tai cục bộ:** Google Maps chỉ biết đường kẹt (đỏ) hay thông thoáng (xanh). Khi một tuyến phố ngập sâu 50cm khiến xe ô tô chết máy hàng loạt, Google Maps vẫn chỉ đường cho tài xế lao thẳng vào vũng ngập!
  * Không có dữ liệu sạt lở đèo, lũ quét, triều cường đặc thù của Việt Nam.
  * Không tích hợp dịch vụ cứu hộ giao thông địa phương khi xe bị ngập nước.

#### Nhóm 2: Ứng dụng thoát nước đô thị (UDI Maps TP.HCM, HSDC Maps Hà Nội, Mini App iHanoi)
* **Điểm mạnh:** Dữ liệu trạm đo ngập chính thống từ các Công ty Thoát nước đô thị nhà nước.
* **Điểm yếu & Khoảng trống chết người:**
  * **Manh mún và cục bộ địa phương:** UDI chỉ xem được ở TP.HCM; HSDC chỉ xem được ở Hà Nội. Xe di chuyển liên tỉnh là vô dụng.
  * **Trải nghiệm người dùng (UX/UI) lạc hậu:** Giao diện dạng webview giật lag, khó tra cứu khi đang lái xe.
  * **Chỉ là bản đồ "xem tĩnh", không có dẫn đường:** Thấy điểm ngập nhưng không tự động vẽ lộ trình vòng tránh.
  * **Hoàn toàn không có dịch vụ cứu hộ:** Khi xe đã ngập chết máy, ứng dụng không có bất kỳ giải pháp nào hỗ trợ người dân.

#### Nhóm 3: Ứng dụng & Tổng đài cứu hộ giao thông (VETC Cứu hộ 1900 6010, eCarAid, ZuttoRide, Zalo SOS)
* **Điểm mạnh:** Có mạng lưới xe kéo cứu hộ và gara sửa chữa thực tế. Đặc biệt, **VETC Cứu hộ là dịch vụ của chính Tập đoàn Tasco**.
* **Điểm yếu & Khoảng trống chết người:**
  * **Quy trình thủ công bằng gọi điện:** Tài xế đứng giữa trời mưa to gió bão rất hoảng loạn, **không biết mình đang ở tọa độ nào để tả đường bằng miệng cho tổng đài**.
  * **Chỉ mang tính bị động (Reactive):** Chỉ cứu hộ khi xe *đã hỏng/đã chết máy*, hoàn toàn không có công cụ cảnh báo trước để *ngăn ngừa sự cố*.
  * Tài xế không biết xe cứu hộ đang ở đâu, bao nhiêu phút nữa đến, và luôn bất an vì sợ bị gara "chặt chém" giá sửa chữa.

---

### 2. Ma trận So sánh Tính năng Toàn diện

| Tiêu chí nghiệp vụ | Google Maps | UDI Maps / HSDC Maps | VETC Hotline / Cứu hộ rời rạc | **Vmap SafeDrive (Dự án mới)** |
|---|:---:|:---:|:---:|:---:|
| **Bản đồ số người Việt làm chủ** | ❌ (Mỹ) | ⚠️ (App địa phương) | ❌ (Chỉ có số hotline) | ✅ **Nền tảng Vmap by Tasco** |
| **Phủ sóng rủi ro toàn quốc (63 tỉnh)** | ❌ | ❌ (Chỉ HN hoặc HCM) | ❌ | ✅ **Toàn diện 63/63 tỉnh thành & đô thị** |
| **Dẫn đường thông minh tránh ngập (Flood-Avoidance)** | ❌ (Chỉ tránh kẹt xe) | ❌ (Chỉ xem điểm ngập) | ❌ | ✅ **Tự động gợi ý tuyến đường né điểm ngập** |
| **SOS Cứu hộ 1-chạm qua GPS** | ❌ | ❌ | ⚠️ (Phải đọc địa chỉ bằng miệng) | ✅ **1-Chạm định vị GPS & điều phối xe cứu hộ** |
| **Theo dõi lộ trình xe cứu hộ Real-time trên map** | ❌ | ❌ | ❌ | ✅ **Thấy vị trí xe cứu hộ đang di chuyển đến** |
| **AI Giám định hiện trường xe ngập nước** | ❌ | ❌ | ❌ | ✅ **AI Vision đo mức độ ngập & ước tính thiệt hại** |
| **Hợp nhất Hệ sinh thái Tasco** | ❌ | ❌ | ⚠️ (Chỉ có số hotline VETC) | ✅ **Vmap + VETC + Tasco Auto + Tasco Insurance** |

---

## 🚀 PHẦN 2: ĐỊNH VỊ MỚI & SỨ MỆNH TRỌNG TÂM (NEW POSITIONING)

### 1. Phân bổ Track thi đấu chính thức
* **Track chính:** **Giao thông và di chuyển thông minh**
  *(Trích đề bài: "xây dựng các lớp dữ liệu và ứng dụng giúp tối ưu hành trình... đề xuất sửa chữa, cứu hộ... phát hiện hoặc dự báo triều cường, ngập lụt...")*
* **Track phụ:** **Dữ liệu, dịch vụ đô thị và an toàn cộng đồng**
  *(Trích đề bài: "bản đồ ngập, phản ánh sự cố hạ tầng, an toàn đô thị...")*

### 2. Bộ nhận diện dự án mới
* **Tên giải pháp:** **Vmap SafeDrive** *(Lớp Dữ Liệu An Toàn Di Chuyển & Cứu Hộ Giao Thông Hiện Trường Trên Nền Tảng Vmap)*
* **Slogan định vị:** *"Thấy trước rủi ro ngập lụt – Vững tay lái trên mọi nẻo đường – Cứu hộ 1-chạm cùng hệ sinh thái Tasco"*
* **Đối tượng phục vụ:**
  * Người lái xe ô tô, xe máy di chuyển hàng ngày trong đô thị và liên tỉnh.
  * Hàng triệu chủ phương tiện trong hệ sinh thái thu phí tự động VETC và chuỗi dịch vụ Tasco Auto.
  * Đội ngũ xe cứu hộ giao thông 24/7 và hệ thống gara sửa chữa liên kết.

### 3. Vòng lặp giá trị hoàn hảo trong Hệ sinh thái Tasco
```
                     HỆ SINH THÁI DI CHUYỂN TOÀN DIỆN CỦA TASCO
       ┌─────────────────────────────────────────────────────────────────┐
       │                          VMAP BY TASCO                          │
       │    (Hạ tầng Bản đồ Số Việt Nam — Định vị, Tuyến đường di chuyển) │
       └────────────────────────────────┬────────────────────────────────┘
                                        │ Nhúng lớp chuyên đề
                                        ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │                   VMAP SAFEDRIVE (DỰ ÁN CỦA ĐỘI)                │
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

## 🔄 PHẦN 3: BẢNG ÁNH XẠ CHUYỂN TRỤC TÍNH NĂNG (100% CODE REUSE & REFRAMING MATRIX)

Tất cả các module mã nguồn đã xây dựng được giữ nguyên và chuyển đổi câu chuyện nghiệp vụ sang chuẩn Bản đồ:

| Thành phần Code hiện tại | Thuật ngữ cũ (Gây cảm giác lệch đề) | Thuật ngữ mới (Chuẩn Bản đồ Vmap) | Giá trị thực tiễn thuyết phục BGK |
|---|---|---|---|
| **Bản đồ 63 tỉnh rủi ro thiên tai** (`/risk-map`) | Bản đồ định phí rủi ro bảo hiểm | 🌊 **Lớp Bản Đồ Cảnh Báo Ngập Úng & Rốn Bão Thiên Tai** | Giúp người lái xe biết trước các điểm đen ngập úng đô thị (Hà Nội, TP.HCM) và vùng bão lũ để chọn lộ trình an toàn, tránh thủy kích chết máy. |
| **Tính năng SOS & Gara đối tác** (`/partners`, API Dispatcher) | Mạng lưới bảo lãnh chi trả bồi thường Cashless | 🚨 **Mạng Lưới Điều Phối Cứu Hộ Giao Thông & Gara 1-Chạm** | Khi xe gặp nạn/chết máy giữa đường: Bấm SOS, hệ thống bắt GPS và tìm 3 đội cứu hộ / gara Tasco Auto gần nhất theo khoảng cách thực tế trên Vmap. |
| **AI Vision quét hư hại xe** (`damage_analyzer.py`) | Thẩm định chi trả tiền bảo hiểm tự động | 🔍 **AI Giám Định Thiệt Hại Hiện Trường Tức Thì** | Nhận diện mức độ hư hại xe (móp méo, vỡ kính, ngập nước) để đội cứu hộ mang đúng loại xe kéo và dự toán trước chi phí sửa chữa, chống bị gara "chặt chém". |
| **OCR CCCD, Cà vẹt, Bằng lái** (`ocr.py`) | Bóc tách hồ sơ bồi thường bảo hiểm | 🪪 **Ví Giấy Tờ Xe Số Hóa (Digital Vehicle Wallet)** | Lưu trữ sẵn đăng ký xe, bằng lái. Khi gặp nạn giữa trời mưa bão, không cần bới tìm giấy tờ ướt nhẹp, 1 chạm gửi thông tin xe cho đội cứu hộ. |
| **Màn hình Reviewer Cockpit** (`/reviewer`) | Bàn làm việc của Giám định viên bảo hiểm | 📡 **Bảng Điều Phối Cứu Hộ & Xác Thực Hiện Trường (Dispatcher Cockpit)** | Bàn điều phối dành cho tổng đài cứu hộ giao thông và quản đốc gara Tasco tiếp nhận lệnh cứu hộ kéo xe từ bản đồ. |
| **LangGraph 4-Node Decision** (`agent.py`) | AI ra quyết định bồi thường trong 3 phút | ⚡ **Động Cơ Xác Thực Sự Cố & Tạo Biên Bản Hiện Trường Số** | Tự động tổng hợp ảnh chụp, vị trí GPS và thông tin xe thành **Biên bản hiện trường số chống can thiệp (Tamper-proof Report)** phục vụ sửa chữa và bảo hiểm. |
| **Quản lý hợp đồng bảo hiểm** (`/policies`) | Mua bán và quản lý hợp đồng bảo hiểm | 🛡️ **Gói Tiện Ích Bảo Trợ Di Chuyển (Mobility Care Packages)** | Tiện ích liên kết bảo vệ rủi ro ngập nước, cứu hộ miễn phí từ Tasco Insurance dành riêng cho người dùng Vmap. |

---

## 🛠️ PHẦN 4: 3 LUỒNG TRẢI NGHIỆM THỰC CHIẾN CỦA VMAP SAFEDRIVE

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BƯỚC 1: TRƯỚC HÀNH TRÌNH — DẪN ĐƯỜNG THÔNG MINH TRÁNH NGẬP (FLOOD-AVOIDANCE ROUTING)   │
│ (Khắc phục điểm yếu mù ngập của Google Maps & tính cục bộ của UDI/HSDC Maps)          │
│ • Bản đồ tích hợp lớp cảnh báo ngập úng đô thị và thiên tai 63 tỉnh thành.            │
│ • Tính năng: [Lộ trình an toàn]: Khi tìm đường, thuật toán tự động né các tuyến phố    │
│   đang có nguy cơ ngập sâu để bảo vệ xe không bị chết máy / thủy kích.                 │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Xe không may gặp sự cố giữa đường
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BƯỚC 2: KHI GẶP NẠN — SOS 1-CHẠM KẾT NỐI VETC CỨU HỘ & TASCO AUTO                     │
│ (Khắc phục điểm yếu gọi điện tả đường miệng của các tổng đài cứu hộ)                   │
│ • Tài xế bấm nút SOS trên Vmap: Không cần tả đường, hệ thống tự truyền tọa độ GPS      │
│   chính xác đến đội xe kéo VETC Cứu hộ và gara Tasco Auto gần nhất.                   │
│ • Theo dõi xe cứu hộ: Người dùng nhìn thấy biểu tượng xe cứu hộ đang di chuyển trên     │
│   bản đồ và thời gian dự kiến tiếp cận (ETA).                                          │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Đội cứu hộ tiếp cận & sửa chữa
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BƯỚC 3: SAU SỰ CỐ — AI KHẢO SÁT HIỆN TRƯỜNG & BẢO TRỢ CHI PHÍ MINH BẠCH                 │
│ (Khắc phục tình trạng tài xế bị gara chặt chém hoặc cãi vã khi làm bảo hiểm)          │
│ • AI Vision quét ảnh hiện trường ngập nước: Tự động trích xuất biển số, đo mực nước     │
│   ngập bánh xe/khoang máy $\to$ Tạo "Biên bản hiện trường số" có GPS chống cãi vã.     │
│ • Kết nối Tasco Auto & Tasco Insurance: Báo giá sửa chữa minh bạch, bảo lãnh chi phí. │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📅 PHẦN 5: KẾ HOẠCH HÀNH ĐỘNG 5 GIAI ĐOẠN THỰC THI (ACTION ROADMAP)

### Giai đoạn 1: Sửa đổi Giao diện UI/UX Frontend (Thời gian: 1 ngày)
* [ ] **Đưa Bản đồ làm màn hình chính:** Sắp xếp lại thứ tự Sidebar, đặt Bản đồ số lên vị trí đầu tiên.
* [ ] **Cập nhật toàn bộ nhãn menu ([Sidebar.tsx](file:///c:/Project/AI-Claims-Processing-Assistant/frontend/src/components/layout/Sidebar.tsx)):**
  * `/risk-map` $\rightarrow$ **🗺️ Bản đồ Cảnh Báo Ngập & SOS**
  * `/dashboard` $\rightarrow$ **🧭 Trung Tâm An Toàn Hành Trình**
  * `/claims` $\rightarrow$ **🚨 Biên Bản Sự Cố & Cứu Hộ Hiện Trường**
  * `/documents` $\rightarrow$ **🪪 Ví Giấy Tờ Xe & Bằng Chứng Số**
  * `/partners` $\rightarrow$ **🛠️ Mạng Lưới Cứu Hộ 24/7 & Gara Tasco Auto**
  * `/chatbot` $\rightarrow$ **🤖 Trợ Lý Hành Trình 24/7**
  * `/reviewer` $\rightarrow$ **📡 Tổng Đài Điều Phối Cứu Hộ**
  * `/policies` $\rightarrow$ **🛡️ Gói Tiện Ích Bảo Trợ Di Chuyển**
* [ ] **Làm nổi bật nút bấm SOS:** Thêm nút bấm nổi `🚨 SOS CỨU HỘ KHẨN CẤP` ngay góc phải màn hình bản đồ.

### Giai đoạn 2: Tinh chỉnh Ngôn ngữ & Tiêu đề các Trang (Thời gian: 1 ngày)
* [ ] Thay đổi các văn bản hiển thị từ ngữ cảnh "Bảo hiểm/Bồi thường" sang ngữ cảnh "An toàn di chuyển/Cứu hộ hiện trường/Bảo trợ phương tiện".
* [ ] Tích hợp tính năng hiển thị tuyến đường xe cứu hộ di chuyển tiếp cận hiện trường bằng `Goong Direction API`.

### Giai đoạn 3: Cập nhật Hồ sơ Dự án (Proposal & README) (Thời gian: 1 ngày)
* [ ] Cập nhật file Proposal: [`BAN_DRAFT_Y_TUONG_DU_AN_CLAIMFLOW.md`](file:///c:/Project/AI-Claims-Processing-Assistant/BAN_DRAFT_Y_TUONG_DU_AN_CLAIMFLOW.md) theo tiêu đề và cấu trúc Vmap SafeDrive.
* [ ] Cập nhật file Pitching & Q&A: [`WEBINAR_PITCH_VA_API_CITATIONS.md`](file:///c:/Project/AI-Claims-Processing-Assistant/WEBINAR_PITCH_VA_API_CITATIONS.md).
* [ ] Cập nhật file [`README.md`](file:///c:/Project/AI-Claims-Processing-Assistant/README.md).

### Giai đoạn 4: Thiết kế Lại Slide Báo cáo (10 Trang Chuẩn Hackathon) (Thời gian: 1 ngày)
1. **Slide 1:** Bìa — Vmap SafeDrive & Đội thi VM Team.
2. **Slide 2:** Nỗi đau di chuyển của người Việt: Mưa bão ngập lụt, chết máy thủy kích, cứu hộ khó khăn.
3. **Slide 3:** Khoảng trống thị trường: Google Maps mù ngập, app thoát nước manh mún, cứu hộ gọi điện thủ công.
4. **Slide 4:** Giải pháp Vmap SafeDrive: Vòng lặp khép kín Trước – Trong – Sau sự cố.
5. **Slide 5:** Lớp bản đồ cảnh báo ngập úng & rốn bão 63 tỉnh thành.
6. **Slide 6:** Tính năng SOS 1-chạm & Điều phối xe kéo VETC Cứu hộ.
7. **Slide 7:** AI Vision giám định hiện trường & Biên bản số hóa chống gian lận.
8. **Slide 8:** Giá trị cộng hưởng hệ sinh thái Tasco (Vmap + VETC + Tasco Auto + Tasco Insurance).
9. **Slide 9:** Kiến trúc kỹ thuật và API minh bạch (Goong, GeoJSON WGS84, Gemini Vision, LangGraph).
10. **Slide 10:** Lộ trình triển khai Sandbox thực tế & Kêu gọi đồng hành.

### Giai đoạn 5: Tổng duyệt & Luyện tập Kịch bản Live Demo 5 Phút (Thời gian: 1 ngày)
* [ ] Luyện tập kịch bản demo thao tác mượt mà không bị lỗi mạng.

---

## 🎤 PHẦN 6: KỊCH BẢN THUYẾT TRÌNH MỞ ĐẦU (SPEECH SCRIPT)
*(Dùng để phát biểu mở màn, giải quyết triệt để định kiến từ buổi góp ý trước)*

> **"Kính thưa Ban Giám khảo và các chuyên gia công nghệ Tasco,**
> 
> Tiếp thu sâu sắc những góp ý quý báu từ buổi đánh giá trước, đội ngũ chúng tôi đã nghiêm túc nhìn nhận lại và thực hiện một bước chuyển mình mang tính quyết định: **Đặt người dùng bản đồ Vmap làm trung tâm của toàn bộ giải pháp.**
> 
> Chúng tôi nhận ra rằng: Người dân mở ứng dụng bản đồ Vmap không phải để làm thủ tục giấy tờ bảo hiểm, mà là để **DI CHUYỂN AN TOÀN TRÊN ĐƯỜNG**. 
> 
> Xuất phát từ bối cảnh Việt Nam là một trong những quốc gia chịu ảnh hưởng nặng nề nhất bởi bão lũ và ngập úng đô thị – nơi hàng nghìn phương tiện bị chết máy, thủy kích sau mỗi trận mưa bão – chúng tôi tự hào giới thiệu: **Vmap SafeDrive – Lớp Bản Đồ Cảnh Báo Ngập Lụt, Dẫn Đường Tránh Thủy Kích & Điều Phối Cứu Hộ Giao Thông 1-Chạm.**
> 
> Giải pháp giải quyết trọn vẹn 3 bài toán mà Google Maps hay các ứng dụng hiện tại chưa làm được:
> 1. **Trước hành trình:** Cung cấp lớp dữ liệu cảnh báo ngập úng và thiên tai 63 tỉnh thành để lái xe chủ động chọn lộ trình an toàn.
> 2. **Khi gặp nạn:** Kích hoạt tính năng SOS 1-chạm bắt GPS để điều phối xe cứu hộ VETC và gara Tasco Auto gần nhất.
> 3. **Sau sự cố:** Dùng AI Vision đo đạc thiệt hại và xuất Biên bản hiện trường số hóa để kết nối sửa chữa minh bạch.
> 
> Sau đây, xin mời Ban Giám khảo cùng theo dõi kịch bản trải nghiệm thực tế ngay trên bản đồ!"

---

## 🎬 PHẦN 7: KỊCH BẢN LIVE DEMO 5 PHÚT CHINH PHỤC BAN GIÁM KHẢO

| Thời gian | Hành động trên màn hình Demo | Lời thuyết minh tương ứng |
|---|---|---|
| **Phút 01:00** | Mở trang **Bản đồ Cảnh Báo Ngập & SOS** (`/risk-map`). Bật bộ lọc *Ngập úng đô thị* và *Bão lũ miền Trung*. Zoom vào Hà Nội và TP.HCM. | *"Đây là lớp dữ liệu chuyên đề ngập lụt và thiên tai phủ khắp 63 tỉnh thành. Lái xe trước khi xuất phát có thể thấy ngay các vùng có nguy cơ ngập cao để chủ động chọn lộ trình khác, tránh rủi ro xe bị thủy kích."* |
| **Phút 02:00** | Giả lập tình huống xe chết máy tại phố ngập nước. Nhấp nút nổi **🚨 SOS CỨU HỘ KHẨN CẤP** trên bản đồ. | *"Giả sử xe của tôi vừa bị chết máy giữa điểm ngập. Thay vì hoảng loạn gọi điện khắp nơi và không biết mình đang ở đâu, tôi chỉ cần bấm SOS 1-chạm. Hệ thống tự động bắt GPS, tính toán cự ly thực tế qua Vmap/Goong API và hiển thị ngay 3 trạm cứu hộ VETC / gara Tasco Auto gần nhất."* |
| **Phút 03:00** | Chọn Gara Tasco Auto gần nhất $\rightarrow$ Bản đồ vẽ tuyến đường xe cứu hộ đang di chuyển tiếp cận hiện trường. | *"Chỉ sau vài giây, lệnh cứu hộ được phát đi. Lái xe có thể theo dõi trực tiếp lộ trình xe cứu hộ đang di chuyển đến vị trí của mình theo thời gian thực."* |
| **Phút 04:00** | Mở tính năng **Chụp ảnh hiện trường** $\rightarrow$ AI Vision quét ảnh xe ngập nước, hiển thị kết quả đo lường hư hại. | *"Trong lúc chờ cứu hộ, tài xế chụp ảnh hiện trường. Công nghệ AI Vision tự động nhận diện biển số, đo đạc mức độ ngập và xuất ra một Biên bản hiện trường số có định vị GPS. Điều này giúp gara chuẩn bị đúng loại phụ tùng và giải quyết dứt điểm tranh cãi khi sửa chữa."* |
| **Phút 05:00** | Mở tab **Tổng đài Điều phối Gara** (`/reviewer`) hiển thị thông tin lệnh cứu hộ vừa tạo. Chốt bài học. | *"Vmap SafeDrive không chỉ là một tiện ích cứu hộ, mà là mắt xích kết nối toàn diện hệ sinh thái Tasco: Bản đồ Vmap $\times$ Khách hàng VETC $\times$ Gara Tasco Auto $\times$ Tasco Insurance. Xin cảm ơn Ban Giám khảo!"* |

---

## ✅ CHECKLIST THEO DÕI TIẾN ĐỘ THỰC HIỆN

- [ ] **Bước 1:** Phê duyệt Kế hoạch chuyển trục tổng thể (Master Pivot Plan).
- [ ] **Bước 2:** Cập nhật lại nhãn menu Sidebar và icon trong `Sidebar.tsx`.
- [ ] **Bước 3:** Chuyển route mặc định khi đăng nhập sang thẳng trang Bản đồ.
- [ ] **Bước 4:** Tinh chỉnh các tiêu đề trang trong Frontend từ ngữ cảnh "Bảo hiểm" sang "Cứu hộ & Di chuyển an toàn".
- [ ] **Bước 5:** Cập nhật lại các file Proposal (`BAN_DRAFT_Y_TUONG_DU_AN_CLAIMFLOW.md`) và Pitch deck.
- [ ] **Bước 6:** Chạy thử kịch bản Live Demo 5 phút trên môi trường local.

---

> [!IMPORTANT]
> Toàn bộ kế hoạch này đã giải quyết triệt để 2 vấn đề lớn nhất: **Trúng đề bài Vmap 100%** và **Thực tế, khả thi ngay trong hệ sinh thái Tasco (VETC Cứu hộ + Tasco Auto)**. Hãy chuẩn bị tinh thần để bắt đầu triển khai các bước đầu tiên!
