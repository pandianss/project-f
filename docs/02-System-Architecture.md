# FarmOS AI India — System, Deployment, Security & Multi-Tenant Architecture

## 1. High-level system architecture
```
                         ┌──────────────────────────────────────────┐
   Mobile/Web Clients →  │  API Gateway (Kong/APISIX) + Auth (OIDC)  │
   B2B API consumers  →  │  Rate-limit, WAF, mTLS, tenant routing    │
                         └───────────────┬──────────────────────────┘
                                         │
        ┌────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                  │
  ┌─────▼──────┐                  ┌───────▼────────┐                ┌────────▼────────┐
  │ Core API   │                  │ Engine Services│                │ AI/ML Services  │
  │ (NestJS/   │                  │ (Python/FastAPI│                │ FarmGPT (RAG),  │
  │  Go svcs)  │                  │  per engine)   │                │ CV, Forecast    │
  └─────┬──────┘                  └───────┬────────┘                └────────┬────────┘
        │                                 │                                  │
  ┌─────▼─────────────────────────────────▼──────────────────────────────────▼───────┐
  │                          Event Bus (Kafka)  +  Workflow (Temporal)                 │
  └─────┬───────────────┬───────────────┬───────────────┬──────────────────┬──────────┘
        │               │               │               │                  │
  ┌─────▼────┐   ┌───────▼──────┐ ┌──────▼─────┐  ┌───────▼──────┐  ┌────────▼───────┐
  │PostGIS   │   │ TimescaleDB  │ │ Object Store│  │ Vector DB    │  │ Feature Store  │
  │(twin/geo)│   │(weather/IoT  │ │ (S3: imagery│  │ (pgvector/   │  │ (Feast)        │
  │          │   │ time-series) │ │  photos)    │  │  Qdrant)     │  │                │
  └──────────┘   └──────────────┘ └─────────────┘  └──────────────┘  └────────────────┘

  Ingestion plane: Airflow/Dagster DAGs → Sentinel/Landsat/MODIS, IMD, Agmarknet,
  Bhuvan, SHC, CGWB → validation → Twin + Timescale + raster tiles (GeoServer/COG).
```

## 2. Component responsibilities
- **API Gateway:** authN/Z, tenant resolution, throttling, WAF, request signing for B2B.
- **Core API:** identity, fields, passports, consent, notifications, billing.
- **Engine services:** stateless compute (weather, soil, water, crop, yield, risk, credit, insurance, market) — each independently deployable/scalable.
- **AI/ML services:** CV disease, FarmGPT/RAG, forecasting, scoring models. Served via Triton/BentoML/vLLM.
- **Ingestion plane:** scheduled DAGs; idempotent; writes to bronze→silver→gold (lakehouse on S3 + Iceberg/Delta).
- **Event bus:** field events (new observation, score recompute) fan out to engines.
- **Workflow (Temporal):** long-running pipelines (onboarding, batch scoring, drone scan processing) with retries/durability.

## 3. Data tiers (medallion)
- **Bronze:** raw external pulls (rasters, CSVs, API payloads).
- **Silver:** cleaned, validated, georeferenced, joined to field IDs.
- **Gold:** features + scores in Feature Store + serving DBs.

## 4. Multi-tenant architecture
- **Tenant types:** farmer (individual), org (FPO/bank/insurer/input/govt).
- **Isolation model:** shared schema + **row-level security (Postgres RLS)** keyed by `tenant_id`, with logical separation of B2B query scopes via **consent-grant tables**. Large/regulated tenants (big banks) can be promoted to **schema-per-tenant** or dedicated DB.
- **Consent boundary:** a bank only sees a field if `consent_grant(field_id, org_id, scope, valid_until)` exists. Enforced at query layer + audited.
- **Per-tenant config:** branding, languages, alert rules, API quotas, billing plan.

## 5. Deployment architecture
- **Cloud:** primary on a hyperscaler with India regions (AWS Mumbai/Hyderabad or Azure/GCP equivalents); data residency in India.
- **Orchestration:** Kubernetes (EKS/AKS/GKE) + Helm/ArgoCD (GitOps).
- **Environments:** dev → staging → prod; ephemeral PR preview envs.
- **Traffic:** CDN (CloudFront) for tiles/static; map tiles cached aggressively.
- **Storage:** S3 (imagery, COGs, photos); RDS/Aurora Postgres+PostGIS; managed Timescale; managed Kafka (MSK).
- **GPU pool:** node group for CV training/inference + LLM; spot for batch training.
- **DR:** multi-AZ; cross-region async backups; RPO ≤ 15 min, RTO ≤ 1 hr for core APIs.

## 6. Security architecture
- **Identity:** OIDC/OAuth2 (Keycloak); farmer auth via phone OTP + optional Aadhaar-linked KYC (with consent, via authorized KYC partners).
- **AuthZ:** RBAC + ABAC; consent-scoped data access; least privilege service accounts.
- **Transport:** TLS 1.3 everywhere; mTLS service-to-service; signed B2B API requests (HMAC).
- **Data at rest:** envelope encryption (KMS); PII column-level encryption; tokenized identifiers in analytics.
- **Secrets:** Vault / cloud secrets manager; no secrets in code/images.
- **Compliance:** DPDP Act 2023 (consent, purpose limitation, data principal rights, breach notification); RBI guidelines for the lending data flows; localization.
- **AppSec:** SAST/DAST in CI, dependency scanning, image scanning, signed images (cosign), SBOM.
- **Audit:** immutable audit log (who queried which field, when, under what consent) — critical for lender/insurer trust and regulatory defense.
- **Anti-fraud:** geo-fencing of field captures, device fingerprinting, duplicate-polygon detection, photo EXIF/geo validation.

## 7. Observability
- **Metrics:** Prometheus + Grafana (SLOs per engine).
- **Logs:** OpenTelemetry → Loki/ELK.
- **Tracing:** OTel traces across gateway→engine→model.
- **ML observability:** model drift, feature drift, prediction distribution, ground-truth backfill (Evidently / Arize).
- **Alerting:** PagerDuty/Opsgenie; data-freshness SLAs (e.g., "Sentinel ingest stale > 7 days").

## 8. Offline support
- Mobile local store (SQLite/WatermelonDB); outbox sync queue; conflict resolution last-write-wins per field-attribute with server reconciliation; cached map tiles + last advisory; queued voice notes uploaded when online.
