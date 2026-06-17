# FarmOS AI India — Executive Summary & Investor Pitch

## One-line
The operating system for Indian agriculture: a **digital twin of every field** that accumulates soil, water, weather, crop, satellite, and market history to generate crop, risk, credit, and insurance intelligence.

## The wedge (read this first)
Weather alerts, disease photo-diagnosis, and reminders are **acquisition features** — cheap to copy, low willingness-to-pay from farmers. They are how we get fields onboarded.

The **venture-scale business** is the compounding data asset:

> **Digital Farm Twin → Farm Risk Engine → Farm Credit Score → Insurance Risk Score**

This sells to **banks, NBFCs, insurers, and FPOs** who have real budgets and a real problem (they cannot underwrite ~120M smallholder fields they cannot see). Every field-season we observe makes the model more defensible. This is the moat.

## Why now
- Sentinel-2 (10m, 5-day revisit) is free and mature; soil/groundwater open data exists (Soil Health Card, CGWB, Bhuvan).
- Account Aggregator + India Stack + ULPIN/Bhu-Naksha digitization make farmer KYC + land linkage feasible.
- KCC/PMFBY/agri-lending under pressure to cut NPAs and fraud — they need ground-truth risk signals.
- LLMs make multilingual voice-first advisory finally cheap enough for a ₹0-ARPU farmer tier.

## Market
- ~120M+ operational holdings; ~86% small/marginal.
- Agri credit outlay > ₹20 lakh crore/yr; PMFBY ~₹30,000 cr premium pool.
- We do not need farmer ARPU to win. We need **fields under management** that institutions pay to query.

## Business model (summary)
- **B2C (farmer/FPO):** freemium, low ARPU — acquisition + data.
- **B2B (banks/NBFC/insurer/input cos/govt):** per-field-scored, per-API-call, SaaS seats, data products — the revenue.
- See [09-Monetization.md](09-Monetization.md) for the model and a 3-year revenue projection (~₹140 Cr ARR Year 3 base case).

## What we are asking (Seed)
- **₹12–18 Cr seed** for 18 months: build the Twin + Risk + Credit MVP, onboard 500K fields in 3 states, sign 3 lender + 1 insurer pilots, validate a credit-score lift in a live lending book.
- Milestone to Series A: demonstrate **NPA reduction / loss-ratio improvement** on a real partner portfolio.

## Document index
| Doc | Contents |
|---|---|
| [01-PRD.md](01-PRD.md) | Product requirements, personas, MVP scope |
| [02-System-Architecture.md](02-System-Architecture.md) | System, deployment, security, multi-tenancy |
| [03-Database-Schema.md](03-Database-Schema.md) | Digital Twin schema (PostGIS) |
| [04-GIS-Architecture.md](04-GIS-Architecture.md) | Geospatial stack, layers, data sources |
| [05-AI-Architecture.md](05-AI-Architecture.md) | All ML/AI engines + FarmGPT |
| [06-API-Design.md](06-API-Design.md) | REST/gRPC API surface |
| [07-Mobile-UX.md](07-Mobile-UX.md) | Apps, screens, flows, voice-first |
| [08-Engines-Spec.md](08-Engines-Spec.md) | Weather/Soil/Water/Crop/Yield/Disease/Market/Risk/Credit/Insurance methodology |
| [09-Monetization.md](09-Monetization.md) | Business model + revenue projection |
| [10-Roadmap-Team-Cost.md](10-Roadmap-Team-Cost.md) | 3-yr roadmap, org, budget, build sequence |
| [11-GTM-Competitive-Risks.md](11-GTM-Competitive-Risks.md) | Competition, GTM, risks & mitigation |
| [12-Android-Apps-and-Marketplace.md](12-Android-Apps-and-Marketplace.md) | **Android-only app suite + direct-retail marketplace + Buyer app (multilingual)** |
| [13-Loss-Aversion-and-Profitability.md](13-Loss-Aversion-and-Profitability.md) | **Protect (avert disasters/losses) + Profit (optimize earnings)** — the core farmer promise |
| [14-Community-Forum.md](14-Community-Forum.md) | **Multilingual, voice-first farmer forum** (hyperlocal, AI-assisted, RP-integrated, moderated) |
