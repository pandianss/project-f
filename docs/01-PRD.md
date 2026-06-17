# FarmOS AI India — Product Requirements Document (PRD)

## 1. Vision
Create a continuously-learning **digital twin** for every agricultural field in India and convert accumulated field intelligence into decisions: what to grow, what it will yield, what can go wrong, what it's worth as collateral, and what it should cost to insure.

## 2. Goals / Non-goals
**Goals**
- Permanent, portable **Farm Passport** (ULPIN-linkable field ID) whose history is never lost.
- Field-level intelligence: crop reco, yield, disease (diagnose + predict), risk, credit, insurance.
- Voice-first, multilingual, offline-tolerant farmer experience.
- B2B scoring APIs as the revenue engine.

**Non-goals (v1)**
- Not a marketplace-first company (input marketplace is a later monetization layer).
- Not building our own satellites/drones (integrate; don't own hardware).
- Not a generic weather app.

## 3. Personas & core jobs-to-be-done
| Persona | Primary job | Key features | Willingness to pay |
|---|---|---|---|
| Small/marginal farmer | "Tell me what to do this week" | Voice advisory, alerts, disease photo, crop reco | Low (freemium) |
| Progressive farmer (5+ ac) | Optimize profit | Yield/profit optimizer, market timing, Family ERP | Medium |
| FPO | Manage member farms, aggregate | Village dashboard, bulk advisory, procurement | Medium-High |
| Bank / NBFC / MFI | Underwrite & monitor agri loans | Credit Score API, KCC eligibility, repayment forecast, portfolio monitoring | **High** |
| Insurer | Price & settle crop insurance | Risk score, claim/loss probability, fraud signals, CCE replacement | **High** |
| Govt dept | Plan & monitor at scale | Village/district intelligence dashboards, scheme targeting | High (contracts) |
| Agri-input company | Target demand | Demand heatmaps, recommendation marketplace, trial analytics | Medium-High |

## 4. MVP scope (first 6–9 months)
**In:**
1. Field onboarding: GPS walk / map-draw polygon → Farm Passport ID.
2. Digital Twin core schema + ingestion (weather, Sentinel-2 NDVI/EVI, Soil Health Card lookup).
3. Weather Intelligence: rain / spray / irrigation / heat / disease-risk alerts.
4. Crop Recommendation Engine (rule + ML hybrid).
5. Disease Diagnosis (image CV) for top 10 crops.
6. AI Farm Assistant (RAG, voice-first, Tamil/Hindi/English).
7. **Farm Risk Score v1** and **Farm Credit Score v1** (the B2B wedge).
8. Farmer app (Android) + Admin portal + Bank API (sandbox).

**Out (later):** drones, carbon credits, full input marketplace, AI call centre, all 7 languages, iOS.

**MVP success metrics:**
- 50,000 fields onboarded in 2 districts.
- ≥70% week-4 alert open rate; ≥40% voice-query usage.
- 1 signed lender pilot scoring ≥10,000 real loan applicants.
- Disease model ≥85% top-1 accuracy on field photos for top 10 crops.

## 5. Functional requirements (high level)
- FR1 Field capture with offline polygon draw + GPS perimeter walk; conflict/overlap detection.
- FR2 Each field gets immutable Farm Passport; all history append-only + versioned.
- FR3 Daily automated ingestion per active field (weather, satellite indices).
- FR4 On-demand engines (crop reco, yield, risk, credit) return explainable outputs.
- FR5 Multilingual voice I/O (ASR + TTS) + text fallback.
- FR6 Notification engine with quiet hours, language, and channel (push/SMS/IVR) prefs.
- FR7 Multi-tenant B2B: each institution sees only consented fields; full audit log.
- FR8 Consent management (DPDP Act 2023 compliant) for sharing field data with lenders/insurers.

## 6. Non-functional requirements
- Offline-first mobile (sync queue; works on 2G/intermittent).
- p95 API latency < 400ms for cached scores; async for heavy compute.
- 99.9% uptime for B2B APIs.
- Data residency in India (DPDP + sector norms).
- Horizontal scale to 50M fields.

## 7. Key product principles
- **Explainability over black-box** — every score ships with top contributing factors (banks/insurers require this).
- **Append-only history** — the moat is the longitudinal record; never overwrite, always version.
- **Farmer owns the data; institutions query with consent.**
