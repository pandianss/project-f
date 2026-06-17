-- Market intelligence: mandis + daily price/arrivals series (Agmarknet-shaped).

CREATE TABLE IF NOT EXISTS mandi (
  mandi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  district TEXT,
  state    TEXT,
  geom     GEOGRAPHY(POINT,4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mandi_geom ON mandi USING GIST (geom);

CREATE TABLE IF NOT EXISTS market_price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandi_id   UUID NOT NULL REFERENCES mandi(mandi_id) ON DELETE CASCADE,
  commodity  TEXT NOT NULL,
  price_date DATE NOT NULL,
  modal_price NUMERIC NOT NULL,       -- ₹/quintal (Agmarknet convention)
  min_price  NUMERIC,
  max_price  NUMERIC,
  arrivals_t NUMERIC,                 -- tonnes arrived
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_price ON market_price(mandi_id, commodity, price_date);
CREATE INDEX IF NOT EXISTS idx_market_price_lookup ON market_price(commodity, price_date DESC);
