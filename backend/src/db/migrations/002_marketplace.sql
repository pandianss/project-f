-- FarmOS marketplace: buyers, negotiation, orders, escrow payments, ratings.
-- Logistics is OUTSOURCED (docs/12 §3.5); we only record 3PL bookings.
-- 'listing' table already created in 001_init.sql.

CREATE TABLE IF NOT EXISTS buyer (
  buyer_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  phone          TEXT UNIQUE NOT NULL,
  buyer_type     TEXT NOT NULL DEFAULT 'consumer',  -- consumer|retailer|restaurant|trader|fpo
  preferred_lang TEXT NOT NULL DEFAULT 'en',
  kyc_status     TEXT NOT NULL DEFAULT 'none',
  geom           GEOGRAPHY(POINT,4326),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offer (
  offer_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listing(listing_id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES buyer(buyer_id),
  offer_price NUMERIC NOT NULL,
  quantity    NUMERIC NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',       -- pending|accepted|rejected|countered
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_order (
  order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listing(listing_id),
  buyer_id      UUID NOT NULL REFERENCES buyer(buyer_id),
  farmer_id     UUID NOT NULL REFERENCES farmer(farmer_id),
  quantity      NUMERIC NOT NULL,
  unit_price    NUMERIC NOT NULL,
  total         NUMERIC NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'pickup',       -- pickup|3pl
  status        TEXT NOT NULL DEFAULT 'placed',       -- placed|paid_escrow|in_transit|delivered|released|cancelled|disputed
  pickup_code   TEXT,                                  -- OTP/QR for handover
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_farmer ON marketplace_order(farmer_id);
CREATE INDEX IF NOT EXISTS idx_order_buyer ON marketplace_order(buyer_id);

CREATE TABLE IF NOT EXISTS payment (
  payment_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES marketplace_order(order_id) ON DELETE CASCADE,
  amount        NUMERIC NOT NULL,
  method        TEXT NOT NULL DEFAULT 'upi',           -- upi|card|wallet
  escrow_status TEXT NOT NULL DEFAULT 'held',          -- held|released|refunded
  gateway_ref   TEXT, payout_ref TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rating (
  rating_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES marketplace_order(order_id),
  rater      TEXT NOT NULL,                            -- farmer|buyer
  ratee      TEXT NOT NULL,
  stars      INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
