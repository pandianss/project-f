# FarmOS AI India — Core API (backend)

First runnable vertical slice of the platform: **Digital Twin core + Farm Passport onboarding + Respect-Points marketplace gate**. Implements build-sequence steps 1–3 from [../docs/10-Roadmap-Team-Cost.md](../docs/10-Roadmap-Team-Cost.md).

## Stack
- Node 24 + TypeScript (ESM), Fastify 5, Zod validation
- PostgreSQL 16 + **PostGIS** (Docker), forward-only SQL migration runner
- Maps to schema in [../docs/03-Database-Schema.md](../docs/03-Database-Schema.md) and the RP gate in [../docs/12-Android-Apps-and-Marketplace.md](../docs/12-Android-Apps-and-Marketplace.md) §3.1a

## Run
```bash
cp .env.example .env
npm install
docker compose up -d          # PostGIS on localhost:5433
npm run migrate               # apply schema
npm start                     # API on :3000  (npm run dev for watch mode)
```

## Endpoints (current slice)
| Method | Path | Purpose |
|---|---|---|
| GET  | `/health` | liveness |
| POST | `/v1/farmers` | create farmer (OTP auth stubbed) |
| GET  | `/v1/farmers/:id` | farmer profile |
| POST | `/v1/farmers/:id/verify-kyc` | mark KYC verified (+75 RP) |
| POST | `/v1/fields` | create field from GeoJSON polygon → **Farm Passport** (computes area, +50 RP if passport complete) |
| GET  | `/v1/fields/:id/passport` | full Farm Passport (field + all history + scores) |
| GET  | `/v1/farmers/:id/fields` | farmer's fields |
| POST | `/v1/fields/:id/crop-history` | log a season (satellite-corroborated → +40 RP) |
| GET  | `/v1/farmers/:id/seller-status` | Respect Points + marketplace unlock state + next steps |
| POST | `/v1/fields/:id/score` | compute + view **Farm Risk + Credit** scores (explainable) |
| POST | `/v1/b2b/orgs` | register a B2B org (bank/nbfc/insurer/…) |
| POST | `/v1/consent/grant` | farmer/field consent grant to an org (scoped, time-boxed) |
| POST | `/v1/consent/revoke` | revoke a consent grant |
| GET  | `/v1/b2b/fields/:id/score?scope=credit\|farm_risk` | **consent-scoped** B2B score read (`x-org-id` header); audited |
| GET  | `/v1/audit?field_id=…` | access audit trail for a field |

## Risk + Credit engine (implemented)
Transparent rule-based v1 scorecard (`src/domain/scoring.ts`) producing 0-100 **sub-scores + reason codes**, the cold-start baseline a GBM/scorecard replaces behind the same interface (docs/08 §9–§10). Credit yields a band (A–D) + indicative KCC limit; KYC is a hard gate. Every score is persisted versioned in `field_score` (`model_version`).

## Consent + audit (implemented)
B2B reads require a valid `consent_grant` (scope + not expired + not revoked) or return **403**; every attempt (read/denied) is written to `access_audit`. This is the regulatory/trust backbone for lender & insurer access (docs/02 §4).

## Respect Points gate (implemented)
Marketplace selling is **OFF by default**. `seller_status.sell_enabled` becomes true only when:
`respect_points >= SELL_UNLOCK_THRESHOLD (250)` **AND** KYC verified **AND** ≥1 satellite-corroborated crop season.
Points/tier recompute from the append-only `respect_ledger` on every award. See `src/domain/respect.ts`.

## Verified end-to-end
Create farmer → create field (Passport `FP-2026-…`, area auto-computed via PostGIS) → KYC → corroborated seasons → RP crosses 250 → `sell_enabled: true`, tier `bronze`. Passport returns field + water + seasons.

## Marketplace (implemented — `src/domain/marketplace.ts`)
Direct-retail flow with the Respect-Points gate enforced server-side:
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/market/listings` | create listing — **403 SELLER_LOCKED** unless `sell_enabled`; enforces probation caps; **auto-attaches provenance** from the twin (passport, corroborated seasons, soil-tested) |
| GET  | `/v1/market/listings?crop&lng&lat&radius_km` | browse, geo-ranked by distance (PostGIS `ST_DWithin`/`ST_Distance`) |
| POST | `/v1/market/buyers` | register a buyer |
| POST | `/v1/market/orders` | place order → reserves listing, issues handover OTP |
| POST | `/v1/market/orders/:id/pay` | escrow **holds** funds |
| POST | `/v1/market/orders/:id/confirm` | OTP handover → escrow **released** to farmer, listing **sold** |

Logistics is outsourced (`delivery_mode = pickup|3pl`); only 3PL bookings are recorded. Escrow is the enforcement lever from the dispute/liability policy (docs/12 §3.6).

**Verified:** locked farmer → 403; unlock via RP (325, sell=true) → listing created with provenance → buyer browses (distance 0.00 km, corroborated badge) → order ₹2000 → pay (escrow held) → wrong OTP rejected → correct OTP releases escrow to farmer.

## Crop recommendation (implemented — `src/domain/cropreco.ts` + `agronomy.ts`)
`GET /v1/fields/:id/crop-reco?season=&water_availability=&investment_capacity=&risk_appetite=`
Hybrid baseline (docs/08 §4): suitability filter (season / soil-pH from twin / water need) → rank feasible crops by **profit penalized by risk-vs-appetite + affordability**. Returns explainable top-5 (expected yield, revenue, profit/ha, risk, demand, reasons). Agronomy KB in `agronomy.ts` (ICAR/Agmarknet-sourced in prod).

## Advisory + alert engine (implemented — `src/domain/advisory.ts`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/fields/:id/advisory` | ingest a weather observation/forecast → generate **action-first alerts** |
| GET  | `/v1/fields/:id/alerts` | active alerts, ranked by ₹-at-risk |
| POST | `/v1/alerts/:id/ack` | farmer marks acted (closes the loop, docs/13 §2.3) |

Threshold rules (the interpretable baseline a GBM refines) emit rain / spray / heat / disease-risk / irrigation alerts, each with a **single recommended action** and **₹-at-risk = field exposure × loss factor** (exposure from area × current crop revenue). Verified: severe weather → critical rain + heat alerts (Rs 2.35L at risk, correctly *no* spray advice during rain, *no* fungal alert above its temp band); fair weather → safe-spray + irrigation.

## Farm Family ERP ledger (implemented — `src/domain/erp.ts`)
Track farming **expenses + income** per field/season and see profit (docs/07 §7, docs/13 §3.2).
| Method | Path | Purpose |
|---|---|---|
| GET  | `/v1/erp/categories` | income/expense category lists |
| POST | `/v1/fields/:id/ledger` | add entry (manual or `source=voice`) |
| GET  | `/v1/fields/:id/ledger?season&year` | list entries |
| GET  | `/v1/fields/:id/pnl?season&year` | season P&L: income, expense, net profit, margin %, category breakdown |
| GET  | `/v1/farmers/:id/erp-summary?year` | all-fields rollup (home profit figure) |

- Append-only; confirmed **marketplace sales auto-post as income** (idempotent via unique `ref_id`), attributed to the order's year + field's current season.
- Realized cash-flow here is the repayment-capacity signal the credit engine consumes (docs/08 §10).
- **Verified:** voice-logged expenses + a 2000 kg paddy marketplace sale → kharif-2026 P&L income Rs 42000 / expense Rs 27000 / **net Rs 15000 (36% margin)**; re-confirming the order does not double-count income.

## Disease prediction (implemented — `src/domain/disease.ts`)
Pre-symptom risk from crop-disease **favourability rules** (humidity/temp/wetness windows) **boosted by neighbour-field outbreaks** within a PostGIS radius (docs/08 §7).
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/fields/:id/disease/predict` | predict (uses latest `weather_obs` or passed weather + `radius_km`) → probabilities + preventive actions; emits `disease_risk` alerts + logs predicted `disease_history` |
| GET  | `/v1/disease/regional-risk?lng&lat&radius_km` | hotspot map: diseases × fields-at-risk × avg probability |

**Verified:** paddy + blast-favourable weather → rice blast 80% (0 neighbours); after 3 nearby confirmed detections → **boosted to 92%**; critical alert with ₹-at-risk created; regional map aggregates; dry/hot negative control → 0 predictions.

## Market intelligence (implemented — `src/domain/market.ts`)
Price forecast + best market + sell-vs-store timing (docs/08 §8).
| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/market/mandis` | register a mandi (geo) |
| POST | `/v1/market/prices` | ingest daily modal price/arrivals (Agmarknet-shaped; upsert) |
| GET  | `/v1/market/forecast?commodity&mandi_id&horizon_days` | forecast (recent level + OLS trend) + direction + confidence |
| GET  | `/v1/market/best?commodity&lng&lat` | best market **net of distance-based transport** (PostGIS) |
| GET  | `/v1/market/sell-or-store?commodity&lng&lat&horizon_days` | sell-now vs store recommendation vs storage cost |

**Verified:** rising tomato series → forecast 1845→2076 (conf 95), best market flips to nearer mandi after transport, sell-or-store → **store (+₹255)**; falling onion series → **sell_now (−₹296)**.

## Community forum (implemented — `src/domain/forum.ts`)
Hyperlocal Q&A with an AI first-responder hook, Respect Points for accepted answers, and a misinformation guardrail (docs/14).
| Method | Path | Purpose |
|---|---|---|
| GET  | `/v1/forum/feed?crop&lng&lat&radius_km` | hyperlocal feed (proximity-ranked, excludes flagged/removed) |
| POST | `/v1/forum/posts` | post (auto AI draft answer; unsafe content auto-flagged) |
| GET  | `/v1/forum/posts/:id` | thread (accepted answer first) |
| POST | `/v1/forum/posts/:id/replies` | reply (expert flag) |
| POST | `/v1/forum/:type/:id/vote` | up/down vote (one per voter) |
| POST | `/v1/forum/posts/:id/accept` | asker accepts answer → **+15 RP** to answerer, post `answered` |
| POST | `/v1/forum/:type/:id/flag` | report (spam/misinfo/abuse/scam/offplatform) |

**Verified:** post gets AI draft; accept-answer awards +15 RP (0→15) and only the asker may accept (else 403); an unsafe post ("endosulfan / double the dose / guaranteed double yield") is **auto-flagged, gets no AI draft, and is excluded from the feed**; feed is proximity-ranked.

## Remaining / next
- **Android app** (Kotlin/Compose) consuming these endpoints — must be built/run in Android Studio (not runnable in this env)
- Hardening: automated test suite, seed script, OpenAPI spec, auth (OAuth2/OTP real), rate limiting
- Engines to deepen later: image disease diagnosis (CV service), weather ingestion DAG, FarmGPT/RAG assistant, soil/water scoring endpoints
