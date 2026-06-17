-- FarmOS AI India — Digital Twin core schema (MVP slice)
-- Implements: identity, Farm Passport, key history tables, scores,
-- consent/audit, Respect Points gate, and marketplace stubs.
-- See docs/03-Database-Schema.md and docs/12 §3.1a.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ============ IDENTITY ============
CREATE TABLE IF NOT EXISTS farmer (
  farmer_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      TEXT NOT NULL,
  phone          TEXT UNIQUE NOT NULL,
  preferred_lang TEXT NOT NULL DEFAULT 'en',
  kyc_status     TEXT NOT NULL DEFAULT 'none',   -- none|partial|verified
  aadhaar_token  TEXT,                            -- tokenized, never raw
  category       TEXT,                            -- small|marginal|progressive
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org (
  org_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  org_type   TEXT NOT NULL,                       -- fpo|bank|nbfc|mfi|insurer|input|govt
  tenant_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  plan       TEXT,
  api_quota  INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FARM PASSPORT ============
CREATE TABLE IF NOT EXISTS field (
  field_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_no TEXT UNIQUE NOT NULL,
  ulpin       TEXT,
  farmer_id   UUID NOT NULL REFERENCES farmer(farmer_id),
  centroid    GEOGRAPHY(POINT,4326),
  boundary    GEOGRAPHY(POLYGON,4326) NOT NULL,
  area_ha     NUMERIC,
  ownership   TEXT,                               -- owned|leased|shared|tenant
  survey_no   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_boundary ON field USING GIST (boundary);
CREATE INDEX IF NOT EXISTS idx_field_farmer ON field(farmer_id);

CREATE TABLE IF NOT EXISTS water_source (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id  UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  type      TEXT,                                 -- borewell|openwell|canal|tank|rainfed|drip|river
  depth_m   NUMERIC,
  geom      GEOGRAPHY(POINT,4326)
);

-- ============ HISTORY (append-only) ============
CREATE TABLE IF NOT EXISTS crop_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  season TEXT, year INT,                          -- kharif|rabi|zaid
  crop TEXT, variety TEXT,
  sowing_date DATE, harvest_date DATE,
  area_ha NUMERIC,
  satellite_corroborated BOOLEAN NOT NULL DEFAULT false,
  source TEXT,                                    -- farmer|satellite|officer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crop_history_field ON crop_history(field_id);

CREATE TABLE IF NOT EXISTS soil_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  sampled_on DATE,
  n NUMERIC, p NUMERIC, k NUMERIC, s NUMERIC,
  zn NUMERIC, fe NUMERIC, mn NUMERIC, cu NUMERIC, b NUMERIC,
  organic_carbon NUMERIC, ph NUMERIC, ec NUMERIC, cec NUMERIC,
  bulk_density NUMERIC, water_holding_capacity NUMERIC,
  source TEXT,                                    -- SHC|lab|model
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disease_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  detected_on DATE, disease TEXT, pest TEXT, deficiency TEXT,
  severity TEXT, detection_method TEXT,           -- image|prediction|officer
  confidence NUMERIC, remedy TEXT, outcome TEXT, image_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yield_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  crop_history_id UUID REFERENCES crop_history(id),
  yield_kg_ha NUMERIC, predicted_kg_ha NUMERIC, confidence NUMERIC,
  revenue NUMERIC, source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SCORES (versioned, explainable) ============
CREATE TABLE IF NOT EXISTS field_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  score_type TEXT NOT NULL,                       -- soil_health|farm_risk|credit|...
  value NUMERIC,
  sub_scores JSONB,
  explanation JSONB,
  model_version TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_score_field ON field_score(field_id, score_type);

-- ============ CONSENT & AUDIT ============
CREATE TABLE IF NOT EXISTS consent_grant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES farmer(farmer_id),
  org_id UUID NOT NULL REFERENCES org(org_id),
  scope TEXT[] NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS access_audit (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID, actor TEXT, field_id UUID, action TEXT, scope TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ RESPECT POINTS GATE (docs/12 §3.1a) ============
CREATE TABLE IF NOT EXISTS respect_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES farmer(farmer_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,                           -- passport_complete|kyc|crop_season_verified|...
  points INT NOT NULL,                            -- may be negative
  ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_respect_farmer ON respect_ledger(farmer_id);

CREATE TABLE IF NOT EXISTS seller_status (
  farmer_id UUID PRIMARY KEY REFERENCES farmer(farmer_id) ON DELETE CASCADE,
  respect_points INT NOT NULL DEFAULT 0,
  trust_tier TEXT NOT NULL DEFAULT 'locked',      -- locked|bronze|silver|gold
  sell_enabled BOOLEAN NOT NULL DEFAULT false,    -- OFF by default
  probation BOOLEAN NOT NULL DEFAULT true,
  max_listing_value NUMERIC,
  max_concurrent_listings INT,
  unlocked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ MARKETPLACE (stub for next slice) ============
CREATE TABLE IF NOT EXISTS listing (
  listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id),
  farmer_id UUID NOT NULL REFERENCES farmer(farmer_id),
  crop TEXT, variety TEXT, grade TEXT,
  quantity NUMERIC, unit TEXT, price NUMERIC, price_basis TEXT,
  harvest_date DATE, available_from DATE, packaging TEXT,
  provenance JSONB,
  pickup_geom GEOGRAPHY(POINT,4326),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_listing_geom ON listing USING GIST (pickup_geom);
