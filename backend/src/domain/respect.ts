// Respect Points: the trust currency that gates marketplace selling rights.
// See docs/12 §3.1a and docs/14 (forum) for the full earning model.
import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { config } from '../config.js';

// Canonical point values for verified, good-faith actions.
export const RP_RULES = {
  passport_complete: 50,      // boundary + ownership + water source
  kyc: 75,                    // phone + ID verified
  crop_season_verified: 40,   // satellite-corroborated season
  soil_or_water_test: 20,
  officer_verified: 100,      // strongest ground-truth
  disease_outcome_confirmed: 10,
  tenure_month: 5,
  forum_accepted_answer: 15,
  forum_upvote: 5,
  // negatives
  fraud_flag: -150,
  failed_verification: -150,
} as const;

export type RpReason = keyof typeof RP_RULES;

function tierFor(points: number): 'locked' | 'bronze' | 'silver' | 'gold' {
  if (points >= 1000) return 'gold';
  if (points >= 500) return 'silver';
  if (points >= config.sellUnlockThreshold) return 'bronze';
  return 'locked';
}

/** Award (or deduct) Respect Points and recompute the seller gate. */
export async function awardRp(
  client: PoolClient,
  farmerId: string,
  reason: RpReason,
  refId?: string,
): Promise<void> {
  const points = RP_RULES[reason];
  await client.query(
    'INSERT INTO respect_ledger(farmer_id, reason, points, ref_id) VALUES ($1,$2,$3,$4)',
    [farmerId, reason, points, refId ?? null],
  );
  await recomputeSellerStatus(client, farmerId);
}

/** Recompute respect_points + seller gate from the ledger + eligibility rules. */
export async function recomputeSellerStatus(client: PoolClient, farmerId: string): Promise<void> {
  const { rows } = await client.query<{ total: string }>(
    'SELECT COALESCE(SUM(points),0)::int AS total FROM respect_ledger WHERE farmer_id=$1',
    [farmerId],
  );
  const total = Number(rows[0]?.total ?? 0);

  // Gate requires: RP >= threshold AND KYC verified AND >=1 satellite-corroborated season.
  const kyc = await client.query<{ kyc_status: string }>(
    'SELECT kyc_status FROM farmer WHERE farmer_id=$1',
    [farmerId],
  );
  const seasons = await client.query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM crop_history ch
       JOIN field f ON f.field_id = ch.field_id
      WHERE f.farmer_id = $1 AND ch.satellite_corroborated = true`,
    [farmerId],
  );
  const kycOk = kyc.rows[0]?.kyc_status === 'verified';
  const seasonOk = Number(seasons.rows[0]?.c ?? 0) >= 1;
  const tier = tierFor(total);
  const sellEnabled = total >= config.sellUnlockThreshold && kycOk && seasonOk;

  await client.query(
    `INSERT INTO seller_status
       (farmer_id, respect_points, trust_tier, sell_enabled, probation,
        max_listing_value, max_concurrent_listings, unlocked_at, updated_at)
     VALUES ($1,$2,$3,$4, true, 50000, 5,
             CASE WHEN $4 THEN now() ELSE NULL END, now())
     ON CONFLICT (farmer_id) DO UPDATE SET
       respect_points = EXCLUDED.respect_points,
       trust_tier     = EXCLUDED.trust_tier,
       sell_enabled   = EXCLUDED.sell_enabled,
       unlocked_at    = COALESCE(seller_status.unlocked_at, EXCLUDED.unlocked_at),
       updated_at     = now()`,
    [farmerId, total, tier, sellEnabled],
  );
}

export interface SellerStatus {
  respect_points: number;
  trust_tier: string;
  sell_enabled: boolean;
  threshold: number;
  kyc_ok: boolean;
  season_ok: boolean;
  next_steps: { action: RpReason; points: number; done: boolean }[];
}

export async function getSellerStatus(farmerId: string): Promise<SellerStatus> {
  const s = await query<{
    respect_points: number;
    trust_tier: string;
    sell_enabled: boolean;
  }>('SELECT respect_points, trust_tier, sell_enabled FROM seller_status WHERE farmer_id=$1', [
    farmerId,
  ]);
  const farmer = await query<{ kyc_status: string }>(
    'SELECT kyc_status FROM farmer WHERE farmer_id=$1',
    [farmerId],
  );
  const ledger = await query<{ reason: string }>(
    'SELECT DISTINCT reason FROM respect_ledger WHERE farmer_id=$1',
    [farmerId],
  );
  const seasons = await query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM crop_history ch
       JOIN field f ON f.field_id = ch.field_id
      WHERE f.farmer_id=$1 AND ch.satellite_corroborated=true`,
    [farmerId],
  );
  const earned = new Set(ledger.rows.map((r) => r.reason));
  const kycOk = farmer.rows[0]?.kyc_status === 'verified';
  const seasonOk = Number(seasons.rows[0]?.c ?? 0) >= 1;

  const candidateSteps: RpReason[] = [
    'kyc',
    'passport_complete',
    'crop_season_verified',
    'soil_or_water_test',
    'officer_verified',
  ];
  const next_steps = candidateSteps.map((action) => ({
    action,
    points: RP_RULES[action],
    done: earned.has(action),
  }));

  return {
    respect_points: s.rows[0]?.respect_points ?? 0,
    trust_tier: s.rows[0]?.trust_tier ?? 'locked',
    sell_enabled: s.rows[0]?.sell_enabled ?? false,
    threshold: config.sellUnlockThreshold,
    kyc_ok: kycOk,
    season_ok: seasonOk,
    next_steps,
  };
}
