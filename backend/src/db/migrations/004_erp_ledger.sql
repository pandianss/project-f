-- Farm Family ERP: income/expense ledger per field + season (docs/07 §7, docs/13 §3.2).
-- Append-only; realized cash-flow becomes a positive credit signal (docs/08 §10).

CREATE TABLE IF NOT EXISTS ledger_entry (
  entry_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id   UUID NOT NULL REFERENCES field(field_id) ON DELETE CASCADE,
  farmer_id  UUID NOT NULL REFERENCES farmer(farmer_id),
  season     TEXT,                       -- kharif|rabi|zaid (optional)
  year       INT,
  direction  TEXT NOT NULL,              -- income|expense
  category   TEXT NOT NULL,              -- seed|fertilizer|pesticide|labour|irrigation|machinery|transport|sale|subsidy|other
  amount     NUMERIC NOT NULL CHECK (amount >= 0),
  note       TEXT,
  source     TEXT NOT NULL DEFAULT 'manual',  -- manual|voice|marketplace|officer
  ref_id     UUID,                        -- e.g. marketplace order
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_field ON ledger_entry(field_id, year, season);
CREATE INDEX IF NOT EXISTS idx_ledger_farmer ON ledger_entry(farmer_id);
-- Idempotency for auto-imported marketplace income (one income row per order).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_marketplace_ref
  ON ledger_entry(ref_id) WHERE source = 'marketplace';
