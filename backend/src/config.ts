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
  // SMS (MSG91). If authkey is unset, OTP is logged instead of sent.
  msg91AuthKey: process.env.MSG91_AUTHKEY ?? '',
  msg91Sender: process.env.MSG91_SENDER ?? '',
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID ?? '',
  // Test bypass: a single phone whose OTP is fixed + returned in the response
  // (for QA / Play review before SMS is live). Empty = disabled.
  testOtpPhone: process.env.TEST_OTP_PHONE ?? '',
  testOtpCode: process.env.TEST_OTP_CODE ?? '',
  // CORS: comma-separated allowed origins; empty => allow all (dev only)
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export const isProd = config.nodeEnv === 'production';
