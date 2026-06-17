// Farmer identity + (stubbed) OTP auth + KYC verification.
import { withTx, query } from '../db/pool.js';
import { awardRp, recomputeSellerStatus } from './respect.js';

export async function createFarmer(input: {
  full_name: string;
  phone: string;
  preferred_lang?: string;
}) {
  return withTx(async (client) => {
    const r = await client.query<{ farmer_id: string }>(
      `INSERT INTO farmer (full_name, phone, preferred_lang)
       VALUES ($1,$2,$3)
       ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING farmer_id`,
      [input.full_name, input.phone, input.preferred_lang ?? 'en'],
    );
    const farmerId = r.rows[0].farmer_id;
    // Initialize the seller gate row (locked by default).
    await recomputeSellerStatus(client, farmerId);
    return { farmer_id: farmerId };
  });
}

/** Demo KYC verification — in production this calls an authorized KYC partner. */
export async function verifyKyc(farmerId: string) {
  return withTx(async (client) => {
    const r = await client.query('UPDATE farmer SET kyc_status=$2 WHERE farmer_id=$1', [
      farmerId,
      'verified',
    ]);
    if (r.rowCount === 0) {
      throw Object.assign(new Error('Farmer not found'), { statusCode: 404 });
    }
    await awardRp(client, farmerId, 'kyc', farmerId); // recomputes gate
    return { farmer_id: farmerId, kyc_status: 'verified' };
  });
}

export async function getFarmer(farmerId: string) {
  const r = await query(
    'SELECT farmer_id, full_name, phone, preferred_lang, kyc_status, category, created_at FROM farmer WHERE farmer_id=$1',
    [farmerId],
  );
  if (r.rowCount === 0) throw Object.assign(new Error('Farmer not found'), { statusCode: 404 });
  return r.rows[0];
}
