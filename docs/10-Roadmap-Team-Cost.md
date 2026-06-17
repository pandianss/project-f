# FarmOS AI India — Roadmap, Team, Cost, Build Sequence

## 1. Tech stack (production)
| Layer | Choice |
|---|---|
| Frontend (web) | React + TypeScript, Next.js; MapLibre/Mapbox + OpenLayers (GIS portals) |
| Mobile | Android-first (Kotlin or Flutter), offline-first (SQLite/WatermelonDB) |
| Backend | NestJS (Node/TS) for core; Go for high-throughput services; Python/FastAPI for engines |
| AI/ML | PyTorch, scikit-learn/LightGBM, HuggingFace, vLLM; MLflow, Feast, Kubeflow/Dagster |
| CV | YOLOv8, ViT/ConvNeXt, ONNX/TFLite (edge) |
| LLM | FarmGPT (fine-tuned open LLM) + Claude/Gemini for hard reasoning; RAG via pgvector/Qdrant |
| GIS | PostGIS, GeoServer, TiTiler, COG/STAC, QGIS, rasterio/dask, GEE (proto) |
| Databases | Postgres/Aurora+PostGIS, TimescaleDB, S3 + Iceberg/Delta, Redis, Qdrant |
| Streaming/workflow | Kafka (MSK), Temporal, Airflow/Dagster |
| Cloud/Infra | Kubernetes (EKS/AKS/GKE, India region), Helm, ArgoCD/GitOps, Terraform |
| Security | Keycloak (OIDC), Vault, KMS, mTLS, cosign/SBOM |
| Observability | Prometheus/Grafana, OTel, Loki/ELK, Evidently/Arize |
| ASR/TTS | IndicConformer/Whisper (fine-tuned), Indic TTS |

## 2. 3-year roadmap
**Year 1 — Foundation & wedge**
- Q1: Twin schema, field onboarding, ingestion (weather, Sentinel NDVI, SHC), Farmer App alpha (Hindi/Tamil/English), Admin portal.
- Q2: Weather + Crop Reco + Disease Diagnosis; Assistant v1 (RAG, voice). MVP launch in 2 districts.
- Q3: **Risk Engine v1 + Credit Score v1**; first lender pilot (sandbox API).
- Q4: Yield engine, Market engine, Insurance engine v1; FPO app + Village Dashboard. Scale to 0.5M fields, sign 3 lender + 1 insurer pilots.

**Year 2 — Monetize the triad**
- Productionize Credit/Insurance APIs validated on real partner books; portfolio monitoring + webhooks.
- All 7 languages; AI Call Centre; offline hardening. **(Android-only — no iOS.)**
- **Direct-retail marketplace** (Respect-Points-gated) + **Buyer companion app**; outsourced 3PL logistics integration; escrow/payments.
- **Community Forum** rollout: seed with expert/KVK + FPO groups first, then open hyperlocal peer posting per-village once dense; misinformation moderation live before open posting; AI first-responder + RP integration.
- Input demand intelligence + recommendation marketplace. 5M fields, multi-state.

**Year 3 — Platform & scale**
- Drone integration; Carbon credit MRV module; Bank Relationship module (KCC automation, repayment forecasting); Family ERP full.
- National/multi-govt contracts; API marketplace; data products. 20M fields.

## 3. Team structure
**Seed (~18–25 people):**
- Eng: 2 backend, 1 Go/platform, 2 mobile, 1 frontend, 2 data eng, 1 DevOps/SRE.
- AI/ML: 1 ML lead, 2 ML (tabular/forecast), 1 CV, 1 NLP/LLM, 1 MLOps.
- GIS: 1 GIS architect, 1 RS/geospatial analyst.
- Domain: 1 agronomist, 1 soil/water scientist, 0.5 credit-risk specialist (advisor).
- Product/Design: 1 PM, 1 UX (low-literacy), 1 designer.
- GTM/Ops: 1 BD (banks/insurers), 1 field-ops lead, founders.

**Marketplace + Community (added Year 2, ~6–9 people):**
- 2 Android eng (Buyer app + Sell module), 1 backend (orders/escrow/3PL integration), 1 payments/escrow specialist.
- **1 Community & Trust-and-Safety lead** + multilingual **moderation ops** (in-house core + outsourced reviewers for scale), owning forum moderation, the agri-misinformation guardrail, and marketplace dispute mediation.
- 1 marketplace ops / 3PL & seller-success.

**Series A:** scale to ~60–80 (regional field teams, partnerships, risk/actuarial, more ML/data, expanded moderation + seller/buyer support).

## 4. Indicative development cost (18 months, seed)
| Bucket | ₹ Cr |
|---|---|
| Salaries (~22 ppl) | 7.0–9.0 |
| Cloud/compute/GPU + data licensing | 1.5–2.5 |
| Field ops / onboarding (pilots) | 1.0–1.5 |
| Tools, security, compliance, legal (DPDP/RBI) | 0.7–1.0 |
| Design/research, contingency | 1.0–1.5 |
| **Total** | **~12–15 Cr** |

## 5. MVP scope (recap from PRD)
Twin + onboarding + ingestion (weather/NDVI/SHC) + Weather/Crop/Disease/Assistant + **Risk v1 + Credit v1** + Farmer App + Admin + Bank sandbox API. 2 districts, 50K fields, 1 lender pilot.

## 6. Step-by-step build sequence
1. Infra baseline: K8s, Terraform, CI/CD, Postgres+PostGIS, S3, observability, Keycloak.
2. Data model: implement Twin schema + Farm Passport + consent/audit.
3. Field onboarding: mobile polygon capture (offline) + validation + passport issuance.
4. Ingestion plane: weather (IMD) + Sentinel-2 NDVI zonal-stats DAG + SHC lookup → silver/gold.
5. Feature store + first scores: soil + water + farm-health.
6. Weather alerts + notification engine (push/SMS/IVR).
7. Crop Reco (rules+ranker) and Disease Diagnosis (CV) — acquisition features.
8. Assistant (RAG + ASR/TTS) voice-first, 3 languages.
9. **Risk Engine v1** → **Credit Score v1** (scorecard + reason codes) → Bank API + console.
10. Yield + Market + Insurance engines.
11. FPO app + Village Intelligence Dashboard.
12. Harden: drift monitoring, fairness audit, security review, load test → lender/insurer pilots → iterate on real outcomes.
13. Year-2: Respect-Points-gated **direct-retail marketplace + Buyer app** (escrow + outsourced 3PL + dispute/liability flow), **community forum** (expert-seeded → moderated peer posting), all 7 languages, AI call centre. **(Android-only throughout — no iOS.)**
14. Year-3: drones, carbon credits, Family ERP full, govt scale.
