import pg from 'pg';
import { config } from '../config.js';

// TLS handling differs per provider:
//   - Render/Supabase external URLs REQUIRE TLS.
//   - Railway/Fly INTERNAL URLs do NOT support TLS (private network) — forcing
//     it crashes the connection.
// So: enable TLS only when explicitly asked. Set DB_SSL=true (Render), or include
// sslmode=require in DATABASE_URL. Default off (works on Railway/Fly/local).
const needsSsl =
  process.env.DB_SSL === 'true' || /sslmode=require/.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
