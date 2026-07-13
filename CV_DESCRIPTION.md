# ClaimFlow — CV Description

> **ClaimFlow — AI-Powered Insurance Claims Platform** · Personal project
> `Next.js 14 · TypeScript · FastAPI · MongoDB · Celery/Redis · Qdrant · Google Gemini · LangGraph · Docker`

**What it is (1 line):** A bilingual (EN/VI) insurtech web app that automates the whole insurance lifecycle — document OCR → policy purchase → AI claim adjudication → human review → payout — on an async, event-driven backend.

---

## Universal summary (use for any role)

- Built an **end-to-end AI insurance platform**: upload documents → Gemini Vision OCR → buy a policy → submit a claim → an **AI agent auto-decides** (approve / reject / manual-review) → reviewer override → payout, with real-time status and notifications.
- **AI core:** a **LangGraph 4-node agent** (extract → coverage → fraud → decision) grounded by a **RAG pipeline** (Qdrant + Gemini) over policy documents, plus Vietnamese OCR with bounding boxes, multi-document consolidation, and a privacy-guarded chatbot.
- **Engineering:** async **FastAPI** (70+ endpoints) + **MongoDB/Beanie**, **Celery/Redis** queue, **WebSocket** realtime, JWT+CSRF security, role-based access (user/reviewer/admin) with audit logs, PDF generation, and **Docker Compose** infra.
- **Frontend:** **Next.js 14 + TypeScript + Tailwind** — bilingual EN/VI, dark mode, mobile-responsive, Leaflet risk map, SVG analytics, multi-step wizards.

---

## AI Engineer

- Designed a **LangGraph 4-node claim agent** (extract → check_coverage → fraud_detection → decide) with hybrid rule + LLM decisioning and calibrated fraud scoring.
- Built a **RAG pipeline** (Qdrant vector search + Gemini embeddings) that grounds coverage checks and the chatbot in real policy clauses, with rule-based fallback.
- Engineered **Gemini Vision OCR** for Vietnamese documents: bounding-box extraction, MD5 caching, confidence-threshold auto-retry, and **multi-doc holistic OCR** that consolidates N files and flags inconsistencies.
- Shipped a **privacy-safe chatbot + claim explainer** with prompt-injection defense and a configurable Gemini model-tier strategy (cost/quality control).

## Software Engineer

- Architected an **async FastAPI backend (70+ endpoints)** with MongoDB/Beanie, **Celery + Redis** for background OCR/claim processing, and **WebSocket** for realtime updates + notifications.
- Implemented production security: **JWT httpOnly cookies, CSRF, rate limiting, RBAC, audit logging, request-ID tracing**.
- Built an **event-driven pipeline** (upload → queue → AI worker → notify), PDF generation (contract/invoice/receipt), MinIO/S3 storage, and **Docker Compose** across MongoDB/Redis/Qdrant/MinIO.
- Applied system-design patterns: message queue, pub/sub, caching, DB indexing, lightweight CQRS, UTM→WGS84 geo conversion.

## Full-Stack

- Developed a **bilingual (EN/VI) Next.js 14 + TypeScript + Tailwind** app with role-based nav, dark mode, mobile-responsive layout, and 10+ feature pages.
- Built interactive UI: multi-step **claim/policy wizards** (with simulated bank-QR payment), **Leaflet** choropleth risk map, pure-SVG analytics, OCR bbox overlays, realtime notification bell.
- Delivered features end-to-end — FastAPI + MongoDB → React — for OCR, policy purchase/renewal, payment schedules, AI claim review, and an "explain my claim" flow.
- Integrated Gemini (OCR/chatbot/agent) + Qdrant RAG; handled auth, i18n (`next-intl`), and full type safety.

---

**Skills line:** `Python, FastAPI, MongoDB, Celery, Redis, Qdrant · TypeScript, React, Next.js 14, TailwindCSS, Leaflet · Google Gemini (Vision/LLM), LangGraph, RAG · Docker, JWT/CSRF, WebSocket, S3/MinIO`
