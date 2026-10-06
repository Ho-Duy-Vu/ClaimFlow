# UI Design System Specification: Relief (Insurance + Map)
> **ClaimFlow — Modern AI-Powered Insurance Claims & Geo-Risk Intelligence Platform**  
> *Theme: Light | Canvas: Cream-paper harbor under flat sky-blue (`#f9f7f0` & `#2e96ff`)*

---

## 1. Executive Summary & Design Philosophy

`ClaimFlow` implements the **Relief** design system — a warm nautical-sky aesthetic specifically tuned for the **Insurance + Map** domain across all three operational roles: **User (Policyholder)**, **Reviewer (Claims Adjudicator)**, and **Admin (Operations & Risk Director)**.

Unlike typical cold, sterile, or bureaucratic insurance software with stark white `#ffffff` backgrounds and generic blues, Relief introduces:
- **Approachability & Trust**: A warm cream canvas (`#f9f7f0`) mimics physical parchment/insurance policy documents, immediately putting distressed policyholders and busy adjusters at ease.
- **Visual Weight & Anchoring**: Deep Harbor navy (`#13426f`) cards sit directly on cream like buoys on sand, creating bold contrast without requiring cluttered borders.
- **The Signature "Pop Shadow"**: A flat solid 7px sky-blue offset (`rgba(154, 207, 246, 0.5) 0px 7px 0px 0px`) under primary action buttons and floating map controls, making elements appear physically raised and tactile like durable stickers.
- **Domain Specialization (Insurance + Map)**: Seamlessly merges high-precision geographic disaster layers (Leaflet maps, flood zones, storm tracks, rescue dispatch pins) with rigorous financial insurance tables (itemized adjustment sheets, SLA timers, fraud velocity pills).

---

## 2. Design Tokens

### 2.1. Color Palette

| Token Name | Hex Value | CSS Variable | Domain & Role Purpose |
|------------|-----------|--------------|------------------------|
| **Warm Cream** | `#f9f7f0` | `--color-warm-cream` | Page canvas & background — the entire site rests on this off-white. Never pure `#ffffff` for page backgrounds. |
| **Snow** | `#ffffff` | `--color-snow` | Elevated card surfaces, input fields, dropdown popups, and modal dialogs. |
| **Ink** | `#333333` | `--color-ink` | Dominant neutral for primary body copy, table text, input text, and form labels. |
| **Charcoal** | `#212121` | `--color-charcoal` | High-emphasis headings, key financial totals, and primary table values. |
| **Fog** | `#d0d5dd` | `--color-fog` | Hairline borders, subtle table row dividers, and map panel borders. |
| **Slate** | `#616c8a` | `--color-slate` | Muted secondary metadata, policy numbers, helper text, and timestamps. |
| **Slate Border** | `#40444e` | `--color-slate-border` | Stronger borders, contrast dividers, and active filter chip boundaries. |
| **Deep Harbor** | `#13426f` | `--color-deep-harbor` | Feature cards, dark status banners, executive stat cards, and map header bars. |
| **Sky Pop** | `#2e96ff` | `--color-sky-pop` | Single chromatic accent: Primary CTAs, active states, approve action, and map trigger points. |
| **Deep Wave** | `#0254a5` | `--color-deep-wave` | Secondary action borders, active sidebar tab text, and secondary interactive outlines. |
| **Sky Tint** | `#bde1f9` | `--color-sky-tint` | Status pill backgrounds, SLA within-time badges, and soft map marker halos. |
| **Sky Wash** | `#cde7fb` | `--color-sky-wash` | Button pop shadow tone, selected row tint, and map hover highlights. |
| **Info Mist** | `#73b9ff` | `--color-info-mist` | Small accents, active icons, step wizard indicators, and subtle map radar pulses. |
| **Sky Mid** | `#50a7ff` | `--color-sky-mid` | Decorative graphical elements, graph lines, and map flood boundary strokes. |

#### Semantic Status Tokens (Tailored for Insurance Workflows)
To maintain the strict single-accent discipline while meeting critical insurance and risk safety standards:
- **Approved / Low Risk / Verified**: Background `#d1fae5`, Border `#10b981`, Text `#065f46`.
- **Pending / In Review / Moderate Risk**: Background `#fef3c7`, Border `#f59e0b`, Text `#92400e`.
- **Rejected / High Risk / Fraud Flag / SLA Overdue**: Background `#fee2e2`, Border `#ef4444`, Text `#991b1b`.
- **Special Direct Billing (GOP Guarantee)**: Background `#e0e7ff`, Border `#6366f1`, Text `#3730a3`.

---

### 2.2. Typography System

**Typeface**: Single-family rounded geometric system — **Gilroy** (Fallbacks: *Montserrat*, *Nunito*, *Manrope*, *sans-serif*).
- **Letter Spacing**: Uniform **`-0.018em`** across all font sizes from 12px to 58px.
- **Font Weights**:
  - `400` (Regular): Explanatory body text, policy terms, customer notice copy.
  - `500` (Medium): UI labels, input fields, navigation items, table cells.
  - `600` (SemiBold): Card titles, subheadings, SLA countdowns, trust chips.
  - `700` (Bold): Hero titles, section headings, primary button labels, key payout numbers.
  - `800` (ExtraBold): Hero lead metrics, high-impact loss ratio stats.

#### Type Scale

| Role | Font Size | Line Height | Tracking | CSS Token | Application in Insurance & Map |
|------|-----------|-------------|----------|-----------|--------------------------------|
| **caption** | 12px | 1.5 | -0.22px | `--text-caption` | Timestamp, GPS coordinates, policy ID footnote, SLA indicator |
| **body-sm** | 14px | 1.5 | -0.25px | `--text-body-sm` | Table row details, input placeholders, map tooltip details |
| **body** | 16px | 1.6 | -0.29px | `--text-body` | Standard claim descriptions, terms of service, AI explanation |
| **subheading** | 18px | 1.5 | -0.32px | `--text-subheading` | Card headers, form section subheaders, map popup titles |
| **heading-sm** | 20px | 1.4 | -0.36px | `--text-heading-sm` | Claim review modal titles, partner profile names |
| **heading** | 32px | 1.29 | -0.58px | `--text-heading` | Page titles, key dashboard section titles, claim status hero |
| **heading-lg** | 40px | 1.2 | -0.72px | `--text-heading-lg` | Stat headline bands, large approved payout banner |
| **display** | 58px | 1.1 | -1.04px | `--text-display` | Landing page hero claim value, platform headline |

---

### 2.3. Spacing, Shapes & Shadows

#### Spacing Scale
- Base unit: `7px / 14px / 28px` rhythm.
- Tokens: `7px`, `8px`, `10px`, `14px`, `16px`, `20px`, `24px`, `28px`, `34px`, `40px`, `56px`, `70px`.
- Page max container: `1280px` (or `1440px` for full-width Map & Cockpit views).
- Standard card padding: `28px` (compact mobile/tables: `16px - 20px`).

#### Border Radii (Soft, Toy-like Tactile Geometry)
- **Pill (Buttons, Badges, Search bars, Map chips)**: `40px` to `70px` (or `9999px`).
- **Standard Cards (Reviewer panels, Policy cards)**: `20px` to `26px`.
- **Large Hero / Deep Harbor Feature Cards**: `28px` to `34px`.
- **Map Overlays & Floating Control Boxes**: `18px` to `24px`.
- *Strict Rule*: No sharp 0-8px corners on cards or buttons; sharp corners break the approachable Relief language.

#### Elevation & Shadows
- **Signature Pop Shadow (Primary CTAs, Active Map Filters)**:
  `box-shadow: rgba(154, 207, 246, 0.5) 0px 7px 0px 0px;`  
  *(Flat solid offset, strictly no CSS blur)*.
- **Secondary Pop Shadow (Small action pills, Map tooltips)**:
  `box-shadow: rgba(154, 207, 246, 0.5) 0px 5px 0px 0px;`
- **Subtle Surface Card Shadow (Floating white cards on cream)**:
  `box-shadow: rgba(0, 0, 0, 0.04) 0px 4px 12px 0px;`
- **Deep Harbor Card Shadow**:
  `box-shadow: rgba(0, 0, 0, 0.08) 0px 6px 0px 0px;`

---

## 3. Domain-Specific Component Specifications (Insurance + Map)

### 3.1. Interactive Map System (Geo-Risk, Rescue & Partner Network)

The Map interface combines spatial GIS intelligence with the Relief aesthetic:

```
+-----------------------------------------------------------------------------+
| [Search Province / Address] [All Risks v] [Hospitals] [Garages] [Rescues]   | <- Pill Filter Bar
+-----------------------------------------------------------------------------+
|                                                                             |
|                                       /=========\                           |
|       (H) Bach Mai                   /  Typhoon  \                          |
|         [GOP 24/7]                  |   Zone VI   |                         |
|                                      \  (Orange) /                          |
|                                       \=========/                           |
|                    (G) Thang Long Garage                                    |
|                      [Rescue Dispatched]                                    |
|                                                                             |
|  +---------------------------+       +-----------------------------------+  |
|  | Floating Map Legend       |       | Live Rescue Dispatch Card         |  |
|  | * Red: Flood High Risk    |       | #CF-9021 . Đội cứu hộ 115       |  |
|  | * Blue: Marine / Storm    |       | [Điều phối xe] (7px Pop Shadow)   |  |
|  +---------------------------+       +-----------------------------------+  |
+-----------------------------------------------------------------------------+
```

1. **Map Container & Base Layer**:
   - Uses a clean, modern base tile style (CartoDB Positron or customized light warm basemap) that matches `--color-warm-cream`.
   - Outer container rounded with `24px` radius and `1px solid var(--color-fog)`.
2. **Interactive Map Markers**:
   - **Partner Hospital (Bảo lãnh viện phí GOP)**: Circular badge `42px` in `#13426f` with white cross icon, wrapped in a `4px` ring of `#bde1f9`.
   - **Partner Garage (Gara sửa chữa ô tô)**: Circular badge in `#0254a5` with wrench/car icon.
   - **Emergency Rescue Squad (Đội cứu hộ 24/7)**: Circular badge in `#2e96ff` with subtle pulsing radar ring (`@keyframes pulse`).
   - **Disaster Hotspot (Tâm bão / Ngập lụt)**: Glowing danger pill showing Province name and Risk Score (`88/100`).
3. **Map Popups & Tooltips**:
   - White snow surface (`#ffffff`), `18px` border radius, `rgba(0,0,0,0.06) 0px 6px 16px 0px`.
   - Header with Deep Harbor text (`#13426f`), badge pill indicating partner type.
   - Primary action button inside popup: Sky Pop pill with signature `5px` pop shadow (`rgba(154, 207, 246, 0.5) 0px 5px 0px 0px`).
4. **Floating Map Controls & Filter Pill Bar**:
   - Horizontal pill cluster positioned over map top-center or top-left.
   - Background `#ffffff` with `40px` pill radius, border `1px solid #d0d5dd`.
   - Active filter chip: Fill `#2e96ff`, text `#ffffff`, shadow `rgba(154, 207, 246, 0.5) 0px 5px 0px 0px`.

---

### 3.2. Insurance Core Components

#### 1. Primary CTA Button
- **Fill**: `#2e96ff` (Sky Pop)
- **Text**: `#ffffff`, Gilroy 700, 16px
- **Padding**: `14px 28px`
- **Border Radius**: `40px` (full pill)
- **Shadow**: `rgba(154, 207, 246, 0.5) 0px 7px 0px 0px`
- **Hover State**: `transform: translateY(-2px); box-shadow: rgba(154, 207, 246, 0.6) 0px 9px 0px 0px;`
- **Active State**: `transform: translateY(4px); box-shadow: rgba(154, 207, 246, 0.5) 0px 3px 0px 0px;`

#### 2. Deep Harbor Feature Card (Nautical Content Block)
- **Fill**: `#13426f` (Deep Harbor navy)
- **Text**: `#ffffff`
- **Padding**: `28px`
- **Border Radius**: `22px`
- **Shadow**: `rgba(0, 0, 0, 0.05) 0px 3px 0px 0px`
- **Usage**:
  - Key Policy Benefit Highlight (e.g. *Bảo lãnh viện phí 24/7 lên đến 500.000.000 đ*).
  - Executive Loss Ratio KPI card.
  - Testimonial and trust blocks.

#### 3. Trust & Status Badge Pills
- **Pill Radius**: `40px` - `100px`.
- **Padding**: `6px 16px`.
- **Font**: Gilroy 600, 12-13px, tracking `-0.018em`.
- **Variants**:
  - *SLA On-Time*: Background `#bde1f9`, Text `#13426f`.
  - *SLA Overdue*: Background `#fee2e2`, Text `#991b1b`, icon `AlertTriangle`.
  - *STP Auto-Approved*: Background `#d1fae5`, Text `#065f46`, icon `CheckCircle2`.
  - *GOP Direct Hospital*: Background `#e0e7ff`, Text `#3730a3`, icon `ShieldCheck`.

#### 4. Itemized Claims Adjustment Sheet
- Embedded within reviewer adjudication cockpit.
- White card container (`#ffffff`), `20px` radius, hairline border `#d0d5dd`.
- Table header in soft gray-blue `#f1f5f9` with Gilroy 600 captions in `#616c8a`.
- Row layout:
  - Item name & category pill.
  - Claimed amount (`#333333`).
  - Approved amount (editable input with pill border `20px`).
  - Reduction/Exclusion code dropdown.
- Bottom summary bar in `#f9f7f0` featuring auto-calculated totals and **"Áp dụng vào tổng duyệt"** pill button with 5px pop shadow.

#### 5. Dual Notes Reviewer Accordion
- **Tab 1: Ghi chú nội bộ (Confidential Memo)**:
  - Border `#f59e0b`, background `#fffbeb`.
  - Watermark badge: `BẢO MẬT NỘI BỘ - KHÁCH HÀNG KHÔNG THẤY`.
- **Tab 2: Thông báo gửi khách hàng (Customer Notice / EOB)**:
  - Border `#2e96ff`, background `#ffffff`.
  - Action button: `Tạo giải trình tự động (Draft EOB)` with Sky Pop outline.

---

## 4. Role-Based UI Architecture

```
                                  ClaimFlow (Relief Design System)
                                                 |
         +---------------------------------------+---------------------------------------+
         |                                       |                                       |
    [USER ROLE]                           [REVIEWER ROLE]                          [ADMIN ROLE]
  Paraphernalia & Claims              Claims Adjudication Cockpit            Enterprise Operations
  - Public & User Portal              - Active Queue & Smart Dispatch         - Underwriting Rule Engine
  - Policy Marketplace                - Itemized Adjustment Sheet             - 4-Eyes Payout Sign-off
  - Claim Filing Wizard               - 12-Month Velocity Risk                - Partner & Garage Network
  - Geo-Risk Disaster Map             - SLA Realtime Countdown                - Map Dispatch Center
  - AI Claims Chatbot                 - Dual Internal / EOB Notes             - Loss Ratio Analytics
```

### 4.1. Role 1: User (Policyholder)

*Primary Objective: Provide maximum clarity, reduce anxiety during distress, and offer friction-free claim submissions.*

1. **Canvas & Layout**:
   - Warm cream canvas `#f9f7f0` gives a welcoming, non-clinical presence.
   - Max width `1200px`, centered.
2. **Claim Submission Wizard (Tạo yêu cầu bồi thường)**:
   - 4-Step Progress Pill Indicator at top (1. Thông tin hợp đồng $\to$ 2. Diễn biến sự kiện $\to$ 3. Tải hoá đơn/chứng từ OCR $\to$ 4. Xác nhận ngân hàng).
   - Document upload dropzone: White surface `#ffffff`, dashed border `2px #2e96ff`, soft sky tint background `#bde1f9/20`.
   - OCR Live Feedback Card: Shows scanned items and recognized amounts with confidence scores.
3. **Geo-Risk Disaster Map for Policyholders (`/geo-risk`)**:
   - Displays real-time provincial flood, storm, and disaster risk indicators.
   - Suggests personalized insurance products and nearest emergency rescue hotlines based on user location.
4. **Claims Tracker & EOB Viewer (`/claims/[id]`)**:
   - Visual milestone track showing live progress.
   - If approved with reduction, transparently shows the Explanation of Benefits (EOB) generated by the reviewer so the user clearly understands every deductible or non-covered line item.
5. **AI Claims Chatbot Assistant**:
   - Floating widget bottom-right with Sky Pop trigger button (`56px` circle with 7px pop shadow).
   - Chat bubbles: Assistant in White `#ffffff` with `#d0d5dd` border; User in `#13426f` with white text.

---

### 4.2. Role 2: Reviewer (Claims Adjudicator)

*Primary Objective: Fast, error-free claim adjudication with deep data visibility, SLA adherence, and fraud detection.*

1. **Queue Workspace (`/reviewer`)**:
   - Split-screen layout:
     - Left (35%): Queue Claim Cards with SLA Countdown badges (`< 12h` amber, overdue red), claimant frequency risk chips, and auto-assigned reviewer avatar.
     - Right (65%): Detailed Adjudication Cockpit.
2. **Adjudication Cockpit Header**:
   - Hero strip in `#13426f` (Deep Harbor) showing Claim ID, Claimed vs Approved amount, and Live SLA Timer with milestone track.
3. **Claimant 12-Month Profile & Fraud Alert**:
   - Summary card calculating previous claims in 12 months, total amount paid, prior rejection rate.
   - Warning pill if high velocity or previous fraud history detected.
4. **Interactive Adjustment Workspace**:
   - Quick-load template buttons for **Y Tế (Medical)** and **Xe Cơ Giới (Vehicle)**.
   - Live sync button updating `amountApproved` with automatic detection of partial approval.
5. **Direct Partner GOP Action**:
   - Quick card showing if policyholder is at a partner hospital or garage with one-click cashless guarantee confirmation.

---

### 4.3. Role 3: Admin (Operations, Underwriting & Partner Network)

*Primary Objective: Executive system visibility, automated rule configuration, partner dispatch, and governance.*

1. **Enterprise Analytics Cockpit (`/analytics`)**:
   - Stat bands on cream canvas: Loss Ratio (Tỷ lệ bồi thường / Doanh thu), GWP, Reserved Claims, STP Rate.
   - Interactive charts with Deep Harbor `#13426f` and Sky Pop `#2e96ff` colorways.
2. **Underwriting Rules Engine (`/underwriting`)**:
   - Card-based configuration for STP (Straight-Through Processing):
     - Auto-approval max amount slider.
     - Maximum acceptable AI fraud score slider ($\le 20$).
     - Minimum OCR confidence threshold ($\ge 85\%$).
   - 4-Eyes Principle queue for high-value claims ($\ge 50.000.000$ đ) with digital sign-off and rejection workflows.
3. **Partner Network & Live Dispatch Map (`/partners`)**:
   - Integrated Leaflet Map showing verified Garage, Hospital, and Rescue squad locations across 63 provinces.
   - Filterable partner table with action button: **"Phát lệnh điều phối"** (Dispatch) linking claim ID and partner.
   - Refresh button styled with `#ffffff` surface and `#212121` black text (`text-black font-semibold`).
4. **Smart Workload Dispatching**:
   - Reviewer team quota bars, auto-assignment switches, and one-click queue rebalancing.

---

## 5. Implementation Code: Tokens & Reusable Tailwind / CSS

### 5.1. CSS Custom Properties (`src/app/globals.css`)

```css
:root {
  /* Relief Color Tokens */
  --color-warm-cream: #f9f7f0;
  --color-snow: #ffffff;
  --color-ink: #333333;
  --color-charcoal: #212121;
  --color-fog: #d0d5dd;
  --color-slate: #616c8a;
  --color-slate-border: #40444e;
  --color-deep-harbor: #13426f;
  --color-sky-pop: #2e96ff;
  --color-deep-wave: #0254a5;
  --color-sky-tint: #bde1f9;
  --color-sky-wash: #cde7fb;
  --color-info-mist: #73b9ff;
  --color-sky-mid: #50a7ff;

  /* Typography */
  --font-gilroy: 'Gilroy', 'Montserrat', 'Nunito', 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --letter-spacing-uniform: -0.018em;

  /* Elevation & Shadows */
  --shadow-pop: rgba(154, 207, 246, 0.5) 0px 7px 0px 0px;
  --shadow-pop-sm: rgba(154, 207, 246, 0.5) 0px 5px 0px 0px;
  --shadow-card: rgba(0, 0, 0, 0.04) 0px 4px 14px 0px;
  --shadow-harbor: rgba(0, 0, 0, 0.08) 0px 6px 0px 0px;

  /* Border Radii */
  --radius-card: 22px;
  --radius-pill: 9999px;
  --radius-modal: 26px;
}

body {
  background-color: var(--color-warm-cream);
  color: var(--color-ink);
  font-family: var(--font-gilroy);
  letter-spacing: var(--letter-spacing-uniform);
}
```

### 5.2. Tailwind Utility Classes Mapping

| Pattern | Tailwind Combination |
|---------|----------------------|
| **Page Canvas** | `bg-[#f9f7f0] min-h-screen text-[#333333]` |
| **Standard Card** | `bg-white rounded-[22px] border border-[#d0d5dd] p-7 shadow-[0_4px_14px_rgba(0,0,0,0.04)]` |
| **Deep Harbor Card** | `bg-[#13426f] text-white rounded-[22px] p-7 shadow-[0_6px_0_rgba(0,0,0,0.08)]` |
| **Primary Pop Button** | `bg-[#2e96ff] hover:bg-[#2585e5] text-white font-bold px-7 py-3.5 rounded-full shadow-[0_7px_0_0_rgba(154,207,246,0.5)] active:translate-y-1 active:shadow-[0_3px_0_0_rgba(154,207,246,0.5)] transition-all` |
| **Ghost Outline Button** | `bg-transparent hover:bg-white/10 text-[#0254a5] border-2 border-[#0254a5] font-semibold px-6 py-3 rounded-full transition-all` |
| **Status Pill** | `bg-[#bde1f9] text-[#13426f] text-xs font-semibold px-4 py-1.5 rounded-full inline-flex items-center gap-1.5` |
| **Map Floating Panel** | `bg-white/95 backdrop-blur-md rounded-[20px] border border-[#d0d5dd] shadow-lg p-4` |
| **Itemized Table Row** | `border-b border-[#d0d5dd] hover:bg-[#cde7fb]/20 transition-colors` |

---

## 6. Do's and Don'ts (Strict Design Checklist)

### Do
- **Do** use `#f9f7f0` Warm Cream as the global page canvas. The canvas is what establishes the human, physical document feel of the product.
- **Do** apply the 7px flat solid offset shadow (`rgba(154, 207, 246, 0.5) 0px 7px 0px 0px`) to all primary CTA buttons and floating action triggers.
- **Do** use pill-shaped borders (`rounded-full`) for all buttons, search bars, filter chips, and badges.
- **Do** place dark navy `#13426f` feature cards directly on the cream canvas without extra borders to create strong visual blocks.
- **Do** maintain `-0.018em` tracking across all text elements to keep the rounded font compact and deliberate.
- **Do** clearly distinguish between confidential internal reviewer notes (`internal_note`) and customer-facing explanations (`customer_notice`).
- **Do** make the refresh button on admin toolbars readable with `#ffffff` background and black text (`text-black font-semibold`).

### Don't
- **Don't** use pure `#ffffff` as the page background. Pure white is reserved solely for elevated card surfaces and inputs floating on cream.
- **Don't** use soft CSS blurred drop shadows on buttons — only flat solid offset shadows are allowed in the Relief system.
- **Don't** use sharp 0-8px border radius on cards or buttons; sharp corners break the approachable, tactile aesthetic.
- **Don't** introduce random auxiliary bright colors (pinks, neon greens, purples) into core screens; stay strictly within the Sky Blue, Deep Harbor, Warm Cream, and Ink palette.
- **Don't** hide emergency rescue hotlines or partner GOP verification behind deep multi-click menus.
- **Don't** display raw code exceptions or JSON dumps to either users or claims adjusters.

---

## 7. Quality Assurance & Verification

When developing or auditing any page in ClaimFlow:
1. **Color Contrast**: Verify that text in `#333333` on `#f9f7f0` exceeds WCAG AA contrast ratio ($\ge 4.5:1$).
2. **Button Tactility**: Confirm that clicking any primary CTA applies the `translate-y-1` micro-interaction and reduces the 7px shadow to 3px.
3. **Map Marker Interaction**: Ensure map pins display hover tooltips in `#ffffff` with `18px` radius and clear action buttons.
4. **Responsive Layout**: On mobile screens ($\le 768px$), cards adapt from `28px` padding to `16-20px`, while keeping pill button shapes intact.
