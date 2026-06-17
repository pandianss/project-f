# FarmOS AI India

**The operating system for Indian agriculture** — a continuously-learning **digital twin of every field** that turns soil, water, weather, crop, satellite, and market history into actionable intelligence: crop recommendations, yield & disease prediction, farm risk scoring, banking-grade credit scores, insurance risk, market timing, and a direct-retail produce marketplace.

> **The wedge:** weather alerts, disease diagnosis, and a voice-first assistant are *acquisition features*. The venture-scale business is the compounding data asset — **Digital Farm Twin → Farm Risk → Farm Credit → Insurance** — sold to banks, NBFCs, insurers, FPOs, input companies, and governments. See [docs/00-Executive-Summary.md](docs/00-Executive-Summary.md).

## Repository layout
| Path | Contents |
|---|---|
| [`docs/`](docs) | Full product, architecture, and business design set (PRD → GTM) |
| [`backend/`](backend) | Runnable core API: Node/TS + Fastify + PostgreSQL/PostGIS |

## Design documents
| # | Doc |
|---|---|
| 00 | [Executive Summary & Investor Pitch](docs/00-Executive-Summary.md) |
| 01 | [Product Requirements (PRD)](docs/01-PRD.md) |
| 02 | [System / Deployment / Security / Multi-tenant Architecture](docs/02-System-Architecture.md) |
| 03 | [Database Schema (Digital Twin)](docs/03-Database-Schema.md) |
| 04 | [GIS Architecture & Data Sources](docs/04-GIS-Architecture.md) |
| 05 | [AI / ML Architecture (incl. FarmGPT)](docs/05-AI-Architecture.md) |
| 06 | [API Design](docs/06-API-Design.md) |
| 07 | [Mobile UX & Flows](docs/07-Mobile-UX.md) |
| 08 | [Intelligence Engines (methodology)](docs/08-Engines-Spec.md) |
| 09 | [Monetization & Revenue Model](docs/09-Monetization.md) |
| 10 | [Roadmap, Team, Cost, Build Sequence](docs/10-Roadmap-Team-Cost.md) |
| 11 | [GTM, Competitive Analysis, Risks](docs/11-GTM-Competitive-Risks.md) |
| 12 | [Android App Suite + Direct-Retail Marketplace](docs/12-Android-Apps-and-Marketplace.md) |
| 13 | [Loss Aversion & Profitability](docs/13-Loss-Aversion-and-Profitability.md) |
| 14 | [Community Forum](docs/14-Community-Forum.md) |

## Backend — implemented & verified
A runnable service ([backend/README.md](backend/README.md)) covering the full thesis, smoke-tested against live PostGIS:

- **Digital Twin + Farm Passport** — field onboarding from GeoJSON polygon (PostGIS area), append-only history.
- **Respect Points gate** — marketplace selling is **off by default**, unlocked only by earned trust (KYC + verified cultivation + RP threshold).
- **Farm Risk + Credit scoring** — explainable 0–100 sub-scores + reason codes; **consent-scoped B2B access with full audit trail**.
- **Direct-retail marketplace** — provenance-badged listings, escrow, OTP handover; outsourced 3PL logistics.
- **Crop recommendation** — suitability + profit/risk ranking.
- **Advisory & alerts** — action-first alerts with ₹-at-risk.
- **Farm Family ERP ledger** — expense/income tracking + season P&L (auto-imports marketplace sales).
- **Disease prediction** — pre-symptom risk from weather favourability + neighbour-field spread.
- **Market intelligence** — price forecast, best market net of transport, sell-vs-store.
- **Community forum** — hyperlocal Q&A, AI first-responder, RP for accepted answers, misinformation guardrail.

### Quick start
```bash
cd backend
cp .env.example .env
npm install
docker compose up -d      # PostGIS on localhost:5433
npm run migrate
npm start                 # API on :3000
```

## Tech stack
Node 24 + TypeScript (Fastify) · PostgreSQL 16 + PostGIS · Docker. Production targets (per docs): Python/FastAPI engine services, Kubernetes, Kafka/Temporal, MLflow/Feast, and **Android-only** consumer apps (Kotlin/Compose).

## Status
Design complete; backend engines implemented and verified. Next: Android client, hardening (tests, OpenAPI, real auth, rate limiting), and the CV/RAG model services.

---
*Built with [Claude Code](https://claude.com/claude-code).*
