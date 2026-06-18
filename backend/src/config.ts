import 'dotenv/config';

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://farmos:farmos@localhost:5433/farmos',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  sellUnlockThreshold: Number(process.env.SELL_UNLOCK_THRESHOLD ?? 250),
  // Auth
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  jwtExpiry: process.env.JWT_EXPIRY ?? '30d',
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
  // CORS: comma-separated allowed origins; empty => allow all (dev only)
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const isProd = config.nodeEnv === 'production';
