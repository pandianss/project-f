# FarmOS AI India — Database Schema (Digital Farm Twin)

PostGIS for spatial; TimescaleDB hypertables for high-frequency time series (weather, satellite indices). History tables are **append-only + versioned**. IDs use UUIDs; field public ID = **Farm Passport**.

## Core entities

```sql
-- ============ IDENTITY ============
CREATE TABLE farmer (
  farmer_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT NOT NULL,
  phone            TEXT UNIQUE NOT NULL,
  preferred_lang   TEXT DEFAULT 'en',
  kyc_status       TEXT DEFAULT 'none',     -- none|partial|verified
  aadhaar_token    TEXT,                    -- tokenized, never raw
  gender           TEXT,
  category         TEXT,                    -- small|marginal|progressive
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE org (                          -- FPO/Bank/Insurer/Input/Govt
  org_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  org_type   TEXT NOT NULL,                 -- fpo|bank|nbfc|mfi|insurer|input|govt
  tenant_id  UUID NOT NULL,
  plan       TEXT, api_quota INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ FARM PASSPORT (the permanent record) ============
CREATE TABLE field (
  field_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_no     TEXT UNIQUE NOT NULL,     -- permanent human-readable ID
  ulpin           TEXT,                     -- govt land parcel ID if linked
  farmer_id       UUID REFERENCES farmer,
  village_id      UUID REFERENCES village,
  centroid        GEOGRAPHY(POINT,4326),
  boundary        GEOGRAPHY(POLYGON,4326),  -- field polygon
  area_ha         NUMERIC,
  ownership       TEXT,                     -- owned|leased|shared|tenant
  survey_no       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_field_boundary ON field USING GIST (boundary);

CREATE TABLE water_source (
  source_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID REFERENCES field,
  type        TEXT,            -- borewell|openwell|canal|tank|rainfed|drip|river
  depth_m     NUMERIC,
  geom        GEOGRAPHY(POINT,4326)
);

-- ============ HISTORY (append-only) ============
CREATE TABLE crop_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field,
  season TEXT, year INT,                    -- kharif|rabi|zaid
  crop TEXT, variety TEXT,
  sowing_date DATE, harvest_date DATE,
  area_ha NUMERIC, source TEXT,             -- farmer|satellite|officer
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE soil_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, sampled_on DATE,
  n NUMERIC,p NUMERIC,k NUMERIC,s NUMERIC,
  zn NUMERIC,fe NUMERIC,mn NUMERIC,cu NUMERIC,b NUMERIC,
  organic_carbon NUMERIC, ph NUMERIC, ec NUMERIC, cec NUMERIC,
  bulk_density NUMERIC, water_holding_capacity NUMERIC,
  source TEXT,                              -- SHC|lab|model
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE water_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, source_id UUID REFERENCES water_source,
  sampled_on DATE,
  ph NUMERIC, ec NUMERIC, tds NUMERIC, sar NUMERIC, rsc NUMERIC,
  chloride NUMERIC, bicarbonate NUMERIC, hardness NUMERIC,
  recharge_mm NUMERIC, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE input_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, crop_history_id UUID REFERENCES crop_history,
  input_type TEXT,                          -- fertilizer|pesticide|seed|labour|irrigation
  product TEXT, quantity NUMERIC, unit TEXT,
  cost NUMERIC, applied_on DATE, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE disease_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field,
  detected_on DATE, disease TEXT, pest TEXT, deficiency TEXT,
  severity TEXT, detection_method TEXT,     -- image|prediction|officer
  confidence NUMERIC, remedy TEXT, outcome TEXT,
  image_uri TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE yield_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, crop_history_id UUID REFERENCES crop_history,
  yield_kg_ha NUMERIC, predicted_kg_ha NUMERIC, confidence NUMERIC,
  revenue NUMERIC, source TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

-- Time-series (TimescaleDB hypertables)
CREATE TABLE weather_history (
  field_id UUID, ts TIMESTAMPTZ,
  rainfall NUMERIC, tmax NUMERIC, tmin NUMERIC, humidity NUMERIC,
  wind NUMERIC, solar NUMERIC, source TEXT
);  -- SELECT create_hypertable('weather_history','ts');

CREATE TABLE satellite_history (
  field_id UUID, ts TIMESTAMPTZ,
  ndvi NUMERIC, evi NUMERIC, ndwi NUMERIC, soil_moisture NUMERIC, lst NUMERIC,
  cloud_pct NUMERIC, sensor TEXT             -- sentinel2|landsat8|modis
);  -- hypertable on ts

-- ============ SCORES (versioned, explainable) ============
CREATE TABLE field_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field,
  score_type TEXT,        -- soil_health|water_quality|farm_risk|credit|insurance|...
  value NUMERIC,          -- 0-100
  sub_scores JSONB,       -- component breakdown
  explanation JSONB,      -- top contributing factors (SHAP)
  model_version TEXT, computed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, farmer_id UUID REFERENCES farmer,
  org_id UUID REFERENCES org, product TEXT,   -- KCC|crop_loan|...
  amount NUMERIC, status TEXT, disbursed_on DATE, repaid_on DATE,
  repayment_status TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE insurance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, scheme TEXT, season TEXT, year INT,
  sum_insured NUMERIC, premium NUMERIC,
  claim_filed BOOL, claim_amount NUMERIC, claim_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ CONSENT & AUDIT (multi-tenant boundary) ============
CREATE TABLE consent_grant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES field, farmer_id UUID REFERENCES farmer,
  org_id UUID REFERENCES org, scope TEXT[],   -- e.g. {credit_score,risk,history}
  granted_at TIMESTAMPTZ DEFAULT now(), valid_until TIMESTAMPTZ,
  revoked BOOL DEFAULT false
);

CREATE TABLE access_audit (
  id BIGSERIAL PRIMARY KEY, org_id UUID, actor TEXT,
  field_id UUID, action TEXT, scope TEXT, at TIMESTAMPTZ DEFAULT now()
);
```

## GIS reference layers (raster/vector, served via GeoServer)
`village`, `survey_parcel`, `soil_map`, `rainfall_grid`, `groundwater`, `flood_zone`,
`drought_zone`, `watershed`, `river`, `canal`, `road`, `market`, `cold_storage`,
`warehouse`, `bank_branch`, `input_dealer`, `weather_station`. Vector layers as PostGIS
tables with GIST indexes; continuous rasters (NDVI, LST, soil moisture, rainfall) as
Cloud-Optimized GeoTIFFs in S3 + STAC catalog.

## Design notes
- **Append-only:** never UPDATE history rows; corrections are new rows with `source`/`supersedes`.
- **Twin = field + all *_history joined over time.** Feature store materializes per-field feature vectors for ML.
- **Privacy:** raw Aadhaar/PII tokenized; analytics uses pseudonymous keys.
