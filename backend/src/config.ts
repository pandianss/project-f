import 'dotenv/config';

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://farmos:farmos@localhost:5433/farmos',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  sellUnlockThreshold: Number(process.env.SELL_UNLOCK_THRESHOLD ?? 250),
};
