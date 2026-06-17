-- Advisory alerts + weather observations.
-- Alerts are action-first and carry the ₹-at-risk that drives behaviour (docs/13).

CREATE TABLE IF NOT EXISTS weather_obs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  rainfall_mm NUMERIC,        -- forecast/observed next-window rainfall
  tmax NUMERIC, tmin NUMERIC,
  humidity NUMERIC,           -- %
  wind_kmph NUMERIC,
  source TEXT DEFAULT 'imd'
);
CREATE INDEX IF NOT EXISTS idx_weather_field ON weather_obs(field_id, ts DESC);

CREATE TABLE IF NOT EXISTS alert (
  alert_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  type        TEXT NOT NULL,            -- rain|spray|irrigation|heat|disease_risk|harvest|market
  severity    TEXT NOT NULL,            -- info|warning|critical
  title       TEXT NOT NULL,
  action      TEXT NOT NULL,            -- the single recommended action
  rupees_at_risk NUMERIC,               -- ₹ exposed if ignored
  valid_until TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'active',  -- active|acted|expired
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_field ON alert(field_id, status);
