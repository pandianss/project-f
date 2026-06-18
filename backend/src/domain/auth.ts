// Phone-OTP authentication + JWT issuance.
// Dev: the OTP is returned in the response and logged so you can test without an
// SMS provider. Production: wire sendSms() to a real gateway and stop returning it.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { withTx, query } from '../db/pool.js';
import { config, isProd } from '../config.js';
import { recomputeSellerStatus } from './respect.js';

export interface JwtUser {
  farmerId: string;
  phone: string;
}

function hashCode(phone: string, code: string): string {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
}

function signToken(u: JwtUser): string {
  return jwt.sign(u, config.jwtSecret, { expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JwtUser {
  return jwt.verify(token, config.jwtSecret) as JwtUser;
}

// Replace with a real SMS gateway (e.g., MSG91/Gupshup/Twilio) in production.
async function sendSms(phone: string, code: string): Promise<void> {
  console.log(`[OTP] ${phone} -> ${code}`);
}

/** Generate + store a 6-digit OTP for a phone. Returns the code only in non-prod. */
export async function requestOtp(phone: string): Promise<{ sent: boolean; dev_code?: string }> {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = hashCode(phone, code);
  await query(
    `INSERT INTO otp_code (phone, code_hash, expires_at, attempts)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval, 0)
     ON CONFLICT (phone) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [phone, codeHash, String(config.otpTtlMinutes)],
  );
  await sendSms(phone, code);
  return isProd ? { sent: true } : { sent: true, dev_code: code };
}

/** Verify an OTP; create the farmer on first login; return a JWT. */
export async function verifyOtp(
  phone: string,
  code: string,
  fullName?: string,
  lang?: string,
): Promise<{ token: string; farmer_id: string; is_new: boolean }> {
  return withTx(async (c) => {
    const row = await c.query<{ code_hash: string; expires_at: string; attempts: number }>(
      'SELECT code_hash, expires_at, attempts FROM otp_code WHERE phone=$1 FOR UPDATE',
      [phone],
    );
    if (row.rowCount === 0)
      throw Object.assign(new Error('Request an OTP first'), { statusCode: 400 });
    const rec = row.rows[0];
    if (new Date(rec.expires_at).getTime() < Date.now())
      throw Object.assign(new Error('OTP expired'), { statusCode: 400 });
    if (rec.attempts >= 5)
      throw Object.assign(new Error('Too many attempts; request a new OTP'), { statusCode: 429 });
    if (rec.code_hash !== hashCode(phone, code)) {
      await c.query('UPDATE otp_code SET attempts = attempts + 1 WHERE phone=$1', [phone]);
      throw Object.assign(new Error('Invalid OTP'), { statusCode: 401 });
    }
    // Success — consume the code.
    await c.query('DELETE FROM otp_code WHERE phone=$1', [phone]);

    // Find or create the farmer.
    const existing = await c.query<{ farmer_id: string }>(
      'SELECT farmer_id FROM farmer WHERE phone=$1',
      [phone],
    );
    let farmerId: string;
    let isNew = false;
    if (existing.rowCount && existing.rowCount > 0) {
      farmerId = existing.rows[0].farmer_id;
    } else {
      const ins = await c.query<{ farmer_id: string }>(
        'INSERT INTO farmer (full_name, phone, preferred_lang) VALUES ($1,$2,$3) RETURNING farmer_id',
        [fullName?.trim() || 'Farmer', phone, lang ?? 'en'],
      );
      farmerId = ins.rows[0].farmer_id;
      isNew = true;
      await recomputeSellerStatus(c, farmerId);
    }
    return { token: signToken({ farmerId, phone }), farmer_id: farmerId, is_new: isNew };
  });
}

/** Delete a farmer and all their data (DPDP / Play data-deletion).
 * Deletes in dependency order; field-scoped tables cascade on field delete. */
export async function deleteAccount(farmerId: string): Promise<{ deleted: boolean }> {
  return withTx(async (c) => {
    const exists = await c.query('SELECT 1 FROM farmer WHERE farmer_id=$1', [farmerId]);
    if (exists.rowCount === 0)
      throw Object.assign(new Error('Farmer not found'), { statusCode: 404 });

    // Marketplace (orders/payments/ratings/offers/listings owned by this farmer)
    await c.query(
      'DELETE FROM payment WHERE order_id IN (SELECT order_id FROM marketplace_order WHERE farmer_id=$1)',
      [farmerId],
    );
    await c.query(
      'DELETE FROM rating WHERE order_id IN (SELECT order_id FROM marketplace_order WHERE farmer_id=$1)',
      [farmerId],
    );
    await c.query('DELETE FROM marketplace_order WHERE farmer_id=$1', [farmerId]);
    await c.query(
      'DELETE FROM offer WHERE listing_id IN (SELECT listing_id FROM listing WHERE farmer_id=$1)',
      [farmerId],
    );
    await c.query('DELETE FROM listing WHERE farmer_id=$1', [farmerId]);

    // Forum (votes/replies/posts authored by this farmer)
    await c.query('DELETE FROM forum_vote WHERE voter_id=$1', [farmerId]);
    await c.query('DELETE FROM forum_reply WHERE author_id=$1', [farmerId]);
    await c.query('DELETE FROM forum_post WHERE author_id=$1', [farmerId]);

    // Ledger + consent referencing the farmer directly
    await c.query('DELETE FROM ledger_entry WHERE farmer_id=$1', [farmerId]);
    await c.query('DELETE FROM consent_grant WHERE farmer_id=$1', [farmerId]);

    // Fields (cascades water/crop/soil/disease/yield/score/weather/alert/field-scoped rows)
    await c.query('DELETE FROM field WHERE farmer_id=$1', [farmerId]);

    // Finally the farmer (respect_ledger + seller_status cascade on this)
    await c.query('DELETE FROM farmer WHERE farmer_id=$1', [farmerId]);
    return { deleted: true };
  });
}
