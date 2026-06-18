-- Phone OTP authentication. Codes are stored hashed with a short TTL.
CREATE TABLE IF NOT EXISTS otp_code (
  phone       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
