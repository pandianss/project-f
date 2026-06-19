// Phone-OTP authentication + JWT issuance.
// Dev: the OTP is returned in the response and logged so you can test without an
// SMS provider. Production: wire sendSms() to a real gateway and stop returning it.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
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

/** Send the OTP via MSG91 Flow API (DLT template with one variable {{var1}}=code).
 * Falls back to console logging when MSG91 isn't configured (dev). */
async function sendSms(phone: string, code: string): Promise<void> {
  if (!config.msg91AuthKey || !config.msg91TemplateId) {
    console.log(`[OTP] ${phone} -> ${code} (MSG91 not configured)`);
    return;
  }
  try {
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authkey: config.msg91AuthKey },
      body: JSON.stringify({
        template_id: config.msg91TemplateId,
        sender: config.msg91Sender || undefined,
        short_url: '0',
        recipients: [{ mobiles: `91${phone}`, var1: code, OTP: code }],
      }),
    });
    if (!res.ok) console.error(`[OTP] MSG91 send failed ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error('[OTP] MSG91 error', e);
  }
}

/** Generate + store a 6-digit OTP for a phone. Returns the code only in non-prod
 * (or for the configured test phone). */
export async function requestOtp(phone: string): Promise<{ sent: boolean; dev_code?: string }> {
  const isTest = config.testOtpPhone !== '' && phone === config.testOtpPhone;
  const code = isTest
    ? config.testOtpCode
    : String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = hashCode(phone, code);
  await query(
    `INSERT INTO otp_code (phone, code_hash, expires_at, attempts)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval, 0)
     ON CONFLICT (phone) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [phone, codeHash, String(config.otpTtlMinutes)],
  );
  if (!isTest) await sendSms(phone, code);
  // Return the code in dev, or for the test phone (so QA/Play review can log in).
  return !isProd || isTest ? { sent: true, dev_code: code } : { sent: true };
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

// ---- Firebase Phone Auth (no DLT/business needed) ----
let fbApp: App | null = null;
function firebase(): App {
  if (fbApp) return fbApp;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa)
    throw Object.assign(new Error('Firebase not configured'), { statusCode: 503 });
  fbApp = initializeApp({ credential: cert(JSON.parse(sa)) });
  return fbApp;
}

/** India phone normalize: keep last 10 digits (so +919629951301 -> 9629951301). */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Find or create a farmer by phone; returns the farmer id + whether new. */
async function findOrCreateFarmer(
  phone: string,
  fullName?: string,
  lang?: string,
): Promise<{ farmerId: string; isNew: boolean }> {
  return withTx(async (c) => {
    const existing = await c.query<{ farmer_id: string }>(
      'SELECT farmer_id FROM farmer WHERE phone=$1',
      [phone],
    );
    if (existing.rowCount && existing.rowCount > 0)
      return { farmerId: existing.rows[0].farmer_id, isNew: false };
    const ins = await c.query<{ farmer_id: string }>(
      'INSERT INTO farmer (full_name, phone, preferred_lang) VALUES ($1,$2,$3) RETURNING farmer_id',
      [fullName?.trim() || 'Farmer', phone, lang ?? 'en'],
    );
    await recomputeSellerStatus(c, ins.rows[0].farmer_id);
    return { farmerId: ins.rows[0].farmer_id, isNew: true };
  });
}

/** Verify a Firebase ID token (phone sign-in) and issue a Kadir JWT. */
export async function loginWithFirebase(
  idToken: string,
  fullName?: string,
  lang?: string,
): Promise<{ token: string; farmer_id: string; is_new: boolean }> {
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(firebase()).verifyIdToken(idToken);
  } catch {
    throw Object.assign(new Error('Invalid Firebase token'), { statusCode: 401 });
  }
  if (!decoded.phone_number)
    throw Object.assign(new Error('Token has no phone number'), { statusCode: 400 });
  const phone = normalizePhone(decoded.phone_number);
  const { farmerId, isNew } = await findOrCreateFarmer(phone, fullName, lang);
  return { token: signToken({ farmerId, phone }), farmer_id: farmerId, is_new: isNew };
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
